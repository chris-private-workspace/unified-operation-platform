---
phase: W04-assign-fulfilment
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed    # in-progress | closed
---

# Phase W04 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention（R2 binding rule per PROCESS.md §5）。

---

## Day 0 — 2026-07-09: Kickoff

**Action**:Phase W04 kickoff（Module D-2 — 履行動作,最硬 critical path）
- 讀 grounded 依據:`GraphService.findUser/assignLicense`（sync gate + usageLocation 內建 set）、`ServiceNowService.addWorkNote`、`OpcoSkuLedger`（compound key `opcoId_skuCatalogId`）、`aggregateRequestStatus`（forward-compat COMPLETED）、DESIGN §5/§7/§8。
- **接住 W03**:D-1 起咗 stage machine（拒 `→ASSIGNED`）;D-2 做 assign 路徑（sync gate → Graph assign → ledger +1 → 回寫）。
- `plan.md` 填好,status=`draft`（**等 Chris approve flip active + 定 OD1–OD6**）。
- `checklist.md` derived（F1–F4）。
- Carry-over from W03 retro:stage advance 未包 transaction → D-2 assign 用 `$transaction`（OD2）;SN table/field（OD5 W03）真回寫前對齊。

**Commit**:_(pending — kickoff 待 Chris approve plan 後連 flip active 一併 commit)_

**下一步**:Chris review plan → 定 OD1–OD6 → approve flip `active` → 由 F1 開工。

---

## Day 1 — 2026-07-09

**Chris approve plan → status `active`;OD1–OD6 全照 default。開始 F1–F4。**

### Done（F1–F4 一日內完成）
- **F1 markSynced ✓**:模擬 Phase 1 回寫 —— set `azureSyncedAt` + `accountCreatedAt`（若空）+ `RequestEvent(SYNC)`。
- **F2 AssignService ✓（critical path）**:5 個 fail-closed gate（READY / azureSyncedAt / findUser / usageLocation / seat）→ Graph `assignLicense` → `$transaction`（line item `ASSIGNED`+`assignedAt` / `OpcoSkuLedger` +1 via upsert increment / `ASSIGN` event / status recompute → `COMPLETED`）→ SN `addWorkNote`（non-fatal）。**H4**:唔 log UPN。
- **F3 Controller/DTO ✓**:2 endpoint（`PATCH .../sync`、`PATCH .../assign` + 可選 usageLocation）+ response DTO + `// TODO(auth)`。
- **F4 Test/lint ✓**:12 test（happy + 6 gate + assign throw isolation + SN non-fatal + override + markSynced）;lint `--fix` 後 clean。

### Gates
- **G1 build ✓**:`nest build` 0 error。
- **G2 H5 tests ✓**:`npm run test` → 5 suites / **37 tests**（W03 25 + W04 12）。
- **G3 endpoints ✓**:7 fulfilment route（D-1 五 + D-2 二）;**markSynced end-to-end smoke** —— intake（azureSyncedAt 空）→ `PATCH sync` → 時間戳 set + `SYNC` event → cleanup。assign 邏輯由 mock test 覆蓋（OD1 唔打真 tenant）。
- **G4 lint ✓**:`eslint` exit 0。

### Decisions / Open-Questions Resolved
- OD1 = **全 mock,唔打真 tenant**（assign 實際改動 → test 一律 mock GraphService）。
- OD2 = **`$transaction`**（Graph 成功後開 tx 包 line item ASSIGNED + ledger +1 + ASSIGN event + status）。
- OD3 = **assign 前查 seat**（`getSubscribedSkus` consumed < prepaid）。
- OD4 = **SN 回寫 non-fatal**（assign 成功後 addWorkNote,fail log warning 唔 rollback）。
- OD5 = **usageLocation**:user 現有 → DTO 提供 → 都無則拒。
- OD6 = **加 `markSynced` endpoint** 模擬 Phase 1 開閘 sync gate。

### 🚩 發現（H4 pre-existing,非本 phase 修）
- **`GraphService.assignLicense`（W01 integration code）log 咗 target UPN**:`this.logger.log(\`Assigned SKU ${skuId} to ${userIdOrUpn}\`)` —— UPN 係 PII,違反 §5.4 H4。W04 `AssignService` 自己**唔** log UPN,但佢 call 嘅 `assignLicense` 會。**未修**（surgical:唔喺 D-2 commit 順手改 integration layer）→ flag 俾 Chris,建議開 BUG（一行改:log userId 或遮蔽 UPN）。

### Commits
- `feat(fulfilment): W04 Module D-2 — assign flow + ledger + ServiceNow write-back`（closeout,含 F1–F4 code + W04 三件套 + BACKLOG/SESSION_SUMMARY sync;pushed origin/main）。

---

## Retro（2026-07-09 收尾）

### What worked
- **fail-closed gate 鏈 + 全部 gate 各一 test**:5 個前置條件（READY / synced / user / usageLocation / seat）順序擋,每個失敗 case 都 assert「Graph 冇被 call、tx 冇開」,證明真係 fail closed —— assign 唔會半途改 state。
- **external call 喺 transaction 外**:`assignLicense`（Graph,不可 rollback）成功**先**開 `$transaction` 寫 DB。test 用 `$transaction: jest.fn(cb => cb(tx))` 就完整驗到 tx 內四步。
- **W02 reconcile 做安全網**:Graph↔DB 之間萬一裂縫（assign 咗但 ledger 冇 +1），W02 總量層對帳會偵測到 drift —— 兩個 phase 扣返一齊,設計閉環。
- **markSynced 真實 smoke**:sync gate 開閘對真 DB 行到,補足 assign 唔能打真 tenant 嘅缺口。

### What didn't work / unexpected friction
- assign flow 唔能真 end-to-end smoke（要真 Graph creds + 真用戶 + 佔真 seat）—— 靠 12 個 mock test + markSynced 真 smoke 補。屬 OD1 既定取捨。
- prettier line-wrap 又 `--fix`（慣性,無 friction）。

### Surprises / discoveries
- **🚩 H4 pre-existing**:`GraphService.assignLicense` log UPN（見上）。W04 之前 assign flow 未接通,呢個 log 唔會觸發;而家 D-2 接通咗,一 assign 就會寫 UPN 落 log → 由潛在變真實 H4 暴露。建議開 BUG 修（integration layer,非 D-2 scope）。
- ledger 用 `upsert` + `increment` 一步搞掂「無 row 就建 assignedQuantity=1 / 有就 +1」,唔使先 findUnique,乾淨。

### Carry-overs to 下一個 phase
- **🚩 BUG 候選**:`GraphService.assignLicense` log UPN（H4）—— 建議 W04 後開 `BUG-001` 一行修。
- **Module D 全完**:D-1（生命週期）+ D-2（履行）both done。**LicenseOps 後端業務層（Module C + D）完成** —— backend-first 路線嘅後端段收工。
- **下一個 = FE-scaffold**（`apps/web` app shell + token/theme,受 H6 保護）—— 前端第一個 phase。
- auth guard 仍未做（endpoint unguarded + `TODO(auth)`）—— 真實曝露前必做（AUTH phase）。
- ServiceNow table/field（OD5 W03）真回寫前對齊 Phase 1;stage advance transaction（W03 carry-over）D-2 已用 `$transaction` 做 assign,stage advance 本身仍 sequential（低優先技術債）。

### ADR triggers
- **無新 ADR** — D-2 純執行已 lock spec（sync gate / `assignedQuantity` +1 / SN mirror / stage 掛 line item）;OD1–OD6 屬 spec 內實作選擇,非架構改動（H1 未觸發）。

### Phase Gate result
- **G1 build:Pass** · **G2 H5 tests:Pass（5 suites / 37 tests）** · **G3 endpoints serve:Pass（7 route + markSynced smoke）** · **G4 lint:Pass**

### Phase status
- Frontmatter status → `closed`。
- BACKLOG 待同步（W04 → 完成;Module D 全完;下一個 = FE-scaffold）。
- 下一個 phase kickoff trigger:**FE-scaffold**（`apps/web` app shell + token/theme,H6）—— backend 段完,轉前端。

---

**End of W04 progress**
