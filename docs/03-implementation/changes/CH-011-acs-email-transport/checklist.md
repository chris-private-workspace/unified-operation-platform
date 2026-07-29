---
change_id: CH-011
spec_ref: ./spec.md
status: blocked          # blocked | ready | in-progress | done
last_updated: 2026-07-29
---

# CH-011 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。
> 🔴 **status 仍然係 `blocked`** —— Gate 0 **五項中四項已過**,剩返 **spec approve** 一格。
> 未過之前**一項 code 都唔可以寫**(PROCESS R1.change)。

## Gate 0 — 開工前必須有嘅答案(4/5 已過)

- [x] **OQ-1** 🔴 ACS sender address → ✅ **`UnifiedOperationsPortal@rci-t.com`**(Chris 2026-07-29)
      ⚠️ **custom domain**(`rci-t.com`)唔係 Azure-managed ⇒ 靠 DNS 側 SPF/DKIM。**因為 D5 唔畀探,寄唔寄得出要到 A11 第一次真寄先知**(揀「唔畀探」嗰陣已接受嘅代價)
      ⚠️ 連帶:custom domain 嘅失敗模式係「ACS 收貨但唔送達」,平台側**睇落完全成功** ⇒ **A11 必須以收件人真係收到為準**
- [x] **OQ-2** 收件人解析收窄成「caller 傳地址」→ ✅ **Approve**(Chris 2026-07-29)⇒ ADR-0019 **D3 成立**,唔建推導層
- [x] **OQ-3** 零 caller 嘅 live 證明用一次性 ops script → ✅ **接受**(Chris 2026-07-29)⇒「拆兩份」維持
- [x] **ADR-0019** `Proposed → Accepted`(2026-07-29;三條 OQ 全答 + 三項前置拍板)
- [ ] 🔴 **Chris approve 本 spec**(`proposed → approved`)—— **最後一格,未過**

## Implementation

### Dependency + 邊界(D1 / D2)
- [ ] `@azure/communication-email` **只**加入 `apps/api/package.json`
- [ ] 確認 `apps/web` + root 兩個 `package.json` **diff = 0**(A1)
- [ ] `EmailService` 落 `apps/api/src/integration/email/`,vendor SDK 唔出呢個資料夾
- [ ] Boundary test 靜態鎖住,**要有正面半邊**(W40:negative-only assertion 會永遠綠)(A2)

### 通知底座(D3)
- [ ] `NotificationService.send({ to, template, params })` 介面
- [ ] Template 機制 = typed code,一個 template 一個檔,出 subject + text + html
- [ ] 落 **`connectivity-check`** 一個 template;🔴 **唔落 password-reset template**(屬 4c-C)(A8)
- [ ] 失敗入 `OutboundFailure` —— **沿用 ADR-0011**,新增一個 kind,唔新發明機制
- [ ] `POST /admin/outbound-failures/:id/retry` 真係重寄(A7)

### Connector + config(D4)
- [ ] `connectors.ts` 加 key `email` + label
- [ ] `CONNECTOR_CONFIG.email`:`acsSenderAddress`(editable)+ `ACS_CONNECTION_STRING`(secret)
- [ ] 🔴 **H1 additive migration**:`ConnectorConfig` 加 nullable `acsSenderAddress`
- [ ] 🔴 **絕不 `getOrThrow`** —— state 永遠唔會係 `required`(A3)
- [ ] `PROBEABLE.email` 寫理由字串(唔畀探,D5)

### H4 邊界(D6 —— 三條都要 test)
- [ ] connection string 唔入 DB / log / API 回應(A4)
- [ ] 收件人 email 唔原封 log,用 `scrubPii()`;**test spy logger**(A5,RISK R5 明文要求)
- [ ] ACS 回應 / error body scrub 之後先 log(A6,BUG-007 先例)

## Verification

- [ ] **A1** 三個 `package.json` diff 核對(只 api 有新 dep)
- [ ] **A2** boundary test 正反兩邊都真係守到
- [ ] **A3** connector state 三態驗(未配置 `inactive` / 配置 `active` / **永遠唔會 `required`**)
- [ ] **A4** 🔴 secret leak —— **實證**既有 derive-from-`CONNECTOR_CONFIG` 嘅 leak test 真係覆蓋到新 key,唔可以假設
- [ ] **A5** 🔴 收件人 PII —— **spy logger**,唔可以只 assert exception message
- [ ] **A6** ACS body scrub
- [ ] **A7** 失敗入佇列 + retry 真重寄
- [ ] **A8** template 出 subject/text/html;零 password-reset template
- [ ] **A9** 🔴 **唔設任何 `ACS_*` env → app boot 得起 + 既有 api test 全綠**(D4 optional 嘅真證明)
- [ ] **A10** api test 不降(現 **599**)· lint 零 output · build OK
- [ ] **A11** 🔴 **live 真寄一封**,以**真係收到**為準(唔係 API 返 202 就算);script 唔留 production 路徑
- [ ] **A12** fails-before 實證 A4 / A5 兩條硬紅線

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N entry(R2)
- [ ] Commit message 標 component tag(`feat(integration):`,標 CH-011)
- [ ] **ADR-0019 已 Accepted** 先開工;若實作中發現要改 ADR 已宣告嘅嘢 → **STOP**,回頭問 owner
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `RISK_REGISTER.md` 檢視(R4 收件人 PII 屬既有 **R5** 範圍,唔開新條 —— 除非實作揭出新面向)
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`
- [ ] 🚧 **下游**:AUTH-4c-C phase(設計已定 ADR-0019 D8)—— **唔喺本 change**,但 R2 嘅緩解就係佢緊接住做

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
