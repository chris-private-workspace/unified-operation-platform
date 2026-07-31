---
change_id: CH-013
spec_ref: ./spec.md
adr_ref: ../../../adr/0021-user-authenticated-servicenow-request-import.md
status: in-progress     # in-progress | done
last_updated: 2026-07-31
---

# CH-013 — Checklist

> 由 `spec.md §3` acceptance criteria 衍生。每 item ≤ 1-2h。
> AI tick 完成嘅 item;tick 唔到嘅喺 `progress.md` Day-N 寫原因(**唔可以刪未勾項**)。

## Gate（開工前）

- [x] Chris approve spec(§6.1 三項拍板)— 2026-07-31
- [x] ADR-0021 寫好 + Accepted + 入 `docs/adr/README.md` index — 2026-07-31
- [x] BACKLOG 同步(R7)— C 區 CH-013 行

## A — 後端：共用 lookup service（ADR-0021 D6）

- [ ] A1 抽 `ServiceNowLookupService`:REQ number → `sc_request` → `sc_req_item[]` → 每張數 `sc_task^active=true`
- [ ] A2 `intake-from-servicenow.ts` 改為 consume 佢(script 唔刪,同 endpoint 共用同一份,免 drift)
- [ ] A3 unit test:REQ 查唔到 / RITM 零張 / active task 0·1·2+ 三種 count(**SN 一律 mock**,§3.4)

## B — 後端：兩條 endpoint（ADR-0021 D1）

- [ ] B1 `GET /requests/servicenow-lookup?req=` — JWT + `@Roles(ADMIN)`,回傳 RITM 列表 + `activeTaskCount` + 可否導入
- [ ] B2 404 message 同時提「可能係 row-level ACL」(Table API 分唔開「唔存在」同「見唔到」)
- [ ] B3 `POST /requests/import-from-servicenow` — DTO(REQ number + 每張選中 RITM 嘅 `ritmNumber` + `skuCatalogId` + target UPN)
- [ ] B4 **server 自己反查**,client 傳嘅 RITM 唔屬該 REQ → 400 零寫入(D5)
- [ ] B5 揀咗 `activeTaskCount ≠ 1` 嘅 RITM → 400,message 講明之後 close 唔到(ADR-0018 D3)
- [ ] B6 組 canonical payload → **直接 call `IntakeService`**(唔經 HTTP、唔經 m2m key)
- [ ] B7 `AuditLog` action `request.imported_from_servicenow`,metadata **非 PII only**(D7)
- [ ] B8 兩條 route 都唔接受 `X-Intake-Key`

## C — 後端：硬邊界驗證（ADR-0021 D2）

- [ ] C1 `git diff` 確認以下四項 **diff = 0**:`intake.service.ts` · `dto/n8n-intake.dto.ts` · `intake-key.guard.ts` · 既有兩條 intake route
- [ ] C2 既有 intake test 全綠、一條 assertion 都唔使改

## D — 後端測試

- [ ] D1 lookup:401(無 JWT)· 403(非 ADMIN)· 200 · 404
- [ ] D2 lookup **零寫入**:跑完 `Request` / `RequestLineItem` / `AuditLog` 行數不變
- [ ] D3 import:201 · idempotent(同一 REQ 兩次唔開第二張)· 400×2(B4 / B5)
- [ ] D4 assert **`INTAKE_API_KEY` 唔出現喺任何 response**
- [ ] D5 api test 總數不降、lint 0

## E — 前端（Settings 新 card）

- [ ] E1 步驟一:REQ number input + Look up → RITM 表(number / title / active task 數 / badge)
- [ ] E2 步驟二:逐張 RITM 揀 SKU(既有 `select`,由 `/license/catalog` 拉)+ target UPN input
- [ ] E3 `activeTaskCount ≠ 1` 嘅行明確標唔可導入 + 原因
- [ ] E4 未揀 SKU / 未填 UPN → import 掣 disabled
- [ ] E5 成功 → toast + 連去 request detail;失敗 → 錯誤原文顯示唔吞
- [ ] E6 非 ADMIN **完全唔 render**(唔係 disable)
- [ ] E7 web test 不降

## F — H6 設計自檢

- [ ] F1 跑 `.claude/skills/ui-design`,DS-1 ~ DS-12 逐條答
- [ ] F2 token-only、零新 primitive(用既有 `dialog`/`select`/`input`/`badge`)
- [ ] F3 Settings 頁**維持一個 primary action**
- [ ] F4 light + dark 都**實際行過**

## G — Live 驗證（真 `ricohapdev`）

- [ ] G1 用一張**未用過**嘅真 REQ 行完整流程 → 平台真出到 request
- [ ] G2 同一張再導入一次 → 唔會出第二張
- [ ] G3 UI 顯示嘅 RITM / task 數,同 `npm run intake:from-sn -w @uop/api -- --req=<REQ>`(dry run)**逐個字一致**
- [ ] G4 DB 抽查 audit row:有 `request.imported_from_servicenow`,而且 **payload 冇 UPN**

## H — 文件

- [ ] H1 `docs/05-usage/` 寫低:幾時用、點解 SKU 要人手揀、同 n8n 正路嘅關係、點清理測試 request
- [ ] H2 `intake-from-servicenow.ts` 檔頭註解補一句指向呢個 UI(兩者關係)

## Cross-Cutting

- [ ] 每個 commit 對應 `progress.md` Day-N entry(R2)
- [x] ADR written(R5)— ADR-0021
- [ ] BACKLOG 由「blocked on 用戶決定」→ 進行中 → 完成(R7)
- [ ] `progress.md` closeout summary 寫好
- [ ] `progress.md` frontmatter status → `closed`

---

**Lifecycle reminder**:本 checklist 隨 spec §3 衍生。新加 item 必須**先入 spec + §7 changelog**,然後先加落嚟。
