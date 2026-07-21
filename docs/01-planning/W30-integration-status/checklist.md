---
phase: W30-integration-status
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-21
---

# Phase W30 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
> **⚠️ plan status=draft —— 未 approve 唔可以開 F1**(PROCESS R1)。

## F0 — Gate(開工前)

- [ ] Chris approve plan §9 三點 —— Q1(n8n inbound 交白卷?)· Q2(節流間隔)· Q3(探針失敗點顯示)
- [ ] plan.md status → `active`

## F1 — Connector 狀態 read-model

- [ ] `integration-status.service.ts` —— 純 query layer,四個 connector 各一行
- [ ] **三態(D3)**:Graph / ServiceNow / intake = `required`(constructor `getOrThrow` fail-fast)· n8n outbound 隨 `REQUEST_SUBMISSION_PROVIDER` 切 `active`/`inactive` —— **唔可以出現 `configured: false` 呢種恆真廢話**
- [ ] **派生時間(D4)**:Graph = `max(SkuCatalog.lastSyncedAt, TenantSkuSnapshot.capturedAt)` · SN = 最近 `serviceNowSysId` 非 null 嘅 Request · n8n outbound = 最近 `origin='platform-created'` 且有 sysId
- [ ] **n8n inbound 交白卷**(Q1 拍板後定案)—— `Request.origin` default 就係 `'onboarding-intake'`(`schema.prisma:200`),seed 同真 intake 分唔開;**寧可標「無法區分」都唔畀錯時間**
- [ ] 冇任何成功紀錄 → `lastSuccessAt: null`(**唔可以** fallback 做「而家」或亂估)
- [ ] test:三態 / 三個派生來源 / 無紀錄 → null

## F2 — `GET /admin/integrations` + `POST /admin/integrations/:key/test`

- [ ] DTO **allow-list 明文列欄位**(唔用 spread)—— D2 唯一結構性保證
- [ ] `GET /admin/integrations` `@Roles(ADMIN)` + OpenAPI
- [ ] `POST /admin/integrations/:key/test` `@Roles(ADMIN)`;探針 **重用既有唯讀方法**:`getSubscribedSkus()` / `query('', table, 1)`
- [ ] 🔴 **絕不 `createRecord`** · 🔴 **絕不打 n8n webhook**(會建真 ticket)· n8n inbound 探針不適用
- [ ] vendor 原始 error **唔可直吐前端**(可能含 instance URL / 帳號)—— 沿用 `graph-unavailable.ts` wrap 手法轉結構化
- [ ] 節流:同 connector 最短間隔(Q2 拍板值),超出 **429**;**唔可以做成 `@Cron`**(D5 連帶義務:只准用戶觸發)
- [ ] **🔴 G1 test 先行**:餵含假 secret 嘅 config → assert 序列化回應**唔含**該字串(同 W29 H4 test 同一思路)
- [ ] **🔴 G2 test**:斷言 `createRecord` / n8n webhook **從未被呼叫**
- [ ] test:403 / 節流 429 / 探針失敗 wrap
- [ ] live curl 驗非 ADMIN → **403**(三重驗證:`/me` 確認身分 → 403 → 同身分對照 endpoint 200)
- [ ] W28 `permissions.spec.ts` 預期兩重紅(snapshot + controller 名單)→ 審視後 deliberate update

## F3 — 前端 Integrations tab

- [ ] `components/settings/integrations-panel.tsx` —— 每 connector 一行(名 · state badge · 最後成功時間 · Test 掣 + 結果)
- [ ] `api-types.ts` + `queries.ts`(`useIntegrations`,`retryUnless403`)+ `mutations.ts`(`useTestConnection`)
- [ ] 取代 `settings.tsx:240-246` EmptyState
- [ ] **🔴 D6:刪走文案入面嘅 DocuWare**(後端零實作 + H3 排除,唔可繼續承諾)—— G9
- [ ] **一個 view 一個 primary**:Test 掣一律 `secondary`(upload 已係本 tab primary)
- [ ] 時間 / 識別碼 **mono**(DS-5)· token-only · lucide-only
- [ ] n8n inbound 行誠實顯示「無法從既有資料區分」,**唔留白扮正常**
- [ ] 403 → restricted state(後端先係真權威)
- [ ] browser 驗 light + dark —— G6
- [ ] 跑 `ui-design` skill 自檢(H6)

## Verify

- [ ] `apps/api`:build · test(≥266)· lint 全綠 —— G7
- [ ] `apps/web`:build · test(≥93)· lint 全綠 —— G7
- [ ] **G1 live**:實際打 `GET /admin/integrations`,肉眼核回應**零 env 值 / 零遮罩值**
- [ ] **G5 live**:連撳兩次 Test → 第二次 429
- [ ] **G4 live**:切 `REQUEST_SUBMISSION_PROVIDER` 重啟對照 n8n outbound `active` vs `inactive`
- [ ] **G8 零既有行為改動**:既有 test 全綠 + `git diff` 核
- [ ] **G9**:grep `settings.tsx` 零 DocuWare

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)—— Q1/Q2/Q3 拍板結果入 progress
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)—— **預期無新 ADR**(ADR-0010 已涵蓋);但 plan §8 嘅 n8n inbound 派生落空 → closeout 喺 ADR-0010 補一句註
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)—— INTEG-1 → 完成;item 5 / 6 狀態不變
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro(候選:INTEG-3 人手 retry[要新 model = H1]/ FE-activity[⚠️ 受 ADMIN-only 限制]/ AUTH-2b[🔴 卡 IT]/ DEPLOY)

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
