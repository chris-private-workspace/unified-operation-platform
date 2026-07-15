# Demo harness — ADR-0008 request flows (dev-bypass + mock integrations)

Local, reusable harness to run the **whole ADR-0008 request lifecycle end-to-end
without touching real ServiceNow / Graph / n8n**. Everything runs under
`AUTH_DEV_BYPASS` with the outbound target pointed at a local mock.

> **Honest scope**: the mocks reproduce the **representative** contract only. Real
> go-live still needs the field/mechanism/creds alignment in
> [`docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md`](../../../../docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md).
> `assign` write-back can't be driven fully live here (GraphService isn't
> env-mockable) — it's proven by `jest assign.service` instead.

## Files
| File | Role |
|---|---|
| `mock-servicenow.js` | Mock SN Table API (`POST/PATCH /api/now/table/*` → `{result:{sys_id,number}}`), logs payloads. `npm run demo:mock-sn` |
| `mock-n8n.js` | Mock n8n webhook (sync `{request,lineItems}` response). `npm run demo:mock-n8n` |
| `cleanup-demo.js` | Delete demo requests by exact `serviceNowSysId` (FK-safe, refuses with no args). `npm run demo:cleanup -- <sysId> ...` |

## Prereqs
- Postgres up (repo `docker compose up -d postgres`, host port 5433) + seeded (23 OpCos).
- `SkuCatalog` populated (the pickers need SKUs) — `POST /license/catalog/sync` against a tenant, or existing dev data.
- API built: `npm run build` (harness runs `node dist/main`).
- Ports used by the harness: **8980** (mock SN), **8990** (mock n8n), **3101** (alt API), **5174** (alt web) — chosen to avoid clashing with a running dev API (3100) / web (5173).

> All API-start commands below set env inline. **PowerShell** (primary shell): set
> `$env:X=...` on separate lines, then run. **bash**: `X=... node dist/main`.

---

## Scenario 1 — Outbound direct (乙): platform → ServiceNow Table API
```powershell
# terminal A — mock SN
npm run demo:mock-sn
# terminal B — API pointed at the mock (from apps/api)
$env:PORT=3101; $env:SERVICENOW_INSTANCE_URL='http://localhost:8980'
$env:SERVICENOW_USER='mock'; $env:SERVICENOW_PASSWORD='mock'
$env:REQUEST_SUBMISSION_PROVIDER='direct'
node dist/main
```
Then create a request (dev-bypass runs as ADMIN):
```bash
curl -s -X POST http://localhost:3101/requests -H "Content-Type: application/json" \
  -d '{"targetUpn":"demo@rapo.com.hk","opcoCode":"RHK","lineItems":[{"skuId":"<catalog skuId>","quantity":2}]}'
```
Watch mock SN log for `sc_request` + `sc_req_item` (note `cat_item` = skuId GUID,
the §🅒 placeholder). The response is the two-level mirror (`origin=platform-created`,
REQ on the request, RITM on each line).

### Optional — the open-ticket UI (`/requests/new`)
```powershell
# terminal C — web, proxy → 3101, dev-bypass (from apps/web)
$env:API_PROXY_TARGET='http://localhost:3101'; $env:VITE_AUTH_DEV_BYPASS='true'
npm run dev -- --port 5174 --strictPort
```
Open `http://localhost:5174/requests/new`, fill the form, submit → the app
navigates to the request detail showing the mirror.

## Scenario 2 — Outbound n8n (丙): platform → n8n webhook
```powershell
npm run demo:mock-n8n                       # terminal A
# terminal B (from apps/api)
$env:PORT=3101; $env:REQUEST_SUBMISSION_PROVIDER='n8n'
$env:N8N_OUTBOUND_WEBHOOK_URL='http://localhost:8990/webhook/create-license-request'
$env:N8N_OUTBOUND_WEBHOOK_KEY='demo-n8n-key'
node dist/main
```
POST `/requests` as above. The mirror's `serviceNowSysId` is now `n8n-req-*`
(vs `reqsys-*` for direct) — proof the provider swapped by env alone (consumer /
UI unchanged). Mock n8n log shows the `X-N8n-Key` header + payload.

## Scenario 3 — Inbound intake (甲): n8n → platform
```powershell
# from apps/api
$env:PORT=3101; $env:INTAKE_API_KEY='demo-intake-key'
node dist/main
```
```bash
BODY='{"targetUpn":"newhire@rapo.com.hk","opcoCode":"RHK","serviceNowSysId":"demo-req-1","serviceNowNumber":"REQ0000001","azureSyncedAt":"2026-01-01T00:00:00.000Z","lineItems":[{"skuId":"<catalog skuId>","quantity":1,"serviceNowRitmSysId":"demo-ritm-1"}]}'
curl -s -o /dev/null -w "no key  → %{http_code}\n"  -X POST http://localhost:3101/requests/intake -H "Content-Type: application/json" -d "$BODY"
curl -s -o /dev/null -w "ok key  → %{http_code}\n"  -X POST http://localhost:3101/requests/intake -H "Content-Type: application/json" -H "X-Intake-Key: demo-intake-key" -d "$BODY"
curl -s -o /dev/null -w "re-post → %{http_code}\n"  -X POST http://localhost:3101/requests/intake -H "Content-Type: application/json" -H "X-Intake-Key: demo-intake-key" -d "$BODY"  # idempotent (same REQ sysId, no dup)
```
Expect `401 / 201 / 201` — the guard fails closed, the first push builds the
two-level mirror (with the sync gate carried inline), and the re-post is
idempotent on the `@unique` REQ sysId. An empty `lineItems` → `400`.

## Cleanup (delete the demo rows you created)
```bash
# from apps/api — pass the exact REQ sysIds the mocks generated / you posted
npm run demo:cleanup -- reqsys-12342 n8n-req-77772 demo-req-1
```

## Teardown
Stop each `node`/`vite` process (Ctrl-C, or kill the port). Nothing here writes to
your real dev API (3100) / web (5173) / `.env` — the harness only overrides env
inline and shares the dev DB.
