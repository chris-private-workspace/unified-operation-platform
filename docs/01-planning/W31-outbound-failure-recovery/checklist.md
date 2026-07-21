---
phase: W31-outbound-failure-recovery
plan_ref: ./plan.md
status: complete       # in-progress | complete
last_updated: 2026-07-21
---

# Phase W31 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F0 — Gate(開工前)

- [x] ADR-0011 **Accepted**(Chris 2026-07-21:Q1 = F1+F2+F3 · Q2 = ADMIN+REGIONAL)
- [x] plan.md status → `active`;§6 三個實作級選擇(I1/I2/I3)Chris 通過
- [x] 記低 D6 實作後果:`record()` **簽名層面唔收 tx handle** —— 令「綁 transaction」呢個錯誤喺型別層就做唔到

## F1 — `OutboundFailure` model + 白名單記錄服務

- [x] `schema.prisma` 加 `OutboundFailure`(additive;`kind`/`status` 用 String + 常數表)
- [x] migration `20260721102719_add_outbound_failure` 生成 + dev DB apply
- [x] `outbound-failure-fields.ts` —— kind / status 常數 + **逐 kind 白名單**
- [x] `outbound-failure.service.ts` —— `record()` / `list()` / `findById()` / `markResolved()` / `markAttemptFailed()` / `markAbandoned()` / `reopen()`
- [x] 白名單喺 service 一處做;**重用** audit 個 `isNeverAudited`(唔另抄 blacklist)
- [x] 🔴 **G1 test**:餵八個 credential 形狀欄位(含 nested lineItems + externalRef)→ persisted row 一個都唔含
- [x] `lastError` 只存訊息文字 + 500 字上限(防佢變成 raw-body 逃生門)
- [x] `record()` 唔接受 tx handle(D6)· 亦唔會 throw(唔可以蓋過原錯誤)

## F2 — 三處失敗點接線

- [x] `request.submit` —— 記錄 → 照樣 throw 同一個 503(訊息一字不改)
- [x] `request.mirror` —— 記錄(含 `externalRef` sysId)→ throw **D7 新訊息**(點名 REQ + 明寫 Do not submit again)
- [x] `servicenow.worknote` —— 記錄 → **仍然 swallow**(I1,OD4 語意不變)
- [x] 🔴 **G3 test**:mirror write 失敗後 failure 紀錄仍然存在
- [x] 🔴 **G4**:既有 23 條 test 全綠 = 成功路徑零行為改動
- [x] **G7(H5)**:`assign.service` 3 條新 test,Graph / SN 全 mock
- [x] work note 失敗後 assign **仍然成功返回** + ledger 照樣 increment(2 條 test)

## F3 — Endpoint + 補救分流

- [x] `GET /admin/outbound-failures`(status / kind 篩選 + cap 雙重防守)
- [x] `POST /:id/retry` —— 按 `kind` 分流(D2)
- [x] `POST /:id/abandon` · `POST /:id/reopen`(I3)
- [x] 全部 `@Roles(ADMIN, REGIONAL)`(D4)
- [x] 🔴 **G2 test**:mirror 補救 → `provider.submit` / `createRecord` / `updateRecord` / `addWorkNote` **全部從未被呼叫**
- [x] mirror 冇 `externalRef` → **拒絕補救**(唔靠估),有 test
- [x] 冪等 guard:已寫過嘅 mirror(`serviceNowSysId` @unique)唔會再寫一次
- [x] **G6**:retry / abandon 落 audit(新 `outbound.retry` / `outbound.abandon`)
- [x] audit **唔複製 payload**(payload 有 UPN、audit 係 ADMIN-only 而佇列係 ADMIN+REGIONAL),有 test
- [x] retry 失敗 → `attemptCount` +1 · status 留 `open`(I2)
- [x] **G5 live**:OPCO_IT 四項驗證(`/me` = OPCO_IT · GET **403** · POST retry **403** · `/license/ledger` **200** 對照)
- [x] W28 drift test 預期紅 → **審視 diff 確認只有 4 條新 route[ADMIN,REGIONAL]、零既有權限改動** → deliberate update

## F4 — 前端補救畫面

- [x] `/outbound-failures` 頁 + `lib/outbound-failures.ts` 純函數
- [x] 🔴 **每個 kind 自己嘅文案**,零 generic「Retry」;mirror = 「Record locally」+ hint 明寫 without contacting ServiceNow
- [x] 措辭 guard test(9 條)—— mirror 文案唔可以含 submit / resend / send again
- [x] sidebar Administration 區改為**逐 entry role predicate**;新增 `canRepairOutbound`
- [x] 非授權者 → **restricted state**(唔係隱藏;同 CH-005 刻意相反,理由入 code 註)
- [x] 空清單 → 誠實 EmptyState(「Nothing to repair」= 好消息,tone `ok`)
- [x] **G9**:grep 零 hex/rgb/gradient · light+dark 實測 swap · mono 實測 `Geist Mono` · icon `stroke-width=2 fill=none` · 零 view-level primary
- [x] `ui-design` 12 條 —— **截圖揪到窄視窗下補救掣被切出畫面外**,修為表格自行橫向 scroll(唔截短 label,label 係 load-bearing)
- [x] `design-system.md §6` 登記第二個 prototype 以外畫面

## Verify

- [x] `apps/api`:build · lint · test **286 → 324**(+38)
- [x] `apps/web`:build · lint · test **114 → 123**(+9)
- [x] migration dev DB 實跑 apply
- [x] **live 端到端**:真 request → SN 打唔通 → 503 → 失敗入表(`externalRef: null`)→ retry 仍敗(**attemptCount 1→2 · status 留 open**)→ abandon → reopen → audit 兩條齊
- [x] **live mirror 補救**:插一條 orphan 記錄 → 撳「Record locally」→ **本地 Request 建成(REQ0099)· status resolved · audit 有紀錄**,而**全程 SN 係死嘅** —— 即 D3 真係純本地
- [x] 測試資料清理乾淨(audit 紀錄保留 —— 真實發生過嘅事唔應該刪)

---

## Cross-Cutting

- [x] All deliverables committed to git(`53b374b` ADR+plan · `c500ee9` kickoff · `c98f399` F1 · `100b6d2` F2 · `2d7aa79` F3 · `44d5d48` F4 · closeout)
- [x] Open-question status sync(R4)—— 本 phase 無 open question(ADR-0011 全覆蓋)
- [x] ADR —— **ADR-0011 事前 Accepted**;實作**無** deviation,D1–D9 全部照做
- [x] Pending / next-candidate 同步 `BACKLOG.md`(R7)
- [x] `RISK_REGISTER.md` —— **R3 加註澄清**:W31 解嘅係 outbound 提交失敗(§2.4 第 5 點),**唔係** R3 嘅 sync 延遲;R3 仍然 ⚠️ Open
- [x] `progress.md` retro section written
- [x] `progress.md` frontmatter status flipped to `closed`
- [x] Phase N+1 kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
