import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OpcoService } from './opco.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('OpcoService', () => {
  let service: OpcoService;
  let prisma: {
    opco: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock; logChange: jest.Mock };

  beforeEach(async () => {
    prisma = {
      opco: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      // W29 F2c: run the callback against the same mock so existing
      // prisma.opco.* assertions keep working untouched.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    audit = { log: jest.fn(), logChange: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OpcoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(OpcoService);
  });

  it('lists active OpCos, code-sorted, id/code/displayName only (picker)', async () => {
    prisma.opco.findMany.mockResolvedValue([
      { id: 'o1', code: 'RHK', displayName: 'Ricoh HK' },
    ]);

    const res = await service.listActive();

    expect(res).toEqual([{ id: 'o1', code: 'RHK', displayName: 'Ricoh HK' }]);
    expect(prisma.opco.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, displayName: true },
    });
  });

  describe('listForAdmin', () => {
    it('active-only by default (drives the create-user scope selector)', async () => {
      prisma.opco.findMany.mockResolvedValue([]);

      await service.listForAdmin();

      expect(prisma.opco.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
    });

    it('includeInactive=true drops the active filter', async () => {
      prisma.opco.findMany.mockResolvedValue([]);

      await service.listForAdmin(true);

      expect(prisma.opco.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  describe('createOpco', () => {
    it('creates when the code is free, trims, "" costCenter → null', async () => {
      prisma.opco.findUnique.mockResolvedValue(null);
      prisma.opco.create.mockResolvedValue({ id: 'new' });

      await service.createOpco('actor-1', {
        code: '  RVN  ',
        displayName: '  Ricoh VN  ',
        company: '  RVN  ',
        costCenter: '   ',
      });

      expect(prisma.opco.findUnique).toHaveBeenCalledWith({
        where: { code: 'RVN' },
        select: { id: true },
      });
      expect(prisma.opco.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            code: 'RVN',
            displayName: 'Ricoh VN',
            company: 'RVN',
            costCenter: null,
            active: true,
          },
        }),
      );
    });

    it('rejects a duplicate code with 409 (never creates)', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createOpco('actor-1', {
          code: 'RHK',
          displayName: 'x',
          company: 'RHK',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.opco.create).not.toHaveBeenCalled();
    });
  });

  describe('updateOpco', () => {
    it('updates only the supplied editable fields; never writes code', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1' });
      prisma.opco.update.mockResolvedValue({ id: 'o1' });

      await service.updateOpco('actor-1', 'o1', {
        displayName: '  New name  ',
        costCenter: '  IT  ',
      });

      const arg = prisma.opco.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'o1' });
      expect(arg.data).toEqual({ displayName: 'New name', costCenter: 'IT' });
      expect(arg.data).not.toHaveProperty('code');
      expect(arg.data).not.toHaveProperty('company');
    });

    it('"" costCenter clears to null', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1' });
      prisma.opco.update.mockResolvedValue({ id: 'o1' });

      await service.updateOpco('actor-1', 'o1', { costCenter: '' });

      expect(prisma.opco.update.mock.calls[0][0].data).toEqual({
        costCenter: null,
      });
    });

    it('deactivates (active=false) without touching other fields', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1' });
      prisma.opco.update.mockResolvedValue({ id: 'o1' });

      await service.updateOpco('actor-1', 'o1', { active: false });

      expect(prisma.opco.update.mock.calls[0][0].data).toEqual({
        active: false,
      });
    });

    it('throws 404 for an unknown id (never updates)', async () => {
      prisma.opco.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOpco('actor-1', 'nope', { displayName: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.opco.update).not.toHaveBeenCalled();
    });
  });

  // W29 F2c — OpCo curation is auditable (ADR-0009 Decision 4).
  describe('audit trail', () => {
    it('records opco.create in the write transaction', async () => {
      prisma.opco.findUnique.mockResolvedValue(null);
      const created = { id: 'new', code: 'RVN' };
      prisma.opco.create.mockResolvedValue(created);

      await service.createOpco('actor-1', {
        code: 'RVN',
        displayName: 'Ricoh VN',
        company: 'RVN',
      });

      expect(audit.log).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'opco.create',
          targetType: 'Opco',
          targetId: 'new',
          actorId: 'actor-1',
          after: created,
        }),
      );
    });

    it('records opco.update with before/after for the diff', async () => {
      const before = { id: 'o1', displayName: 'Old', active: true };
      prisma.opco.findUnique.mockResolvedValue(before);
      prisma.opco.update.mockResolvedValue({ ...before, displayName: 'New' });

      await service.updateOpco('actor-1', 'o1', { displayName: 'New' });

      expect(audit.logChange).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'opco.update', before }),
      );
    });

    it('writes nothing when the OpCo does not exist', async () => {
      prisma.opco.findUnique.mockResolvedValue(null);
      await expect(
        service.updateOpco('actor-1', 'nope', { displayName: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.logChange).not.toHaveBeenCalled();
    });
  });
});
