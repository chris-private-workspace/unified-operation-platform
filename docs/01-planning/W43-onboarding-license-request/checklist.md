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

- [ ] F1-1 `ServiceNowService` 加 `order_now` 落單能力（單行）
- [ ] F1-2 `ServiceNowService` 加 cart 路徑（`add_to_cart` + `submit_order`，多行用）
- [ ] F1-3 `DirectServiceNowProvider` 改用 catalog API，**唔再 insert `sc_request`**
- [ ] F1-4 unit test（SN mock）：order_now / cart / 400 mandatory / 5xx 各一
- [ ] F1-5 boundary test：專項斷言「**冇任何 `sc_request` insert**」
- [ ] F1-6 CH-014 script **保留唔刪**，確認同 production path 各行各路
- [ ] F1-7 BUG-010 report 標 fixed + 指返 ADR-0025 D2

## F2 — Onboarding intake → 建 O365 單

- [ ] F2-1 決定 catalog item id 放邊（`ConnectorConfig` vs constant）+ 實作
- [ ] F2-2 requester email → `sys_user` sys_id 解析
- [ ] F2-3 **fail-closed**：解析不到 → 唔建單 + `request.submit` failure（**唔用 fallback 帳號**）
- [ ] F2-4 variable mapping：4 個 mandatory 齊全
- [ ] F2-5 `target_user` = requester sys_id（placeholder）· `target_users_email` = 真新用戶 email
- [ ] F2-6 `target_user_opcos` = `opcoCode` 轉小寫；`action_type` = `new_license_assignment`
- [ ] F2-7 `license_type` best-effort（對唔到留空，**唔 fail**）
- [ ] F2-8 新 RITM sys_id / number 寫落 `RequestLineItem.serviceNowSysId` / `serviceNowNumber`（OQ-2）
- [ ] F2-9 schema 註釋寫死「`Request.serviceNow*` = onboarding REQ；line item = UOP 建嗰張」
- [ ] F2-10 多條 line → cart（OQ-3）
- [ ] F2-11 failure：`request.submit`（未變）/ `request.mirror`（已變，**絕不重新提交**）
- [ ] F2-12 test 覆蓋 F2-2 ~ F2-11

## F3 — Gate ②：schema + sweep + 回填

- [ ] F3-1 migration：`Request` 加 `serviceNowUserSyncedAt` / `serviceNowUserSysId`（additive nullable）
- [ ] F3-2 verify：scratch DB apply **+ rollback**（唔碰 dev DB）
- [ ] F3-3 `SyncSweepService.findCandidates()` 條件由「gate ① 未通」放寬成「**任一 gate 未通**」
- [ ] F3-4 🔴 兩個 gate **各自 try/catch**，逐 vendor abort（Graph 掛唔可以拖跨 SN）
- [ ] F3-5 Gate ② = `snow.query('sys_user', 'email=<targetUpn>')`；**≥2 命中 fail-closed**（OQ-4）
- [ ] F3-6 開閘：寫 `serviceNowUserSyncedAt` + `serviceNowUserSysId` + `RequestEvent` + audit
- [ ] F3-7 **回填**：同一刻 PATCH 新 RITM 個 `target_user` 成真人 sys_id
- [ ] F3-8 回填失敗 non-fatal（gate 照開，failure 入佇列）
- [ ] F3-9 `SyncCheckService` 加 on-demand gate ②（跟既有 cooldown pattern）
- [ ] F3-10 `scrub-pii.spec.ts` 白名單同步（新 code path 會攞 UPN）
- [ ] F3-11 test：sweep 兩 vendor 獨立失敗 / ≥2 命中 / 回填 / 回填失敗

## F4 — Assign 雙 gate

- [ ] F4-1 `assign.service.ts:135` 之後加第二閘，**既有嗰行逐字不變**
- [ ] F4-2 兩個訊息分開（operator 睇得出等緊邊一邊）
- [ ] F4-3 verify：`budgetOverrideReason` **override 唔到**任何一個 gate（專項 test）
- [ ] F4-4 verify：既有 gate ① test（`spec.ts:406` / `:619`）仍然綠

## F5 — 前端：兩個 gate 狀態可見

- [ ] F5-1 Request detail 顯示兩個 check point 狀態
- [ ] F5-2 token-only，**唔加新 pattern / 新色**（用既有 Badge + semantic tone）
- [ ] F5-3 light + dark 都驗
- [ ] F5-4 跑 `.claude/skills/ui-design` 自檢，逐條答
- [ ] F5-5 web test

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
- [ ] G5 — migration scratch DB apply + rollback
- [ ] G6 — **live 真建一張 O365 單**（⚠️ 需 Chris 明示批准，SN 刪唔到）
- [ ] G7 — **live** gate ② 由未通 → 通，`target_user` 真係由 requester 變新用戶
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
