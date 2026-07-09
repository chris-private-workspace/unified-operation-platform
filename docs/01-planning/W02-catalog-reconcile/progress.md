---
phase: W02-catalog-reconcile
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed    # in-progress | closed
---

# Phase W02 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention（R2 binding rule per PROCESS.md §5）。

---

## Day 0 — 2026-07-09: Kickoff

**Action**:Phase W02 kickoff（backend-first 路線敲定後首個後端業務 phase）
- 讀 grounded 依據:`schema.prisma`（SkuCatalog / OpcoSkuLedger / TenantSkuSnapshot / DriftAlert 實際 field）、`graph.service.ts`（`getSubscribedSkus()` → `SubscribedSku[]`）、DESIGN §5/§6/§11、PROCESS phase 流程、W01 三件套格式。
- `plan.md` 填好,status=`draft`（**等 Chris approve flip active + 定 OD1–OD3**）。
- `checklist.md` derived from plan deliverables（F1–F5）。
- Carry-over from W01 retro:RISK R1（Prisma engine,🟡）;auth guard 未做（endpoint 暫 unguarded + TODO）;`OpcoSkuLedger` 未有 seed data（reconcile 初期會全 drift,屬預期 R4）。

**Commit**:_(pending — kickoff 待 Chris approve plan 後連 flip active 一併 commit)_

**下一步**:Chris review plan → 定 OD1–OD3 → approve flip `active` → 由 F1 開工。

---

## Day 1 — 2026-07-09

**Chris approve plan → status `active`;OD1–OD3 全照 default（OD1 cron defer / OD2 reconcile live / OD3 消失 SKU 軟刪）。開始 F1–F5。**

### Done（F1–F5 一日內完成,快過 3-day 估算）
- **F1 接線 ✓**:`LicenseModule` import `IntegrationModule`(取 `GraphService`)+ register `CatalogService` / `ReconcileService` / `LicenseController`;`PrismaService` 由 `@Global` PrismaModule inject。
- **F2 CatalogService ✓**:`syncFromTenant()` upsert `SkuCatalog` by `skuId`(update 只掂 tenant-owned 欄,保留人手 `businessAlias` 等)+ 每 SKU 寫 `TenantSkuSnapshot` + 消失 SKU 軟刪(OD3);`listCatalog()` 返 active。
- **F3 ReconcileService ✓(critical path)**:`reconcile()` 攞 live consumedUnits(OD2)、per-SKU `sum(assignedQuantity)`、`delta`;delta≠0 開/更新 OPEN `DriftAlert`(唔重複、detectedAt 保留),delta=0 resolve;`listDrift()` include sku ref。
- **F4 Controller/DTO ✓**:4 條 route(`POST catalog/sync`·`GET catalog`·`POST reconcile`·`GET drift`)+ `@ApiTags`/`@ApiOkResponse` DTO + `// TODO(auth): @Roles`。
- **F5 Test/lint ✓**:2 spec / 8 test 全綠(Graph/Prisma mock);lint `--fix` 後 clean。

### Gates
- **G1 build ✓**:`npm run build`(nest build)0 error。
- **G2 H5 tests ✓**:`npm run test` → 2 suites / 8 tests passed(catalog 2 + reconcile 6,覆蓋 delta 正/負/零 + null-sum + 唔重複開 + resolve + no-op)。
- **G3 endpoints ✓**:boot log map 4 route;`/docs/api-json` 見全 4 條;`GET /license/catalog` + `GET /license/drift` → **200**(body `[]`,未 sync 前預期)。
- **G4 lint ✓**:`eslint` exit 0。

### Decisions / Open-Questions Resolved
- OD1 = **cron defer**（本 phase 只手動 trigger endpoint;daily `@Cron` 留 orchestration phase）。
- OD2 = **reconcile live**（`reconcile()` 即時 call `getSubscribedSkus()` 攞 fresh consumedUnits;`TenantSkuSnapshot` 只作 sync 時歷史）。
- OD3 = **消失 SKU 軟刪 `active=false`**（保 ledger/snapshot/drift FK）。

### Blockers 🚧 → ✅ 已解決
- **Boot G3 撞 `EADDRINUSE :::3100`**:一個 15:08 起嘅 stale 舊 app instance(W01 build,無 license route)仲霸住 3100 → 頭一次 poll 打錯佢先見 route 空。**解**:`Stop-Process` 停 stale PID → 釋放 3100 → re-boot 新 build → 4 route + GET 200 驗到。（延伸 W01 已知「本機 port 佔用」坑。）

### Commits
- `feat(license): W02 Module C — SKU catalog + total-level reconciliation`（closeout,含 F1–F5 code + W02 三件套 + BACKLOG/SESSION_SUMMARY sync;pushed origin/main）。

---

## Retro（2026-07-09 收尾）

### What worked
- **Grounded 先寫**:落 code 前讀晒 `schema.prisma` / `graph.service.ts` / `main.ts` / `integration.module.ts`,DTO 對得住 Prisma type、`getSubscribedSkus()` shape 一次啱,零返工。
- **方案甲 drift 邏輯用純 unit test 全覆蓋**(delta 正/負/零 + null-sum + 唔重複開 + resolve + no-op),Graph/Prisma mock,唔洗真 tenant 就驗到 critical path(H5)。
- **Gate 分層照 W01**:build/test/lint 唔靠網絡先過,boot 先撞環境坑,隔離清楚。

### What didn't work / unexpected friction
- **Stale app instance 霸 3100**:上一個 dev instance 冇收乾淨,boot 撞 `EADDRINUSE`,而且頭次 poll 靜靜打中舊 build(無 license route)差啲誤判。教訓:驗證前先確認冇 stale listener。
- prettier line-wrap 15 個 error(全 `--fix` 自動修),下次寫時直接跟 80-col wrap 慳一步。

### Surprises / discoveries
- 本機成日殘留舊 node instance(W01 已知 3100/Langfuse 坑再現)。**建議**:之後 phase 驗證前跑一句 `Get-NetTCPConnection -LocalPort 3100` 清 stale。
- `reconcile()` 目前每個 active SKU 各打一次 `aggregate` + `findFirst`(N+1)。SKU 數量細(~37),早期 simplicity 可接受;SKU 大增或加 cron 高頻時再優化(見 carry-over)。

### Carry-overs to 下一個 phase（W03 Module D）
- **OD1 daily `@Cron` reconcile** deferred → orchestration phase 落實(`ScheduleModule.forRoot()` 已 register,掛個 handler 就得)。
- **reconcile N+1 query** — SKU 大量 / 高頻時用 `groupBy` 一次攞晒 ledger sum 優化(技術債,BACKLOG E 區候選)。
- **實際 baseline 對齊**(清差異建 baseline)= operational 動作,要真 tenant creds + 真 `OpcoSkuLedger` 數據,非 W02 gate。
- auth guard(endpoint 暫 unguarded + `TODO(auth)`)、對回機制(§10 deferred)不變。

### ADR triggers
- **無新 ADR** — Module C 純執行已 lock spec(方案甲對帳 / `skuId` 主鍵 / 兩層 ledger);OD1–OD3 屬 spec 內實作選擇,非架構改動(H1 未觸發)。

### Phase Gate result
- **G1 build:Pass**（`nest build` 0 error）
- **G2 H5 tests:Pass**（2 suites / 8 tests）
- **G3 endpoints serve:Pass**（4 route in OpenAPI + 兩條 GET 200）
- **G4 lint:Pass**（eslint exit 0）

### Phase status
- Frontmatter status → `closed`。
- BACKLOG 待同步（W02 → 完成;W03 Module D 候選）。
- 下一個 phase kickoff trigger:**W03 = Module D**（request 履行:intake → line items → triage → sync gate → assign → ledger → 回寫 ServiceNow）。

---

**End of W02 progress**
