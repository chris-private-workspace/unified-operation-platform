---
phase: W42-onboarding-default-sku
name: "intake 測試 fixture(CH-A)+ onboarding default SKU 注入(CH-B)"
sprint_week: W42
start_date: 2026-07-31
end_date:
status: active                # draft | active | closed
spec_refs:
  - docs/adr/0017-n8n-execution-seams-switchable-integration.md **D0**(只換執行器唔換決策者)· **D4**(intake adapter 存在理由)
  - docs/adr/0008-request-intake-d365.md **D6**(REQ/RITM 兩層鏡像)
  - docs/adr/0013-connector-config-ui-management.md(非機密落 DB / secret 留 env;Model C)
  - docs/adr/0009-audit-trail.md **D4**(新 action 必須擴白名單,否則 `pickAuditMetadata` 靜靜丟棄)
  - docs/adr/0020-default-onboarding-sku-injection.md(**本 phase 產出**,Proposed)
prior_phase: W41-auth-password-reset
---

# Phase W42 — intake fixture + onboarding default SKU

> **Plan version**:1.0(approved,轉 active)
> **Owner**:AI(Claude)
> **Approved by**:**Chris Lai(2026-07-31)** —— plan approve · **ADR-0020 Accepted** · **OQ-1 = 要驗**(原話:「如果是自行填的,一定要驗證是否真實存在」)· branch 策略跟建議(#58 merge 後從 main 開)。
> ⚠️ **OQ-2 仍未答**(n8n 側零 licence RITM 時實際行為)—— 唔阻塞實作,**阻塞 §7 驗收第 1 條嘅真實性**。

## 0. 起因(user 原話兩個問題)

1. **n8n 側未接通** ⇒ 收唔到 ServiceNow user onboarding 資料 ⇒ 平台**冇得做端到端測試**。
2. **業務規則**:所有 user onboarding **default 需要 M365 E5**,即使 ServiceNow 個 requested item **一行 licence 都冇**。唔係自動 assign —— 係 request 到咗 UOP 之後**自動補一行 E5 line item**,畀操作員自己 assign。

## 1. Scope

| | 內容 | 觸發 hard constraint |
|---|---|---|
| **CH-A** | intake 測試 fixture(canonical + n8n native 兩條路) | 無(純 dev tooling) |
| **CH-B** | onboarding default SKU 注入 | **H1** → ADR-0020 |

兩者**互不依賴**,但一併做:CH-A 造出嚟嘅 fixture 正好係 CH-B 嘅驗收載體。

### 1.1 唔做(H3 邊界)

- ❌ **唔郁 canonical CONTRACT**(W24,LOCKED)—— `N8nIntakeRequestDto` 同 `POST /requests/intake` 一個字都唔改。注入邏輯**只喺 `IntakeAdapterService`**(n8n 路線)。
- ❌ **唔做 per-OpCo 唔同 default** —— 全域單一值(Chris 2026-07-31 揀 connector config,未要求 per-OpCo)。
- ❌ **唔喺 ServiceNow 反向開 RITM** 畀自動加嘅行 —— BACKLOG `Request-edit-more` 已記低係延後項,需要 SN schema 拍板。
- ❌ **唔碰 assign 段** —— 真 Graph `findUser` 依賴保持原狀(見 §2.2)。
- ❌ 唔改 `IntakeService`(canonical writer)—— 佢收 0 行已經 work(§3.4 已驗 code path)。

## 2. 現況調查(全部 code-traced,唔係推測)

### 2.1 兩條 intake 路,外部依賴差天共地

| 路線 | 外部依賴 | 本機可跑 |
|---|---|---|
| `POST /requests/intake`(canonical,LOCKED) | **零** — 純 DB 寫(`intake.service.ts`) | ✅ |
| `POST /requests/intake/n8n`(native envelope) | **真 ServiceNow**(REQ number → sysId 反查,`intake-adapter.service.ts:172`) | ⚠️ 見 F0 |

⇒ 模擬 n8n 推 request **唔使等 n8n**:canonical 路線得一個 `X-Intake-Key`(env `INTAKE_API_KEY`),REQ sysId 自己作(佢淨係做 `@unique` 冪等鍵)。

### 2.2 🔴 真正卡死端到端嘅唔係 n8n

`assign.service.ts:141` —— assign 之前一定要 Graph **`findUser` 真命中**。`azureSyncedAt` 可以由 payload 帶落(或 `markSynced` 破窗),但 `findUser` 返 null 就 400。

⇒ **即使 n8n 聽日通晒,`pending user sync to azure → assign` 呢段本機一樣跑唔到** —— 要真 tenant 入面真係有嗰個 user。

**fixture 能覆蓋**:intake 冪等、OpCo/SKU 解析、stage machine、Requests 列表/detail、drift、ledger 顯示、**CH-B 注入行為**。
**fixture 覆蓋唔到**:真 Graph assign、SN write-back。

### 2.3 🔴 code 註解嘅事實前提已經過期

`intake-adapter.service.ts:138` 寫:「今日 `E5` 唯一,只係因為 no-Teams 變體**未 curated**,係運氣唔係保證」。

實測本機 catalog(**99 個 active SKU**)已經有兩個:

| skuId | skuPartNumber | businessAlias |
|---|---|---|
| `06ebc4ee-1bb5-47dd-8120-11324bc54e06` | `SPE_E5` | **`E5`** |
| `18a4bd3f-0b5b-4887-b04f-61dd0ee15f5e` | `Microsoft_365_E5_(no_Teams)` | *(空)* |

結論(今日仍唯一)**仍然成立**,但理由變咗:`findUniqueSku` 用 `equals` 唔係 contains,而 `businessAlias` 先查、只有 `SPE_E5` 帶 `E5` 呢個 alias。**註解要更正**(F11)。

⇒ 對 CH-B 嘅直接後果:**default 必須指 `06ebc4ee-…`(SPE_E5)**。呢個就係「一律用 `skuId` GUID,唔靠名」嘅實證。

### 2.4 冇 RITM 嘅 line item 唔會爆

`assign.service.ts:339` —— `item.serviceNowSysId` 為 null 時 fallback 落 parent REQ 落 work note。自動加嘅 E5 行(冇 RITM)行呢條路,**唔會 crash**。

### 2.5 前端係 data-driven,加 field 零改動

`integrations-panel.tsx:229` 係 `editable.map(...)`,`column`/`label`/`kind` 全部由 API 嚟。加一個 editable field **前端零 code 改動**;`n8n-inbound` 卡片會由「冇可編輯設定」變成長出一個輸入格(F10 要 live 睇一眼)。

## 3. CH-B 設計

### 3.1 Schema(H1 — additive 一欄,ADR-0020 授權)

```prisma
model ConnectorConfig {
  // ...
  // n8n inbound intake (W42 / ADR-0020) — non-secret.
  defaultOnboardingSkuId String?   // DEFAULT_ONBOARDING_SKU_ID override
}
```

單行表(`connector @unique`),additive nullable → **零 backfill、零 breaking**。

### 3.2 connectors.ts — `n8n-inbound` 第一個 editable field

```ts
'n8n-inbound': {
  editable: [
    { column: 'defaultOnboardingSkuId', label: 'Default onboarding SKU',
      envKey: 'DEFAULT_ONBOARDING_SKU_ID', kind: 'sku' },   // ← kind 見 OQ-1
  ],
  secrets: [{ envKey: 'INTAKE_API_KEY', label: 'Intake API key' }],
}
```

該 connector 現時 `editable: []`,註解寫「inbound 冇非機密設定」—— 呢個係第一個,註解要一併更正。

### 3.3 DTO 放寬(**邏輯必然,唔係可選**)

`N8nNativeIntakeDto.licenseItems` 由 `@ArrayMinSize(1)` → `@ArrayMinSize(0)`。

🔴 唔放寬,「完全冇 licence 行」呢個**唯一觸發條件永遠到唔到 adapter**(DTO 層直接 400)。

⚠️ 代價:空 list 由「非法 payload」變成「合法且有意義嘅訊號」。**只改 native DTO**,canonical `N8nIntakeRequestDto` 保持 `@ArrayMinSize(1)`。

### 3.4 注入邏輯(`IntakeAdapterService`)

```
resolveLineItems() → resolved
  resolved.length > 0  → 原樣返回(唔加,唔查重)
  resolved.length == 0 → ensureDefaultLine()
      ├ 未配置 / 配置指向唔存在或 inactive 嘅 SKU
      │    → logger.warn + 返 []  →  request 照建,0 行
      └ 配置有效 → [{ skuId, quantity: 1 }]   // 冇 RITM(serviceNowSysId = null)
```

**觸發條件 = 完全冇 licence 行**(Chris 2026-07-31)。有 E3 但冇 E5 → **唔加**,尊重 SN 側 curation。

`IntakeService` 收 0 行已經 work:`for (const line of dto.lineItems)` 空 loop → `lineItems: { create: [] }` → 建一個零行 Request。**唔使改**。

adapter 內部砌 canonical DTO 唔經 ValidationPipe(該 service 自己個註解已言明),所以 canonical DTO 個 `@ArrayMinSize(1)` 唔會阻住傳 0 行。

### 3.5 Audit vs log — 直接沿用 W41 裁決

| 情況 | 處理 | 理由 |
|---|---|---|
| **注入成功** | **寫 audit** | 平台自己造咗一行 line item = **業務事實**,操作員之後 assign 嘅嘢有一半唔係 SN 要求嘅,冇 audit 就追唔返 |
| **未配置 / 配置錯** | **只 `logger.warn`,唔寫 audit** | **配置錯屬 ops,唔屬業務 audit** —— W41 OQ-1 已就同一問題拍板(未設 `APP_BASE_URL` → 只 log) |

🔴 ADR-0009 **D4**:新 audit action 必須擴白名單,否則 `pickAuditMetadata` **靜靜丟棄** metadata。F6 必須同步做。

### 3.6 fail-soft 而唔 fail-closed 嘅理由(記低,免得日後當係漏)

adapter 通篇 fail-closed,但呢度**刻意唔跟**。fail-closed 嘅論據係「猜錯會 assign 錯 licence 落真人身上」—— 而呢度**冇任何猜測**:冇配置就係冇配置,收一張零行 request 唔會 assign 錯任何嘢。

反過來,拒收 = n8n 收 400,而 n8n 側收到 400 會唔會通知到人**未知**(OQ-2)。**入咗但少一行,操作員喺 Requests 列表睇得見;入唔到,可能靜默丟失** —— 後者嚴重得多。

## 4. CH-A 設計

兩個 fixture,分工唔同:

| | 打邊條路 | 驗到咩 |
|---|---|---|
| **canonical fixture** | `POST /requests/intake` | 下游全鏈:冪等、OpCo/SKU 解析、stage machine、UI |
| **native fixture** | `POST /requests/intake/n8n` | **adapter mapping**(Job Function→OpCo、licenceCode→skuId)+ **CH-B 注入** |

⚠️ 走 canonical 灌數據會**完全繞開 adapter**,而 adapter 係最新、最易錯嗰舊 code —— 所以兩個都要(Chris 2026-07-31)。

native fixture 卡住 SN 反查,F0 先實測再定做法(真 REQ number / stub / 只靠 unit test)。

## 5. Hard constraint 分析

| | 判斷 | 理由 |
|---|---|---|
| **H1 架構** | ⚠️ **觸發 → ADR-0020** | 「平台自己憑規則造一行 line item」係**新增平台側決策權**:今日每一行 line item 都源自 SN 嘅 RITM。掂到 ADR-0017 **D0**(只換執行器唔換決策者)同 ADR-0008 **D6** 兩層鏡像語義。Schema 一欄 additive 亦一併由 ADR-0020 授權。 |
| **H2 Vendor** | ✅ | 零新 dependency。 |
| **H3 Scope** | ✅ | LicenseOps 模組內;§1.1 明列邊界。 |
| **H4 Security** | ✅ | 唔掂 secret;`INTAKE_API_KEY` 維持 env-only。log 唔可以帶 target UPN(沿用 adapter 現有 H4 紀律:只 quote REQ number / OpCo / licence code)。 |
| **H5 Test** | ⚠️ **critical path** | 掂到 request 建單 + line item 生成 → adapter spec 必須同步。 |
| **H6 Design** | ✅ | 前端零 code 改動(§2.5),但 F10 要 live 睇卡片 + light/dark。 |

## 6. Deliverables

| # | 項目 | 產出 |
|---|---|---|
| **F0** | Preflight:SN 反查通唔通 · 確認 E5 GUID · fixture 放邊 | 實測記錄入 progress |
| **F1** | **ADR-0020**(Proposed → Chris approve → Accepted) | `docs/adr/0020-*.md` |
| **F2** | Schema 加 `defaultOnboardingSkuId` + migration | `schema.prisma` + migration |
| **F3** | `connectors.ts` 加 editable field(+ 更正過期註解) | `connectors.ts` |
| **F4** | Admin 寫入時 SKU 存在性驗證(OQ-1) | connector config service/controller |
| **F5** | native DTO `@ArrayMinSize(0)` + swagger 描述講清空 list 語義 | `n8n-native-intake.dto.ts` |
| **F6** | `ensureDefaultLine()` + audit action(**擴 ADR-0009 白名單**)+ warn log | `intake-adapter.service.ts` |
| **F7** | Test:注入 / 唔注入 / 未配置 / 配置錯 / 有 E3 唔加 | `intake-adapter.service.spec.ts` 等 |
| **F8** | canonical fixture script | 待 F0 定位置 |
| **F9** | native fixture script | 同上 |
| **F10** | Live 驗證:本機 intake→READY 端到端 + connector UI 卡片(light+dark) | progress 記錄 |
| **F11** | Doc sync:BACKLOG(R7)· 更正 §2.3 過期註解 · MAPPING/CONTRACT 如受影響 | — |

## 7. Acceptance(每條可證偽)

1. `POST /requests/intake/n8n` 帶 `licenseItems: []` + default 已配置 → 建出嘅 Request **恰好 1 行**,`skuId = 06ebc4ee-…`,`serviceNowSysId = null`,`stage = REQUESTED`。
2. 同上但 **default 未配置** → Request **建到**(唔係 400),**0 行**,log 有 warn,**audit 冇新行**。
3. `licenseItems: [E3]` → **1 行 E3**,**冇** E5(唔加)。
4. `licenseItems: [E5]` → 1 行,唔重複。
5. canonical `POST /requests/intake` 行為**逐字不變**(既有 test 全綠,無一條要改)。
6. Settings → Integrations → n8n (inbound intake) 見到「Default onboarding SKU」輸入格;填一個唔存在嘅 GUID **被拒**(OQ-1 決定後定形)。
7. fixture 跑完,Requests 列表見到新 request,可以推到 READY。
8. api / web test 全綠 + lint exit 0 + build 出 `dist/main.js`。

## 8. Risks

| # | 風險 | 狀態 |
|---|---|---|
| **R1** | 🔴 **CH-B 建基於未證實前提**:假設 n8n 喺「SN 零 licence RITM」時會 POST 一個**空 list**。但佢可能**根本唔 POST**(workflow 自己 filter),果真如此 CH-B 永遠唔會觸發 = 白做 | **未證實** → OQ-2,**要同 n8n 側對** |
| **R2** | no-Teams E5 已 curated(§2.3)→ 配錯 GUID = 畀人開錯 licence | 🟡 由 F4 存在性驗證 + GUID-only 緩解 |
| **R3** | 放寬 `@ArrayMinSize` 削弱 native 路線 fail-closed | ⚫ 已知並接受(§3.3),只限 native |
| **R4** | 自動加嘅行喺 SN 冇對應 RITM → 對唔返數 | ⚫ 接受;反向開 RITM 屬 BACKLOG 延後項 |
| **R5** | 本機 assign 段仍需真 Graph,fixture 覆蓋唔到(§2.2) | ⚫ 接受,非本 phase 可解 |

## 9. Open Questions(**要 Chris 答先落 code**)

| # | 問題 | 建議 |
|---|---|---|
| **OQ-1** | ~~Admin 填 default SKU 時要唔要驗「真係一個 active SKU」?~~ | ✅ **已答(Chris 2026-07-31):要驗** —— 原話「如果是自行填的,一定要驗證是否真實存在」。⇒ 加新 `kind: 'sku'` 做 DB 存在性檢查(F4)。同 CH-011 加 `kind: 'email'` 同一論據(`connectors.ts:104`):呢個 connector 唔 probeable,write-time validation 係操作員唯一 feedback。 |
| **OQ-2** | n8n 喺「SN 零 licence RITM」時實際會做咩?(R1) | 要睇 workflow 1001/1005。**唔阻塞實作,但阻塞驗收** |
| **OQ-3** | fixture 放邊、要唔要 `npm run` script | 建議對齊 `prisma/seed-demo-ledger.ts` 既有 pattern |

## 10. Changelog

| 日期 | 版本 | 改動 |
|---|---|---|
| 2026-07-31 | 0.1 | 初稿(draft,待 approve)。四個方向由 Chris 2026-07-31 拍板:fixture 兩條路都要 · 注入放 adapter · 只喺完全冇 licence 行時加 · default 落 connector config。 |
| 2026-07-31 | 1.0 | **Chris approve → active**。ADR-0020 Proposed→**Accepted**(H1 解鎖)。OQ-1 答「要驗」→ F4 定形為 `kind: 'sku'`。OQ-3 按建議自決(對齊 `prisma/seed-demo-ledger.ts` pattern),唔另外問。**OQ-2 仍 open**。 |
