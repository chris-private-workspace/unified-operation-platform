---
phase: W03-request-lifecycle
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed    # in-progress | closed
---

# Phase W03 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention（R2 binding rule per PROCESS.md §5）。

---

## Day 0 — 2026-07-09: Kickoff

**Action**:Phase W03 kickoff（Module D-1 — request 生命週期骨架）
- 讀 grounded 依據:`schema.prisma`（Request / RequestLineItem / RequestEvent / LineItemStage / RequestStatus / EventType）、`servicenow.service.ts`（getRecordByNumber / updateRecord / addWorkNote）、`fulfilment.module.ts`（空殼）、`seed.ts`（23 OpCos,無 request/ledger data）、DESIGN §6/§7/§8。
- **拆法決定（提案）**:Module D 拆兩個 slice —— **W03 = D-1**（intake + triage + stage 推進,**無 external side-effect**）、**W04 = D-2**（sync gate + assign + ledger + 回寫）。理由 = 隔離 internal state machine vs 掂 Graph/ledger/SN 真寫,critical path 集中、可測。
- `plan.md` 填好,status=`draft`（**等 Chris approve flip active + 定 OD1–OD5**,特別 OD1 拆法）。
- `checklist.md` derived from plan（F1–F5）。
- Carry-over from W02 retro:OD1 daily `@Cron` deferred;reconcile N+1 技術債;stale 3100 instance 驗前先清;auth guard 未做。

**Commit**:_(pending — kickoff 待 Chris approve plan 後連 flip active 一併 commit)_

**下一步**:Chris review plan → 定 OD1（拆法）+ OD2–OD5 → approve flip `active` → 由 F1 開工。

---

## Day 1 — 2026-07-09

**Chris approve plan → status `active`;OD1 = 拆兩個（D-1 now / D-2=W04）,OD2–OD5 全照 default。開始 F1–F5。**

### Done（F1–F5 一日內完成）
- **F1 接線 ✓**:`FulfilmentModule` import `IntegrationModule`(取 `ServiceNowService`)+ register `RequestService` / `StageService` / `FulfilmentController`。
- **F2 RequestService ✓**:`intake()`(manual 或 by SN number → mirror SN 欄 + rawRequestText;opco/SN 不存在 → NotFound)、`addLineItem()`(triage + `RequestEvent(NOTE)` + recompute)、`listRequests()`/`getRequestDetail()`。**H4**:intake 唔 log target UPN(PII),只 log id + opco code。
- **F3 StageService ✓(critical path)**:`advanceStage()` 顯式 `LEGAL_TRANSITIONS` matrix(短路/procurement)+ 拒非法跳轉 + 拒 `→ASSIGNED`(D-2)+ 寫 `STAGE_CHANGE` event + stage timestamp;`aggregateRequestStatus()` pure helper(OD4,forward-compat COMPLETED)+ `recomputeRequestStatus()`。
- **F4 Controller/DTO ✓**:5 route + class-validator request DTO + `@ApiOkResponse` response DTO + `// TODO(auth)`。
- **F5 Test/lint ✓**:4 suites / 25 test 全綠;lint `--fix` 後 clean。

### Gates
- **G1 build ✓**:`nest build` 0 error。
- **G2 H5 tests ✓**:`npm run test` → 4 suites / **25 tests**(W02 8 + W03 17:request 6 + stage 11,含 pure helper 5 + transition machine 6)。
- **G3 endpoints ✓**:boot 見 5 fulfilment route;GET `/fulfilment/requests` 200;**真實 end-to-end smoke** —— 真 opcoId → `POST` intake → status `OPEN` → `GET` detail 驗到 → cleanup `DELETE 1`。
- **G4 lint ✓**:`eslint` exit 0。

### Decisions / Open-Questions Resolved
- OD1 = **拆兩個 slice**（W03 = D-1 intake+triage+stage machine 無 side-effect;W04 = D-2 assign+ledger+回寫）。
- OD2 = **intake by SN number（`getRecordByNumber`）+ 手動 payload**;自動 poll defer。
- OD3 = **line item operator 手動加**（`rawRequestText` 唔自動 parse）。
- OD4 = **status 聚合**:全 REQUESTED→OPEN、有 in-flight→IN_PROGRESS、全 CANCELLED→CANCELLED（COMPLETED 待 D-2）。
- OD5 = **SN 用預設 `sc_req_item`/`number`/`work_notes` + mock**（Phase 1 實際未對齊,depends on OQ default）。

### Blockers 🚧 → ✅
- G3 前先跑 `Get-NetTCPConnection -LocalPort 3100` 清 stale instance（W02 教訓）—— 清咗一個殘留 PID,今次 boot 一次到位,冇再撞 `EADDRINUSE`。

### Commits
- `feat(fulfilment): W03 Module D-1 — request lifecycle skeleton`（closeout,含 F1–F5 code + W03 三件套 + BACKLOG/SESSION_SUMMARY sync;pushed origin/main）。

---

## Retro（2026-07-09 收尾）

### What worked
- **拆 D-1/D-2 的隔離收效**:D-1 全部 write 都係 platform 自己嘅 table(Request / RequestLineItem / RequestEvent),零 external side-effect → 用 pure mock 就驗晒,唔洗真 Graph/SN/ledger。critical path(stage machine)可以孤立測到底。
- **顯式 transition matrix + pure `aggregateRequestStatus`**:合法/非法路徑一覽,test 直接對住 matrix 寫;pure helper 可以脫離 DB 單獨測 5 個 status case,快又穩。
- **真實 end-to-end smoke(POST intake → GET detail → cleanup)**:除咗 mock test,仲對住真 DB 行咗一轉寫入路徑,證 DTO validation + Prisma create + status 聚合真係通。
- W02 教訓即時生效:G3 前先清 stale 3100,一次 boot 成功。

### What didn't work / unexpected friction
- prettier line-wrap 又要 `--fix`(慣性)。無其他 friction —— schema/service signature 之前 grounded 讀過,一次啱。
- ServiceNow record field 名(`sys_id`/`number`/`state`/`short_description`)係按 `sc_req_item` 預設**估**,Phase 1 實際未對齊(OD5)→ intake by-number 真跑要對齊先準;邏輯用 mock 驗到,對齊屬 operational。

### Surprises / discoveries
- `stage machine` 嘅 `→ASSIGNED` 要**雙重**擋:matrix 本身唔 include ASSIGNED,但仍加一個明確 guard 畀清楚 error(話明 D-2),UX 好過一句籠統 illegal transition。
- 每次 stage advance 係 3 個 sequential write(update line item + create event + update request status),無包 transaction。低並發(人手推進)可接受;高並發或要嚴格一致再包 `$transaction`(技術債,見 carry-over)。

### Carry-overs to 下一個 phase（W04 = D-2）
- **D-2 直接接住**:`READY` line item + sync gate(`azureSyncedAt` / `findUser`)→ `assignLicense`(Graph)→ line item `→ASSIGNED`(`assignedAt`)→ **`OpcoSkuLedger.assignedQuantity` +1**（同 W02 對帳扣返）→ 回寫 ServiceNow(`addWorkNote`/`updateRecord`)。`aggregateRequestStatus` 已 forward-compat `COMPLETED`。
- **stage advance 未包 transaction** — 一致性技術債,D-2 assign(掂 ledger)時考慮包埋(BACKLOG E 區候選)。
- ServiceNow table/field 對齊(OD5)= D-2 回寫真跑前要 confirm Phase 1 實際設定。
- auth guard 不變(endpoint unguarded + `TODO(auth)`)。

### ADR triggers
- **無新 ADR** — D-1 純執行已 lock spec(stage 掛 line item / 短路+procurement 兩路徑 / RequestEvent 平台歷史);OD1–OD5 屬 spec 內實作選擇,非架構改動(H1 未觸發)。

### Phase Gate result
- **G1 build:Pass** · **G2 H5 tests:Pass（4 suites / 25 tests）** · **G3 endpoints serve:Pass（5 route + intake smoke）** · **G4 lint:Pass**

### Phase status
- Frontmatter status → `closed`。
- BACKLOG 待同步（W03 → 完成;W04 = D-2 候選）。
- 下一個 phase kickoff trigger:**W04 = Module D-2**（sync gate + `assignLicense` + 更新 `assignedQuantity` + 回寫 ServiceNow + `ASSIGNED` stage）。

---

**End of W03 progress**
