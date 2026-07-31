# W42 Checklist — intake fixture + onboarding default SKU

> 對應 `plan.md §6 Deliverables`。**唔可以刪未勾項** —— 只可以 `[ ]`→`[x]`,或加 🚧 + 理由 + target phase。

## Gate 0 — pre-implementation(R1)

- [x] **G0** plan.md 由 **Chris approve**(status: draft → active)—— 2026-07-31
- [ ] **G1** §9 三條 OQ 有答案 —— **部分**:OQ-1 ✅ 要驗(→ `kind: 'sku'`,F4 定形)· OQ-3 ✅ 按建議自決 · **OQ-2 🚧 仍 open**(n8n 側零 licence RITM 實際行為,需同 n8n 側對;唔阻塞實作,阻塞 §7 驗收第 1 條嘅真實性)
- [x] **G2** ADR-0020 由 Proposed → **Accepted**(H1 授權落實)—— Chris Lai 2026-07-31

## F0 — Preflight(唔使等 approve,純調查)

- [x] **F0a** ~~實測條 SN 反查本機通唔通~~ —— **問題消失**:`mock-servicenow.js:52-61` 已支援 `GET ?sysparm_query=number=` 反查(為 `getRecordByNumber` 而加),native 路線全程走 mock,唔使打真 SN
- [x] **F0b** 確認 default SKU GUID = `06ebc4ee-1bb5-47dd-8120-11324bc54e06`(SPE_E5)—— 2026-07-31 實測 catalog 99 SKU,兩個 E5 變體並存(plan §2.3)
- [x] **F0c** 確認 fixture 放邊(OQ-3)—— `apps/api/scripts/demo-harness/` **已存在**,fixture 加入該 harness,配 `npm run demo:intake`

## CH-B — default SKU 注入

- [x] **F1** ADR-0020 寫好 → **Accepted**
- [x] **F2** `schema.prisma` 加 `defaultOnboardingSkuId` + migration `20260731012942_add_default_onboarding_sku`(additive nullable,零 backfill)
- [x] **F3** `connectors.ts` 加 `n8n-inbound` editable field + 新 `kind: 'sku'` + 更正「inbound 冇非機密設定」註解
- [x] **F4** Admin 寫入時 SKU 存在性驗證 —— `validate` 改 async,shape-first 再查 catalogue,inactive 亦拒(**26/26** connector-config test)
- [x] **F5** native DTO `@ArrayMinSize(1)`→`(0)` + swagger 描述寫明空 list 語義(canonical DTO 保持 ≥1)
- [x] **F6** `applyDefaultSku()` + `intake.default_sku_injected` action + **擴 ADR-0009 D4 白名單** + warn log(H4:只 log REQ number / SKU part number,零 UPN)
- [x] **F7** Test:注入 / audit / 有 E3 唔加 / 未配置 / 配置指向 inactive / **重推唔重複 audit** —— adapter **23/23**;🔴 **fails-before 實證**:首版 mock 唔真實,拆 guard 仍全綠 = 假驗證;修正後拆 guard → `Expected 1, Received 2` 真紅

## CH-A — 測試 fixture

- [x] **F8** canonical fixture(`POST /requests/intake`)—— `intake-fixture.js --mode canonical`
- [x] **F9** native fixture(`POST /requests/intake/n8n`,含 `--empty` 驗 ADR-0020)+ README Scenario 4 + `npm run demo:intake`
  - ⚠️ **code 寫好但未實跑** —— 要起 mock SN + API 3101,屬 F10

## 收官

- [x] **F10** Live 驗證(harness:mock SN 8980 + API 3101,**冇掂 3100/5173**)
  - [x] 未配置 → `201` + **0 行** + `WARN`(零 UPN)+ **audit 零新行**(baseline 24)
  - [x] 寫入驗證三態 → `E5`→400 `must be a GUID` · 不存在 GUID→400 `no SKU with id … exists` · 真 SPE_E5→**200**
  - [x] 配置後 → `201` + **1 行**,line item id **同 audit `targetId` 逐字對上**,`ritmSysId=null`,audit meta `SPE_E5` / `source=n8n-intake` / `actor=null`
  - [x] 有 licence 行(canonical ×2 + native ×2)→ 每張 **1 行**,audit 不變 ⇒ 冇亂注入 + canonical 行為不變
  - [x] 重推同一 REQ → `201` 返 existing,audit **26→26**(`preExisting` guard live 生效)
  - [x] `n8n-inbound` connector 真返 `defaultOnboardingSkuId` field
  - [ ] 🚧 **UI 卡片目視(light + dark,H6)未做** —— 交 owner:`http://localhost:5173/settings` → Integrations → n8n (inbound intake);3100 已跑最新 code 且同一 DB,值已設好
  - [x] Cleanup:清 5 張,**保留 `sys-REQ46525400`** 畀 owner 喺 UI 睇「平台加咗一行」
- [x] **F11** Doc sync:BACKLOG(R7)· 更正 `intake-adapter.service.ts` 過期註解(no-Teams 前提已失效)· harness README(Files 表 + Scenario 4 + 澄清「empty→400」係 canonical-only)
- [ ] **F12** Acceptance §7 八條逐條驗 + api/web test 全綠 + lint + build
- [ ] **F13** progress.md 寫齊 Day-N(R2)+ retro

## 🚧 明確唔喺本 phase 做(唔係漏)

- 🚧 **SN 反向開 RITM** 畀自動加嘅行 → BACKLOG `Request-edit-more`(需 SN schema 拍板)
- 🚧 **per-OpCo 唔同 default** → 未有需求,ConnectorConfig 係單行表做唔到
- 🚧 **assign 段真 Graph 依賴** → 非本 phase 可解(plan §2.2)
