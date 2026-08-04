---
phase: W43-onboarding-license-request
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-08-03
---

# Phase W43 — Checklist

> Atomic checkbox（每 item ≤ 1–2 hour effort）。
> AI tick 完成嘅 item；唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> 🔴 **G1（ADR-0025 Accepted）未剔之前，F0 以下一律唔可以開工**（R1 + H1）。

## G — 前置 gate

- [x] G1 — **ADR-0025 Accepted**（Chris 2026-08-04）
- [x] G1b — 本 plan 由 draft 轉 active（Chris 2026-08-04，**分批做、由批 A 開始**）

## F0 — 止血：停用 by-task close

- [x] F0-1 `assign.service.ts` `ticketTarget()` 停止讀 `item.serviceNowTaskSysId`（優先次序剩 RITM → REQ）；順帶由 `ticketTarget()` / `holdTicket()` 嘅 param type 移除嗰個欄（自己改動製造嘅 orphan）
- [x] F0-2 更新 `assign.service.spec.ts` **3 個** by-task test，斷言全部反轉（`ignores a handed-over catalog task…` / `does not close … when the line has no RITM` / failed close 記 `targetKind: 'ritm'`）
- [x] F0-3 `schema.prisma` 兩個欄註釋改寫成 **TRACEABILITY ONLY**（ADR-0025 D1），**冇 drop column**
- [x] F0-4 `n8n-flat-intake.dto.ts` 兩個欄保留收貨 + 註釋同 `@ApiPropertyOptional` 改成 traceability
- [x] F0-5 verify：`npm test -w @uop/api` → **837 passed / 68 suites / EXIT=0**

## F1 — BUG-010：`DirectServiceNowProvider` 改行 Service Catalog API

- [x] F1-1 `ServiceNowService` 加 `orderNow()`（單行）+ `readRequestNumber()`（`request_number` / `number` 兩個都讀，冇就 throw）
- [x] F1-2 `ServiceNowService` 加 cart 路徑：`cartItemCount()` / `addToCart()` / `submitCartOrder()`
- [x] F1-3 `DirectServiceNowProvider` 重寫走 catalog API，**冇任何 `sc_request` insert**
- [x] F1-4 unit test（SN mock）：order_now / `number` fallback / 冇 request number / cart count / 空 cart / add_to_cart / **400 mandatory** / **5xx** — 11 個
- [x] F1-5 boundary test：`never inserts into sc_request`（專項斷言 `createRecord` 零呼叫）
- [x] F1-6 CH-014 script **一個字冇改**；production 行 `ServiceNowService`，script 行自己嘅 `fetch`，兩條路
- [x] F1-7 BUG-010 report → **`verifying`**（唔係 `done`）+ 指返 ADR-0025 D2。🔴 轉 `done` 要等 **G6 真 POST**
- [x] F1-8 *(新增，plan §7 changelog)* `findUserSysIdByEmail()` — 兩個 caller 共用（F2 requester / F3 gate ②），**≥2 命中 fail-closed**（OQ-4），H4 log path redact
- [x] F1-9 *(新增)* catalog item 分流 + 三個 env key 落 `.env.example`

## F2 — Onboarding intake → 建 O365 單

- [x] F2-1 catalog item id → **env-only**（`SERVICENOW_O365/D365_CATALOG_ITEM_SYS_ID`）。**否決 `ConnectorConfig` column** —— ADR-0025 冇授權嗰個 schema 改動，env 零 schema 兼可逆；要 UI 可改 = 另一個 H1，批 C 再判斷
- [x] F2-2 requester email → `sys_user` sys_id（`findUserSysIdByEmail`，F1-8）
- [x] F2-3 **fail-closed**：解析不到 / 冇 requesterEmail → **唔打任何 SN 寫入**（專項 test 斷言 `orderNow` 零呼叫），**冇 fallback 帳號**
- [x] F2-4 variable mapping：4 個 mandatory 齊全
- [x] F2-5 `target_user` = requester（placeholder）· `target_users_email` = 真新用戶 email（專項 test 釘死）
- [x] F2-6 `target_user_opcos` / `opcos` = `opcoCode` 轉小寫；`action_type` = `new_license_assignment`
- [x] F2-7 `license_type` **一個字唔送**（`mandatory=false`，冇 mapping ⇒ 送個估更差）
- [x] F2-8 新 RITM 寫落 `RequestLineItem.serviceNowSysId` / `serviceNowNumber`（OQ-2）
- [x] F2-9 `schema.prisma` 註釋寫死兩張 REQ 嘅分工 + 點解平台自己嗰張**冇** `Request` 層位置
- [x] F2-10 多條 line → cart（OQ-3），cart 非空 fail-closed
- [x] F2-11 failure 分兩種：`request.submit`（外部未變 → repair 重新提交）/ `request.mirror`（**單已存在，絕不重新提交**，帶 `externalRef`）
- [x] F2-12 test：5 個新 test，**含 once-guard**（n8n 重推唔會開第二張真飛）+ 兩種 failure kind 分辨
- [x] F2-13 *(新增)* hook 點揀 `IntakeAdapterService.intakeFlat`，**唔郁 canonical `IntakeService`** —— 否則 ADR-0021 import-from-SN 呢類 caller（由已存在嘅 REQ 導入）會被無端開多一張單

## F3 — Gate ②：schema + sweep + 回填

- [x] F3-1 migration `20260804032725_w43_gate2_sn_user_sync`（additive、兩個 nullable、零 backfill）
- [x] F3-2 scratch DB apply + rollback ✅（見 G5）
- [x] F3-3 `findCandidates()` → `OR: [{azureSyncedAt: null}, {serviceNowUserSyncedAt: null}]`，select 帶埋兩個 gate 狀態（一個半開嘅 request 只花一個 vendor call）
- [x] F3-4 🔴 **一個 vendor 一個 abort flag**（`graphDown` / `snowDown`）—— 共用一個 flag 會令一邊 outage 靜靜停低另一邊，而 round 仍然「成功」
- [x] F3-5 Gate ② = `findUserSysIdByEmail`；**≥2 命中**用新 `AmbiguousServiceNowUserError` 分辨 —— 呢個係**單一 request 嘅問題唔係 SN 掛咗**，所以 gate 關住但**唔 abort vendor**（OQ-4）
- [x] F3-6 開閘 = `openServiceNowUserGate`（同 `openSyncGate` 放同一個檔，兩個 gate 並排睇到差異）+ `SYNC_GATE_MESSAGE.SN_VERIFIED` + audit
- [x] F3-7 **回填** `target_user`：新 `ServiceNowService.updateCatalogVariable()`（`sc_item_option_mtom` → `sc_item_option` → `item_option_new` 三層 walk）
- [x] F3-8 回填失敗 **non-fatal**，gate 照開（專項 test）—— 而且 `sc_item_option` 寫權**未證實**（BUG-010 已示範 insert / update 係兩套 ACL）
- [ ] 🚧 F3-9 `SyncCheckService` on-demand gate ② —— **未做**。理由：sweep 每 10 分鐘已覆蓋，on-demand 純屬 UX 便利，唔影響 gate 正確性。**target：批 C 或 BACKLOG**
- [x] F3-10 `scrub-pii` 白名單 —— `sync-sweep.service.ts` 本身已喺表內；`findUserSysIdByEmail` 個 email 走 `logPath` redact（專項 test 斷言 log 冇地址、有 `<redacted>`）
- [x] F3-11 test：6 個新 —— 開閘 / 回填 / 回填失敗 gate 照開 / ≥2 唔停其他 / **SN 掛咗 Graph 照開** / **Graph 掛咗 SN 照開**
- [x] F3-12 *(新增)* `audit-fields` `SyncSweep` 白名單加 `snOpened` —— 唔加會**靜靜丟**，round 永遠少報 gate ②（ADR-0009 D4）

## F4 — Assign 雙 gate

- [x] F4-1 第二閘加咗，**既有嗰行逐字不變**（連 wording）
- [x] F4-2 兩個訊息分開：`Phase 1 sync gate not passed…` vs `ServiceNow sync gate not passed: the target user is not in ServiceNow yet`
- [x] F4-3 專項 test：`budgetOverrideReason` **override 唔到** gate ②（override 係畀人為**預算決定**負責；sync gate 唔係決定，係「呢個人存唔存在」嘅事實）
- [x] F4-4 既有 gate ① test 仍然綠
- [x] F4-5 *(新增，非計劃內)* 🔴 修 `readyItem` fixture：`...over` 本來喺 `request` **之後**，所以 `over.request` 係**整個取代**而唔係 merge。以前得一個 gate 所以冇人發現;兩個 gate 之後，「關 gate ②」會連 gate ① 一齊抹走，測試就會**因為錯嘅原因而 pass**

## F5 — 前端：兩個 gate 狀態可見

- [x] F5-1 Request detail 顯示兩個 check point 狀態 —— 第三個 `SyncStep`「Known to ServiceNow」；gate ① 開 gate ② 未開 = 「Waiting on ServiceNow · checked automatically」（**純文字冇掣**：`Check now` 問嘅係 Graph，喺呢個狀態出佢等於叫人去查已經冇事嗰邊；`Mark synced` 更加唔可以有——冇人可以「宣稱」一條 SN 記錄存在）
- [x] F5-2 token-only，**唔加新 pattern / 新色**（第三個 step 用返同一個 `SyncStep` primitive；新色只有 `text-warn`，已存在 token）
- [ ] 🚧 F5-3 light + dark 都驗 —— **未做**：本 session 冇 browser（`claude-in-chrome` 零連接、無 Playwright MCP）。已做**結構**驗證：新用嘅 `--warn` 喺 `design-system/tokens/colors.css` `:root`(L29) 同 dark(L56) 兩邊都有定義，改動檔案零 hex / rgb / hsl。**target：同 G9 一齊做**
- [x] F5-4 跑 `.claude/skills/ui-design` 自檢，逐條答（見 progress Day-2；DS-4 / DS-11 標 ⚠️ 未 render 驗）
- [x] F5-5 web test：**265 → 281**（31 files）；tsc web 0 error
- [x] F5-6 *(新增，非計劃內)* `deriveStatus` 加 gate ② —— 唔加嘅話**同一個版面自相矛盾**：header badge 講「Ready to assign」而下面 assign 掣講「Blocked · sync」。兩個 gate **共用一個 label**（list column 度「邊個 vendor」唔 actionable，「而家 assign 唔到」先係），順帶令 `matchesFilter('blocked')` **零改動**就接住 gate ② 阻塞嘅 request——分開 label 就要同步改個 filter，漏咗會**靜靜**令佢喺 Blocked tab 消失

## F6 — Close 路徑驗證（零新 code）

- [ ] F6-1 test：新建 RITM → `pickTask` → close 成功
- [ ] F6-2 test：`close_notes` 維持 UOP 指紋（**唔可以同 n8n 撞**）
- [ ] F6-3 live：assign 後 `Execution Step` task 閂咗（**睇 `close_notes` 唔睇 `sys_updated_by`**）
- [ ] F6-4 live：**兄弟 task 冇郁**（分辨「閂咗指定嗰張」vs「閂咗搵到嘅第一張」）

## F7 — Doc sync + closeout

- [ ] F7-1 ADR-0024 status 標註「D1 改用途 / D6① superseded by ADR-0025」
- [ ] F7-2 `docs/adr/README.md` 加 0025 一行
- [ ] F7-3 CLAUDE.md §0 + §9 phase 座標
- [ ] F7-4 `docs/12-ai-assistant/01-prompts/SESSION_SUMMARY.md`
- [ ] F7-5 `docs/13-deployment/07-uat-as-built.md`（🔴 **先 `az containerapp revision list` 實測**，唔信文件）
- [ ] F7-6 `RISK_REGISTER.md`：加「UOP 同 n8n 共用 SN 帳號」（R5）
- [ ] F7-7 `BACKLOG.md` 同步（R7）+ `license_type` 48-choice 對照表入 backlog
- [ ] F7-8 memory 更新（ADR-0025 決定 + 共用帳號指紋）

## 驗收 Gate（plan §4）

- [ ] G2 — api test 全綠且**數目上升**（基線 837 / 68 suites）
- [ ] G3 — root `npm run lint` exit 0（CI 真正 gate 嗰條）
- [ ] G4 — tsc api + web 各 0 error
- [x] G5 — migration scratch DB apply + rollback ✅（`platform_w43_gate2`，建→驗→drop，dev DB 零污染）：19 條 apply exit 0 → 插 2 行 fixture（一行 gate ② 有值、一行冇）→ **手寫 rollback**（`DROP COLUMN` ×2 + 刪 `_prisma_migrations` 一行，同一個 `-c` ⇒ 一個 transaction）→ 欄消失但兩行其他欄**逐格不變**、ledger 19→18 → 重 apply（**呢次係打落一個已經有 row 嘅 DB**，即真實 UAT 情境）→ 欄返嚟 `is_nullable=YES` / **冇 default**、`rows_with_gate2_set = 0` ⇒ **零 backfill 喺真 row 上得到證明**。🔴 誠實講：rollback 對呢兩個欄係**有損**（`DROP COLUMN` 必然），對其餘一切無損
- [x] G6 — **live 真建一張 O365 單** ✅（Chris 2026-08-04 批准）：**REQ0044071 / RITM0047366 / SCTASK0071831**（`Execution Step` · `O365 Support` · 剛好 1 張 active）。行 production class 唔另寫 SN 呼叫；獨立 read 覆核 variables（`target_user` = requester · `license_type` 空 · `rapo` 小寫）。⚠️ **張單要人手 cancel**
- [ ] G7 — **live** gate ② 由未通 → 通，`target_user` 真係由 requester 變新用戶
  - **前半已有實證**（G5 順帶查到，非計劃內）：dev DB 兩張單 2026-08-04 03:40 由 **scheduled sweep** 真開咗 gate ②（`RequestEvent` 有 `ServiceNow sync verified …(scheduled sweep)` + `serviceNowUserSysId` 有真 sys_id）⇒ `findUserSysIdByEmail` + `openServiceNowUserGate` 打真 SN 行得通
  - **後半仍然未驗**：`target_user` 回填走 `updateCatalogVariable`（寫 `sc_item_option`），而佢**刻意 non-fatal** ⇒ 失敗唔會喺 DB 留低任何痕跡。要證就要**去 SN 讀返嗰兩張 RITM 個 `target_user`**（read-only）
- [ ] G8 — **live** close 成功 + 兄弟 task 冇郁
- [ ] G9 — 前端 light + dark + `ui-design` 跑過
- [ ] G10 — UAT 部署後抽 running OpenAPI **實搜**新契約（唔靠 tag 推論）

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker（R4）
- [ ] All architectural-adjacent decisions documented as ADR（per CLAUDE.md §5）
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`（R7）
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro

---

**Lifecycle reminder**：呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog，然後再加 checklist item。
