---
phase: W31-outbound-failure-recovery
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-21
---

# Phase W31 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F0 — Gate(開工前)

- [x] ADR-0011 **Accepted**(Chris 2026-07-21:Q1 = F1+F2+F3 · Q2 = ADMIN+REGIONAL)
- [x] plan.md status → `active`;§6 三個實作級選擇(I1/I2/I3)Chris 通過
- [ ] 記低 D6 實作後果:`record()` **簽名層面唔收 tx handle** —— 令「綁 transaction」呢個錯誤喺型別層就做唔到,唔靠人記住

## F1 — `OutboundFailure` model + 白名單記錄服務

- [ ] `schema.prisma` 加 `OutboundFailure`(additive:`kind`/`status` 用 String + 常數表,跟 `AuditLog` 慣例)
- [ ] migration 生成 + dev DB apply
- [ ] `outbound-failure-fields.ts` —— kind / status 常數 + **逐 kind 白名單**
- [ ] `outbound-failure.service.ts` —— `record()` / `list()` / `retry()` 用嘅 read / `markResolved()` / `markAbandoned()`
- [ ] **白名單喺 service 一處做**,call site 唔可以自己砌 payload(沿用 `AuditService` 做法)
- [ ] 🔴 **G1 test**:餵六個假 secret(SN 密碼 / n8n key / auth header / vendor raw body …)→ assert persisted row **一個都唔含**
- [ ] `lastError` 只存訊息文字 —— 有 test 鎖住唔會混入 vendor 原始 response
- [ ] `record()` **唔接受 tx handle**(D6)—— 型別層杜絕

## F2 — 三處失敗點接線

- [ ] `request.submit` —— `outbound-request.service.ts:79-87`:記錄 → 照樣 throw 503(訊息不變)
- [ ] `request.mirror` —— `outbound-request.service.ts:123-131`:記錄(含 `externalRef` sysId)→ throw **D7 新訊息**(講明 ticket 已開但平台未記低)
- [ ] `servicenow.worknote` —— `assign.service.ts:197-203`:記錄 → **仍然 swallow**(I1,唔改 OD4 語意)
- [ ] 🔴 **G3 test**:F2 場景 —— mirror write 失敗後 failure row **仍然存在**(證明冇被 rollback 拖走)
- [ ] 🔴 **G4**:成功路徑零行為改動 —— 既有 test 全綠 + `git diff` 逐處核
- [ ] **G7(H5)**:`assign.service` 改動有對應 test,Graph / SN **一律 mock**
- [ ] F3 之後 assign **仍然成功返回** —— 有 test 鎖住(work note 失敗唔可以令 assign 變失敗)

## F3 — Endpoint + 補救分流

- [ ] `GET /admin/outbound-failures`(篩 status / kind + cap 雙重防守,跟 audit 做法)
- [ ] `POST /admin/outbound-failures/:id/retry` —— **按 `kind` 分流**(D2)
- [ ] `POST /admin/outbound-failures/:id/abandon`
- [ ] 全部 `@Roles(ADMIN, REGIONAL)`(D4)
- [ ] 🔴 **G2 test**:`request.mirror` 補救 → assert `provider.submit` / `createRecord` **從未被呼叫**(W30 G2 手法)
- [ ] **G6**:retry / abandon 落 audit(`outbound.retry` / `outbound.abandon`)
- [ ] retry 失敗 → `attemptCount` +1 · status 留 `open` · 更新 `lastError`(I2,唔扮成功)
- [ ] `abandoned` 可 reopen(I3)
- [ ] **G5 live**:OPCO_IT **403** 三重驗證(`/me` 確認身分 → 403 → 同身分另一 endpoint 200 對照)
- [ ] W28 `permissions.spec.ts` 預期紅(3 條新 route)→ 審視後 deliberate update

## F4 — 前端補救畫面

- [ ] 失敗清單 UI —— 按 `kind` 顯示**唔同動作文案**
- [ ] 🔴 **`request.mirror` 個掣唔可以寫「Resubmit」** —— 要講明係補寫本地紀錄(D3 喺 UI 層嘅延伸);寫成 test guard
- [ ] 非 ADMIN/REGIONAL → **restricted state**(唔係隱藏 —— 同 CH-005 相反,因為呢個係專程去嘅畫面)
- [ ] 空清單 → 誠實 EmptyState(「冇失敗」係好消息)
- [ ] **G9**:token-only(grep 零 hex/rgb/gradient)· light + dark · lucide-only · 一 view 一 primary
- [ ] 跑 `ui-design` skill 12 條逐條記錄

## Verify

- [ ] **G8**:`apps/api` build · lint · test(286 → ≥300)
- [ ] **G8**:`apps/web` build · lint · test(114 → ≥120)
- [ ] migration 可 apply(dev DB 實跑)
- [ ] **live 端到端**:整跌 SN → F1 失敗入表 → 撳 retry(仍失敗,attemptCount 2)→ 還原 → retry 成功 → status `resolved`

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] Open-question status sync(R4)—— 本 phase 無 open question(ADR-0011 全覆蓋)
- [ ] ADR —— **ADR-0011 事前已 Accepted**;若實作揭示 D1–D9 有錯 → 補註而唔係靜靜偏離(R3)
- [ ] Pending / next-candidate 同步 `BACKLOG.md`(R7)—— INTEG-3 → 完成;**RISK R3 錯引用校正**要反映
- [ ] `RISK_REGISTER.md` 更新 —— §2.4 第 5 點「冇交付保證」已解決;R3 本身仍 Open(唔可以順手當解決咗)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
