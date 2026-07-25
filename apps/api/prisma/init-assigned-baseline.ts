import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  applyAssignedBaseline,
  BaselineDb,
  planAssignedBaseline,
} from '../src/license/assigned-baseline';

/**
 * ONE-SHOT go-live baseline for `assignedQuantity` (ADR-0014 / W35 F3).
 *
 * Run: npm run baseline:assigned -w @uop/api -- --file=<assigned.csv> [--actor=<email>] [--commit]
 *
 *   dry-run is the DEFAULT — nothing is written without `--commit`.
 *
 * CSV format is identical to the allocation import (ADR-0004): row 1 = OpCo
 * headers matching `Opco.code` exactly, column A = `SkuCatalog.businessAlias`
 * exactly, cells = whole seat counts. The NUMBERS mean something different
 * though: here they are seats **already assigned** today, not the budget.
 *
 * ⚠️ This runs outside the API, so it is NOT behind a role guard — whoever can
 * run it already has direct DB access. Deploy-time ops only.
 * ⚠️ Do NOT grow this into a repeatable bulk-update tool. That is a new ADR
 * (ADR-0014 Consequences → promote to option B).
 */

const REASON = 'go-live baseline (init-assigned-baseline)';
const MAX_PRINT = 40; // long plans print a capped table + a remainder count

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const file = arg('file');
  const actorEmail = arg('actor');
  const commit = process.argv.includes('--commit');

  if (!file) {
    throw new Error(
      'Missing --file=<path to assigned-baseline CSV>. ' +
        'See docs/05-usage/DATA-INITIALISATION.md step 5.',
    );
  }

  const csv = readFileSync(file, 'utf8');
  const prisma = new PrismaClient();

  try {
    // Same scope rules as the import: active OpCos, active curated SKUs.
    const [opcos, catalog, ledger] = await Promise.all([
      prisma.opco.findMany({ where: { active: true } }),
      prisma.skuCatalog.findMany({
        where: { active: true, businessAlias: { not: null } },
      }),
      prisma.opcoSkuLedger.findMany({
        select: { opcoId: true, skuCatalogId: true, assignedQuantity: true },
      }),
    ]);

    const plan = planAssignedBaseline(csv, opcos, catalog, ledger);

    console.log(`\nFile: ${file}`);
    console.log(
      `Mapped: ${plan.opcoColumns} OpCo columns · ` +
        `${plan.mappedSkuRows}/${plan.skuRows} SKU rows · ` +
        `${plan.changes.length} cell change(s)`,
    );

    if (plan.unknownOpcoHeaders.length > 0) {
      console.log(
        `\n⚠️  ${plan.unknownOpcoHeaders.length} header column(s) match no Opco.code — ignored:`,
      );
      for (const h of plan.unknownOpcoHeaders) console.log(`      ${h}`);
    }
    if (plan.skippedSkuLabels.length > 0) {
      console.log(
        `\n⚠️  ${plan.skippedSkuLabels.length} SKU row(s) not curated — skipped (curate businessAlias first):`,
      );
      for (const s of plan.skippedSkuLabels) console.log(`      ${s}`);
    }

    if (plan.changes.length === 0) {
      console.log('\nNothing to do — the baseline already matches this file.');
      return;
    }

    console.log(
      '\n  OpCo            SKU                    before → target   delta',
    );
    for (const c of plan.changes.slice(0, MAX_PRINT)) {
      const d = c.delta > 0 ? `+${c.delta}` : `${c.delta}`;
      console.log(
        `  ${c.opcoCode.padEnd(15)} ${c.skuPartNumber.padEnd(22)} ` +
          `${String(c.before).padStart(6)} → ${String(c.target).padEnd(6)} ${d.padStart(7)}`,
      );
    }
    if (plan.changes.length > MAX_PRINT) {
      console.log(`  … +${plan.changes.length - MAX_PRINT} more`);
    }

    if (!commit) {
      console.log(
        '\nDRY RUN — nothing written. Re-run with --commit to apply.\n',
      );
      return;
    }

    // Resolve the operator so the audit trail names someone. Optional: the
    // schema allows a null actor (ADR-0007), we just say so out loud.
    let actorId: string | null = null;
    if (actorEmail) {
      const actor = await prisma.appUser.findUnique({
        where: { email: actorEmail },
        select: { id: true },
      });
      if (!actor) throw new Error(`No AppUser with email ${actorEmail}`);
      actorId = actor.id;
    } else {
      console.log(
        '\nNote: no --actor=<email> given → LedgerAdjustment.actorId will be null.',
      );
    }

    const written = await applyAssignedBaseline(
      prisma as unknown as BaselineDb,
      plan,
      { actorId, reason: REASON },
    );
    console.log(
      `\nCommitted ${written} assignedQuantity change(s); ` +
        `${written} LedgerAdjustment row(s) recorded.`,
    );
    console.log(
      'Next: POST /license/reconcile and confirm drift is clear ' +
        '(docs/05-usage/DATA-INITIALISATION.md step 6).\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
