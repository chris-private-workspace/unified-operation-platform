import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CatalogImportService } from './catalog-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** A SkuCatalog row as the service reads it. */
interface CatalogRow {
  id: string;
  skuId: string;
  skuPartNumber: string;
  displayName: string;
  businessAlias: string | null;
  category: string | null;
  isBaseLicense: boolean;
  seatModel: string;
  active: boolean;
}

const entry = (over: Partial<CatalogRow> = {}): CatalogRow => ({
  id: 'c1',
  skuId: 'guid-1',
  skuPartNumber: 'SPE_E3',
  displayName: 'Microsoft 365 E3',
  businessAlias: null,
  category: null,
  isBaseLicense: false,
  seatModel: 'prepaid',
  active: true,
  ...over,
});

const HEADER = 'SkuId,Business alias,Category,Base licence';

function body(err: unknown): Record<string, unknown> {
  return (err as BadRequestException).getResponse() as Record<string, unknown>;
}

describe('CatalogImportService (CH-019 / ADR-0023)', () => {
  let service: CatalogImportService;
  let prisma: {
    skuCatalog: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock; logChange: jest.Mock };

  beforeEach(async () => {
    prisma = {
      skuCatalog: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        // Present only so the "never creates" assertion can prove it stayed
        // unused — the service must never mint a catalog row.
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    audit = { log: jest.fn(), logChange: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(CatalogImportService);
  });

  const catalog = (...rows: ReturnType<typeof entry>[]) =>
    prisma.skuCatalog.findMany.mockResolvedValue(rows);

  // ── round-trip / diff ────────────────────────────────────────────────────
  it('reports zero changes when an unedited export is re-uploaded (idempotent)', async () => {
    catalog(
      entry({
        businessAlias: 'E3 Bundle',
        category: 'Base',
        isBaseLicense: true,
      }),
    );

    const res = await service.import('actor-1', {
      csv: `${HEADER}\nguid-1,E3 Bundle,Base,Yes`,
    });

    expect(res.summary).toEqual({
      rows: 1,
      matched: 1,
      changes: 0,
      aliasClears: 0,
    });
    expect(res.changes).toEqual([]);
  });

  it('reports only the fields that actually changed, with before/after', async () => {
    catalog(
      entry({ businessAlias: 'Old', category: 'Base', isBaseLicense: false }),
    );

    const res = await service.import('actor-1', {
      csv: `${HEADER}\nguid-1,New,Base,Yes`,
    });

    expect(res.changes).toEqual([
      {
        skuId: 'guid-1',
        skuPartNumber: 'SPE_E3',
        displayName: 'Microsoft 365 E3',
        alias: { before: 'Old', after: 'New' },
        isBaseLicense: { before: false, after: true },
        clearsAlias: false,
      },
    ]);
    // Category was identical — it must not appear at all.
    expect(res.changes[0]).not.toHaveProperty('category');
  });

  // ── CH-026 / ADR-0032 — Seat model rides the same path ───────────────────
  it('diffs and commits a Seat model change through the bulk path', async () => {
    catalog(entry({ seatModel: 'prepaid' }));
    prisma.skuCatalog.update.mockResolvedValue(
      entry({ seatModel: 'unlimited' }),
    );

    const res = await service.import('actor-1', {
      csv: 'SkuId,Seat model\nguid-1,unlimited',
      dryRun: false,
    });

    expect(res.changes).toEqual([
      {
        skuId: 'guid-1',
        skuPartNumber: 'SPE_E3',
        displayName: 'Microsoft 365 E3',
        seatModel: { before: 'prepaid', after: 'unlimited' },
        clearsAlias: false,
      },
    ]);
    // The write itself, not just the preview: the diff and the update input are
    // two separate code paths and only one of them was the CH-019 bug shape.
    expect(prisma.skuCatalog.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { seatModel: 'unlimited' },
    });
  });

  it('reports no change when the file repeats the seat model a SKU already has', async () => {
    catalog(entry({ seatModel: 'unlimited' }));

    const res = await service.import('actor-1', {
      csv: 'SkuId,Seat model\nguid-1,Unlimited',
    });

    expect(res.changes).toEqual([]);
  });

  it('matches skuId case-insensitively', async () => {
    catalog(entry({ skuId: 'GUID-1' }));

    const res = await service.import('actor-1', {
      csv: `SkuId,Category\nguid-1,Base`,
    });

    expect(res.summary.matched).toBe(1);
    expect(res.skippedSkuIds).toEqual([]);
  });

  // ── dry-run ─────────────────────────────────────────────────────────────
  it('writes nothing on a dry run (the default) but still returns the changes', async () => {
    catalog(entry());

    const res = await service.import('actor-1', {
      csv: `SkuId,Category\nguid-1,Base`,
    });

    expect(res.dryRun).toBe(true);
    expect(res.committed).toBe(0);
    expect(res.changes).toHaveLength(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.skuCatalog.update).not.toHaveBeenCalled();
  });

  it('requires an explicit dryRun:false to write', async () => {
    catalog(entry());
    prisma.skuCatalog.update.mockResolvedValue(entry({ category: 'Base' }));

    const res = await service.import('actor-1', {
      csv: `SkuId,Category\nguid-1,Base`,
      dryRun: false,
    });

    expect(res.dryRun).toBe(false);
    expect(res.committed).toBe(1);
    expect(prisma.skuCatalog.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { category: 'Base' },
    });
  });

  // ── never creates ───────────────────────────────────────────────────────
  it('skips an unknown skuId and never creates a catalog row', async () => {
    catalog(entry());

    const res = await service.import('actor-1', {
      csv: `SkuId,Category\nguid-1,Base\nguid-nope,Add-on`,
      dryRun: false,
    });

    expect(res.skippedSkuIds).toEqual(['guid-nope']);
    expect(res.summary).toEqual({
      rows: 2,
      matched: 1,
      changes: 1,
      aliasClears: 0,
    });
    expect(prisma.skuCatalog.create).not.toHaveBeenCalled();
  });

  it('only ever writes the three curated columns', async () => {
    catalog(entry());
    prisma.skuCatalog.update.mockResolvedValue(entry());

    await service.import('actor-1', {
      csv: `${HEADER}\nguid-1,E3,Base,Yes`,
      dryRun: false,
    });

    const data = prisma.skuCatalog.update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual([
      'businessAlias',
      'category',
      'isBaseLicense',
    ]);
  });

  // ── alias collision (ADR-0023 D5) ───────────────────────────────────────
  it('rejects the whole batch when two uploaded rows would share an alias', async () => {
    catalog(
      entry(),
      entry({ id: 'c2', skuId: 'guid-2', skuPartNumber: 'SPE_E5' }),
    );

    const run = service.import('actor-1', {
      csv: `SkuId,Business alias\nguid-1,Shared\nguid-2,Shared`,
      dryRun: false,
    });

    await expect(run).rejects.toThrow(BadRequestException);
    expect(prisma.skuCatalog.update).not.toHaveBeenCalled();
  });

  // The case a naive implementation misses: the file touches one row, and the
  // alias it sets belongs to a SKU the file never mentions.
  it('rejects when a new alias collides with an untouched SKU', async () => {
    catalog(
      entry(),
      entry({
        id: 'c2',
        skuId: 'guid-2',
        skuPartNumber: 'SPE_E5',
        businessAlias: 'E5 Bundle',
      }),
    );

    let thrown: unknown;
    try {
      await service.import('actor-1', {
        csv: `SkuId,Business alias\nguid-1,E5 Bundle`,
        dryRun: false,
      });
    } catch (err) {
      thrown = err;
    }

    expect(body(thrown).code).toBe('alias-collision');
    expect(body(thrown).collisions).toEqual([
      { alias: 'E5 Bundle', skuPartNumbers: ['SPE_E3', 'SPE_E5'] },
    ]);
    expect(prisma.skuCatalog.update).not.toHaveBeenCalled();
  });

  // The preview is where an operator is meant to find out — not the commit.
  it('rejects a colliding dry run too', async () => {
    catalog(
      entry(),
      entry({ id: 'c2', skuId: 'guid-2', skuPartNumber: 'SPE_E5' }),
    );

    await expect(
      service.import('actor-1', {
        csv: `SkuId,Business alias\nguid-1,Shared\nguid-2,Shared`,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows a swap that leaves every alias unique', async () => {
    catalog(
      entry({ businessAlias: 'A' }),
      entry({
        id: 'c2',
        skuId: 'guid-2',
        skuPartNumber: 'SPE_E5',
        businessAlias: 'B',
      }),
    );
    prisma.skuCatalog.update.mockResolvedValue(entry());

    const res = await service.import('actor-1', {
      csv: `SkuId,Business alias\nguid-1,B\nguid-2,A`,
      dryRun: false,
    });

    expect(res.committed).toBe(2);
  });

  // ── alias clears (ADR-0023 D6) ──────────────────────────────────────────
  it('flags an alias clear and refuses to commit it unconfirmed', async () => {
    catalog(entry({ businessAlias: 'E3 Bundle' }));

    const preview = await service.import('actor-1', {
      csv: `SkuId,Business alias\nguid-1,`,
    });
    expect(preview.summary.aliasClears).toBe(1);
    expect(preview.changes[0].clearsAlias).toBe(true);

    let thrown: unknown;
    try {
      await service.import('actor-1', {
        csv: `SkuId,Business alias\nguid-1,`,
        dryRun: false,
      });
    } catch (err) {
      thrown = err;
    }
    expect(body(thrown).code).toBe('clears-not-confirmed');
    expect(prisma.skuCatalog.update).not.toHaveBeenCalled();
  });

  it('commits the clear once confirmed', async () => {
    catalog(entry({ businessAlias: 'E3 Bundle' }));
    prisma.skuCatalog.update.mockResolvedValue(entry());

    const res = await service.import('actor-1', {
      csv: `SkuId,Business alias\nguid-1,`,
      dryRun: false,
      confirmClears: true,
    });

    expect(res.committed).toBe(1);
    expect(prisma.skuCatalog.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { businessAlias: null },
    });
  });

  // Setting an alias on a SKU that had none is not a clear — demanding
  // confirmation for it would train operators to tick the box every time.
  it('does not treat "was already empty" as a clear', async () => {
    catalog(entry({ businessAlias: null }));
    prisma.skuCatalog.update.mockResolvedValue(entry());

    const res = await service.import('actor-1', {
      csv: `SkuId,Business alias\nguid-1,E3 Bundle`,
      dryRun: false,
    });

    expect(res.summary.aliasClears).toBe(0);
    expect(res.committed).toBe(1);
  });

  // ── audit ───────────────────────────────────────────────────────────────
  it('writes a per-SKU catalog.update plus one batch summary, in one transaction', async () => {
    catalog(
      entry(),
      entry({ id: 'c2', skuId: 'guid-2', skuPartNumber: 'SPE_E5' }),
    );
    prisma.skuCatalog.update.mockImplementation(
      async ({ where }: { where: { id: string } }) => entry({ id: where.id }),
    );

    await service.import('actor-1', {
      csv: `SkuId,Category\nguid-1,Base\nguid-2,Add-on`,
      dryRun: false,
    });

    expect(audit.logChange).toHaveBeenCalledTimes(2);
    expect(audit.logChange).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'catalog.update',
        targetType: 'SkuCatalog',
        targetId: 'c1',
        actorId: 'actor-1',
      }),
    );
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'catalog.bulk_curate',
        targetType: 'CatalogImport',
        targetId: 'bulk',
        actorId: 'actor-1',
        after: { rows: 2, matched: 2, changes: 2, aliasClears: 0, skipped: 0 },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('writes no audit row at all when nothing changed', async () => {
    catalog(entry({ category: 'Base' }));

    await service.import('actor-1', {
      csv: `SkuId,Category\nguid-1,Base`,
      dryRun: false,
    });

    expect(audit.logChange).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  // Inactive SKUs take no part in allocation matching
  // (allocation-import.service.ts:42-44), so they are out of scope here too.
  it('ignores inactive catalog entries', async () => {
    catalog(entry());

    await service.import('actor-1', { csv: `SkuId,Category\nguid-1,Base` });

    expect(prisma.skuCatalog.findMany).toHaveBeenCalledWith({
      where: { active: true },
    });
  });
});
