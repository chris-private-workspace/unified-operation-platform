import {
  applyAssignedBaseline,
  BaselineDb,
  BaselineTx,
  planAssignedBaseline,
} from './assigned-baseline';

// Two OpCos + two curated SKUs; the D365 row is deliberately uncurated to
// exercise curation-as-scope (same gate as allocation import, ADR-0004 #3).
const OPCOS = [
  { id: 'opco-rhk', code: 'RHK' },
  { id: 'opco-rth', code: 'RTH' },
];
const CATALOG = [
  { id: 'sku-e3', skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' },
  { id: 'sku-e1', skuPartNumber: 'STANDARDPACK', businessAlias: 'O365 E1' },
];
const CSV = [
  ',RHK,RTH,Grand Total',
  'M365 E3,120,45,165',
  'O365 E1,8,0,8',
  'D365 Sales Sub Per User,,175,175', // uncurated → skipped
].join('\n');

describe('planAssignedBaseline', () => {
  it('maps OpCo + SKU and diffs against the current assigned baseline', () => {
    const plan = planAssignedBaseline(CSV, OPCOS, CATALOG, []);

    expect(plan.opcoColumns).toBe(2);
    expect(plan.skuRows).toBe(3);
    expect(plan.mappedSkuRows).toBe(2);
    // RHK×E3=120, RTH×E3=45, RHK×E1=8 change; RTH×E1 is 0→0 = no-op
    expect(plan.changes).toHaveLength(3);
    expect(plan.changes).toContainEqual({
      opcoId: 'opco-rhk',
      opcoCode: 'RHK',
      skuCatalogId: 'sku-e3',
      skuBusinessAlias: 'M365 E3',
      skuPartNumber: 'SPE_E3',
      before: 0,
      target: 120,
      delta: 120,
    });
    expect(plan.skippedSkuLabels).toEqual(['D365 Sales Sub Per User']);
    expect(plan.unknownOpcoHeaders).toEqual([]);
  });

  it('diffs against assignedQuantity — NOT allocatedQuantity', () => {
    // A row whose allocated is wildly different from assigned: the plan must
    // read the assigned baseline only, so before=5 (not 600).
    const plan = planAssignedBaseline(CSV, OPCOS, CATALOG, [
      { opcoId: 'opco-rhk', skuCatalogId: 'sku-e3', assignedQuantity: 5 },
    ]);
    const c = plan.changes.find(
      (x) => x.opcoId === 'opco-rhk' && x.skuCatalogId === 'sku-e3',
    );
    expect(c).toMatchObject({ before: 5, target: 120, delta: 115 });
  });

  it('idempotent: values already in the baseline yield zero changes', () => {
    const plan = planAssignedBaseline(CSV, OPCOS, CATALOG, [
      { opcoId: 'opco-rhk', skuCatalogId: 'sku-e3', assignedQuantity: 120 },
      { opcoId: 'opco-rth', skuCatalogId: 'sku-e3', assignedQuantity: 45 },
      { opcoId: 'opco-rhk', skuCatalogId: 'sku-e1', assignedQuantity: 8 },
      { opcoId: 'opco-rth', skuCatalogId: 'sku-e1', assignedQuantity: 0 },
    ]);
    expect(plan.changes).toEqual([]);
  });

  it('a blank cell downgrades an existing baseline to 0 (explicit, not ignored)', () => {
    const csv = [',RHK,Grand Total', 'M365 E3,,0'].join('\n');
    const plan = planAssignedBaseline(csv, OPCOS, CATALOG, [
      { opcoId: 'opco-rhk', skuCatalogId: 'sku-e3', assignedQuantity: 30 },
    ]);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      before: 30,
      target: 0,
      delta: -30,
    });
  });

  it('reports header columns matching no Opco.code ("Grand Total" is not unknown)', () => {
    const csv = [',RHK,BOGUS,Grand Total', 'M365 E3,10,20,30'].join('\n');
    const plan = planAssignedBaseline(csv, OPCOS, CATALOG, []);
    expect(plan.unknownOpcoHeaders).toEqual(['BOGUS']);
    expect(plan.opcoColumns).toBe(1);
  });

  it('a curated D365 SKU is planned like any other — curation is the only gate', () => {
    const plan = planAssignedBaseline(
      CSV,
      OPCOS,
      [
        ...CATALOG,
        {
          id: 'sku-d365',
          skuPartNumber: 'DYN365_ENTERPRISE_SALES',
          businessAlias: 'D365 Sales Sub Per User',
        },
      ],
      [],
    );
    expect(plan.skippedSkuLabels).toEqual([]);
    expect(plan.changes).toContainEqual(
      expect.objectContaining({
        opcoCode: 'RTH',
        skuCatalogId: 'sku-d365',
        target: 175,
      }),
    );
  });
});

describe('applyAssignedBaseline', () => {
  let upsert: jest.Mock;
  let createMany: jest.Mock;
  let db: BaselineDb;

  beforeEach(() => {
    let n = 0;
    upsert = jest.fn().mockImplementation(() => {
      n += 1;
      return Promise.resolve({ id: `ledger-${n}` });
    });
    createMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx: BaselineTx = {
      opcoSkuLedger: { upsert },
      ledgerAdjustment: { createMany },
    };
    db = { $transaction: jest.fn((fn) => fn(tx)) } as unknown as BaselineDb;
  });

  const plan = () => planAssignedBaseline(CSV, OPCOS, CATALOG, []);

  it('writes ONLY assignedQuantity — never touches allocatedQuantity (mirror invariant)', async () => {
    const written = await applyAssignedBaseline(db, plan(), {
      actorId: 'actor-1',
      reason: 'go-live baseline',
    });

    expect(written).toBe(3);
    expect(upsert).toHaveBeenCalledTimes(3);
    for (const call of upsert.mock.calls) {
      const arg = call[0];
      // INVARIANT: neither branch may mention allocatedQuantity.
      expect(arg.update).not.toHaveProperty('allocatedQuantity');
      expect(arg.create).not.toHaveProperty('allocatedQuantity');
      expect(Object.keys(arg.update)).toEqual(['assignedQuantity']);
      // create omits it entirely → schema default 0, left for allocation import
      expect(Object.keys(arg.create).sort()).toEqual([
        'assignedQuantity',
        'opcoId',
        'skuCatalogId',
      ]);
    }
  });

  it('records one LedgerAdjustment per changed cell, in the same transaction', async () => {
    await applyAssignedBaseline(db, plan(), {
      actorId: 'actor-1',
      reason: 'go-live baseline',
    });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.field).toBe('assignedQuantity');
      expect(r.reason).toBe('go-live baseline');
      expect(r.actorId).toBe('actor-1');
      expect(typeof r.ledgerId).toBe('string');
    }
    // before/after mirror the plan, so the trail explains the jump
    expect(rows).toContainEqual(
      expect.objectContaining({ beforeValue: 0, afterValue: 120 }),
    );
  });

  it('an unidentified operator is allowed — actorId null (schema permits it)', async () => {
    await applyAssignedBaseline(db, plan(), {
      actorId: null,
      reason: 'go-live baseline',
    });
    for (const r of createMany.mock.calls[0][0].data) {
      expect(r.actorId).toBeNull();
    }
  });

  it('an empty plan writes nothing at all (no transaction, no audit)', async () => {
    const empty = planAssignedBaseline(CSV, OPCOS, CATALOG, [
      { opcoId: 'opco-rhk', skuCatalogId: 'sku-e3', assignedQuantity: 120 },
      { opcoId: 'opco-rth', skuCatalogId: 'sku-e3', assignedQuantity: 45 },
      { opcoId: 'opco-rhk', skuCatalogId: 'sku-e1', assignedQuantity: 8 },
    ]);

    const written = await applyAssignedBaseline(db, empty, {
      actorId: null,
      reason: 'go-live baseline',
    });

    expect(written).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
