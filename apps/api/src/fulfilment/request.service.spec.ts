import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { RequestService } from './request.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { StageService } from './stage.service';

// Actors (AUTH-3a). OpCo under test = 'o1'.
const ADMIN = { id: 'admin', opcoScopeId: null } as unknown as AppUser;
const O1_IT = { id: 'o1-it', opcoScopeId: 'o1' } as unknown as AppUser;
const OTHER_IT = { id: 'ox-it', opcoScopeId: 'oX' } as unknown as AppUser;

describe('RequestService', () => {
  let service: RequestService;
  let prisma: {
    opco: Record<string, jest.Mock>;
    request: Record<string, jest.Mock>;
    skuCatalog: Record<string, jest.Mock>;
    requestLineItem: Record<string, jest.Mock>;
    requestEvent: Record<string, jest.Mock>;
  };
  let snow: { getRecordByNumber: jest.Mock };
  let stage: { recomputeRequestStatus: jest.Mock };

  beforeEach(async () => {
    prisma = {
      opco: { findUnique: jest.fn() },
      request: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'r1', ...data })),
      },
      skuCatalog: { findUnique: jest.fn() },
      requestLineItem: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: 'li1' }),
        // CH-025 C — addLineItem now recomputes "is this request finished"
        // from the existing lines. Default EMPTY, which aggregates to OPEN, so
        // every test written before CH-025 behaves exactly as it did.
        findMany: jest.fn().mockResolvedValue([]),
      },
      requestEvent: { create: jest.fn() },
    };
    snow = { getRecordByNumber: jest.fn() };
    stage = { recomputeRequestStatus: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RequestService,
        { provide: PrismaService, useValue: prisma },
        { provide: ServiceNowService, useValue: snow },
        { provide: StageService, useValue: stage },
      ],
    }).compile();
    service = moduleRef.get(RequestService);
  });

  describe('intake', () => {
    it('creates an OPEN request from a manual payload (no SN lookup)', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
      prisma.request.create.mockImplementation(({ data }) => ({
        id: 'r1',
        ...data,
      }));

      const res = await service.intake(
        {
          targetUpn: 'new.user@rhk.com',
          opcoId: 'o1',
        },
        ADMIN,
      );

      expect(snow.getRecordByNumber).not.toHaveBeenCalled();
      expect(res).toMatchObject({ id: 'r1', status: 'OPEN', opcoId: 'o1' });
    });

    it('pulls + mirrors ServiceNow fields when a number is given', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
      snow.getRecordByNumber.mockResolvedValue({
        sys_id: 'sys123',
        number: 'RITM0012345',
        state: '2',
        short_description: 'Onboard new hire',
      });
      prisma.request.create.mockImplementation(({ data }) => ({
        id: 'r1',
        ...data,
      }));

      const res = await service.intake(
        {
          targetUpn: 'new.user@rhk.com',
          opcoId: 'o1',
          serviceNowNumber: 'RITM0012345',
        },
        ADMIN,
      );

      expect(snow.getRecordByNumber).toHaveBeenCalledWith('RITM0012345');
      expect(res).toMatchObject({
        serviceNowSysId: 'sys123',
        serviceNowNumber: 'RITM0012345',
        serviceNowStatus: '2',
        rawRequestText: 'Onboard new hire',
      });
    });

    it('throws NotFound when the OpCo is unknown', async () => {
      prisma.opco.findUnique.mockResolvedValue(null);

      await expect(
        service.intake({ targetUpn: 'x@y.com', opcoId: 'nope' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('throws NotFound when the ServiceNow record is missing', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
      snow.getRecordByNumber.mockResolvedValue(null);

      await expect(
        service.intake(
          {
            targetUpn: 'x@y.com',
            opcoId: 'o1',
            serviceNowNumber: 'RITM9999999',
          },
          ADMIN,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    // AUTH-3a: OPCO_IT may only file for its own OpCo.
    it('OPCO_IT filing for another OpCo → 403, no create', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });

      await expect(
        service.intake({ targetUpn: 'x@y.com', opcoId: 'o1' }, OTHER_IT),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.request.create).not.toHaveBeenCalled();
    });
  });

  describe('addLineItem', () => {
    it('creates a REQUESTED line item with triage flag + NOTE event + recompute', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });
      prisma.skuCatalog.findUnique.mockResolvedValue({
        id: 'c1',
        skuPartNumber: 'SPE_E3',
      });
      prisma.requestLineItem.create.mockImplementation(({ data }) => ({
        id: 'li1',
        ...data,
      }));

      const item = await service.addLineItem(
        'r1',
        { skuCatalogId: 'c1', procurementRequired: true },
        ADMIN,
      );

      expect(item).toMatchObject({
        stage: 'REQUESTED',
        quantity: 1,
        procurementRequired: true,
      });
      expect(prisma.requestEvent.create).toHaveBeenCalled();
      expect(stage.recomputeRequestStatus).toHaveBeenCalledWith('r1');
    });

    it('throws NotFound when the SKU is unknown', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });
      prisma.skuCatalog.findUnique.mockResolvedValue(null);

      await expect(
        service.addLineItem('r1', { skuCatalogId: 'bad' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.requestLineItem.create).not.toHaveBeenCalled();
    });

    // AUTH-3a: OPCO_IT may only add to its own OpCo's requests.
    it('OPCO_IT adding to another OpCo request → 403, no create', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });

      await expect(
        service.addLineItem('r1', { skuCatalogId: 'c1' }, OTHER_IT),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.requestLineItem.create).not.toHaveBeenCalled();
    });

    // CH-007 D6: a platform-created request is already fully in ServiceNow.
    it('adding to a platform-created request → 409, no create', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        origin: 'platform-created',
      });

      await expect(
        service.addLineItem('r1', { skuCatalogId: 'c1' }, ADMIN),
      ).rejects.toThrow(ConflictException);
      expect(prisma.requestLineItem.create).not.toHaveBeenCalled();
    });

    /**
     * CH-025 C — a finished onboarding stays finished.
     *
     * 🔴 Before this guard the add SUCCEEDED, and `recomputeRequestStatus`
     * below then pushed the request from COMPLETED back to IN_PROGRESS: a
     * delivered onboarding quietly coming back to life, with the timeline
     * showing only "line item added".
     */
    describe('completed requests (CH-025 C)', () => {
      const intake = () =>
        prisma.request.findUnique.mockResolvedValue({
          id: 'r1',
          opcoId: 'o1',
          origin: 'onboarding-intake',
        });

      it('🔴 refuses, and writes NOTHING, once every line is assigned', async () => {
        intake();
        prisma.requestLineItem.findMany.mockResolvedValue([
          { stage: 'ASSIGNED' },
          { stage: 'ASSIGNED' },
        ]);

        await expect(
          service.addLineItem('r1', { skuCatalogId: 'c1' }, ADMIN),
        ).rejects.toThrow(ConflictException);
        // All three, because the damage was never the extra line on its own —
        // it was the status flip and the event that made it look routine.
        expect(prisma.requestLineItem.create).not.toHaveBeenCalled();
        expect(prisma.requestEvent.create).not.toHaveBeenCalled();
        expect(stage.recomputeRequestStatus).not.toHaveBeenCalled();
      });

      it('still allows while one line is outstanding', async () => {
        intake();
        prisma.requestLineItem.findMany.mockResolvedValue([
          { stage: 'ASSIGNED' },
          { stage: 'READY' },
        ]);
        prisma.skuCatalog.findUnique.mockResolvedValue({
          id: 'c1',
          skuPartNumber: 'SPE_E3',
        });
        prisma.requestLineItem.create.mockImplementation(({ data }) => ({
          id: 'li2',
          ...data,
        }));

        await expect(
          service.addLineItem('r1', { skuCatalogId: 'c1' }, ADMIN),
        ).resolves.toMatchObject({ stage: 'REQUESTED' });
      });

      /**
       * Nothing was delivered, so nothing is finished. This mirrors the
       * front-end `allLinesAssigned`; the two must not disagree about where
       * "complete" starts, or the UI hides a control the API would accept.
       */
      it('an all-cancelled request is NOT complete — adding stays open', async () => {
        intake();
        prisma.requestLineItem.findMany.mockResolvedValue([
          { stage: 'CANCELLED' },
        ]);
        prisma.skuCatalog.findUnique.mockResolvedValue({
          id: 'c1',
          skuPartNumber: 'SPE_E3',
        });
        prisma.requestLineItem.create.mockImplementation(({ data }) => ({
          id: 'li2',
          ...data,
        }));

        await expect(
          service.addLineItem('r1', { skuCatalogId: 'c1' }, ADMIN),
        ).resolves.toBeDefined();
      });
    });

    // …while intake requests (the D-1 authoring flow) still accept lines.
    it('adding to an intake request is allowed', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        origin: 'onboarding-intake',
      });
      prisma.skuCatalog.findUnique.mockResolvedValue({
        id: 'c1',
        skuPartNumber: 'SPE_E3',
      });
      prisma.requestLineItem.create.mockImplementation(({ data }) => ({
        id: 'li1',
        ...data,
      }));

      await expect(
        service.addLineItem('r1', { skuCatalogId: 'c1' }, ADMIN),
      ).resolves.toMatchObject({ stage: 'REQUESTED' });
    });
  });

  // CH-007 — header edit
  describe('updateHeader', () => {
    it('updates display fields + writes a NOTE event naming the changed fields only', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        azureSyncedAt: null,
        targetDisplayName: 'Old Name',
        requesterEmail: null,
      });

      await service.updateHeader(
        'r1',
        { targetDisplayName: 'New Name' },
        ADMIN,
      );

      expect(prisma.request.update).toHaveBeenCalled();
      // H4: the event message must name the field, never its (PII) value.
      const eventArg = prisma.requestEvent.create.mock.calls[0][0];
      expect(eventArg.data.message).toContain('targetDisplayName');
      expect(eventArg.data.message).not.toContain('New Name');
    });

    // D2 — targetUpn is the assign key once synced; editing it then is fail-closed.
    it('rejects a targetUpn change after the account has synced → 409', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        azureSyncedAt: new Date('2026-07-01'),
        targetUpn: 'old@rhk.com',
      });

      await expect(
        service.updateHeader('r1', { targetUpn: 'new@rhk.com' }, ADMIN),
      ).rejects.toThrow(ConflictException);
      expect(prisma.request.update).not.toHaveBeenCalled();
    });

    it('allows a targetUpn change before sync', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        azureSyncedAt: null,
        targetUpn: 'old@rhk.com',
      });

      await expect(
        service.updateHeader('r1', { targetUpn: 'new@rhk.com' }, ADMIN),
      ).resolves.toBeDefined();
      expect(prisma.request.update).toHaveBeenCalled();
    });

    // C3 — sync keys are not on the DTO; even if the caller smuggles them in the
    // object, the service only ever writes the four allowed columns.
    it('never writes sync keys / opcoId even if present on the payload', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        azureSyncedAt: null,
        rawRequestText: 'old',
      });

      await service.updateHeader(
        'r1',
        {
          rawRequestText: 'new',
          // @ts-expect-error — smuggled fields the DTO does not declare
          serviceNowNumber: 'REQ9999999',
          opcoId: 'evil',
          origin: 'platform-created',
        },
        ADMIN,
      );

      const updateData = prisma.request.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('serviceNowNumber');
      expect(updateData).not.toHaveProperty('opcoId');
      expect(updateData).not.toHaveProperty('origin');
    });

    it('OPCO_IT editing another OpCo request → 403', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        azureSyncedAt: null,
      });

      await expect(
        service.updateHeader('r1', { targetDisplayName: 'x' }, OTHER_IT),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.request.update).not.toHaveBeenCalled();
    });

    // A no-op PATCH (same value) must not write an empty "Header updated: " event.
    it('writes nothing when no field actually changes', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        azureSyncedAt: null,
        targetDisplayName: 'Same Name',
      });

      await service.updateHeader(
        'r1',
        { targetDisplayName: 'Same Name' },
        ADMIN,
      );

      expect(prisma.request.update).not.toHaveBeenCalled();
      expect(prisma.requestEvent.create).not.toHaveBeenCalled();
    });
  });

  // CH-007 — line item removal (D5)
  describe('removeLineItem', () => {
    const reqOk = { id: 'r1', opcoId: 'o1' };
    const line = (over: Record<string, unknown> = {}) => ({
      id: 'li1',
      requestId: 'r1',
      serviceNowSysId: null,
      stage: 'REQUESTED',
      sku: { skuPartNumber: 'SPE_E3' },
      ...over,
    });

    it('removes a REQUESTED line with no RITM + writes event + recomputes', async () => {
      prisma.request.findUnique.mockResolvedValue(reqOk);
      prisma.requestLineItem.findUnique.mockResolvedValue(line());

      await service.removeLineItem('r1', 'li1', ADMIN);

      expect(prisma.requestLineItem.delete).toHaveBeenCalledWith({
        where: { id: 'li1' },
      });
      expect(prisma.requestEvent.create).toHaveBeenCalled();
      expect(stage.recomputeRequestStatus).toHaveBeenCalledWith('r1');
    });

    it('refuses to remove a line that has an RITM in ServiceNow → 409', async () => {
      prisma.request.findUnique.mockResolvedValue(reqOk);
      prisma.requestLineItem.findUnique.mockResolvedValue(
        line({ serviceNowSysId: 'ritm-sys-1' }),
      );

      await expect(service.removeLineItem('r1', 'li1', ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.requestLineItem.delete).not.toHaveBeenCalled();
    });

    it('refuses to remove a line past REQUESTED → 409', async () => {
      prisma.request.findUnique.mockResolvedValue(reqOk);
      prisma.requestLineItem.findUnique.mockResolvedValue(
        line({ stage: 'READY' }),
      );

      await expect(service.removeLineItem('r1', 'li1', ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.requestLineItem.delete).not.toHaveBeenCalled();
    });

    it('OPCO_IT removing from another OpCo request → 403', async () => {
      prisma.request.findUnique.mockResolvedValue(reqOk);

      await expect(
        service.removeLineItem('r1', 'li1', OTHER_IT),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.requestLineItem.delete).not.toHaveBeenCalled();
    });
  });

  // AUTH-3a read scope
  describe('listRequests', () => {
    it('REGIONAL / ADMIN → no OpCo restriction (where opcoId absent)', async () => {
      await service.listRequests(ADMIN);

      const arg = prisma.request.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
    });

    it('OPCO_IT → scoped to its own OpCo (where opcoId)', async () => {
      await service.listRequests(O1_IT);

      const arg = prisma.request.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ opcoId: 'o1' });
    });
  });

  describe('getRequestDetail', () => {
    it('OPCO_IT reading its own OpCo request is allowed', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });

      await expect(
        service.getRequestDetail('r1', O1_IT),
      ).resolves.toMatchObject({ id: 'r1' });
    });

    it('OPCO_IT reading another OpCo request by id → 403 (no data leak)', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });

      await expect(service.getRequestDetail('r1', OTHER_IT)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFound when the request is missing', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.getRequestDetail('missing', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
