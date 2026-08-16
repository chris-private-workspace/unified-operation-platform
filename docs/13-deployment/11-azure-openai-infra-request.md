# 11 — Azure OpenAI:治理前置 + infra 請求(草稿,未發出)

> **狀態(2026-08-16)**:🟡 **草稿寫好晒,路已揀 = B(`Q0` 擺第一條),但未發出 —— 而「幾時發」仲未決定。**
>
> 🔴 **發之前要答嘅唔係本文件入面任何一條,而係:`A14`(live 驗)要唔要而家解封?**
> - **要** → 就要發,因為冇第二條路:`ADR-0037 E1` 禁止打 `api.openai.com`,而公司 tenant 嘅 Azure OpenAI resource **唔存在** ⇒ 一定要人開
> - **唔要** → **本文件原封不動放喺度**,`A14` 標 blocked,期一剩返 `F10-2`,期二 `G1–G7` 全部 LLM mock、唔使真 endpoint
>
> ⚠️ **infra 依賴唔係今日先出現嘅** —— `ADR-0037` Negative 第一條就係「W46 第一個外部依賴…**A14 live 驗嘅時間表由呢件事決定,唔由 code 決定**」,而 `E4` / `OQ-1` 兩個 deferred 項嘅 Target 逐字就係「infra 確認咗個 Azure OpenAI resource 點開之後」。**但 timing 係 owner 話事,冇嘢逼住即刻發。**
> **目的**:解封 `ADR-0037 E4`(auth 兩條路未揀)+ W46 `OQ-1`(deployment 名)+ `F11-2 / A14`(live 驗)。
> **Phase**:W46 `agent-runtime`。**決策 SSOT** = `ADR-0037`。
> **點解兩件事一次過問**:兩個都取決於同一件事 —— infra 點開個 resource。分開問會問兩次,而本項目 infra 往返每次都以星期計(B1 / B4 / B7 / B8 / B9 五次)。
>
> **格式沿用 W44 附錄 C 嗰個兩層分法**(`W44-azure-dev-deploy/plan.md:333`):上面係我哋自己嘅工作記錄,下面 `📤` 個 code block 先係真正發出去嗰段字。**刪走內部細節唔係簡化,係移走會分散注意嘅嘢。**

---

## 🔴 Part A —— 發出去之前,內部要先決定一件事

**呢個唔係一張普通 infra ticket,而個障礙係我哋自己文件入面寫住嘅。**

`05-rci-par-process.md:4`:

> **RCI** = Regional Cloud Infrastructure…**開資源前必經 PAR**。

而同一份 PAR Section 1 輸入 pack(`:54`)**明文申報過我哋冇 Azure OpenAI**:

> `├ AKS / Blob / **Azure OpenAI** / Event Grid | ✅ **暫無**(Redis/BullMQ 未 wired;**AI 屬未來 tier**)`

⇒ **開一個 Azure OpenAI resource,同我哋已經寫落 PAR 嗰句直接相反。** 而 PAR 簽核鏈(`:20`)包括 **Reg. Information & Security Manager · GM CISO IT · Chief Digital Officer** —— 佢哋 endorse 嘅係一個**資料流向態勢**,而本次改動正正就係加一條「真人 email 原文 → 一個新 Azure 服務」嘅資料流。

🔴 **`05:30` 自己嗰句填表原則,反方向一樣成立**:

> 填「private access」而實際 `--public-access 0.0.0.0`,等於**向治理機構描述咗一個唔存在嘅態勢**。

申報「Azure OpenAI 暫無」然後靜靜開一個,係同一個錯誤嘅鏡像。

### 四件已知事實(唔係推論)

| # | 事實 | 出處 |
|---|---|---|
| 1 | **PAR 由頭到尾未提交** —— Section 1 仍有 `🔲 待 Chris` 欄 | `05-rci-par-process.md:95-97` · `BACKLOG.md` `PAR-as-built` 行 |
| 2 | 嗰份 PAR 寫嘅係 W32/W33 個「Azure UAT」,而嗰個環境**已確認係誤名**(自建孤島,同企業網零連繫)—— **唔係**而家用緊嘅 `RG-RAPO-UOP-DEV` | `07-uat-as-built.md` 頂 blockquote · CLAUDE.md §9 |
| 3 | **「DEV 呢個環境要唔要走 PAR」一早寫低咗「要問」,而佢從來冇問過** | `09-dev-as-built.md:125`「**治理**:RCI 側對自建資源有冇要求(PAR),要問」 |
| 4 | 🔴 **`RG-RAPO-UOP-DEV` 本身,就係 infra 喺我哋一份 PAR 都未交嘅情況下 2026-08-04 開畀我哋嘅** | CLAUDE.md §9 · `09-dev-as-built.md` · 事實 1 |

### ⚠️ 事實 4 收窄咗上面幾段(2026-08-16 自我更正)

本段初稿把 `05:4`「開資源前必經 PAR」讀成**一定成立**,然後由嗰度推出「有治理障礙」。**事實 4 就喺手邊,而我冇對返佢** —— 我哋而家用緊嘅整個 RG,本身就係喺零 PAR 之下開出嚟嘅。

⇒ **「必經 PAR」呢句喺 DEV 呢個環境,實際上係反例多過正例。**

呢個**唔取消** `Q0`(佢仍然要問,因為 infra 側可能有佢哋自己嘅內部流程,而我哋只知道**我哋**冇交過一份),但佢改變咗語氣:**呢度係一條未答嘅治理問題,唔係一道已知嘅閘。** `Q0` 個問法由頭到尾都係「要唔要」,冇假設「要」—— 呢一點初稿冇寫錯,錯嘅係包住佢嗰段敘述。

📌 **形狀**:由一句文件上嘅規定,推去一個更強嘅結論,而反例就喺同一份文件旁邊 —— 同 §9 記低嗰族(`az acr list` vs `show` · `docker login` vs `push` · ACA FQDN vs custom domain)同源。

### 🟢 已揀:B(Chris 2026-08-16)

| | 路 | 代價 |
|---|---|---|
| ~~A~~ | ~~先淨問治理一條,答完先發技術請求~~ | ~~多一個往返~~ |
| 🟢 **B** | **兩樣同一封發**,`Q0` 擺第一條 | 一次過。若答案係「要行 PAR」,下面啲技術答案**本身就係 PAR Section 1 要填嘅嘢** ⇒ **一個字都唔會白寫**(逐條對照見下) |

> 📌 冇列第三條「當一般資源請求發」—— 事實 1–3 之下佢係明知有治理問題而繞開,而 `W44 plan.md:309` 個教訓係:**留住一個死路選項唔係保留彈性,係引人揀錯。**

### B 個賣點要兌現得到 —— 五條答案逐條對返 PAR Section 1 邊個欄

**唔係口講「唔會白寫」,係真係逐格對得上。** 呢張表亦即係話:一旦 `Q0` 答「要行 PAR」,我哋唔使重新收集資料,只需要把回覆填入去。

| 問題 | 填入 PAR Section 1 邊度 | 備註 |
|---|---|---|
| **Q0** 治理 | 流程本身(交唔交 / 交新定修訂) | 亦順帶答返 `09-dev-as-built.md:125` 掛咗成個月嗰條 |
| **Q1** auth | **User Access / Authentication** 段 | Option A 會令段落多一句「service-to-service 行 managed identity」;Option B 就會多一個 secret 要喺 `02-environment-reference.md` 登記 |
| **Q2** model / deployment | **System Component Specification › Other Resources** | 🔴 就係要把 `:54` 嗰行 `Azure OpenAI ✅ 暫無` **改成實際值**,而呢個修改本身就係整件事嘅治理核心 |
| **Q3** abuse monitoring | **Security requirements**(RIT 填,`:88`)+ 資料處理描述 | 🔴 **Security Manager endorse 嘅就係呢格。** 若答案係「有人手覆核」,PAR 上面就唔可以寫成「內部封閉」 |
| **Q4** outbound | **Communication protocol between components** 表 | 要加一行 `uop-api → Azure OpenAI · HTTPS · 443`。⚠️ **呢行同 `05:64` 嗰條被劃走嘅 Key Vault 行剛好相反** —— 嗰條係「唔存在所以唔准填」,呢條係「會真係存在所以一定要填」,兩者同一條原則 |

> 🔴 **但 Section 1 本身仲有七格未填,而 PAR 由頭到尾未提交。** 2026-08-16 整理咗一張「**Chris 填呢七格就夠**」+ 填空表落 `05-rci-par-process.md`(BACKLOG `PAR-submit`)。⇒ **`Q0` 若答「要行 PAR」,除咗本份嘅回覆之外,仲要嗰七格。** 兩件事一齊睇先算齊。

---

## Part B —— 內部版(逐條解釋點解要問)

### B1 要開嘅嘢

| # | 要乜 | 備註 |
|---|---|---|
| 1 | Azure OpenAI resource,公司 tenant | 首選 `eastasia`(同平台其餘資源一致,`05:46` RCI1 HK)。開唔到就講返邊個 region 得 |
| 2 | 一個 model deployment | 揀邊個見 Q2 |
| 3 | 平台側存取權 | 見 Q1 |

### B2 開完要回報嘅四樣

| 值 | 落邊個 env | 點解要 |
|---|---|---|
| Endpoint URL | 新 `AZURE_OPENAI_ENDPOINT` | — |
| 🔴 **Deployment name** | **`AGENT_MODEL`** | 見下面警告 |
| API version | 新 `AZURE_OPENAI_API_VERSION` | — |
| Auth 憑證 | 視乎 Q1 | — |

🔴🔴 **「deployment」呢個字係本請求最高風險嘅一個詞,而我哋有先例。**

`ADR-0028:35` 記低咗 **"Application ID URI" 三輪往返都攞唔到** —— infra 分別答咗「web portal 網址」「OAuth authorization endpoint」「Application ID」,三個都係**合理解讀**。`W44 progress.md:605` 個結論:

> 三次都答唔到同一條問題,值得懷疑嘅唔係對方,係「呢條問題係咪一定要問」。

**"deployment" 完全同一族**:對 infra 嚟講呢個字預設係 **ARM deployment**,唔係「model deployment」。⇒ 發出去嗰段字**必須自己解釋清楚個詞**,唔可以齋問。已經寫咗喺下面 `📤` 版。

⚠️ 另外:設咗 `deployment`,SDK 會把 base URL 改寫成 `…/deployments/{deployment}`(`openai/azure.d.ts:19-20`)。填錯 = **404**,而錯誤訊息**唔會提示**呢件事(RISK **R17**)。

### B3 五條問題,同各自點解要問

| Q | 問乜 | 點解 |
|---|---|---|
| **Q0** | 治理 / PAR | Part A。**擺第一條**(Chris 揀 B),因為佢個答案會決定下面四條幾時有人睇 |
| **Q1** | auth 行 Entra 定 API key | = `ADR-0037 E4`。🔴 **A 有一步我哋做唔到**:role assignment 要 `Microsoft.Authorization/roleAssignments/write`,而我哋個 SP(`d2f094a3-…`)喺 `RG-RAPO-UOP-DEV` **只有 Contributor** ⇒ 無論 resource 開喺邊,呢步都要佢哋做。<br>⚠️ 亦要講明 `aca-rapo-uop-api-dev` **今日冇 managed identity**(`aca-dev.json` grep `identity` = **0**) |
| **Q2** | 開邊個 model | = `OQ-1`。**問「有咩開得到」唔係叫佢開一個特定型號** —— 沿用 `W44 checklist.md:247` 嗰個問法(「問係咩,唔係叫佢設定」),因為 Azure OpenAI 嘅供應同 region 有關,而我哋證唔到邊個喺公司 tenant 開得到 |
| **Q3** | abuse monitoring / prompt 保留 | 🔴 **呢條係 `E1` 個論據本身**。E1 話「收件人變咗,同 Graph / M365 同一個信任面」——**呢句只喺冇第三方人手覆核嘅前提下成立** |
| **Q4** | ACA outbound 通唔通 | B3(ACA 有 VNet 但打唔入內網)+ B8(custom domain 企業 DNS 冇記錄)兩次都係「以為通」⇒ 寧願先問 |

### B4 我哋自己要做嘅嘢(唔屬 infra,唔好寫入請求)

- 🚧 `openai-agents.provider.ts` **今日零 Azure 接線** —— 只有 `resolveModel()`(未配就 503)。`E2` 講嘅 `setDefaultOpenAIClient(new AzureOpenAI({…}))` **未寫**
- 🚧 `deploy/azure/aca-dev.json` **零個 `AGENT_*` / `OPENAI_*` env**(實測 grep = 0)⇒ 部署 template 要加
- 🚧 `connectors.ts` 只有 `agentRuntime` / `agentModel` + 兩個 API key。`endpoint` / `apiVersion` **未有位放**,而佢哋**唔係 secret** ⇒ 應入 `ConnectorConfig`(ADR-0013 Model C),唔係齋落 env
- 🚧 `.env.example` 要明文寫「Azure 之下 `AGENT_MODEL` 填 **deployment name**」(`E3`)

### B5 三條殘留風險

| ID | Risk | 本請求點減佢 |
|---|---|---|
| **R17** | deployment 名寫錯 → 404,訊息唔提示 | `📤` 版**逐字解釋咗個詞**兼要求原文回報 |
| **R18** | 🔴「轉咗 Azure」被讀成「PII 問題解決咗」 | **Q3 本身就係防 R18** —— 答案若係「有人手覆核」,`E1` 個論據就要收窄 |
| **R19** | resource 由 infra 持有,佢改配置我哋只見 404 | **未減**。要期二 `G7` 加監測 |

### B6 ⚠️ 一件我哋唔可以自己答嘅嘢

**Q3 我係由記憶寫嘅,repo 入面冇任何嘢證實得到。** 所以佢寫成「請確認」而唔係一句結論。**唔好因為 ADR-0037 已經 `Accepted` 就當呢條唔使問** —— `09-dev-as-built.md:224` 嗰條教訓喺度:

> **一個未實測嘅答覆,同一個未問嘅問題,喺風險上係同一樣嘢** —— 分別只在於前者令人唔再追。

---

## 📤 精簡版 —— 直接發出去嗰段(英文,沿用 W44 先例)

```
Hi team,

We need one new Azure resource for the Unified Operation Platform (UOP)
DEV environment, plus answers to a few questions before we wire it up.

BACKGROUND (short)
UOP is adding a feature that reads the free-text remark on an onboarding
request and SUGGESTS which M365 licences the joiner needs. A human always
approves before anything happens; the platform never assigns on its own.

That feature needs an LLM. We deliberately do NOT want to use the public
OpenAI API, because the remark is a real person's email text and contains
names and UPNs. Using Azure OpenAI in our own tenant keeps that text within
the same trust boundary as Graph / M365 / Entra, which the platform already
talks to.

--------------------------------------------------------------------
0) FIRST, A GOVERNANCE QUESTION

Does standing up an Azure OpenAI resource require a PAR?

Our PAR Section 1 pack currently declares "Azure OpenAI: none (AI is a
future tier)", so this change contradicts what we already wrote. Also note
that pack has not been submitted yet, and it describes our earlier
self-built test environment rather than RG-RAPO-UOP-DEV.

  - Is a PAR required for this?
  - If yes: a new one, or an amendment to the un-submitted one?
  - Is there any separate AI-usage / data-processing approval to go through?

If a PAR is needed, the answers below are exactly what its Section 1 asks
for, so nothing here is wasted.

--------------------------------------------------------------------
1) WHAT WE NEED

  a. One Azure OpenAI resource in the company tenant.
     Preferred region: eastasia (same as the rest of the platform).
     If the model we need is not available there, please tell us which
     region does have it and we will re-evaluate.

  b. One model deployment on that resource (see question 2 below).

  c. Access for the platform (see question 1 below).

Scope note: we only need this for DEV (RG-RAPO-UOP-DEV, subscription
rcitest). Nothing for UAT or production in this request.

--------------------------------------------------------------------
2) QUESTIONS

Q1 - AUTHENTICATION: which route can you support?

  Option A (our preference) - Entra / managed identity:
     - enable a system-assigned managed identity on container app
       "aca-rapo-uop-api-dev" (RG-RAPO-UOP-DEV, subscription rcitest)
     - grant that identity the "Cognitive Services OpenAI User" role on
       the Azure OpenAI resource
     Benefit: no new static secret for anyone to rotate.

  Option B - API key: just send us the key.

  Two things worth flagging so this does not need a second round:
     - The role assignment has to come from your side either way. Our
       service principal (d2f094a3-...) only has Contributor on
       RG-RAPO-UOP-DEV, and Contributor cannot create role assignments.
     - That container app has no managed identity today, so Option A
       needs it enabled first.
     - If you would rather use a custom role than the built-in one, that
       is fine - our only hard requirement is permission to make
       inference calls against the deployment.

Q2 - WHICH MODEL CAN YOU DEPLOY?

  We are asking what is available rather than naming one, since
  availability depends on region and tenant.

  Must have:
     - tool / function calling, and it must work across multiple turns
       (the agent calls several tools in sequence before answering)
     - structured JSON output (we only accept SKU GUIDs, never SKU names)
     - 8k-32k token context is plenty

  Not needed:
     - vision, audio, embeddings, fine-tuning, very long context

  Expected volume: this is a pilot. One call per request, triggered by a
  person clicking a button. Under 100 calls per day for the foreseeable
  future, so no high TPM quota is required.

Q3 - ABUSE MONITORING AND PROMPT RETENTION

  This one matters to us more than it might look, because it is the whole
  reason we chose Azure over the public API.

  Our understanding - please correct us, we would rather not guess - is
  that Azure OpenAI by default retains prompts and completions for a
  period for abuse detection, and that flagged content can be reviewed by
  Microsoft staff; and that there is a "modified abuse monitoring"
  (Limited Access) application that turns that off.

  Could you confirm:
     - is that default active on our tenant, and for how long is content kept?
     - can Microsoft staff see the content?
     - has the company applied for (or can it apply for) modified abuse
       monitoring?

  We ask because the text we send contains real names and UPNs. Our
  argument for using Azure was "the recipient is Microsoft, same trust
  boundary as Graph and M365" - and Graph and M365 do not have humans
  reading our data. If that difference exists, we need to know before we
  switch this on.

Q4 - OUTBOUND NETWORK

  Container app "aca-rapo-uop-api-dev" runs on the shared ACA environment
  "acaen-rapo-dev", which is integrated with vNet-RCITest-HKG.

  Can that app reach https://<name>.openai.azure.com/ outbound on 443?
     - if there is a UDR or firewall on the VNet egress, does anything
       need to be allow-listed?
     - or would you rather we use a private endpoint? If so please create
       it - we do not need this resource reachable from the internet.

  We ask up front because we have been caught twice by assuming
  reachability: the ACA environment has VNet integration but cannot reach
  the corporate network, and our custom domain had no corporate DNS record.

--------------------------------------------------------------------
3) WHAT WE DO NOT NEED

  - No access to the public OpenAI API (api.openai.com)
  - No fine-tuning, custom models, or training-data upload
  - No embeddings, vector store, or Azure AI Search
  - No tracing/telemetry export. The SDK sends tool calls to OpenAI's
    tracing backend by default and we explicitly disable that in three
    places, so please do not enable anything of that kind.
  - Nothing for UAT or production

--------------------------------------------------------------------
4) VALUES TO SEND BACK

  IMPORTANT - about "deployment name": in Azure OpenAI, a "deployment" is
  the name you choose when you deploy a model onto the resource. It is NOT
  an ARM/infrastructure deployment, and it does NOT have to match the
  model name - whoever creates it picks the string. Our configuration
  takes that exact string, and if it is wrong the only symptom is an HTTP
  404 that says nothing about deployments. So please send it verbatim,
  copied rather than retyped.

  Endpoint URL        : ______________________________________
                        (e.g. https://<name>.openai.azure.com/)
  Deployment name     : ______________________________________
  Model behind it     : ______________________________________
  API version         : ______________________________________
  Auth route (A or B) : ______________________________________
  If B, the key       : ______________________________________
                        (please send through whatever channel you
                         normally use for secrets, not e-mail)

Thanks,
Chris
```

---

## Part C —— 解封對照

| ID | 卡住嘅嘢 | 由邊條答案解封 |
|---|---|---|
| `ADR-0037 E4` | auth 兩條路未揀 | **Q1** |
| W46 `OQ-1` | deployment 名 | **Q2** + 回報表 |
| W46 `F11-2 / A14` | live 驗 | 全部 |
| 🆕 治理 | DEV 環境要唔要 PAR(`09-dev-as-built.md:125` 問咗但冇問過) | **Q0** |

⚠️ **收到回覆之後要即刻做嘅事**(`W44 progress.md:1207`):

> 🔴 **「卡環境」呢個標籤自己會過期,而冇人負責令佢過期** ⇒ **解封一個 blocker 之後,要即刻掃返所有標住佢嘅 item。**

本份一有回覆,要掃:`ADR-0037 E4` · W46 `checklist.md` 三行延後表 · `plan.md §7 OQ-1` · `BACKLOG.md` W46 行。

⚠️ 亦要記住 `09-dev-as-built.md:224`:**一個未實測嘅答覆,同一個未問嘅問題,喺風險上係同一樣嘢。** 收到 Q1–Q4 嘅答案唔等於解封,真接得通先係。
