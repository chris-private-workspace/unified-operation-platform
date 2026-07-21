---
phase: W30-integration-status
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-21
---

# Phase W30 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
## F0 — Gate(開工前)

- [x] Chris approve plan §9 三點 —— Q1 **交白卷標「無法區分」** · Q2 **節流 10s** · Q3 **state 唔變,另有「上次探測」結果**(三點全照建議)
- [x] plan.md status → `active`
- [x] Q3 實作後果記低:回應分兩組欄位 `state`(部署形態,恆定)+ `lastProbe`(**in-process,restart 即清**,唔持久化)—— UI 唔可以令人以為 `lastProbe` 係歷史紀錄

## F1 — Connector 狀態 read-model

- [x] `integration-status.service.ts` —— 純 query layer,四個 connector 各一行
- [x] **三態(D3)**:Graph / ServiceNow / intake = `required`(constructor `getOrThrow` fail-fast)· n8n outbound 隨 `REQUEST_SUBMISSION_PROVIDER` 切 `active`/`inactive` —— **無 `configured` 欄位**
- [x] **派生時間(D4)**:三個來源全部實作 + test
- [x] **n8n inbound 交白卷**(Q1)—— `lastSuccessNote` 明寫「Cannot be distinguished from other requests in existing data」
- [x] 冇任何成功紀錄 → `lastSuccessAt: null`(有專門 test 鎖住,唔 fallback)
- [x] test:三態 / 三個派生來源 / 無紀錄 → null(**9 條**)

## F2 — `GET /admin/integrations` + `POST /admin/integrations/:key/test`

- [x] DTO **allow-list 明文列欄位**(唔用 spread)—— controller mapper 亦逐欄砌
- [x] `GET /admin/integrations` `@Roles(ADMIN)` + OpenAPI
- [x] `POST /admin/integrations/:key/test` `@Roles(ADMIN)`;探針**重用既有唯讀方法**,零新 vendor 方法
- [x] 🔴 **絕不 `createRecord`** · 🔴 **絕不打 n8n webhook** —— `PROBEABLE` 寫成**資料**並註明「Do not add a probe here」
- [x] vendor 原始 error **只入 log**,回固定訊息
- [x] 節流 **10s**/connector → **429**;無 `@Cron` 變體
- [x] **🔴 G1 test**:餵六個假 secret → assert 序列化回應一個都唔含(連 `service-now.com` 片段都唔准)
- [x] **🔴 G2 test**:跑晒四個探針 → assert `createRecord`/`updateRecord`/`addWorkNote` **從未被呼叫**
- [x] test:403(live)/ 節流 429 / 探針失敗 wrap —— **20 條**(9 status + 11 probe)
- [x] live curl 驗非 ADMIN → **403** 三重驗證(`/me`=opco.it.rhk OPCO_IT → GET **403** + POST test **403** → `/license/ledger` 200 對照)
- [x] W28 `permissions.spec.ts` 如預期兩重紅,兩條新 route 都帶 `roles [ADMIN]`,審視後 deliberate update
- [x] **順手修語意**:探針原返 **201 Created** 但乜都冇建立 → `@HttpCode(200)`(live 驗證由 201 → 200)

## F3 — 前端 Integrations tab

- [x] `components/settings/integrations-panel.tsx` —— 每 connector 一行
- [x] `api-types.ts` + `queries.ts`(`useIntegrations`,`retryUnless403`)+ `mutations.ts`(`useTestConnection`)
- [x] 取代 EmptyState;**順手刪咗變成 orphan 嘅 `EmptyState` import**(§1.3 自己造成嘅 orphan 要清)
- [x] **🔴 D6 DocuWare 已清** —— live DOM 驗 `hasDocuWare: false`(G9)
- [x] **一個 view 一個 primary**:Test 掣 `secondary`
- [x] 時間 / note **mono**(實測 `"Geist Mono"`)· token-only(grep 零 hex/rgb/gradient)· lucide-only
- [x] n8n inbound 誠實顯示「Cannot be distinguished…」(live DOM 驗到)
- [x] 403 → restricted state
- [x] browser 驗 light + dark —— G6(bg 245→8 · badge 21,128,61→67,209,127 · **見下 dark 量度陷阱**)
- [x] 跑 `ui-design` skill 自檢(H6)—— 12 條;**自檢揪到 3 個位即場修**:`py-[13px]` eyeball → `py-[11px]`(§1.3 `--pad-cell-y`)· `gap-[5px]` 唔喺 2px-step scale → `gap-[6px]` · **閃電圖示 `animate-spin` 讀落似 glitch** → pending 換 `RefreshCw`(跟 `drift.tsx` 慣例)
- [x] 純函數 test:`lib/integrations.ts`(tone / label / lastSuccessText 三態)—— **6 條**,含「文案只可講 succeeded 唔可講 checked」嘅措辭 guard

## Verify

- [x] `apps/api`:build · test **286**(266→+20)· lint 全綠 —— G7
- [x] `apps/web`:build · test **99**(93→+6)· lint 全綠 —— G7
- [x] **G1 live**:`GET /admin/integrations` 回應**零 env 值 / 零 URL / 零遮罩**;頁面亦零 `AADSTS` / host / URL
- [x] **G5 live**:連撳兩次 → 第二次 **429**「Too many attempts — retry in 10s」
- [x] **G4 live**:切 `REQUEST_SUBMISSION_PROVIDER=n8n` 重啟 → `inactive` **→ `active`**
- [x] **G8 零既有行為改動**:既有 test 全綠 + `git diff` 核 —— 純新增(唯一改既有檔 = `settings.tsx` 換 panel + 清 orphan import、`integration.module.ts` 加 controller)
- [x] **G9**:live DOM `hasDocuWare: false`

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
