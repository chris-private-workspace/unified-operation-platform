// Intake fixture — push synthetic onboarding requests into the platform
// (W42 / CH-A). Exists because the real n8n connection is not up yet, so there
// is otherwise no way to exercise anything downstream of intake.
//
// Two routes, deliberately BOTH (they prove different things):
//   canonical → POST /requests/intake      — the LOCKED contract; proves the
//               downstream chain (idempotency, OpCo/SKU resolution, stage
//               machine, the Requests UI). Touches no external system.
//   native    → POST /requests/intake/n8n  — n8n's own envelope; the ONLY route
//               that exercises IntakeAdapterService, i.e. Job Function → OpCo,
//               licenceCode → skuId, REQ number → sysId. Driving data through
//               the canonical route alone would leave the newest and most
//               error-prone code completely uncovered.
//
// The native route reverse-looks-up the REQ number in ServiceNow, so point the
// API at mock-servicenow.js (which answers number queries for /^(REQ|RITM)\d+$/).
//
// Run (from apps/api, API on 3101 per the harness convention):
//   node scripts/demo-harness/intake-fixture.js
//   node scripts/demo-harness/intake-fixture.js --mode native --count 5
//   node scripts/demo-harness/intake-fixture.js --mode native --empty
//
// Env: API_BASE (default http://localhost:3101), INTAKE_KEY (default
// demo-intake-key). The key is read but never printed.
//
// Every created request prints its REQ sysId so `npm run demo:cleanup -- <ids>`
// can remove exactly what this made.

const API = process.env.API_BASE ?? 'http://localhost:3101';
const KEY = process.env.INTAKE_KEY ?? 'demo-intake-key';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')
    ? args[i + 1]
    : fallback;
};
const mode = flag('mode', 'both');
const count = Number(flag('count', '2'));
// ADR-0020: an empty licence list is the payload that triggers the default SKU.
const empty = args.includes('--empty');
const opcoCode = flag('opco', 'RHK');
// Must be a real n8n Job Function (see opco-department-map.ts) — the adapter
// rejects anything else rather than falling back to a default OpCo.
const jobFunction = flag('job-function', 'RHK IT');

if (!['canonical', 'native', 'both'].includes(mode)) {
  console.error(`unknown --mode '${mode}' (canonical | native | both)`);
  process.exit(1);
}
if (!Number.isInteger(count) || count < 1) {
  console.error(`--count must be a positive integer (got '${count}')`);
  process.exit(1);
}

// A run marker so several runs never collide on the @unique REQ sysId, and so
// cleanup can tell one batch from another. Seconds are enough: the collision
// this guards against is re-running the script, not concurrent runs.
const stamp = Math.floor(Date.now() / 1000);

const post = async (path, body, headers = {}) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Intake-Key': KEY,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
};

/** Active catalogue SKUs, so the fixture never invents an id (AP-8). */
async function loadSkus() {
  const res = await fetch(`${API}/license/catalog`);
  if (!res.ok) {
    throw new Error(
      `GET /license/catalog → ${res.status}. Is the API up on ${API} with dev-bypass?`,
    );
  }
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : (rows.items ?? rows.data ?? []);
  const active = list.filter((s) => s.active !== false);
  if (active.length === 0) {
    throw new Error(
      'Catalogue is empty — run POST /license/catalog/sync (or use a dev DB that has SKUs).',
    );
  }
  return active;
}

async function canonicalRun(skus) {
  console.log(`\n── canonical: POST /requests/intake × ${count} ──`);
  const created = [];
  for (let i = 0; i < count; i++) {
    const sku = skus[i % skus.length];
    const sysId = `fixture-${stamp}-can-${i}`;
    const { status, body } = await post('/requests/intake', {
      targetUpn: `fixture.can.${stamp}.${i}@demo.invalid`,
      targetDisplayName: `Fixture Canonical ${i}`,
      opcoCode,
      serviceNowSysId: sysId,
      serviceNowNumber: `REQ9${String(stamp % 100000).padStart(5, '0')}`,
      // Claimed by the caller, exactly as n8n would. NOT proof Graph can see
      // the user — assign still gates on a real findUser hit (RISK R3), which
      // is why this fixture can drive the flow only as far as READY.
      azureSyncedAt: new Date().toISOString(),
      lineItems: [{ skuId: sku.skuId, quantity: 1 }],
    });
    console.log(
      `  [${status}] ${sysId} → ${sku.skuPartNumber} (${body?.lineItems?.length ?? 0} line item(s))`,
    );
    if (status < 300) created.push(sysId);
  }
  return created;
}

async function nativeRun(skus) {
  const label = empty ? 'no licence line (ADR-0020)' : 'one licence line';
  console.log(`\n── native: POST /requests/intake/n8n × ${count} — ${label} ──`);
  const created = [];
  for (let i = 0; i < count; i++) {
    const sku = skus[i % skus.length];
    // mock-servicenow resolves any /^(REQ|RITM)\d+$/ to sys-<number>, so the
    // REQ number is what makes each run distinct here.
    const reqNumber = `REQ${String(stamp).slice(-6)}${String(i).padStart(2, '0')}`;
    const { status, body } = await post('/requests/intake/n8n', {
      event: 'license_request_received',
      idempotencyKey: reqNumber,
      sentAt: new Date().toISOString(),
      request: {
        requestId: reqNumber,
        openedDate: new Date().toISOString(),
        remarks: 'fixture — synthetic onboarding',
        department: jobFunction,
        source: { subject: '[REQ] onboarding', sender: 'it.rhk@rapo.com.hk' },
      },
      targetUser: {
        raw: `Fixture Native ${i}`,
        firstName: 'Fixture',
        lastName: `Native${i}`,
        email: `fixture.nat.${stamp}.${i}@demo.invalid`,
        validated: true,
      },
      licenseItems: empty
        ? []
        : [
            {
              ritmNumber: `RITM${String(stamp).slice(-6)}${String(i).padStart(2, '0')}`,
              ritmSysId: `fixture-ritm-${stamp}-${i}`,
              ritmTitle: 'O365 License Request',
              // businessAlias first, then skuPartNumber (MAPPING.md §2.3).
              licenseCode: sku.businessAlias || sku.skuPartNumber,
            },
          ],
    });
    const lines = body?.lineItems?.length ?? 0;
    console.log(
      `  [${status}] ${reqNumber} → ${lines} line item(s)` +
        (empty
          ? lines === 1
            ? '  ← default SKU injected'
            : '  ← no default configured (zero lines, by design)'
          : ` (${sku.businessAlias || sku.skuPartNumber})`) +
        (status >= 400 ? `  ${JSON.stringify(body?.message ?? body)}` : ''),
    );
    if (status < 300 && body?.serviceNowSysId) created.push(body.serviceNowSysId);
  }
  return created;
}

async function main() {
  const skus = await loadSkus();
  console.log(`API ${API} · ${skus.length} active SKU(s) · opco ${opcoCode}`);

  const created = [];
  if (mode === 'canonical' || mode === 'both') {
    created.push(...(await canonicalRun(skus)));
  }
  if (mode === 'native' || mode === 'both') {
    created.push(...(await nativeRun(skus)));
  }

  if (created.length) {
    console.log(
      `\nCleanup:\n  npm run demo:cleanup -- ${created.join(' ')}\n`,
    );
  } else {
    console.log('\nNothing created.\n');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
