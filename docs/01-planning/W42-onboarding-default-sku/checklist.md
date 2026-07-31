# W42 Checklist — intake fixture + onboarding default SKU

> 對應 `plan.md §6 Deliverables`。**唔可以刪未勾項** —— 只可以 `[ ]`→`[x]`,或加 🚧 + 理由 + target phase。

## Gate 0 — pre-implementation(R1)

- [x] **G0** plan.md 由 **Chris approve**(status: draft → active)—— 2026-07-31
- [ ] **G1** §9 三條 OQ 有答案 —— **部分**:OQ-1 ✅ 要驗(→ `kind: 'sku'`,F4 定形)· OQ-3 ✅ 按建議自決 · **OQ-2 🚧 仍 open**(n8n 側零 licence RITM 實際行為,需同 n8n 側對;唔阻塞實作,阻塞 §7 驗收第 1 條嘅真實性)
- [x] **G2** ADR-0020 由 Proposed → **Accepted**(H1 授權落實)—— Chris Lai 2026-07-31

## F0 — Preflight(唔使等 approve,純調查)

- [ ] **F0a** 實測 `POST /requests/intake/n8n` 條 SN 反查本機通唔通(決定 F9 做法)
- [x] **F0b** 確認 default SKU GUID = `06ebc4ee-1bb5-47dd-8120-11324bc54e06`(SPE_E5)—— 2026-07-31 實測 catalog 99 SKU,兩個 E5 變體並存(plan §2.3)
- [ ] **F0c** 確認 fixture 放邊 + 有冇現成 `scripts/` 慣例(OQ-3)

## CH-B — default SKU 注入

- [ ] **F1** ADR-0020 寫好(Proposed)
- [ ] **F2** `schema.prisma` 加 `defaultOnboardingSkuId` + migration(additive nullable)
- [ ] **F3** `connectors.ts` 加 `n8n-inbound` editable field + 更正「inbound 冇非機密設定」註解
- [ ] **F4** Admin 寫入時 SKU 存在性驗證(**視 OQ-1 而定**)
- [ ] **F5** native DTO `@ArrayMinSize(1)`→`(0)` + swagger 描述寫明空 list 語義
- [ ] **F6** `ensureDefaultLine()` + audit action + **擴 ADR-0009 D4 白名單** + warn log(H4:log 唔可以帶 target UPN)
- [ ] **F7** Test:注入 / 有 E3 唔加 / 有 E5 唔重複 / 未配置 / 配置指向 inactive SKU

## CH-A — 測試 fixture

- [ ] **F8** canonical fixture(`POST /requests/intake`)
- [ ] **F9** native fixture(`POST /requests/intake/n8n`)— 做法待 F0a

## 收官

- [ ] **F10** Live 驗證:本機 intake→READY 端到端 · connector UI 卡片(**light + dark**,H6)
- [ ] **F11** Doc sync:BACKLOG(R7)· 更正 `intake-adapter.service.ts:138` 過期註解 · MAPPING/CONTRACT 如受影響
- [ ] **F12** Acceptance §7 八條逐條驗 + api/web test 全綠 + lint + build
- [ ] **F13** progress.md 寫齊 Day-N(R2)+ retro

## 🚧 明確唔喺本 phase 做(唔係漏)

- 🚧 **SN 反向開 RITM** 畀自動加嘅行 → BACKLOG `Request-edit-more`(需 SN schema 拍板)
- 🚧 **per-OpCo 唔同 default** → 未有需求,ConnectorConfig 係單行表做唔到
- 🚧 **assign 段真 Graph 依賴** → 非本 phase 可解(plan §2.2)
