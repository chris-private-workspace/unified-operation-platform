import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AllocationResetService } from './allocation-reset.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { pickAuditFields } from '../audit/audit-fields';

/**
 * CH-016. What these tests can and cannot prove, stated up front so nobody
 * mistakes the second for the first (memory: scratch-db-verification):
 *
 *  - A mock CAN prove the shape of the write — that the only column named is
 *    allocatedQuantity, and that no delete of any kind is issued. That is
 *    exactly what spec §2.3 forbids, so it is exactly what is asserted here.
 *  - A mock CANNOT prove "assignedQuantity really is unchanged in the database".
 *    That claim needs a real before/after diff, and lives in the live
 *    verification (checklist V4).
 */

// The third row's SKU is inactive on purpose — that is the §2.5 case, and it
// was a real one: live verification found RTW carrying two such cells.
const LEDGER = [
  {
    allocatedQuantity: 661,
    opco: { code: 'RHK' },
    sku: { skuPartNumber: 'SPE_E3', active: true },
  },
  {
    allocatedQuantity: 80,
    opco: { code: 'RHK' },
    sku: { skuPartNumber: 'STANDARDPACK', active: true },
  },
  {
    allocatedQuantity: 1624,
    opco: { code: 'RTH' },
    sku: { skuPartNumber: 'VISIO_PLAN1', active: false },
  },
];

describe('AllocationResetService (CH-016)', () => {
  let service: AllocationResetService;
  let prisma: any;
  let audit: { buildLogArgs: jest.Mock };

  beforeEach(async () => {
    prisma = {
      opco: { findUnique: jest.fn() },
      opcoSkuLedger: {
        findMany: jest.fn().mockResolvedValue(LEDGER),
        updateMany: jest.fn().mockResolvedValue({ count: LEDGER.length }),
        // Present but never wired to anything — if the service ever grows a
        // delete, these exist so the assertion below fails loudly rather than
        // erroring on an undefined mock.
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    audit = { buildLogArgs: jest.fn(() => ({ data: {} })) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AllocationResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AllocationResetService);
  });

  describe('the two boundaries that must never move (spec §2.3)', () => {
    it('writes allocatedQuantity and NOTHING else', async () => {
      await service.reset('actor-1', { dryRun: false });

      const { data } = prisma.opcoSkuLedger.updateMany.mock.calls[0][0];
      expect(data).toEqual({ allocatedQuantity: 0 });
      // Named explicitly: assignedQuantity is the drift baseline AND the total
      // assign increments. A future edit that adds it here is the failure this
      // whole CH exists to prevent (spec R4).
      expect(Object.keys(data)).not.toContain('assignedQuantity');
    });

    it('never deletes a ledger row', async () => {
      await service.reset('actor-1', { dryRun: false });

      expect(prisma.opcoSkuLedger.delete).not.toHaveBeenCalled();
      expect(prisma.opcoSkuLedger.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('dry-run (the default)', () => {
    it('previews without an explicit flag and writes nothing', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.dryRun).toBe(true);
      expect(res.affected).toBe(3);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('dryRun: true is the same as omitting it', async () => {
      const res = await service.reset('actor-1', { dryRun: true });

      expect(res.dryRun).toBe(true);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
    });

    it('lists the cells it would zero, so the UI can show them', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.rows).toEqual([
        {
          opcoCode: 'RHK',
          skuPartNumber: 'SPE_E3',
          before: 661,
          skuActive: true,
        },
        {
          opcoCode: 'RHK',
          skuPartNumber: 'STANDARDPACK',
          before: 80,
          skuActive: true,
        },
        {
          opcoCode: 'RTH',
          skuPartNumber: 'VISIO_PLAN1',
          before: 1624,
          skuActive: false,
        },
      ]);
    });
  });

  /**
   * §2.5 — found by live verification, not by reasoning: re-importing after a
   * reset restored only 2 of 4 cells, because the import reads `active: true`
   * catalog entries only. The reset still clears those cells (clearing a
   * retired SKU's leftover budget is a real reason to reset), but the operator
   * has to see which ones before pressing.
   */
  describe('inactive SKUs — the cells a re-import cannot bring back', () => {
    it('counts them separately from `affected`', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.affected).toBe(3);
      expect(res.irreversible).toBe(1);
    });

    it('flags the row itself, so the preview can mark it', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.rows.filter((r) => !r.skuActive)).toHaveLength(1);
      expect(res.rows.find((r) => !r.skuActive)?.skuPartNumber).toBe(
        'VISIO_PLAN1',
      );
    });

    it('still resets them — this is a warning, not a filter', async () => {
      await service.reset('actor-1', { dryRun: false });

      // The where clause must NOT have grown a sku.active condition: clearing
      // a retired SKU's leftover allocation is a supported use, not a mistake.
      const { where } = prisma.opcoSkuLedger.updateMany.mock.calls[0][0];
      expect(JSON.stringify(where)).not.toContain('active');
    });

    it('appends the caveat to the warning, keeping the mid-state half', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.warning).toContain('block assigns'); // the always-true half
      expect(res.warning).toContain('1 cell belong'); // singular, from 1
      expect(res.warning).toContain('INACTIVE SKU');
      expect(res.warning).toContain('per-row correction');
    });

    it('says nothing extra when every SKU in scope is active', async () => {
      prisma.opcoSkuLedger.findMany.mockResolvedValue([LEDGER[0], LEDGER[1]]);

      const res = await service.reset('actor-1', {});

      expect(res.irreversible).toBe(0);
      expect(res.warning).not.toContain('INACTIVE');
    });
  });

  describe('commit', () => {
    it('zeroes and reports what it touched', async () => {
      const res = await service.reset('actor-1', { dryRun: false });

      expect(res.dryRun).toBe(false);
      expect(res.affected).toBe(3);
      expect(prisma.opcoSkuLedger.updateMany).toHaveBeenCalledTimes(1);
    });

    it('skips cells already at zero — same no-op rule as the import', async () => {
      await service.reset('actor-1', { dryRun: false });

      const { where } = prisma.opcoSkuLedger.updateMany.mock.calls[0][0];
      expect(where.allocatedQuantity).toEqual({ not: 0 });
      // The preview query must use the identical filter, otherwise `affected`
      // would describe a different set of rows than the one being written.
      expect(prisma.opcoSkuLedger.findMany.mock.calls[0][0].where).toEqual(
        where,
      );
    });

    it('writes nothing at all when there is nothing to zero', async () => {
      prisma.opcoSkuLedger.findMany.mockResolvedValue([]);

      const res = await service.reset('actor-1', { dryRun: false });

      expect(res.affected).toBe(0);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('OpCo scope', () => {
    it('limits the write to one OpCo', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'opco-rhk', code: 'RHK' });

      const res = await service.reset('actor-1', {
        dryRun: false,
        opcoCode: 'RHK',
      });

      expect(res.scope).toBe('RHK');
      expect(prisma.opcoSkuLedger.updateMany.mock.calls[0][0].where).toEqual({
        allocatedQuantity: { not: 0 },
        opcoId: 'opco-rhk',
      });
    });

    it('reports scope "all" when no OpCo is given', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.scope).toBe('all');
      expect(prisma.opco.findUnique).not.toHaveBeenCalled();
    });

    /**
     * The worst failure this endpoint could have: a typo'd code silently
     * matching nothing and therefore resetting EVERY OpCo. 404 instead.
     */
    it('404s on an unknown OpCo instead of falling back to all', async () => {
      prisma.opco.findUnique.mockResolvedValue(null);

      await expect(
        service.reset('actor-1', { dryRun: false, opcoCode: 'NOPE' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('audit (ADR-0009)', () => {
    it('writes one summary row inside the same transaction as the write', async () => {
      await service.reset('actor-1', { dryRun: false, opcoCode: undefined });

      expect(audit.buildLogArgs).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'allocation.reset',
          targetType: 'AllocationReset',
          targetId: 'bulk',
          actorId: 'actor-1',
          after: { affected: 3, scope: 'all' },
        }),
      );
      // Both operations in one array-form $transaction — a zeroed ledger with
      // no audit row is the state ADR-0009 D8.1 exists to prevent.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    });

    /**
     * Regression guard for a real trap (seen in CH-015): the audit field
     * allow-list silently DROPS keys it does not know, so a summary can end up
     * empty while every test still passes.
     */
    it('its summary keys survive the ADR-0009 allow-list', () => {
      expect(
        pickAuditFields('AllocationReset', { affected: 3, scope: 'RHK' }),
      ).toEqual({ affected: 3, scope: 'RHK' });
    });
  });

  it('always returns the mid-state warning, dry-run or not', async () => {
    const preview = await service.reset('actor-1', {});
    const committed = await service.reset('actor-1', { dryRun: false });

    for (const res of [preview, committed]) {
      expect(res.warning).toContain('allocated = 0');
      expect(res.warning).toContain('block assigns');
      // The reassurance half matters as much as the warning half.
      expect(res.warning).toContain('assignedQuantity is not touched');
    }
  });
});
