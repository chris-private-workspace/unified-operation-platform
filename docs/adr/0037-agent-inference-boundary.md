# ADR-0037: AI-Assist 嘅 inference 一律行公司 tenant 嘅 Azure OpenAI

**Date**: 2026-08-15
**Status**: **Proposed**(待 Chris 拍板）
**Decision content owner**: Chris Lai(2026-08-15 揀咗 provider）

> 🚧 同 ADR-0036 一樣,本文件住喺 branch `feat/w46-agent-runtime`,**未 merge 落 `main`**。
>
> 🔴 **點解係 `Proposed` 而唔係一寫出嚟就 `Accepted`**:Chris 2026-08-15 答咗嘅係「**用邊個 provider**」。而查證之後浮出嚟嘅三個後果 —— `AGENT_MODEL` 語意變咗、auth 有兩條路要揀、tracing **唔會**因為轉去 Azure 而變安全 —— 佢**未見過**。批一個佢冇見過後果嘅決定,就係本項目一路想避開嗰件事。

---

## Context

### 觸發

**W46 `OQ-7`**,由 F2 寫 `get_request` 嗰陣揭出嚟。ADR-0036 對 PII 有三道防線,而**三道全部係關於「落庫」同「送去 trace backend」**:

| 防線 | 擋住乜 |
|---|---|
| **D6** `scrubPii` | transcript **落 `AgentMessage`** 之前 |
| **D11** tracing 三重關 | tool call **送去 OpenAI trace backend** |
| **D5** 唔入 `AuditLog` | transcript **入審計表** |

**冇一道係關於 inference 本身。** 而 `AI-Assist` 嘅工作**就係**把 `rawRequestText`(一段真人寫嘅 email 原文,連 UPN 同姓名)送去一個 model provider。

📌 **值得記住嘅形狀**:D11 防到嘅係「順手開住嗰個 tracing」,防唔到「**呢個功能正常運作嗰陣本身做嘅嘢**」。一個 opt-in 嘅洩漏面比一個 default-on 嘅**更難見到**,因為佢冇一個 default 可以罵 —— 佢就係設計本身。

### Chris 2026-08-15 嘅答案

四個選項入面揀咗 **Azure OpenAI(公司 tenant)**。否決咗:OpenAI 公共 API + ZDR · OpenAI 公共 API 標準條款 · 送之前先 scrub。

### 五個查證過嘅事實(2026-08-15,對**已裝嘅 package** 查,唔係靠記憶）

> ⚠️ ADR-0036 初稿就係因為「假設咗一個 SDK 做唔到乜」而要整份改寫。所以以下每條都標明出處。

🟢 **① `@openai/agents-openai` 畀你換走底層 client。**
`node_modules/@openai/agents-openai/dist/defaults.d.ts:11` —— `setDefaultOpenAIClient(client: OpenAIClient): void`。

🟢 **② `openai@7` 自己就 ship 咗 Azure client。**
`node_modules/openai/azure.d.ts:34` —— `export declare class AzureOpenAI extends OpenAI`,constructor 收 `endpoint` / `apiVersion` / `deployment` / `azureADTokenProvider`。

⇒ ①+② 合埋:**接 Azure 唔使改 tool 定義、唔使改 registry、唔使改 adapter 邏輯**,只係喺 boot 嗰陣塞一個唔同嘅 client 落去。

🔴 **③ 設咗 `deployment`,base URL 就會被改寫。**
`azure.d.ts:19-20` 原文:*"A model deployment, if given, sets the base client URL to include `/deployments/{deployment}`. Note: this means you won't be able to use non-deployment endpoints."*

⇒ **喺 Azure 之下,`AGENT_MODEL` 收嘅係一個 deployment 名,唔係一個 model 名。** 兩者可以完全唔同字(deployment 名係開嗰個人自己改嘅)。

🟢 **④ 可以用 Entra token,唔一定要 static key。**
`azure.d.ts:54` constructor 收 `azureADTokenProvider`。而平台已經持有 Entra 憑證(ADR-0028)。

🔴 **⑤ SDK 有一個「冇人揀過」嘅 default model。**
`defaults.d.ts:3` —— `DEFAULT_OPENAI_MODEL = "gpt-5.6-luna"`。

我哋今日**去唔到**嗰度,因為 `openai-agents.provider.ts:324-332` 個 `resolveModel()` 未配就 **503**。但要講清楚:**擋住呢件事嘅係我哋自己嗰段 code,唔係 SDK 嘅性質** —— 邊個第日喺第二個地方 `new Agent({...})` 而唔填 `model`,就會靜靜行一個冇人揀過嘅 model,去一個冇人揀過嘅 endpoint。

---

## Decision

### E1 —— AI-Assist 嘅 inference 只准打公司 tenant 嘅 Azure OpenAI resource

唔准打 `api.openai.com`。呢條係本 ADR 嘅實質內容,其餘幾條都係佢嘅後果。

**論據唔係「內容變少咗」,係「收件人變咗」**:原文仍然係原文(見 **E6**),但佢只喺「公司 ↔ Microsoft」之間流動 —— **同平台今日打緊嘅 Graph / M365 / Entra 完全同一個信任面**。⇒ 本決定**唔擴闊**平台嘅第三方暴露面,而其餘三個選項每一個都會。

### E2 —— 接法 = 換 client,唔改任何 agent 側嘅嘢

boot 嗰陣 `setDefaultOpenAIClient(new AzureOpenAI({ endpoint, apiVersion, deployment, … }))`。

🟢 **`AgentToolRegistry`、五個 tool、`toSdkTools()`、`normaliseTurn()`、`resume()` 一個字唔改。** 呢個係 **ADR-0036 D1 第一次被真嘢測試** —— D1 當時嘅承諾係「換 runtime 唔使動 tool 定義」,而今次換嘅仲要唔係 runtime,只係佢下面個 endpoint,所以佢應該連 adapter 都唔使動。**如果實作嗰陣發現要改 registry,咁就係 D1 錯咗,要返轉頭講,唔係喺呢度硬塞。**

### E3 —— 🔴 `agentModel` 喺 Azure 之下係 **deployment 名**,而呢件事要喺 code 同 `.env.example` 講明

事實③ 嘅直接後果。個欄名**唔改**(改一個已經有 migration 嘅欄名,成本大過佢解決嘅混淆),但:

- `.env.example` 同 `ConnectorConfig` 個描述要明文寫「Azure 之下呢度填 **deployment name**」
- **OQ-1 嘅問題本身變咗**:由「揀邊個 model」變成「**喺公司個 Azure OpenAI resource 開邊個 deployment、叫咩名**」 —— 而後者係一個**要 infra 做嘢**嘅問題,唔係一個揀嘅問題

### E4 —— Auth 兩條路,**未揀**;但無論揀邊條,secret 只落 env

| | 好處 | 代價 |
|---|---|---|
| **A. `azureADTokenProvider`**(Entra) | 冇新 static secret 要輪換;跟平台已有嘅身份模型 | 要 infra 喺 Azure OpenAI resource 上面開 role assignment |
| **B. API key** | 即刻用得 | 多一個 secret,而 ADR-0036 已經記低 client secret **2028-07-28 到期**(RISK R8)—— 呢類到期日**冇嘢會提你** |

**建議 A,但唔喺本 ADR 拍板** —— 佢取決於 infra 點開個 resource,而本項目歷史上凡係「假設 infra 會點做」都錯(B1 / B4 / B7 / B8 / B9 五次)。

🔴 **兩條路共通:key / credential 一律只落 env,永遠唔入 DB / API 回應 / audit**(ADR-0036 D10 · ADR-0013 Model C · H4)。

### E5 —— 🔴 Tracing **維持一律關**,而且轉去 Azure **唔會**令佢變安全

ADR-0036 D11 一個字唔改。但要明文寫低一個**極易誤讀**嘅位:

> **trace exporter 打嘅係 OpenAI 嘅 backend,同你把 inference 指去邊個 endpoint 完全無關。**

⇒ 「我哋轉咗去 Azure」**唔係**「PII 唔會出去」。inference 唔出去咗,trace 仍然會 —— 如果有人關咗 D11 嗰三重關。**D11 喺呢個 ADR 之後唔係變得冇咁重要,係變得更加係唯一防線**,因為身邊多咗一句聽落好安心嘅話。

### E6 —— `get_request` 仍然原文回傳 `rawRequestText`

F2 今日就係咁做,**唔改**。理由 = plan §7 OQ-7 第 3 點:parse 嗰段文字**就係** AI-Assist 本身,scrub 咗就係交白卷。

本 ADR 冇令呢件事變得冇風險,佢只係令**收件人**由一個新嘅第三方變成一個平台本來就信住嘅一方。呢個分別要講清楚,唔好讀成「問題解決咗」。

### E7 —— 本 ADR 只答咗 OpenAI 嗰半

ADR-0036 D9 講明 Claude 側(期二 G4,Tool Runner)遲啲會加。**佢會重新開返同一條問題** —— Anthropic 唔喺公司個 M365 / Azure 信任面入面。

⇒ **G4 開工之前要再答一次 OQ-7,唔可以引用本 ADR 當已答。** 寫喺呢度,係因為「一條問題答過一次就當永遠答咗」正正係本項目 §9 記低過嗰種漂移。

---

## Alternatives Considered

- **OpenAI 公共 API + ZDR** —— **rejected**(Chris)。技術上行得通,而且 ADR-0036 事實④ 嗰個「ZDR 用唔到 tracing」嘅代價**喺我哋身上等於零**(D11 反正一律關)。真正嘅代價唔喺呢度:佢**多咗一個第三方**入信任面,而且要等 provider 側審批。
- **OpenAI 公共 API,標準條款** —— **rejected**(Chris)。最快,但真人 email 原文交去一個新嘅第三方,而確實條款要另外覆核。
- **送之前先 scrub** —— **rejected**(Chris)。唯一會改 F5 code shape 嗰個。而且要先實測 agent 見到 `[redacted-email]` 之後仲 parse 唔 parse 到 SKU —— 有機會直接令 AI-Assist 交白卷,即係用「功能唔work」換「冇 PII」。
- **只送摘要唔送原文** —— **rejected**。個摘要本身要一個 LLM call,而嗰個 call 一樣要收原文 ⇒ 淨係把同一件事推遲一層,兼多一次 inference。
- **Chosen —— Azure OpenAI(公司 tenant)**。理由:佢係四個入面**唯一唔擴闊第三方信任面**,而且唔使犧牲功能(對比 scrub)或者等外部審批(對比 ZDR)。

---

## Consequences

### Positive

- 🟢 **信任面唔擴闊** —— 原文只喺公司同 Microsoft 之間,同 Graph / M365 / Entra 同一個面
- 🟢 **ADR-0036 D1 第一次有真嘢驗證**(E2)—— 換 endpoint,tool 定義零改動
- 🟢 **可以行 Entra 而唔係一個新嘅 static secret**(E4 A)
- 🟢 `@openai/agents` **唔使換走**,H2 冇新 dependency(`openai@7` 已經係 `@openai/agents` 嘅 transitive)

### Negative

- 🔴 **W46 第一個外部依賴** —— 要 infra 開 Azure OpenAI resource + deployment。本項目歷史上 infra 依賴**每一次都要等**(B1 image build · B4 `join/action` · B7 log 權限 · B8 DNS · B9 app registration)⇒ **A14 live 驗嘅時間表由呢件事決定,唔由 code 決定**
- 🔴 **`AGENT_MODEL` 語意變咗**(E3),而填錯一個 deployment 名 = **404**,錯誤訊息唔會提你「你打緊嘅係 Azure、呢個係 deployment 唔係 model」
- 🔴 **Azure OpenAI 嘅 model 供應落後公共 API** ⇒ OQ-1 嘅選擇面細咗,而且「今日有邊啲」要真查
- ⚠️ 設咗 `deployment` 之後 **non-deployment endpoint 用唔到**(事實③)—— 今日冇 caller 需要,但係一個要記住嘅約束

### Neutral

- `AgentToolRegistry` / D0 / D1 / D2 / D3 / D4 一個字唔郁
- D11 tracing 三重關**一個字唔郁**(E5 只係補一句點解佢更重要)
- Claude 側(D9 / G4)**唔受影響,亦冇被本 ADR 答到**(E7)

### 殘留風險

| ID | Risk |
|---|---|
| **R17** | deployment 名寫錯 → 404,而錯誤訊息完全唔提示「deployment ≠ model」⇒ 會被誤診成「model 唔存在」或者「key 錯」 |
| **R18** | 🔴 **「轉咗 Azure」被讀成「PII 問題解決咗」** ⇒ D11 三重關被鬆懈。呢個係本 ADR 自己製造嘅風險(E5) |
| **R19** | Azure OpenAI resource 由 infra 持有 ⇒ 佢改配置 / 刪 deployment,平台側只會見到 404,冇任何事前信號 |

---

## References

- **ADR-0036** —— 本 ADR 補佢一個缺口(**唔 supersede**:D6 / D11 / D5 三道防線全部仍然成立,佢哋只係從來冇管過 inference 嗰個面)
- `docs/01-planning/W46-agent-runtime/plan.md §7 OQ-7` —— 問題原文同五條要答嘅嘢
- **ADR-0013** —— Model C:非機密欄落 DB,真 secret 只落 env(E4)
- **ADR-0028** —— 平台已持有嘅 Entra 憑證(E4 A 嘅前提)
- **INC-001** —— 「唔可以靠自律,要靠架構」;E5 就係呢個 —— 一句安心嘅話唔係一道防線
- **已裝 package 實查(2026-08-15)**:
  - `node_modules/@openai/agents-openai/dist/defaults.d.ts:3,11` —— `DEFAULT_OPENAI_MODEL` · `setDefaultOpenAIClient`
  - `node_modules/openai/azure.d.ts:19-20,34,54` —— `AzureOpenAI` · `deployment` 改寫 base URL · `azureADTokenProvider`
  - `apps/api/src/agent/openai-agents.provider.ts:324-332` —— `resolveModel()` 未配就 503
