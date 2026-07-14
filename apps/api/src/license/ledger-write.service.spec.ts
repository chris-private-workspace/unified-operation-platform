import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { LedgerWriteService } from './ledger-write.service';
import { PrismaService } from '../prisma/prisma.service';

// Actors: ADMIN (opcoScopeId null → all OpCos) vs OPCO_IT scoped to opco-rhk.
const ADMIN = {
  id: 'u-admin',
  opcoScopeId: null,
  role: 'ADMIN',
} as unknown as AppUser;
const OPCO_RHK = {
  id: 'u-rhk',
  opcoScopeId: 'opco-rhk',
  role: 'OPCO_IT',
} as unknown as AppUser;

// A ledger row belonging to RHK: allocated 100 / assigned 10.
const ROW = {
  id: 'row-1',
  opcoId: 'opco-rhk',
  skuCatalogId: 'sku-e3',
  allocatedQuantity: 100,
  assignedQuantity: 10,
  opco: { code: 'RHK', displayName: 'RHK' },
  sku: {
    skuId: 'x',
    skuPartNumber: 'SPE_E3',
    displayName: 'E3',
    category: null,
  },
};

describe('LedgerWriteService (ADR-0007 / W23-A)', () => {
  let service: LedgerWriteService;
  let prisma: {
    opcoSkuLedger: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    opcoSkuLedger: { update: jest.Mock };
    ledgerAdjustment: { createMany: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      opcoSkuLedger: {
        update: jest.fn(({ data }) =>
          Promise.resolve({
            ...ROW,
            allocatedQuantity: data.allocatedQuantity ?? ROW.allocatedQuantity,
            assignedQuantity: data.assignedQuantity ?? ROW.assignedQuantity,
          }),
        ),
      },
      ledgerAdjustment: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = {
      opcoSkuLedger: { findUnique: jest.fn().mockResolvedValue({ ...ROW }) },
      // callback-form $transaction — run the callback with the tx mock.
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LedgerWriteService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(LedgerWriteService);
  });

  it('ADMIN set allocatedQuantity (absolute) → updates only that field + one audit row', async () => {
    const res = await service.updateLedgerRow(ADMIN, 'row-1', {
      allocatedQuantity: 150,
    });

    // only allocatedQuantity written — assignedQuantity untouched (各欄獨立)
    const data = tx.opcoSkuLedger.update.mock.calls[0][0].data;
    expect(data).toEqual({ allocatedQuantity: 150 });
    expect(data).not.toHaveProperty('assignedQuantity');

    // one adjustment: before 100 → after 150, actor stamped, no reason → null
    const adj = tx.ledgerAdjustment.createMany.mock.calls[0][0].data;
    expect(adj).toEqual([
      {
        ledgerId: 'row-1',
        field: 'allocatedQuantity',
        beforeValue: 100,
        afterValue: 150,
        reason: null,
        actorId: 'u-admin',
      },
    ]);

    // returned DTO reflects new value + derived headroom (150 - 10)
    expect(res.allocatedQuantity).toBe(150);
    expect(res.headroom).toBe(140);
  });

  it('manual assigned correction (對回) → assignedQuantity set + audited, allocated untouched', async () => {
    const res = await service.updateLedgerRow(ADMIN, 'row-1', {
      assignedQuantity: 30,
      reason: '對回 drift',
    });

    const data = tx.opcoSkuLedger.update.mock.calls[0][0].data;
    expect(data).toEqual({ assignedQuantity: 30 });
    expect(data).not.toHaveProperty('allocatedQuantity');

    const adj = tx.ledgerAdjustment.createMany.mock.calls[0][0].data;
    expect(adj[0]).toMatchObject({
      field: 'assignedQuantity',
      beforeValue: 10,
      afterValue: 30,
      reason: '對回 drift',
    });
    expect(res.assignedQuantity).toBe(30);
  });

  it('both fields changed → two audit rows', async () => {
    await service.updateLedgerRow(ADMIN, 'row-1', {
      allocatedQuantity: 200,
      assignedQuantity: 50,
    });
    const adj = tx.ledgerAdjustment.createMany.mock.calls[0][0].data;
    expect(adj).toHaveLength(2);
    expect(adj.map((a: { field: string }) => a.field).sort()).toEqual([
      'allocatedQuantity',
      'assignedQuantity',
    ]);
  });

  it('OPCO_IT editing its OWN OpCo is allowed', async () => {
    await expect(
      service.updateLedgerRow(OPCO_RHK, 'row-1', { allocatedQuantity: 120 }),
    ).resolves.toBeDefined();
    expect(tx.opcoSkuLedger.update).toHaveBeenCalled();
  });

  it('OPCO_IT editing ANOTHER OpCo → 403 fail-closed, nothing written', async () => {
    prisma.opcoSkuLedger.findUnique.mockResolvedValue({
      ...ROW,
      opcoId: 'opco-rth',
    });
    await expect(
      service.updateLedgerRow(OPCO_RHK, 'row-1', { allocatedQuantity: 120 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no field supplied → 400 before any DB access', async () => {
    await expect(
      service.updateLedgerRow(ADMIN, 'row-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.opcoSkuLedger.findUnique).not.toHaveBeenCalled();
  });

  it('unknown row → 404', async () => {
    prisma.opcoSkuLedger.findUnique.mockResolvedValue(null);
    await expect(
      service.updateLedgerRow(ADMIN, 'nope', { allocatedQuantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no-op (value equals current) → no transaction, no audit, returns current row', async () => {
    const res = await service.updateLedgerRow(ADMIN, 'row-1', {
      allocatedQuantity: 100, // same as ROW
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.ledgerAdjustment.createMany).not.toHaveBeenCalled();
    expect(res.allocatedQuantity).toBe(100);
  });
});
