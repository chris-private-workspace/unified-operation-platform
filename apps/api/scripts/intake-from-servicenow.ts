import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ServiceNowService } from '../src/integration/servicenow/servicenow.service';
import {
  LookedUpRequest,
  ServiceNowLookupService,
} from '../src/integration/servicenow/servicenow-lookup.service';

/**
 * ONE-SHOT: turn a real ServiceNow REQ number into platform test data.
 *
 * Run:
 *   npm run intake:from-sn -w @uop/api -- --req=REQ0043858
 *   npm run intake:from-sn -w @uop/api -- --req=REQ0043858 --notes
 *   npm run intake:from-sn -w @uop/api -- --req=REQ0043858 --sku=SPE_E5 \
 *       --upn=chris.lai@rapo.com.hk --post
 *
 * ## Why this exists
 *
 * The n8n UAT connection is not up, so nothing pushes onboarding requests into
 * the platform. `demo-harness/intake-fixture.js` fills that gap with SYNTHETIC
 * data, which is enough to exercise intake but useless for the next step: the
 * ticket-update seam needs a RITM that really exists, with a real catalog task
 * under it, or there is nothing for the platform to close.
 *
 * So this script does the one thing the intake adapter deliberately does not:
 * it reverse-looks-up the RITMs. The adapter takes `ritmSysId` from its caller
 * because n8n already holds it (ADR-0017 D4) — no code path ever needed to ask
 * ServiceNow. Here the operator has only a REQ number, so we ask.
 *
 * Same shape as `send-connectivity-check.ts` and the ADR-0014 baseline script:
 * deploy/test-time ops, NOT a product feature. It is also the executable
 * specification for the upload UI, if that gets approved — the lookup below is
 * exactly what the UI would have to do server-side.
 *
 * ## It does not boot AppModule
 *
 * Same reason as the connectivity check: `createApplicationContext(AppModule)`
 * would start ScheduleModule, and ADR-0015's sync sweep WRITES (it opens sync
 * gates against real Graph). A read-only lookup must not be able to do that, so
 * ServiceNowService is wired by hand. It is the real class — this exercises the
 * production path, not a copy of it.
 *
 * ## 🔴 This talks to the REAL ServiceNow
 *
 * `.env` points at a real instance. The lookup is read-only (GET only), but
 * `--post` writes a request into the platform DB, and everything downstream of
 * that (assign, ticket-update) will act on the REAL ticket. Nothing here is a
 * mock. Credentials are read from `.env` by dotenv and never printed.
 */

loadEnv({ path: join(__dirname, '..', '.env') });

// The REQ→RITM→task walk moved to ServiceNowLookupService (CH-013 / ADR-0021
// D6) so this script and the import endpoint cannot drift apart. What stays
// here is what only a terminal wants: the journal read below, and the printing.
const REQ_TABLE = 'sc_request';
const JOURNAL_TABLE = 'sys_journal_field';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

/** ServiceNow reference fields come back as `{value, link}` or a bare string. */
function ref(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  const value = (raw as { value?: unknown }).value;
  return typeof value === 'string' ? value : '';
}

function text(raw: unknown): string {
  return typeof raw === 'string' ? raw : ref(raw);
}

/**
 * What the platform actually wrote on a catalog task.
 *
 * `state` alone answers "did the seam reach ServiceNow", which is what the
 * task line above shows. It does not answer "and what did it say" — and the
 * note is the half a human reads. They need different sources: `work_notes` is
 * a journal INPUT field, so a Table API GET returns it empty no matter what
 * was written to it. The text lands in sys_journal_field, keyed by the task.
 *
 * Behind a flag and truncated, deliberately: a real task's journal carries
 * whatever anyone has ever written on it, and a script that scans 15 requests
 * has no business dumping all of that to a terminal (H4).
 */
async function printWorkNotes(
  snow: ServiceNowService,
  taskSysId: string,
): Promise<void> {
  const journal = await snow.query(
    `element_id=${taskSysId}^element=work_notes^ORDERBYDESCsys_created_on`,
    JOURNAL_TABLE,
    3,
  );
  if (journal.length === 0) {
    // "Nothing was written" and "this account cannot read the journal" look
    // identical from here, and they mean opposite things — one says the seam
    // is broken, the other says the check is. Ask whether the table returns
    // anything AT ALL before letting an empty result be read as evidence.
    const readable = await snow.query('element=work_notes', JOURNAL_TABLE, 1);
    console.log(
      readable.length === 0
        ? '        work_notes: (none) — but sys_journal_field returns nothing to this account at all, so this says NOTHING about whether a note was written'
        : '        work_notes: (none) — the journal is readable, so no note reached this task',
    );
    return;
  }
  for (const j of journal) {
    const body = text(j.value).replace(/\s+/g, ' ').trim().slice(0, 160);
    console.log(`        work_note ${text(j.sys_created_on)} · ${body}`);
  }
}

async function main(): Promise<void> {
  const list = has('list');
  const reqNumber = arg('req');
  if (!reqNumber && !list) {
    throw new Error(
      'Missing --req=<REQ number>. Example: npm run intake:from-sn -w @uop/api -- --req=REQ0043858\n' +
        'Or --list to see which requests this integration account can actually see.',
    );
  }
  const post = has('post');
  const showNotes = has('notes');
  const sku = arg('sku');
  const upn = arg('upn');
  const jobFunction = arg('job-function') ?? 'RHK IT';
  const api = arg('api') ?? 'http://localhost:3100';
  const only = arg('only');

  if (post && (!sku || !upn)) {
    throw new Error(
      '--post needs --sku=<businessAlias|skuPartNumber> and --upn=<target user email>',
    );
  }

  const prisma = new PrismaClient();
  try {
    // DB-then-env, the precedence ConnectorConfigService applies (ADR-0013 D3).
    // Reproduced rather than imported for the same reason the connectivity
    // check does it: the real resolver drags in AuditService and the Nest graph.
    const row = await prisma.connectorConfig.findUnique({
      where: { connector: 'servicenow' },
    });
    const resolve = async (_c: string, column: string): Promise<string | null> =>
      (row as Record<string, unknown> | null)?.[column] as string | null ??
      process.env[
        column === 'serviceNowInstanceUrl'
          ? 'SERVICENOW_INSTANCE_URL'
          : 'SERVICENOW_DEFAULT_TABLE'
      ] ??
      null;

    const snow = new ServiceNowService(
      {
        get: (key: string) => process.env[key],
        getOrThrow: (key: string) => {
          const v = process.env[key];
          if (!v) throw new Error(`${key} is not set in apps/api/.env`);
          return v;
        },
      } as never,
      { resolve } as never,
    );
    await snow.onModuleInit();
    // Same class the import endpoint injects — not a copy of it. That is the
    // whole point of ADR-0021 D6: if the walk changes, both callers change.
    const lookup = new ServiceNowLookupService(snow);

    // ── 0. --list: what can this account actually SEE? ────────────────────
    // Worth its own mode. "Not found" and "not visible to me" are the same
    // answer from the Table API, and workflow 2004's own TODO note records that
    // the PROJ-001 fixture rows are invisible to this credential (row ACL). So
    // when a lookup misses, the next question is always this one.
    if (list) {
      // Each REQ is scanned down to its tasks, because "which request can I
      // test with" is the only question this mode is ever asked. A REQ whose
      // RITM has 0 or 2+ active tasks cannot complete the flow (ADR-0018 D3),
      // and finding that out here costs two GETs instead of a failed assign.
      const recent = await lookup.listRecent(15);
      console.log(
        `${REQ_TABLE}: ${recent.length} row(s) visible to the integration account\n`,
      );
      for (const r of recent) {
        console.log(`  ${r.number}  ${r.sysId}  ${r.openedAt}`);
        if (r.shortDescription) console.log(`    ${r.shortDescription}`);

        if (r.items.length === 0) {
          console.log('    (no RITM)');
          continue;
        }
        for (const it of r.items) {
          console.log(
            `    ${it.importable ? '✅' : '🔴'} ${it.number} · ${it.activeTaskCount} active task(s) · ${it.title || '(no title)'}`,
          );
        }
      }
      console.log(
        '\n✅ = one active catalog task ⇒ the platform can close it (ADR-0018 D3).\n' +
          '🔴 = 0 or 2+ ⇒ ticket-update will fail closed, so this REQ cannot finish the flow.',
      );
      if (recent.length === 0) {
        console.log(
          '  🔴 Zero rows. The credential authenticates but sees nothing —\n' +
            '     that is a row-level ACL problem, not a connectivity one.',
        );
      }
      if (!reqNumber) return;
      console.log('');
    }

    // ── 1. REQ number → the request and everything under it ───────────────
    // One call now. The task count per RITM is the point: DirectTicketProvider
    // requires EXACTLY one active task (ADR-0018 D3) and fails closed on 0 or
    // 2+, so a RITM that does not satisfy that here will not be closable later
    // either — better to see it now than after the assign has happened.
    const found: LookedUpRequest | null = await lookup.lookupByNumber(
      reqNumber as string,
    );
    if (!found) {
      throw new Error(
        `${reqNumber} was not found in ${REQ_TABLE}. Check the number, and that the integration account can see it (row-level ACL).`,
      );
    }
    console.log(`REQ  ${found.number}  sys_id=${found.sysId}`);
    if (found.shortDescription) console.log(`     ${found.shortDescription}`);

    if (found.items.length === 0) {
      throw new Error(
        `${reqNumber} has no sc_req_item rows. A request with no items cannot produce a line item.`,
      );
    }

    // ── 2. print what was found ───────────────────────────────────────────
    console.log(`\n${found.items.length} RITM(s):\n`);
    for (const item of found.items) {
      console.log(`  ${item.number}  ${item.sysId}`);
      console.log(`    ${item.title || '(no short_description)'}`);
      console.log(
        `    active catalog tasks: ${item.activeTaskCount}  ${item.importable ? 'OK' : `🔴 ${item.blockedReason}`}`,
      );
      // The raw task records are server-side detail the service carries for
      // exactly this: a terminal wants state / assignee, an HTTP client does not
      // get them (see the type's own warning).
      for (const t of item.activeTasks) {
        console.log(
          `      · ${text(t.number)} state=${text(t.state)} assigned_to=${ref(t.assigned_to) || '(empty)'}`,
        );
        if (showNotes) await printWorkNotes(snow, String(t.sys_id));
      }
    }

    const selected = only
      ? found.items.filter((r) => r.number === only)
      : found.items;
    if (only && selected.length === 0) {
      throw new Error(`--only=${only} matched none of the RITMs above.`);
    }

    if (!post) {
      console.log(
        '\nDry run — nothing was written.\n' +
          'To push these into the platform:\n' +
          `  npm run intake:from-sn -w @uop/api -- --req=${reqNumber} --sku=<partNumber> --upn=<email> --post\n` +
          '\n⚠️  The licence code cannot be derived from ServiceNow: a RITM title\n' +
          '   ("O365 License Request") has no mechanical relationship to a platform\n' +
          '   skuPartNumber ("SPE_E5"). Pick it yourself — and do NOT paste the SN\n' +
          '   label into businessAlias to make it match (that column belongs to the\n' +
          '   ADR-0004 allocation import).',
      );
      return;
    }

    // ── 4. push through the native intake route ───────────────────────────
    const key = process.env.INTAKE_API_KEY;
    if (!key) throw new Error('INTAKE_API_KEY is not set in apps/api/.env');

    const payload = {
      event: 'license_request_received',
      idempotencyKey: reqNumber,
      sentAt: new Date().toISOString(),
      request: {
        requestId: reqNumber,
        openedDate: found.openedAt || new Date().toISOString(),
        remarks: found.shortDescription || `imported from ${reqNumber}`,
        department: jobFunction,
        source: {
          subject: `[${reqNumber}] ${found.shortDescription}`,
          sender: upn as string,
        },
      },
      targetUser: { raw: upn as string, email: upn as string, validated: true },
      licenseItems: selected.map((r) => ({
        ritmNumber: r.number,
        ritmSysId: r.sysId,
        ritmTitle: r.title,
        licenseCode: sku as string,
      })),
    };

    console.log(
      `\nPOST ${api}/requests/intake/n8n — ${payload.licenseItems.length} line(s), sku=${sku}, opco via job function '${jobFunction}'`,
    );
    const res = await fetch(`${api}/requests/intake/n8n`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Intake-Key': key },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    console.log(`[${res.status}] ${body.slice(0, 600)}`);

    if (res.ok) {
      console.log(
        '\n🔴 A 2xx means the request now exists in the platform. It does NOT mean\n' +
          '   the flow works end to end: azureSyncedAt is deliberately left null\n' +
          '   (the adapter refuses to infer "synced" from "n8n posted"), so assign\n' +
          '   still has to see the user in Graph itself.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`intake-from-servicenow failed: ${(err as Error)?.message}`);
  process.exit(1);
});
