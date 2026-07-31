# ADR-0020: Onboarding default SKU — 平台自動補一行 licence line item

**Date**: 2026-07-31
**Status**: **Accepted**(Chris Lai,2026-07-31)
**Approver**: Chris Lai

## Context

業務方提出:**所有 user onboarding 都 default 需要一個 M365 E5**,即使 ServiceNow 個 request 入面**一行 licence 相關嘅 requested item 都冇**。要求唔係自動 assign,而係 request 到咗 UOP 之後**自動補一行 E5 line item**,交畀操作員自己決定幾時 assign。

呢個要求觸發 **CLAUDE.md §5 H1**,因為佢改變咗一件到今日為止都成立嘅事:

> **平台從來冇造過 line item。** 每一行 `RequestLineItem` 都源自 ServiceNow 一個 `sc_req_item`(RITM),兩層鏡像關係由 ADR-0008 **D6** 定死。平台係鏡,唔係源。

補一行冇 RITM 對應嘅 line item,等於平台第一次成為 line item 嘅**來源**。呢個同 ADR-0017 **D0**(「只換執行器唔換決策者」)有表面張力,必須正面講清楚,唔可以當普通 change 滑過去。

### 兩個實測到嘅事實限制

1. **`E5` 唔可以靠名。** 本機 catalog(99 個 active SKU)實測有兩個 E5 變體並存:`SPE_E5`(businessAlias `E5`)同 `Microsoft_365_E5_(no_Teams)`。`intake-adapter.service.ts:138` 個註解原本寫「no-Teams 未 curated,係運氣」—— 個運氣已經用完咗。今日仍然解析得到唯一值,純粹因為 `findUniqueSku` 用 `equals` 而 `businessAlias` 先查。

2. **觸發條件到唔到 adapter。** `N8nNativeIntakeDto.licenseItems` 現時係 `@ArrayMinSize(1)`,所以「完全冇 licence 行」呢個 payload 會喺 DTO 層直接 400,**永遠入唔到** adapter。唔放寬就實現唔到需求 —— 呢個係邏輯必然,唔係設計選擇。

## Decision

### D1 — 平台可以喺 n8n intake 路線注入一行 default line item

`IntakeAdapterService` 喺解析完 `licenseItems` 之後,若結果**完全冇 licence 行**,補一行 default SKU、`quantity = 1`、**冇 RITM**(`serviceNowSysId = null`)。

呢個係對 ADR-0008 D6「line item 一律鏡像 RITM」嘅**明確、有界例外**,唔係推翻。

### D2 — 只喺「完全冇 licence 行」時注入

| payload | 行為 |
|---|---|
| `licenseItems: []` | **補 default** |
| `licenseItems: [E3]` | **唔補** — 尊重 ServiceNow 側 curation |
| `licenseItems: [E5]` | **唔補** — 唔重複 |

「有 E3 就冇 E5」係**刻意接受**嘅後果:平台唔會第二次猜業務意圖。SN 明確講咗要咩,就以佢為準。

### D3 — 只喺 adapter,canonical contract 一個字都唔改

注入邏輯**只住喺 `IntakeAdapterService`**(n8n 路線)。`POST /requests/intake`、`N8nIntakeRequestDto`、`IntakeService` 全部逐字不變。

⇒ 其他 caller(包括 W25 IT 喺 UOP 手動開單)**唔會**有 default —— 呢個係有意識嘅取捨,見 Consequences。

### D4 — default 用 `skuId` GUID,存喺 `ConnectorConfig`(非機密)

`ConnectorConfig.defaultOnboardingSkuId`(additive nullable),掛喺 `n8n-inbound` connector,DB-then-env 解析(env fallback `DEFAULT_ONBOARDING_SKU_ID`),沿用 ADR-0013 Model C。呢個係 `n8n-inbound` 第一個非機密可編輯欄位。

🔴 **一律 GUID,絕不靠名** —— Context 第 1 點就係代價:揀錯就係畀真人開錯 licence。

**寫入時必須驗證該 GUID 真係一個 active SKU**(Chris 2026-07-31:「如果是自行填的,一定要驗證是否真實存在」)。現有 `kind: 'guid'` 只驗**格式**,所以引入新嘅 `kind: 'sku'` 做 DB 存在性檢查。論據同 CH-011 當初引入 `kind: 'email'` 一致(`connectors.ts:104`):**呢個 connector 唔 probeable,write-time validation 係操作員唯一嘅 feedback** —— 冇佢,一個格式合法但唔存在嘅 GUID 要等到第一張真 onboarding request 先爆。

### D5 — native DTO 放寬到 `@ArrayMinSize(0)`

**只限** `N8nNativeIntakeDto`。canonical `N8nIntakeRequestDto` 保持 `@ArrayMinSize(1)`。

空 list 由「非法 payload」升格為「**合法且有意義嘅訊號**」:意思係「ServiceNow 側一行 licence 都冇」。

### D6 — 未配置 / 配置無效 → fail-**soft**

default 未設,或者指向唔存在 / inactive 嘅 SKU:**照收張 request、0 行 line item、`logger.warn`**,唔拒收。

呢度**刻意唔跟** adapter 通篇嘅 fail-closed 慣例。fail-closed 嘅論據係「猜錯會 assign 錯 licence 落真人身上」—— 而呢度**冇任何猜測**,收一張零行 request 唔會 assign 錯任何嘢。反過來,拒收 = n8n 收 400,而 n8n 側收到 400 會唔會通知到人**未知**。

> **入咗但少一行,操作員喺 Requests 列表睇得見;入唔到,可能靜默丟失。**

### D7 — 注入成功寫 audit;配置問題只 log

| 情況 | 處理 |
|---|---|
| 成功注入 | **寫 audit** — 平台造咗一行 line item 係**業務事實**;冇 audit,日後就分唔清邊行係 SN 要求、邊行係平台加 |
| 未配置 / 配置錯 | **只 `logger.warn`** — **配置錯屬 ops,唔屬業務 audit** |

D7 下半直接沿用 W41 就同一問題嘅裁決(未設 `APP_BASE_URL` → 只 log 唔寫 audit)。

🔴 新 audit action 必須擴 ADR-0009 **D4** 白名單,否則 `pickAuditMetadata` 會**靜靜丟棄** metadata。

### D8 — 唔喺 ServiceNow 反向開 RITM

注入嘅行喺 SN 冇對應記錄,**接受**。反向開 RITM 需要 SN schema 拍板,屬 BACKLOG `Request-edit-more` 延後項。

已核實安全:`assign.service.ts:339` 對 `serviceNowSysId = null` 有 fallback(work note 落 parent REQ),唔會 crash。

## Alternatives Considered

- **喺 `IntakeService` 注入(所有 caller 都有 default)** — rejected:會改動 W24 **LOCKED** canonical contract 嘅語義,令每個現有同未來 caller 都收到一行「我冇要求過」嘅 line item。呢個 default 係 **n8n onboarding 流程**嘅業務規則,唔係「所有 intake」嘅規則。

- **default SKU 放 env(`DEFAULT_ONBOARDING_SKU_ID` only)** — rejected:改一次要重啟一次,而呢個係業務參數唔係部署參數。ADR-0013 Model C 已經有現成 DB+UI 路,而 `n8n-inbound` 卡片本來就喺 Settings 見到。env 保留做 fallback。

- **靠 `businessAlias = 'E5'` 解析,唔存 GUID** — rejected:Context 第 1 點實測有兩個 E5 變體。今日唯一係 `equals` 語義嘅副產品,唔係保證。

- **未配置時 fail-closed(400)** — rejected:見 D6。

- **永遠補一行 E5(唔查重)** — rejected:已有 E5 嘅 request 會變兩行,ledger 數字誤導。

- **冇 E5 行就補(即使已有 E3)** — rejected(Chris 2026-07-31 揀最保守):會令每個 E3 用戶嘅 request 都多一行要人手刪,而「刪走一行」比「補返一行」更容易出錯。

## Consequences

### Positive
- 業務需求落地:SN 側漏咗 licence 行,onboarding 唔會再靜靜咁少咗個 E5。
- 決策點集中喺**一個** service、**一個** config 值,睇得晒。
- canonical contract 保持 LOCKED,既有 caller 嘅嚴格保證一個字唔少。
- 前端零 code 改動(`integrations-panel.tsx` 係 data-driven)。

### Negative
- 🔴 **平台第一次成為 line item 嘅來源。** 之後任何人 debug「呢行邊嚟」都要多諗一個可能性。D7 個 audit 就係為咗令呢個可回答。
- native 路線嘅 `@ArrayMinSize` fail-closed 削弱咗一級(D5)。
- 手動開單(W25)**冇** default —— 同一個業務規則喺兩條路上行為唔一致。若日後認為手動開單都要,要另開 ADR,唔可以順手加。
- 注入嘅行喺 ServiceNow 冇對應 RITM,兩邊對唔返數(D8)。

### Neutral
- `ConnectorConfig` 加一欄 additive nullable —— 零 backfill、零 breaking。
- 觸發條件收窄到「完全冇 licence 行」,實際觸發頻率取決於 ServiceNow 側 curation 質素,平台呢邊估唔到。

### 🔴 未證實嘅前提(接受風險)

本 ADR 假設 n8n 喺「SN 零 licence RITM」時會 POST 一個**空 `licenseItems`**。若 n8n workflow 其實係**根本唔 POST**(自己 filter 咗),咁 D1 永遠唔會觸發,呢個 ADR 落地咗都等於冇。

**呢點必須同 n8n 側對過**(W42 OQ-2)。寫喺呢度,係因為佢唔係實作風險,係**需求成唔成立**嘅前提。

---

## 實作補註(2026-07-31,W42 收官)

> Accepted 之後**唔改上文任何一個字**(§6 慣例)。呢節記低落地後即刻發現嘅事實,同佢對每條決定嘅影響。

### 🔴 Consequences 嗰個「未證實前提」當日就證偽咗

上文 Consequences 寫住:本 ADR 假設 n8n 喺「SN 零 licence RITM」時會 POST 一個**空 `licenseItems`**;若佢根本唔 POST,D1 永遠唔會觸發。

**Chris 2026-07-31 確認 n8n 唔會送空 list**,並交出最新 workflow(`docs/06-reference/03-n8n-workflow/`,舊版改 `_bak`)。

> ⚠️ 該目錄係 **SEC-001 刻意 gitignored**(內含明文憑證),所以**唔會出現喺任何 clone / 其他 worktree**。下面嘅引用係本機實讀嘅結果;要核對原文要向 owner 攞 export。本節只引用**契約性內容**,零憑證。

實讀 1001 / 1005 嘅 `WF1 - Prepare UOP Intake`,真相**比「唔送空 list」更遠**:

n8n 早喺 **2026-07-26** 已經改成 **flat mode-based contract**,code 第二行逐字:

> `n8n sends user + OpCo + mode:1 ONLY. UOP owns the "new joiner -> E5" policy and resolves the SKUs.`

實際 payload(1001 同 1005 一致):

```json
{ "mode": 1, "targetUpn": "…", "targetDisplayName": "…", "opcoCode": "RHK",
  "requesterEmail": "…", "source": "1001-immediate", "requestId": "REQ0043858" }
```

POST 去 **hardcoded** `https://ca-uop-web…/api/requests/intake`,即 **canonical** route。

### 逐條影響

| 決定 | 狀態 |
|---|---|
| **D1**(冇 licence 行就注入 default) | ✅ **成立,而且係 n8n 明文交畀 UOP 嘅責任**。方向對咗。 |
| **D2**(只喺完全冇 licence 行時加;有 E3 唔加) | ⚠️ **實際失效** —— 冇 licence 行係**常態唔係例外**,「有 E3 就唔加」呢個分支喺呢個 contract 下永遠行唔到。 |
| **D3**(只放 `IntakeAdapterService`) | ❌ **接錯咗 route** —— n8n 打 canonical `/requests/intake`,唔經 adapter。 |
| **D4**(GUID + `kind:'sku'` 驗存在) | ✅ 不受影響,原樣重用。 |
| **D5**(native DTO `@ArrayMinSize` 1→0) | ❌ **無用** —— payload **根本冇** `licenseItems` 呢個欄位,唔係「空陣列」。 |
| **D6**(fail-soft) | ✅ 不受影響。 |
| **D7**(注入寫 audit / 配置錯只 log) | ✅ 不受影響,live 已驗。 |
| **D8**(唔反向開 RITM) | ✅ 不受影響。 |

### 保留 vs 重做

**保留**(已 live 驗證,新 contract 一樣要用):`ConnectorConfig.defaultOnboardingSkuId` + `kind:'sku'` 寫入驗證 · `applyDefaultSku` 注入邏輯 · `intake.default_sku_injected` audit · fail-soft · demo harness fixture。

**重做**(W43):**幾時觸發**(由「空 list」改成「`mode` 訊號」)同**掛喺邊條 route**(Chris 2026-07-31 拍板:**canonical route 內部分流** —— body 帶 `mode` 走新 handler,冇 `mode` 逐字不變,n8n 唔使改 URL)。

### 同批發現、屬 n8n 側嘅缺口(唔喺本 ADR 範圍)

1. URL 指 `ca-uop-**web**` 且帶 `/api` 前綴,而 UOP backend 本身冇 prefix —— 要確認 UAT ingress 有冇 rewrite,否則 404。
2. payload 註解講「交畀 UOP 嘅係 TASK:`serviceNowTaskNumber` + `serviceNowTaskSysId`」,**但兩個欄位都冇喺 payload 出現**。
3. `resolveOpco` 只認 RHK / RAPO,其餘返 `''` → 現行 UOP 會 404 `OpCo '' not found`。
4. `requestId` 係 REQ **number** 唔係 sysId;而平台冪等鍵係 sysId。
5. 2003 sticky 明講:E5 每張 onboarding 都 fire,**assigner 必須 skip 已持有 E5 嘅 user**。

## References

- `docs/01-planning/W42-onboarding-default-sku/plan.md`(本 ADR 觸發 phase)
- ADR-0008 **D6** — REQ/RITM 兩層鏡像(本 ADR 對佢開有界例外)
- ADR-0017 **D0/D4** — 只換執行器唔換決策者 · intake adapter 存在理由
- ADR-0013 — connector config Model C(非機密落 DB / secret 留 env)
- ADR-0009 **D4** — audit action 白名單
- `apps/api/src/fulfilment/intake-adapter.service.ts`(注入點)· `assign.service.ts:339`(冇 RITM 嘅 fallback)
- BACKLOG `Request-edit-more` — 反向 push 加行返 ServiceNow(延後)
