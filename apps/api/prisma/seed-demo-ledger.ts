import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * DEV/DEMO ONLY — populate OpcoSkuLedger with random allocation data so the
 * License Assets By-OpCo view has every active OpCo to filter on (real prod data
 * arrives via allocation-import, ADR-0004). Idempotent: only pairs that do NOT
 * already have a ledger row are inserted, so re-running fills gaps and NEVER
 * overwrites existing rows (e.g. the seeded RHK / RTH allocations stay intact).
 *
 * Run: npm run demo:ledger  (ts-node prisma/seed-demo-ledger.ts)
 */

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Base bundles get bigger allocations than add-ons — makes the numbers read like
// a real tenant rather than uniform noise.
const BASE_PARTS = new Set(['SPE_E3', 'SPE_E5', 'DESKLESSPACK', 'STANDARDPACK']);

async function main() {
  const opcos = await prisma.opco.findMany({
    where: { active: true },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  });
  const skus = await prisma.skuCatalog.findMany({
    where: { active: true },
    select: { id: true, skuPartNumber: true },
  });

  if (skus.length === 0) {
    throw new Error(
      'No SKUs in catalog — run POST /license/catalog/sync first, then re-run.',
    );
  }

  // Existing (opco,sku) pairs — never touched, so RHK/RTH keep their data.
  const existing = await prisma.opcoSkuLedger.findMany({
    select: { opcoId: true, skuCatalogId: true },
  });
  const seen = new Set(existing.map((r) => `${r.opcoId}:${r.skuCatalogId}`));

  const rows: {
    opcoId: string;
    skuCatalogId: string;
    allocatedQuantity: number;
    assignedQuantity: number;
  }[] = [];

  for (const opco of opcos) {
    // Each OpCo carries a random subset of the catalogue (4..min(9, all)).
    const count = Math.min(randInt(4, 9), skus.length);
    const picked = [...skus].sort(() => Math.random() - 0.5).slice(0, count);

    for (const sku of picked) {
      if (seen.has(`${opco.id}:${sku.id}`)) continue; // keep existing row

      const isBase = BASE_PARTS.has(sku.skuPartNumber);
      const allocated = isBase ? randInt(20, 140) : randInt(5, 60);

      // Assigned is usually a slice of allocated; ~12% intentionally over the
      // budget so the UI shows the over-allocated (drift) state, ~10% idle.
      const roll = Math.random();
      const assigned =
        roll < 0.12
          ? allocated + randInt(1, 8)
          : roll < 0.22
            ? 0
            : randInt(Math.floor(allocated * 0.4), allocated);

      rows.push({
        opcoId: opco.id,
        skuCatalogId: sku.id,
        allocatedQuantity: allocated,
        assignedQuantity: assigned,
      });
    }
  }

  const result = await prisma.opcoSkuLedger.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const distinctOpcos = await prisma.opcoSkuLedger.findMany({
    distinct: ['opcoId'],
    select: { opcoId: true },
  });

  console.log(
    `Demo ledger: ${result.count} rows created (${existing.length} pre-existing left untouched). ` +
      `Ledger now covers ${distinctOpcos.length} of ${opcos.length} active OpCos.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
