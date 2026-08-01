import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ServiceNowService } from '../src/integration/servicenow/servicenow.service';
import { ServiceNowLookupService } from '../src/integration/servicenow/servicenow-lookup.service';

/**
 * OPS: place a synthetic O365 license request through the ServiceNow Service
 * Catalog, so the import + fulfilment path has a ticket to run on.
 *
 * Run (dry run — prints the exact request, writes NOTHING):
 *   npm run seed:sn-onboarding -w @uop/api
 *   npm run seed:sn-onboarding -w @uop/api -- --shape=multi
 *
 * Run (actually places the order):
 *   npm run seed:sn-onboarding -w @uop/api -- --post
 *   npm run seed:sn-onboarding -w @uop/api -- --shape=multi --post
 *
 * ## Why the catalog API and not a Table API insert
 *
 * Because the insert does not work. Proven on ricohapdev 2026-08-01: POST to
 * sc_request returns `403 ACL Exception Insert Failed due to security
 * constraints` even with a payload of one field, so it is the table that is
 * closed, not a field. The account holds sn_request_write / itil / task_editor
 * and still cannot do it — which is ServiceNow's normal posture: a REQ is
 * something the catalog engine builds, not something you insert.
 *
 * 🔴 The same finding applies to `DirectServiceNowProvider` (ADR-0008 乙): its
 * first call is `createRecord(..., 'sc_request')`, so that path cannot work on
 * this instance with this account either. Out of scope here — recorded so it is
 * not discovered again from scratch.
 *
 * Going through the catalog also gets the part a hand-built insert could not:
 * ServiceNow runs the workflow, so the catalog task is created the same way a
 * real one is.
 *
 * ## Where the variable values come from
 *
 * Read off real O365 license RITMs (RITM0047329-31, 0046765-66) on 2026-08-01,
 * not invented. All four mandatory variables come from the two variable sets
 * attached to the item; `target_user_opcos` / `opcos` are choice fields backed
 * by `u_opcos_approval_matrix.u_opcos`, whose values are lowercase opco codes
 * ('rhk', 'rapo').
 *
 * Note `license_type`: real requests from 2025 carry "e3", and that choice is
 * now INACTIVE — the list has since moved to "Microsoft 365 E3". Anything that
 * maps this variable to a platform SKU has to cope with both.
 *
 * ## 🔴 Who the request is for
 *
 * `target_user` is the integration account itself, deliberately. Pointing it at
 * a colleague would put their name on a request they never made (H4) — and if
 * the platform then fulfils it, it assigns a REAL license seat to a real person.
 * Override with --target/--email only when that is what you actually want.
 *
 * ## 🔴 This writes to the REAL ServiceNow
 *
 * `--post` places a real order: real REQ/RITM/SCTASK numbers, and the catalog
 * workflow runs (assignment groups, notifications, approvals — whatever the
 * item defines). ServiceNow does not delete these; they can only be cancelled.
 * Dry run is the default for that reason.
 *
 * Requires `node --use-system-ca` (the npm script sets it): corporate TLS
 * inspection presents a self-signed chain Node's bundled CA list rejects.
 */

loadEnv({ path: join(__dirname, '..', '.env') });

/** O365 User License Maintenance Request — ricohapdev, 2026-08-01. */
const CAT_ITEM_O365 = 'efe38adedbef6f80a98e75868c961936';

interface Line {
  licenseType: string;
  label: string;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const post = has('post');
  const shape = arg('shape') ?? 'single';
  const opco = arg('opco') ?? 'rhk';
  const license = arg('license') ?? 'Microsoft 365 E3';

  if (shape !== 'single' && shape !== 'multi') {
    throw new Error(`--shape must be 'single' or 'multi' (got '${shape}')`);
  }

  const base = process.env.SERVICENOW_INSTANCE_URL?.replace(/\/$/, '');
  const user = process.env.SERVICENOW_USER;
  const pass = process.env.SERVICENOW_PASSWORD;
  if (!base || !user || !pass) {
    throw new Error('SERVICENOW_INSTANCE_URL / _USER / _PASSWORD must be set in apps/api/.env');
  }
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  /**
   * The catalog lives under /api/sn_sc, which ServiceNowService cannot reach —
   * its helpers hard-code /api/now/table/. Rather than widen a production
   * service for a test-data script, this does its own calls; the read-back
   * below still goes through the real lookup service.
   */
  async function sn(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; body: string; json: any }> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON error bodies are reported via `body` */
    }
    return { ok: res.ok, status: res.status, body: text, json };
  }

  const prisma = new PrismaClient();
  try {
    // DB-then-env, the precedence ConnectorConfigService applies (ADR-0013 D3).
    // Reproduced rather than imported for the reason intake-from-servicenow.ts
    // gives: the real resolver drags in AuditService and the Nest graph.
    const row = await prisma.connectorConfig.findUnique({
      where: { connector: 'servicenow' },
    });
    const resolve = async (_c: string, column: string): Promise<string | null> =>
      ((row as Record<string, unknown> | null)?.[column] as string | null) ??
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

    // ── Who the request is by / for ───────────────────────────────────────
    const me = await snow.getIntegrationUserSysId();
    if (!me) {
      throw new Error(
        'The integration account was not found in sys_user, so requester_name cannot be set.',
      );
    }
    const targetSysId = arg('target') ?? me;
    let email = arg('email');
    if (!email) {
      const rows = await sn('GET', `/api/now/table/sys_user/${targetSysId}?sysparm_fields=email`);
      email = rows.json?.result?.email || '';
    }
    /**
     * The integration account has no email, and that gap is useful rather than
     * inconvenient: an address that does not exist in Entra means `findUser`
     * returns null, so the platform stops at the Phase 1 sync gate instead of
     * assigning a real license seat. Pass --email to aim at a real mailbox only
     * when assignment is what you are actually testing.
     */
    let syntheticEmail = false;
    if (!email) {
      email = 'uop.test@rapo.com.hk';
      syntheticEmail = true;
    }

    const lines: Line[] =
      shape === 'single'
        ? [{ licenseType: license, label: license }]
        : [
            { licenseType: license, label: license },
            { licenseType: 'Power BI Pro', label: 'Power BI Pro' },
          ];

    /** Mirrors what real RITMs carry — see the header note on provenance. */
    const variablesFor = (line: Line): Record<string, string> => ({
      requester_name: me,
      target_user: targetSysId,
      target_users_email: email as string,
      target_user_opcos: opco,
      opcos: opco,
      action_type: 'new_license_assignment',
      license_type: line.licenseType,
      wso_license_applied: 'No',
    });

    // ── Show exactly what will be sent ────────────────────────────────────
    console.log(
      `shape=${shape} · ${lines.length} item(s) · opco=${opco} · mode=${post ? '🔴 POST (places a real order)' : 'dry run'}`,
    );
    console.log(
      `target_user = ${targetSysId}${targetSysId === me ? ' (integration account — no real person, no real seat)' : ' 🔴 OVERRIDDEN — a real person'}`,
    );
    console.log(
      syntheticEmail
        ? `target_users_email = ${email} (not in Entra — the platform will stop at the sync gate, by design)`
        : `target_users_email = 🔴 a real mailbox — the platform can assign a REAL license seat to it\n`,
    );
    console.log('');
    for (const line of lines) {
      const endpoint =
        shape === 'single'
          ? `/api/sn_sc/servicecatalog/items/${CAT_ITEM_O365}/order_now`
          : `/api/sn_sc/servicecatalog/items/${CAT_ITEM_O365}/add_to_cart`;
      console.log(`POST ${endpoint}`);
      console.log(
        JSON.stringify(
          { sysparm_quantity: '1', variables: { ...variablesFor(line), target_users_email: '<target email>' } },
          null,
          2,
        ),
      );
      console.log('');
    }
    if (shape === 'multi') {
      console.log('POST /api/sn_sc/servicecatalog/cart/submit_order   (one REQ containing both items)\n');
    }

    if (!post) {
      console.log(
        'Dry run — nothing was written.\n' +
          'To place the order for real:\n' +
          `  npm run seed:sn-onboarding -w @uop/api -- --shape=${shape} --post`,
      );
      return;
    }

    // ── Place the order ───────────────────────────────────────────────────
    let reqNumber: string;

    if (shape === 'single') {
      const res = await sn('POST', `/api/sn_sc/servicecatalog/items/${CAT_ITEM_O365}/order_now`, {
        sysparm_quantity: '1',
        variables: variablesFor(lines[0]),
      });
      if (!res.ok) {
        throw new Error(`order_now -> HTTP ${res.status}: ${res.body.slice(0, 300)}`);
      }
      reqNumber = res.json.result.request_number ?? res.json.result.number;
      console.log(`✅ ordered — REQ ${reqNumber}`);
    } else {
      /**
       * 🔴 The cart belongs to the ACCOUNT, not to this run, and submit_order
       * submits all of it. Anything another process left behind would be
       * ordered under our REQ, so a non-empty cart stops the run rather than
       * being cleared — deleting someone else's pending order is not this
       * script's call to make.
       */
      const cart = await sn('GET', '/api/sn_sc/servicecatalog/cart');
      const existing = cart.json?.result?.items?.length ?? 0;
      if (existing > 0) {
        throw new Error(
          `The integration account's cart already holds ${existing} item(s). ` +
            'submit_order would include them. Clear the cart in ServiceNow, then re-run.',
        );
      }

      for (const line of lines) {
        const res = await sn('POST', `/api/sn_sc/servicecatalog/items/${CAT_ITEM_O365}/add_to_cart`, {
          sysparm_quantity: '1',
          variables: variablesFor(line),
        });
        if (!res.ok) {
          throw new Error(
            `add_to_cart (${line.label}) -> HTTP ${res.status}: ${res.body.slice(0, 300)}. ` +
              'The cart may hold partial items — clear it in ServiceNow before re-running.',
          );
        }
        console.log(`   + ${line.label}`);
      }

      const submitted = await sn('POST', '/api/sn_sc/servicecatalog/cart/submit_order');
      if (!submitted.ok) {
        throw new Error(
          `submit_order -> HTTP ${submitted.status}: ${submitted.body.slice(0, 300)}. ` +
            'Items are still in the cart — clear it in ServiceNow.',
        );
      }
      reqNumber = submitted.json.result.request_number ?? submitted.json.result.number;
      console.log(`✅ ordered — REQ ${reqNumber}`);
    }

    // ── Verify through the SAME service the import UI uses ─────────────────
    // 🔴 The point of this block. "The order returned 200" does not mean the
    // fixture is usable: the workflow decides how many catalog tasks appear,
    // and the platform needs EXACTLY one active task per RITM (ADR-0018 D3).
    // Only the real lookup answers that.
    console.log('\n── Verifying via ServiceNowLookupService (what the import sees) ──');
    const lookup = new ServiceNowLookupService(snow);
    const found = await lookup.lookupByNumber(reqNumber);
    if (!found) {
      console.log(
        `🔴 ${reqNumber} was created but the lookup cannot see it — row-level ACL.`,
      );
      return;
    }
    console.log(`REQ ${found.number}  ${found.sysId}`);
    console.log(`    ${found.shortDescription}`);
    for (const it of found.items) {
      console.log(
        `  ${it.importable ? '✅' : '🔴'} ${it.number} · ${it.activeTaskCount} active task(s) · ${it.title}` +
          `${it.importable ? '' : ` · ${it.blockedReason}`}`,
      );
    }
    /**
     * 🔴 Label them, or nobody can tell these apart from real requests.
     *
     * The catalog decides the RITM title, so unlike a hand-built insert there is
     * no chance to set it up front — it has to be a patch afterwards. Both
     * halves matter: the work note carries the explanation, and the title prefix
     * is the only part visible in a list view, which is where somebody would
     * mistake one of these for a real O365 license request.
     *
     * sc_req_item PATCH is allowed for this account even though sc_request
     * INSERT is not (proven 2026-08-01) — update and insert are separate ACLs.
     */
    for (const it of found.items) {
      await snow.updateRecord(
        it.sysId,
        {
          work_notes:
            '[UOP TEST] Synthetic request created by seed-servicenow-onboarding.ts ' +
            'for Unified Operation Platform testing. Not a real staff request — safe to cancel.',
          short_description: `[UOP TEST] ${it.title.replace(/\s+/g, ' ').trim()}`,
        },
        'sc_req_item',
      );
    }
    console.log(`\nLabelled ${found.items.length} RITM with [UOP TEST].`);

    const ok =
      found.items.length === lines.length && found.items.every((i) => i.importable);
    console.log(
      ok
        ? `\n✅ ${reqNumber} is importable — Settings › Integrations › Import request from ServiceNow`
        : `\n🔴 Ordered, but not importable as-is (${found.items.length} RITM vs ${lines.length} ordered). See per-RITM reason above.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`seed-servicenow-onboarding failed: ${(err as Error)?.message}`);
  process.exit(1);
});
