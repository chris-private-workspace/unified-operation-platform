import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * W29 F3 — the read path. The write path (log / logChange / buildLogArgs) is
 * covered where it is used (user-admin / auth / opco / catalog / import /
 * reconcile specs) plus the pure-function H4 suite in audit-fields.spec.
 */
describe('AuditService.find', () => {
  let service: AuditService;
  let prisma: { auditLog: { count: jest.Mock; findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('defaults: no filters, newest first, page of 50 from 0, actor display join', async () => {
    const res = await service.find({});

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
      include: { actor: { select: { email: true, displayName: true } } },
    });
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: {} });
    expect(res).toEqual({ total: 0, limit: 50, offset: 0, entries: [] });
  });

  it('ANDs every filter and converts the date range', async () => {
    await service.find({
      actorId: 'actor-1',
      targetType: 'AppUser',
      targetId: 'user-9',
      action: 'user.role_change',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-21T00:00:00.000Z',
    });

    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      actorId: 'actor-1',
      targetType: 'AppUser',
      targetId: 'user-9',
      action: 'user.role_change',
      createdAt: {
        gte: new Date('2026-07-01T00:00:00.000Z'),
        lte: new Date('2026-07-21T00:00:00.000Z'),
      },
    });
    // count sees the SAME where — total must describe the filtered set.
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where });
  });

  it('passes limit/offset through and reports them back', async () => {
    prisma.auditLog.count.mockResolvedValue(240);
    const res = await service.find({ limit: 25, offset: 75 });

    const args = prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.take).toBe(25);
    expect(args.skip).toBe(75);
    expect(res).toMatchObject({ total: 240, limit: 25, offset: 75 });
  });

  // Defence in depth: the DTO already rejects limit > 100, but an internal
  // caller bypassing the ValidationPipe must not widen the window either.
  it('clamps limit to 100 even if the DTO layer is bypassed', async () => {
    await service.find({ limit: 500 });

    expect(prisma.auditLog.findMany.mock.calls[0][0].take).toBe(100);
  });
});

/** The public cap + enum filters live in the DTO — validate them directly. */
describe('AuditQueryDto validation', () => {
  const check = async (raw: Record<string, unknown>) =>
    validate(plainToInstance(AuditQueryDto, raw));

  it('rejects limit above the 100 cap and below 1', async () => {
    expect(await check({ limit: '101' })).not.toHaveLength(0);
    expect(await check({ limit: '0' })).not.toHaveLength(0);
    expect(await check({ limit: '100' })).toHaveLength(0);
  });

  it('rejects an action / targetType outside the known constants', async () => {
    expect(await check({ action: 'user.self_destruct' })).not.toHaveLength(0);
    expect(await check({ targetType: 'RefreshToken' })).not.toHaveLength(0);
    expect(
      await check({ action: 'user.update', targetType: 'AppUser' }),
    ).toHaveLength(0);
  });

  it('rejects a malformed date range', async () => {
    expect(await check({ from: 'yesterday' })).not.toHaveLength(0);
    expect(await check({ from: '2026-07-01' })).toHaveLength(0);
  });
});
