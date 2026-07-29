---
change_id: CH-011
title: "Email 傳輸層(Azure Communication Services)+ 最小通知底座"
status: proposed          # draft | proposed | approved | active | done | cancelled
created: 2026-07-29
target_completion: 2026-07-31
affects_components:
  - apps/api/src/integration/email (新 — EmailService + template,vendor SDK 只准喺呢度)
  - apps/api/src/integration/connectors.ts (新 connector key `email`)
  - apps/api/prisma/schema.prisma (additive:ConnectorConfig 加 acsSenderAddress)
  - apps/api/src/fulfilment/outbound-* (沿用 ADR-0011 失敗佇列,新增一個 kind)
  - apps/api/package.json (新 runtime dep — H2)
spec_refs:
  - ADR-0019(本 change 嘅決策來源,**Proposed —— 未 Accept 唔可以開工**)
  - ADR-0013(Model C connector config · D5 secret 三重守 · W39 補註 ALTER TABLE)
  - ADR-0011(outbound 失敗佇列 — 沿用,唔新發明)
  - ADR-0010(D4 lastSuccessAt 語意 · D5 PROBEABLE 當資料)
  - RISK R5 / BUG-004 / BUG-007(scrubPii + spy logger)
---

# CH-011 — Email 傳輸層(ACS)+ 最小通知底座

> **Spec version**:1.0(initial)
> **Owner**:AI(執行)· 決策 = Chris Lai
> **Status**:`proposed` —— **兩重 gate,一重已過**
> 1. ✅ **ADR-0019 `Proposed → Accepted`**(2026-07-29;三條 OQ 全答 —— sender = `UnifiedOperationsPortal@rci-t.com` · 收件人解析收窄 approve · 零 caller 用 ops script 驗)
> 2. ⬜ 本 spec `proposed → approved`(PROCESS R1.change)—— **最後一格**
>
> 🔴 **第 2 重未過之前一行 code 都唔可以寫。**

## 1. Context (Why)

Chris 2026-07-29:「開 CH-011 + ADR 做 ACS email,也一併處理 AUTH-4c-C。」

查證(2026-07-29,真跑唔係推論):

| # | 事實 | 依據 |
|---|---|---|
| 1 | **平台零發郵件能力** | 全部 `package.json` 只有 `@azure/identity` + MSAL;`apps/api/src/` 全掃零發信 code |
| 2 | ACS 連接字串已入 `.env` 但**讀唔到** | 第 34 行被 comment;36/37 行係拆開嘅片段,**冇 env var 名**、細楷 |
| 3 | AUTH-4c-C 由 **2026-07-13** blocked 至今,卡嘅就係 transport | ADR-0006 §分階段 4c-C |

**本 change 只做 transport + 底座。** AUTH-4c-C 嘅 endpoint / schema / 前端頁**唔喺本 change**(Chris 拍板「拆兩份」),設計方向已喺 **ADR-0019 D8** 定死,免得兩邊形狀唔夾。

🔴 **一個要開宗明義講清楚嘅特性**:**本 change 落地嗰刻,呢條 email 路徑會係零 production caller。** 呢個係「拆兩份」嘅必然後果,唔係疏忽。CH-010 啱啱先因為「冇 caller 到達得到、測唔到嘅 code」刪走 n8n 2004 client —— 本 change **唔會扮呢個問題唔存在**:live 證明靠一次性 ops script(A11),真 caller 喺 AUTH-4c-C phase 到。

## 2. Scope (What)

### 2.1 In Scope

**D1 — 新 runtime dependency `@azure/communication-email`(🔴 H2)。**
只加入 **`apps/api`**,唔加去 `apps/web` / root。

**D2 — `EmailService` 落 `apps/api/src/integration/email/`。**
Vendor SDK(`EmailClient`)**只准出現喺呢個資料夾**(CLAUDE.md §3.1)。Domain 層只見到 `NotificationService` 介面。要有 **boundary test 靜態鎖住**(跟 `license-ops.boundary.spec.ts` 先例)。
⚠️ W40 教訓:boundary test 嘅 **negative assertion 好易永遠綠**(TS `abstract` 方法冇 runtime 存在)⇒ 本次條 test **必須有正面半邊**,證明佢真係睇緊嘢。

**D3 — 通知底座三件(ADR-0019 D3)。**
1. `NotificationService.send({ to, template, params })`
2. **Template = typed code,一個 template 一個檔**,各自出 subject + plain-text + HTML
3. 失敗**沿用 ADR-0011 `OutboundFailure`**,新增一個 `kind`;retry 走**既有** `POST /admin/outbound-failures/:id/retry`

本 change 只落 **一個 template:`connectivity-check`**(A11 ops script 專用)。
🔴 **刻意唔落 password-reset template** —— 佢屬 AUTH-4c-C,喺度落會令兩個 change 界線糊掉。

**D4 — Connector `email`(ADR-0019 D4)。**
- `ACS_CONNECTION_STRING` = **secret,env-only**
- `ACS_SENDER_ADDRESS` = non-secret,UI 改得(DB-then-env)
- 🔴 **H1 additive migration**:`ConnectorConfig` 加一個 nullable 欄 `acsSenderAddress`(ADR-0013 W39 補註已預告,今次事前就知)
- 🔴 **絕不 `getOrThrow`** ⇒ state 只會 `active` / `inactive`,**永遠唔會 `required`**

**D5 — 唔畀探(ADR-0019 D5)。**
`PROBEABLE.email = '…delivers a real message, so it is never called as a test'`,跟 `n8n-outbound` 同一寫法 —— 理由當**資料**寫喺 `connectors.ts`,令 controller 冇得靜靜長出 probe。

**D6 — H4 三條邊界,每條要有 test(ADR-0019 D6)。**
1. connection string 唔入 DB / log / API 回應
2. 收件人 email 唔可以原封 log(`scrubPii()`)
3. ACS 回應 / error body scrub 之後先 log

### 2.2 Out of Scope（explicit)

- ❌ **AUTH-4c-C 全部** —— `PasswordResetToken` model / 兩個 `@Public()` endpoint / 前端 `/forgot-password` · `/reset-password` 頁 / password-reset template。設計已定(ADR-0019 D8),實作喺後續 phase
- ❌ 業務通知(licence 派好通知申請人、drift 通知 admin…)—— 要開新 ADR
- ❌ Template 編輯 UI / DB-stored template
- ❌ 收件人由 role / OpCo 推導(ADR-0019 D3,收窄待 approve)
- ❌ per-IP rate limit(需新 dep = 再觸發 H2)
- ❌ 收信 / 附件 / 排程發送 / 第二個 transport / seam
- ❌ 唔掂 ledger / reconcile / stage machine / 預算 gate / 對帳 / audit 權限矩陣

## 3. Acceptance Criteria

- [ ] **A1** `@azure/communication-email` **只**加入 `apps/api/package.json`;`apps/web` + root 兩個 `package.json` **diff = 0**
- [ ] **A2** boundary test:`EmailClient` / `@azure/communication-email` **只**出現喺 `src/integration/email/`;domain 層零 import。⚠️ 條 test 要有**正面半邊**(證佢真係睇到嘢),唔可以只有一句永遠綠嘅 negative assertion(W40 教訓)
- [ ] **A3** `GET /admin/integrations` 出到 `email` connector:未配置 → `inactive`;配置咗 → `active`;**任何情況都唔會係 `required`**
- [ ] **A4** 🔴 **secret 唔洩漏**:`GET /admin/integrations` 回應全文**唔含** connection string 任何片段(既有 leak test 由 `CONNECTOR_CONFIG` derive,新 key 應自動被覆蓋 —— **要實證佢真係覆蓋到**,唔可以假設)
- [ ] **A5** 🔴 **收件人 PII 唔入 log**:test **必須 spy logger**(RISK R5 明文要求),唔可以只 assert exception message —— BUG-004 就係咁匿咗 18 日
- [ ] **A6** ACS 回應 / error body 入 log 前經 `scrubPii()`(BUG-007 先例)
- [ ] **A7** 送信失敗 → 入 `OutboundFailure`;`POST /admin/outbound-failures/:id/retry` 真係**重寄**(唔係當成功)
- [ ] **A8** Template 機制:`connectivity-check` 出到 subject + text + html 三樣;**零 password-reset template**(D3)
- [ ] **A9** 🔴 **冇配置 ACS 時平台完全照舊**:唔設任何 `ACS_*` env → app **boot 得起** + **既有 api test 全部照樣綠**(= D4「optional 唔 getOrThrow」嘅真證明,唔係口頭承諾)
- [ ] **A10** api test 不降 + 新增覆蓋(現 **599**);`npm run lint`(api)零 output;`npm run build` OK
- [ ] **A11** 🔴 **live 真寄一封** —— 一次性 ops script 經真 ACS,由 **`UnifiedOperationsPortal@rci-t.com`** 寄去 Chris 指定收件地址。
      🔴 **以收件人真係收到為準,唔係「API 返 202」就算** —— custom domain 嘅失敗模式正正係「ACS 收貨但唔送達」,嗰種情況平台側**睇落完全成功**(R1)。script 唔留 production 路徑
- [ ] **A12** fails-before 實證:至少 A4 / A5 兩條硬紅線,要示範「拆走守門就變紅」

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | ~~sender address 未 provisioned~~ → **改為:custom domain 送達失敗而平台睇落成功** | Med | **High**(靜默唔送達 = 用戶收唔到重設信而系統話成功) | 🟡 **已降級**:地址有咗(`UnifiedOperationsPortal@rci-t.com`)。但佢係 **custom domain**(`rci-t.com`)唔係 Azure-managed,靠 DNS SPF/DKIM ⇒ 失敗模式係「**ACS 收貨但唔送達**」,而 API 會照返 202。而 D5 又刻意唔畀探 ⇒ **A11 必須以收件人真係收到為準**,唔可以以 API 回應為準 |
| **R2** | 零 caller 嘅 code 變技術債(若 AUTH-4c-C 遲遲唔做) | Med | Med | 本 spec 開宗明義寫明呢個特性;ADR-0019 Consequences 亦記低。**緩解係「4c-C 緊接住做」,唔係技術手段** |
| **R3** | connection string 洩漏(入 log / DB / API) | Low | **High** | A4 + D6;既有 leak test 已由 `CONNECTOR_CONFIG` derive(W40),新 key 自動入網 —— 但 **A4 要實證**唔可以假設 |
| **R4** | 收件人 email(PII)入 plaintext log | **Med**(已發生三次 —— BUG-001/004/007) | Med | A5 **spy logger**;`scrubPii()` 共用 helper,唔准自寫 regex |
| **R5** | `ALTER TABLE` 出錯 / 環境未 migrate | Low | Med | Additive nullable 欄,零 backfill;跟既有 migration 流程 |
| **R6** | 「唔畀探」⇒ 配置錯到真寄先知 | High | Low | 刻意接受(ADR-0019 D5)。`lastSuccessAt` 由真寄成功 derive,唔由「有配置」derive |

## 5. Effort Estimate

**~1.5–2 日** —— dep + EmailService + template 機制(0.5)· connector + migration + secret/PII 邊界 test(0.75)· 失敗佇列接線 + retry(0.25)· ops script + live(0.5)。
⚠️ **不含** ACS sender domain 嘅 provisioning(Azure 側,唔喺本 repo)。

## 6. Dependencies

- ✅ **ADR-0019 Accepted**(2026-07-29,三條 OQ 全答)
- ⬜ **Chris approve 本 spec**(`proposed → approved`)—— **唯一剩低嘅 gate**
- 🟡 **ACS sender address = `UnifiedOperationsPortal@rci-t.com`**(R1 降級)—— 地址有咗,但**「可寄」未證實**:custom domain 靠 DNS SPF/DKIM,而 D5 唔畀探 ⇒ 要到 **A11 第一次真寄**先知
- ✅ `OutboundFailure` 失敗佇列已存在(ADR-0011,W31)
- ✅ `scrubPii()` 共用 helper 已存在(BUG-004)
- ✅ Connector config 機制已存在(ADR-0013,W34)
- ➡️ **AUTH-4c-C phase** 係本 change 嘅下游,唔係前置

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-29 | Initial draft(**proposed**) | Chris 要求開 CH-011 + ADR 做 ACS email 並一併處理 AUTH-4c-C;AI 三項提問後 Chris 拍板:**拆兩份** · **順便鋪通知底座**(AI 曾 push back,Chris 揀咗)· **唔畀探** | — |
| 2026-07-29 | **三條 OQ 全答 ⇒ ADR-0019 Accepted**;R1 由「sender 未 provisioned」**改寫**成「custom domain 靜默唔送達」;A11 收緊為「以收件人真係收到為準」;§6 依賴更新。**scope 冇擴,只係把待定項填實 + 一個風險換咗面目** | OQ-1 = `UnifiedOperationsPortal@rci-t.com`(Chris)· OQ-2 = approve 收窄(D3 成立)· OQ-3 = 接受 ops script。⚠️ **R1 唔係消失咗而係變咗形**:地址有咗解決咗「寄唔出」,但揭出 custom domain 特有嘅「ACS 收貨但唔送達 + API 照返 202」—— 而 D5 唔畀探令呢個位冇第二層守門 | **Chris Lai**(OQ)+ AI(風險改寫) |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。本 change 額外有 **ADR-0019 Accept** 呢重 gate,而 ADR-0019 本身仲有 **OQ-1 sender address** 未答。
