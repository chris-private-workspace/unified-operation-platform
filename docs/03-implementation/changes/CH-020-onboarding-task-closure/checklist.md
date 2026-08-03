# CH-020 Checklist — Onboarding catalog task closure

> 對應 `spec.md`(status `approved`,2026-08-03)。ADR-0024 = **Accepted**。
> 規矩:唔可以刪未勾項 —— 只可以 `[ ]` → `[x]`,或者加 🚧 + 理由 + target。

## G — Gate(開工前)

- [x] G1 ADR-0024 status → `Accepted`(Chris approve,2026-08-03)
- [x] G2 `spec.md` status → `approved`(2026-08-03)
- [x] G3 ADR README 加 0024 一行
- [x] G4 BACKLOG 加 CH-020 一行(R7)

## S — Schema(D1)

- [x] S1 `RequestLineItem` 加 `serviceNowTaskSysId` / `serviceNowTaskNumber`(兩個 nullable)
- [x] S2 Additive migration(零 backfill;既有 row 全 null)—— `20260803060106_ch020_line_item_task_ref`
- [x] S3 `prisma generate` + `migrate deploy` 落本機 dev DB(真 DB 查證:兩欄 `text`/`YES`、19 行全 null、migration `applied=t`)

## I — Intake 分流(D2 / D3)

- [x] I1 `dto/n8n-flat-intake.dto.ts` —— `mode`(`@IsIn([1])`)/ `targetUpn` / `opcoCode` / `requestId` required;task 兩欄 + `targetDisplayName` / `requesterEmail` / `source` optional
- [x] I2 `intake.controller.ts` 收 raw body 手動分流:冇 `mode` → canonical;`mode===1` → flat;其他 → 400
- [x] I3 分流兩支都行**同一個 `ValidationPipe({whitelist:true, transform:true})`**(重用同一個 class,唔手寫第二套規則)
- [x] I4 `IntakeAdapterService.intakeFlat()` —— `resolveReqSysId` + `applyDefaultSku` 重用,零複製
- [x] I5 OpCo code 驗到存在 + active(沿用 canonical 路徑既有行為)
- [x] I6 Task 兩欄經 `IntakeService.intake(dto, taskRef?)` 落 line item(**canonical DTO 一個字唔改**)
- [x] I7 `mode` / `source` 唔存(OQ-2)

## P — Seam ④ + provider(D4 / D5)

- [x] P1 `ticket-update.provider.ts` —— `TicketTarget` discriminated union + 兩個 method signature
- [x] P2 `DirectTicketProvider` `kind:'ritm'` 分支**逐字保留**(pickTask 邏輯不變)
- [x] P3 `DirectTicketProvider` `kind:'task'` 新路:`query('sys_id=…')` → 搵唔到 / 唔係 active → `error` 唔 patch(用 `query` 唔用 `getRecord`:後者吞 error 返 null,會把「SN 死咗」報成「task 唔存在」)
- [x] P4 `task` 路 `assigned_to` 空先補;已有 assignee 唔覆蓋(共用同一段 `moveTask`,唔另寫)
- [x] P5 `N8nTicketProvider` `ritm` 今日行為(throw);`task` 回 `{status:'error'}` 講明 2004 未支援
- [x] P6 `outbound-failure-fields.ts` allowlist 加 `targetKind`(retry 要知重播邊種 target)
- [x] P7 `outbound-retry.service.ts` 依 `targetKind` 重建 target,舊 row(冇 `targetKind`)→ 當 `ritm`

## A — Assign 分支(D6)

- [x] A1 `assign.service.ts` close 優先次序:task → RITM → parent REQ work note
- [x] A2 既有兩條路**一個字唔改**(只換 target 形狀,分支條件同 body 逐字保留)
- [x] A3 失敗仍 non-fatal(ADR-0011 OD4),落 Delivery failures
- [x] A4 `holdTicket` 亦走 task 優先(共用 `ticketTarget()`,hold 同 close 唔可以指向兩個唔同 record)

## T — 測試(H5:assign = critical path)

- [x] T1 canonical payload(冇 `mode`)→ 行為同今日一樣,既有 intake test 全綠(+ 新增 4 條守 locked contract:缺 `serviceNowSysId` / 空 `lineItems` 仍 400、unknown 欄仍被 strip、task 欄**去唔到** flat 路)
- [x] T2 1001 真實 flat payload → 建到 request(欄逐個對)
- [x] T3 `mode` = `2` / `0` / `"1"` / `null` / `true` → 400,兩邊 service 都冇被 call
- [x] T4 flat 路 REQ number → sysId;同一 REQ 再 POST → `create` 零次
- [x] T5 flat 冇 licence line → 注入 default SKU 兼帶住 `serviceNowTaskSysId` + `serviceNowTaskNumber`
- [x] T6 `mode` / `source` 冇落 DB
- [x] T7 line 有 task sysId → `query('sys_id=…')` + PATCH 嗰張 task,**斷言冇任何 query 含 `request_item=`**
- [x] T8 task `active=false` → 唔 patch(boolean `true` / string `'true'` 兩種都收)
- [x] T9 task 搵唔到 → 同上;`active` 欄完全冇 → 一樣 fail closed
- [x] T10 task `assigned_to` 空 → 補;已有 assignee → 唔覆蓋
- [x] T11 line 只有 RITM → 行返 `pickTask`,既有斷言一個字冇改
- [x] T12 兩者皆無 → parent REQ work note,行為不變
- [x] T13 SN 寫入失敗 → assign 仍成功 + 落 queue(既有);新增:task 失敗嗰行帶 `targetKind:'task'`
- [x] T14 `N8nTicketProvider` `task` → error 而唔 throw;`ritm` 仍然 throw
- [x] T15 retry `targetKind:'task'` 重播行 task 路;舊 row 冇 `targetKind` → ritm(既有兩條 test 就係呢個 shape)

## V — Gate / 驗收

- [x] V1 `apps/api` `npm test` 全綠 —— 797 → **837**(67 → **68** suites)
- [x] V2 `npm run lint`(repo root)exit 0
- [x] V3 tsc 兩邊 0(api + web)
- [x] V4 Migration apply + rollback 驗過 —— scratch DB `ch020_scratch` 由零跑晒 18 個 migration → 兩欄在 → `DROP COLUMN` → 0 欄、其餘 19 欄完好 → drop DB
- [x] V5 **Live**:兩半分開驗齊,🔴 **中間嗰下 assign 未撳**(見下)
  - [x] V5a **intake 半**:`mode:1` + 真 REQ0044068 → **201**,`serviceNowSysId` 由 server 反查(`b27e6dbf…`,唔係 number)· ADR-0020 注入 SPE_E5 · 嗰條 line 帶住 `serviceNowTaskSysId=5f7eadbf…` / `SCTASK0071829` · sync gate 兩欄 null · **再 POST 一次返同一個 request id**
  - [x] V5b **close 半**(走 Delivery-failures retry,同 CH-010 一樣嘅真 code path):**SCTASK0071829 state 1→3 · active true→false · `assigned_to` 由空補成 integration 帳號**;🔴 **兄弟 task SCTASK0071830 一個字冇郁**(state 1 / active / 無 assignee)= 證實只閂咗一張
  - [x] V5c **D5 兩個分支 live**:同一張(已閂)task 再閂 → **400 拒絕唔 patch**;唔存在嘅 task sys_id → **400 拒絕**。兩個 failure row 都**維持 `open`** + attemptCount 遞增(I2 守住)
  - [ ] 🔴 **V5d 未做**:`assignLineItem` 真跑一次把兩半接埋 —— 要真派一個 E5 落真 tenant 一個真 synced user。**要 Chris 明確指示先撳**;target 選擇同影響見 `progress.md`
- [x] V5-guard 順帶驗:無 key → **401**(兩種 body 都係)· canonical 缺 `serviceNowSysId` / 空 `lineItems` → **400 validation**(locked contract 冇被放寬)· `mode` = `2`/`0`/`"1"`/`true` → **400 fail-closed**
- [x] V6 CONTRACT.md 記低 `/requests/intake` 兩種形狀(W24 `CONTRACT.md` 新增 §7 addendum,**唔改任何 locked 內容**)

## C — 收官

- [ ] C1 `progress.md` Day-N 寫齊
- [ ] C2 BACKLOG CH-020 → closed(R7)
- [ ] C3 CLAUDE.md §0/§9 + `SESSION_SUMMARY.md` 座標掃一次
