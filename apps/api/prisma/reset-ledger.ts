import { PrismaClient } from '@prisma/client';
import { AuditService } from '../src/audit/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { LedgerFullResetService } from '../src/license/ledger-full-reset.service';

/**
 * Ledger full reset, deploy-time edition (CH-017 / ADR-0022 D5).
 *
 * Run: npm run reset:ledger -w @uop/api -- [--opco=CODE] [--actor=<email>] --confirm=<CODE|ALL> --commit
 *
 *   dry-run is the DEFAULT — nothing is written without `--commit`.
 *
 * This does NOT reimplement the reset. It constructs the very service the HTTP
 * endpoint uses and calls it, so the two can never drift apart (the pattern
 * ADR-0021 set: "script and endpoint share the same lookup"). `--confirm` is
 * therefore required here too — filling it in automatically would turn the
 * script into a back door around the one gate the service enforces.
 *
 * ⚠️ Runs outside the API, so it is NOT behind a role guard — whoever can run it
 * already has direct DB access. Deploy-time ops only.
 * ⚠️ Zeroing `assignedQuantity` destroys the drift reconciliation baseline, and
 * no allocation import can rebuild it (ADR-0004 #5). Reload it with
 * `npm run baseline:assigned` afterwards.
 */

const MAX_PRINT = 40; // long resets print a capped table + a remainder count

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const opcoCode = arg('opco');
  const actorEmail = arg('actor');
  const confirm = arg('confirm');
  const commit = process.argv.includes('--commit');

  const prisma = new PrismaClient();

  try {
    let actorId: string | null = null;
    if (actorEmail) {
      const actor = await prisma.appUser.findUnique({
        where: { email: actorEmail },
        select: { id: true },
      });
      if (!actor) throw new Error(`No AppUser with email ${actorEmail}`);
      actorId = actor.id;
    }

    const db = prisma as unknown as PrismaService;
    const service = new LedgerFullResetService(db, new AuditService(db));

    const res = await service.reset(actorId, { dryRun: !commit, opcoCode, confirm });

    console.log(`\nScope: ${res.scope}`);
    console.log(
      `Cells: ${res.affected} in scope · ` +
        `${res.allocatedCells} with allocation · ` +
        `${res.assignedCells} with an assigned baseline`,
    );

    if (res.affected === 0) {
      console.log('\nNothing to do — every cell in scope is already 0 / 0.\n');
      return;
    }

    console.log('\n  OpCo            SKU                    allocated  assigned');
    for (const r of res.rows.slice(0, MAX_PRINT)) {
      const flag = r.skuActive ? '' : '  (inactive SKU)';
      console.log(
        `  ${r.opcoCode.padEnd(15)} ${r.skuPartNumber.padEnd(22)} ` +
          `${String(r.allocatedBefore).padStart(9)} ${String(r.assignedBefore).padStart(9)}${flag}`,
      );
    }
    if (res.rows.length > MAX_PRINT) {
      console.log(`  … +${res.rows.length - MAX_PRINT} more`);
    }

    console.log(`\n⚠️  ${res.warning}\n`);

    if (!commit) {
      console.log(
        `DRY RUN — nothing written. Re-run with --confirm=${opcoCode ?? 'ALL'} --commit to apply.\n`,
      );
      return;
    }

    if (!actorEmail) {
      console.log(
        'Note: no --actor=<email> given → LedgerAdjustment.actorId is null.',
      );
    }
    console.log(
      `Committed. ${res.assignedCells} LedgerAdjustment row(s) recorded; ` +
        'no ledger rows deleted.',
    );
    console.log(
      'Next: re-import allocations, then npm run baseline:assigned to restore ' +
        'the reconciliation baseline.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
