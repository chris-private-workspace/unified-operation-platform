# Integration layer — setup

## 1. Packages

```bash
npm install @microsoft/microsoft-graph-client @azure/identity
# @nestjs/config is assumed already present in the NestJS project
```

Requires Node 20+ (uses the global `fetch` for ServiceNow).

## 2. Entra app registration (for Graph, app-only)

Create an app registration, add a client secret, and grant these
**Application** permissions (then grant admin consent):

| Permission              | Used by                                  |
| ----------------------- | ---------------------------------------- |
| `Organization.Read.All` | `getSubscribedSkus()`                    |
| `Directory.Read.All`    | `findUser()` (Azure-sync gate check)     |
| `User.ReadWrite.All`    | `assignLicense()`, `setUsageLocation()`  |

Put `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` in `.env`.

## 3. ServiceNow integration account

A service account with Table API access and read/write on the request
table. Confirm the actual **table name and field names** against what
Phase 1 already reads/writes — `sc_req_item` and `work_notes` are the
common defaults but may differ in your instance.

## 4. Runtime caveats (built into the code, but worth knowing)

- **usageLocation is mandatory** before `assignLicense`. Pass
  `{ usageLocation: 'HK' }` (or the right code per user) and the service
  sets it first if missing.
- **assignLicense fails with no free seats** — check availability (via the
  reconciliation/ledger layer) before calling it.
- **`findUser()` returning null = not synced yet** — use it as the Phase 1
  gate before attempting assignment; retry on a schedule until it appears.
- Graph SDK errors expose `.statusCode`; ServiceNow errors are thrown with
  the HTTP status in the message.

## 5. Wire it up

Import `IntegrationModule` wherever the domain layer needs Graph/ServiceNow,
and make sure `ConfigModule.forRoot({ isGlobal: true })` is in `AppModule`.
