import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LedgerFullResetService } from './ledger-full-reset.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { pickAuditFields } from '../audit/audit-fields';

/**
 * CH-017 / ADR-0022. What these tests can and cannot prove, stated up front
 * (memory: scratch-db-verification):
 *
 *  - A mock CAN prove the shape of the write — that exactly two columns are
 *    named, that no delete of any kind is issued, and that a LedgerAdjustment is
 *    created for every assigned cell and no allocated-only one. Those are the
 *    boundaries ADR-0022 draws, so those are what is asserted here.
 *  - A mock CANNOT prove "the row count in Postgres is unchanged" or "the
 *    adjustments really carry the overwritten values". That needs a real
 *    before/after diff and lives in live verification (checklist V4).
 */

/**
 * Deliberately covers all four combinations, because each one exercises a
 * different branch. Row 2 is the case that started this change: allocation
 * already zeroed by CH-016, assigned still holding the row on screen.
 */
const LEDGER = [
  {
    id: 'led-1',
    allocatedQuantity: 661,
    assignedQuantity: 500,
    opco: { code: 'RHK' },
    sku: { skuPartNumber: 'SPE_E3', active: true },
  },
  {
    id: 'led-2',
    allocatedQuantity: 0,
    assignedQuantity: 80,
    opco: { code: 'RHK' },
    sku: { skuPartNumber: 'STANDARDPACK', active: true },
  },
  {
    id: 'led-3',
    allocatedQuantity: 1624,
    assignedQuantity: 0,
    opco: { code: 'RTH' },
    sku: { skuPartNumber: 'VISIO_PLAN1', active: false },
  },
  {
    id: 'led-4',
    allocatedQuantity: 100,
    assignedQuantity: 0,
    opco: { code: 'RTH' },
    sku: { skuPartNumber: 'EMS', active: true },
  },
];

const COMMIT_ALL = { dryRun: false, confirm: 'ALL' };

describe('LedgerFullResetService (CH-017)', () => {
  let service: LedgerFullResetService;
  let prisma: any;
  let audit: { buildLogArgs: jest.Mock };

  beforeEach(async () => {
    prisma = {
      opco: { findUnique: jest.fn() },
      opcoSkuLedger: {
        findMany: jest.fn().mockResolvedValue(LEDGER),
        updateMany: jest.fn().mockResolvedValue({ count: LEDGER.length }),
        // Wired to nothing on purpose — they exist so the "never deletes"
        // assertion fails loudly instead of erroring on an undefined mock.
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      ledgerAdjustment: { createMany: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    // Interactive form: the service reads inside the transaction so the values
    // it records as `beforeValue` are the ones it overwrote. Handing the same
    // object back as `tx` keeps the call assertions in one place.
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    audit = { buildLogArgs: jest.fn(() => ({ data: {} })) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LedgerFullResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(LedgerFullResetService);
  });

  describe('the boundaries that must never move (ADR-0022 D1 / spec §2.7)', () => {
    it('never deletes a ledger row', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      expect(prisma.opcoSkuLedger.delete).not.toHaveBeenCalled();
      expect(prisma.opcoSkuLedger.deleteMany).not.toHaveBeenCalled();
    });

    it('writes exactly the two quantity columns and nothing else', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      const { data } = prisma.opcoSkuLedger.updateMany.mock.calls[0][0];
      expect(data).toEqual({ allocatedQuantity: 0, assignedQuantity: 0 });
    });

    it('does everything in one transaction — a zeroed ledger with no audit row is the state ADR-0009 D8.1 prevents', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * ADR-0022 D4. The asymmetry is the point: allocated follows the import's
   * convention (no per-cell trail), assigned follows ADR-0014's (a bulk assigned
   * write is a batch of manual corrections).
   */
  describe('LedgerAdjustment trail', () => {
    it('records one adjustment per assigned cell, and none for allocated-only cells', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      const { data } = prisma.ledgerAdjustment.createMany.mock.calls[0][0];
      expect(data).toHaveLength(2); // led-1 (500) and led-2 (80) only
      expect(data.map((d: any) => d.ledgerId)).toEqual(['led-1', 'led-2']);
    });

    it('carries the overwritten value, so the figure is recoverable afterwards', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      const { data } = prisma.ledgerAdjustment.createMany.mock.calls[0][0];
      expect(data[0]).toEqual({
        ledgerId: 'led-1',
        field: 'assignedQuantity',
        beforeValue: 500,
        afterValue: 0,
        reason: 'Ledger full reset (CH-017), scope all',
        actorId: 'actor-1',
      });
    });

    it('never records an allocatedQuantity adjustment — that column keeps the import convention', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      const { data } = prisma.ledgerAdjustment.createMany.mock.calls[0][0];
      expect(data.every((d: any) => d.field === 'assignedQuantity')).toBe(true);
    });

    it('skips the createMany entirely when no assigned cell is in scope', async () => {
      prisma.opcoSkuLedger.findMany.mockResolvedValue([LEDGER[2], LEDGER[3]]);

      await service.reset('actor-1', COMMIT_ALL);

      expect(prisma.opcoSkuLedger.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.ledgerAdjustment.createMany).not.toHaveBeenCalled();
    });
  });

  describe('typed confirmation (ADR-0022 D6)', () => {
    it('rejects a commit with no confirmation, writing nothing', async () => {
      await expect(
        service.reset('actor-1', { dryRun: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a mistyped confirmation', async () => {
      await expect(
        service.reset('actor-1', { dryRun: false, confirm: 'all' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
    });

    /**
     * The mix-up worth catching: typing the habitual ALL while an OpCo filter is
     * set would confirm a scope the operator is not actually looking at.
     */
    it('rejects ALL when the request is scoped to one OpCo', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'opco-rhk', code: 'RHK' });

      await expect(
        service.reset('actor-1', {
          dryRun: false,
          opcoCode: 'RHK',
          confirm: 'ALL',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
    });

    it('accepts the OpCo code as confirmation for a scoped reset', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'opco-rhk', code: 'RHK' });

      const res = await service.reset('actor-1', {
        dryRun: false,
        opcoCode: 'RHK',
        confirm: 'RHK',
      });

      expect(res.dryRun).toBe(false);
      expect(prisma.opcoSkuLedger.updateMany).toHaveBeenCalledTimes(1);
    });

    it('never asks for confirmation on a preview — nobody should type it before seeing the scope', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.dryRun).toBe(true);
      expect(res.affected).toBe(4);
    });
  });

  describe('dry-run (the default)', () => {
    it('previews without an explicit flag and writes nothing', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.dryRun).toBe(true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
      expect(prisma.ledgerAdjustment.createMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('reports both halves separately, so the UI can say which is unrecoverable', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.affected).toBe(4);
      expect(res.allocatedCells).toBe(3); // 661, 1624, 100
      expect(res.assignedCells).toBe(2); // 500, 80
      expect(res.irreversibleAllocated).toBe(1); // VISIO_PLAN1 — inactive SKU
    });

    it('lists every cell with both before-values', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.rows[1]).toEqual({
        opcoCode: 'RHK',
        skuPartNumber: 'STANDARDPACK',
        allocatedBefore: 0,
        assignedBefore: 80,
        skuActive: true,
      });
    });
  });

  describe('scope selection', () => {
    it('matches a row if EITHER number is non-zero — the CH-016 leftover case', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      const { where } = prisma.opcoSkuLedger.updateMany.mock.calls[0][0];
      expect(where.OR).toEqual([
        { allocatedQuantity: { not: 0 } },
        { assignedQuantity: { not: 0 } },
      ]);
    });

    it('previews and writes with the identical filter', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      const readWhere = prisma.opcoSkuLedger.findMany.mock.calls[0][0].where;
      const writeWhere = prisma.opcoSkuLedger.updateMany.mock.calls[0][0].where;
      expect(readWhere).toEqual(writeWhere);
    });

    it('limits the write to one OpCo', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'opco-rhk', code: 'RHK' });

      const res = await service.reset('actor-1', {
        dryRun: false,
        opcoCode: 'RHK',
        confirm: 'RHK',
      });

      expect(res.scope).toBe('RHK');
      expect(
        prisma.opcoSkuLedger.updateMany.mock.calls[0][0].where.opcoId,
      ).toBe('opco-rhk');
    });

    /**
     * The worst failure this endpoint could have: a typo'd code matching nothing
     * and therefore clearing EVERY OpCo.
     */
    it('404s on an unknown OpCo instead of falling back to all', async () => {
      prisma.opco.findUnique.mockResolvedValue(null);

      await expect(
        service.reset('actor-1', {
          dryRun: false,
          opcoCode: 'NOPE',
          confirm: 'NOPE',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
    });

    it('never filters on sku.active — clearing a retired SKU is a supported use', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      const { where } = prisma.opcoSkuLedger.updateMany.mock.calls[0][0];
      expect(JSON.stringify(where)).not.toContain('active');
    });

    it('writes nothing at all when there is nothing to clear', async () => {
      prisma.opcoSkuLedger.findMany.mockResolvedValue([]);

      const res = await service.reset('actor-1', COMMIT_ALL);

      expect(res.affected).toBe(0);
      expect(prisma.opcoSkuLedger.updateMany).not.toHaveBeenCalled();
      expect(prisma.ledgerAdjustment.createMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('audit (ADR-0009)', () => {
    it('writes one summary row with both counts', async () => {
      await service.reset('actor-1', COMMIT_ALL);

      expect(audit.buildLogArgs).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ledger.full_reset',
          targetType: 'LedgerFullReset',
          targetId: 'bulk',
          actorId: 'actor-1',
          after: {
            affected: 4,
            scope: 'all',
            allocatedCells: 3,
            assignedCells: 2,
          },
        }),
      );
    });

    /**
     * Regression guard for a real trap (CH-015, and CH-016 repeated it): the
     * allow-list silently DROPS unknown keys, so a summary can end up empty
     * while every other test still passes.
     */
    it('its summary keys survive the ADR-0009 allow-list', () => {
      expect(
        pickAuditFields('LedgerFullReset', {
          affected: 4,
          scope: 'RHK',
          allocatedCells: 3,
          assignedCells: 2,
        }),
      ).toEqual({
        affected: 4,
        scope: 'RHK',
        allocatedCells: 3,
        assignedCells: 2,
      });
    });
  });

  /**
   * ADR-0022 D7 — the two consequences are different in kind. Collapsing them
   * into one "just import again" sentence would be false about the assigned
   * half, which is the whole reason this operation is riskier than CH-016.
   */
  describe('warning', () => {
    it('always states the assign-blocking mid-state', async () => {
      const preview = await service.reset('actor-1', {});
      const committed = await service.reset('actor-1', COMMIT_ALL);

      for (const res of [preview, committed]) {
        expect(res.warning).toContain('allocated = 0');
        expect(res.warning).toContain('block assigns');
        expect(res.warning).toContain('No ledger rows are deleted');
      }
    });

    it('states that the assigned baseline has no way back, with the count', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.warning).toContain('2 cells lose their assigned baseline');
      expect(res.warning).toContain('NO import can put it back');
      expect(res.warning).toContain('drift reconciliation has no baseline');
    });

    it('keeps the inactive-SKU caveat separate from the assigned one', async () => {
      const res = await service.reset('actor-1', {});

      expect(res.warning).toContain('1 cell belong'); // singular, from 1
      expect(res.warning).toContain('INACTIVE SKU');
    });

    it('says nothing about assigned when no assigned cell is in scope', async () => {
      prisma.opcoSkuLedger.findMany.mockResolvedValue([LEDGER[3]]);

      const res = await service.reset('actor-1', {});

      expect(res.assignedCells).toBe(0);
      expect(res.warning).not.toContain('assigned baseline');
      expect(res.warning).not.toContain('INACTIVE');
      expect(res.warning).toContain('block assigns'); // the always-true half
    });
  });
});
