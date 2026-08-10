# ADR-0030 — Requester sys_id 由 REQ 自己個 `opened_by` 攞,唔再靠 n8n 送 email 反查

- **Status**:Proposed(2026-08-10)
- **Owner**:Chris Lai
- **Supersedes**:ADR-0025 **D1** 嘅「requester 來源」呢一格(D1 其餘部分 — `target_user` 係 placeholder、真 target 睇 `target_users_email` — **不變**,見 ADR-0026)
- **關聯**:ADR-0025(onboarding licence request creation)· ADR-0026(placeholder 永久化 + 逐表開權)· ADR-0008 D6(一個 request 一個 sysId)· DD-5

## Context

ADR-0025 **D1** 拍板:SN 個 `target_user` 係 **mandatory reference → `sys_user`**,收 sys_id 唔收 email,而 gate ② 講緊嗰個 joiner 未必同步咗去 SN ⇒ 所以用 **requester 做 placeholder**。

實作落咗 `direct-servicenow.provider.ts:211-225`:

```ts
const sysId = await this.snow.findUserSysIdByEmail(email);   // sys_user?sysparm_query=email=<addr>
if (!sysId) throw new Error('The requester was not found in ServiceNow, so the request cannot be raised');
```

**2026-08-10 診斷(W44 Day 6 + `INTAKE-REQUESTER`)三件實測,合起嚟推翻咗呢條路:**

1. 🔴 **2026-08-07 三次 n8n intake 全部掛喺呢一句** — `REQ0043934` / `REQ0044049` / `REQ0044057`,DEV container log 三行同一個 WARN;SN 側 cross-check 08-07 **一整日零新 RITM**。⇒ 端到端第 2 步(UOP 建 SN 單)**由 W43 交付到今日,喺真流量下一次都冇成功過**。
2. 🔴 **n8n 送嘅根本唔係「ServiceNow 用戶」** — `1001 - AD Management Workflow.json:1486`:
   ```js
   requesterEmail: conf.sender || (aiBrain.source_email || {}).sender || '',
   ```
   即係**觸發 onboarding 嗰封 Outlook email 嘅寄件人**。UOP 自己條 code 一早知道(`intake-adapter.service.ts:584` 讀 `dto.request.source?.sender`,comment 寫「anything odd coming out of the **Outlook trigger**」)。
3. 🔴 **失敗係必然,唔係偶發** — SN 側實測:`REQ0043934` 個 `opened_by` = `Operator@rapo.com.hk`,用**同一條** `email=` query **命中 1 行**(即係查詢方式本身冇壞);而整合帳號 **`n8napiservice1` 個 `email` 欄係空**,所以凡係佢開嘅單,email 反查**永遠**命中 0。

**根因唔係任何一邊寫錯,係接縫冇人對過**:n8n 個 `requesterEmail` 語意係「email 寄件人」,ADR-0025 D1 消費佢嗰陣當咗係「ServiceNow 用戶」。兩個 domain 之間冇任何保證對得上。

同時發現一個**現成而未用嘅資料源**:`resolveReqSysId()`(`intake-adapter.service.ts:545-565`)已經行緊 `getRecordByNumber(number, 'sc_request')`,而嗰個 method **冇落 `sysparm_fields`**(`servicenow.service.ts:172-183`)⇒ **成個 REQ record 已經喺手,`opened_by` 一直都喺入面,只係冇人攞。**

## Decision

### D1 — intake 路:requester sys_id 改由 REQ 自己個 `opened_by` 攞

`resolveReqSysId` 除咗 `sys_id`,順手 return `opened_by` 個 reference value(= sys_id),沿住 intake 一路帶落 submit payload。

**零額外 API call**(同一個 record),**零額外權限**(`sc_request` read 一直行緊,F7-6 證過)。

### D2 — `requesterEmail` 降級做 metadata,唔再係履行路徑嘅依賴

繼續存落 `Request.requesterEmail` 畀顯示 / audit 用,但**開單成唔成功唔再繫於佢**。`emailOrUndefined` 個 drop 規則不變。

### D3 — email 反查**保留**,但只服務 outbound 路

`DirectServiceNowProvider.submit` 有**兩個** caller:

| Caller | 有冇 REQ 可攞 | requester 來源 |
|---|---|---|
| intake adapter(n8n onboarding) | ✅ 有 | **`opened_by`(D1)** |
| `POST /requests`(IT 平台自己開單,W25) | ❌ 冇 — 張單就係佢而家要開嗰張 | 維持 email 反查 |

⇒ payload 加一個 **optional `requesterSysId`**:有就直接用,冇就行返 `resolveRequester(email)`。

🔴 **刻意唔做成「fallback 鏈」**:intake 路傳咗 `requesterSysId` 就**唔准**再跌返去 email 反查。跌返去只會令一個已知會失敗嘅路徑靜靜復活 —— 同 ADR-0026 D1 同一判斷(「a 0% path that is KNOWN to be 0% reads as a repair mechanism to whoever finds it next」)。

### D4 — 唔追溯改已 mirror 嘅 request

08-07 三張(同其後任何一張)靠 **Delivery failures 個 `REQUEST_SUBMIT` retry** 補,唔寫一次性 migration。`REQUEST_SUBMIT` 嘅語意本來就係「外面乜都冇改過,repair 就係重新 submit」(ADR-0011 D3),啱用。

## Alternatives Considered

**A1 — 叫 n8n 改送一個真 ServiceNow user 嘅 email**
最細改動,平台一行唔使郁。
🔴 **否決**:Outlook 寄件人**本質上**唔保證係 SN user(可以係 HR、外部、distribution list)。要 n8n 送一個「保證喺 `sys_user` 有 row」嘅地址,等於要 n8n 側自己做一次 user 解析 —— 把同一個問題推去一個**更難觀測**嘅地方,而失敗形狀一樣(靜靜開唔到單)。而且平台控制唔到 n8n,呢個依賴會一直係外部風險。

**A2 — 查唔到就 fallback 去一個固定 service account**
🔴 **否決**:兩重問題。①實測 `n8napiservice1` 個 `email` 欄**係空**,所以連 fallback 自己都查唔到 ②就算填返個 email,`target_user` 就會變成「一個同呢張單無關嘅帳號」,而 ADR-0026 已經把 `target_user` 定死做**永久 placeholder** — 再加一層假資料只會令 SN 側更加睇唔出邊個開單。D1 攞 `opened_by` 反而係**真相**。

**A3 — `target_user` 留空**
🔴 **否決**:mandatory reference,SN 會拒收。

**A4 — 放寬查詢(`emailLIKE` / 改查 `user_name` / 大小寫不敏感)**
🔴 **否決**:治標。實測證咗查詢方式**冇壞**(`Operator@rapo.com.hk` 命中 1 行),壞嘅係餵入去嗰個值嘅**語意**。而且放寬比對會抬高 `AmbiguousServiceNowUserError` 嘅機會 — ADR-0025 OQ-4 已經記低咗 ≥2 個 `sys_user` 共用地址呢個現實。

## Consequences

### 🟢 正面

- 端到端第 2 步由「真流量下 0% 成功」變成唔再依賴一個跨系統巧合
- **消除兩個失敗點**:反查 miss、反查 ambiguous(intake 路)
- 零額外 API call、零額外 SN 權限
- integration 帳號(email 欄空)照用得 — 因為根本唔經 email
- `requesterEmail` 送咩都唔再阻塞 ⇒ **唔使等 n8n 側改嘢**

### ⚠️ 代價 / 風險

- 🔴 **`SubmitPayload` 形狀改**(加 optional `requesterSysId`)⇒ `RequestSubmissionProvider` interface 改動,`N8nWorkflowProvider` 亦要跟住處理(即使佢暫時 fail-loud)。**呢個就係本 ADR 屬 H1 嘅原因。**
- ⚠️ **outbound direct 路個失敗點仍然喺度** — IT 自己開單嗰條路冇 REQ 可攞,依然靠 email 反查。本 ADR **唔解決佢**,只係令佢唔再影響 onboarding 主線。若將來 outbound 都撞同一個問題,要另開決定。
- ⚠️ **`target_user` 對 n8n 建嘅單會變成 `n8napiservice1`** — 因為 `REQ0044049`/`REQ0044057` 個 `opened_by` 實測就係佢。語意上企得住(ADR-0026 已定佢係**永久 placeholder**,真 target 睇 `target_users_email`),但 **SN owner 要知道**:睇 `target_user` 睇唔出真人,呢個係**設計**唔係 bug。
- ⚠️ **`opened_by` 理論上可以係空** — SN 冇保證。要 fail-loud(同 `resolveReqSysId` 搵唔到 record 一樣行 400),唔可以靜靜跌返去 email。
- ⚠️ 既有 test 要改:`direct-servicenow.provider.spec.ts` 兩條(`:291` 對 `/requester was not found/`、`:301` 餵 `requesterEmail: undefined`)語意變咗 — 佢哋而家守嘅係 **outbound 路**,要明寫出嚟,否則下手會以為 intake 都仲行嗰條。**H5 critical path**。

## References

- `apps/api/src/fulfilment/direct-servicenow.provider.ts:70`(call)· `:200-225`(`buildVariables` + `resolveRequester`)
- `apps/api/src/fulfilment/intake-adapter.service.ts:545-565`(`resolveReqSysId`)· `:583-597`(`requesterEmail` / `emailOrUndefined`)
- `apps/api/src/integration/servicenow/servicenow.service.ts:172-183`(`getRecordByNumber` — 冇 `sysparm_fields`)· `:300-315`(`findUserSysIdByEmail`)
- `docs/06-reference/03-n8n-workflow/phase 1/1001 - AD Management Workflow.json:1486`(n8n 個 mapping)
- W44 `progress.md` **Day 6** · BACKLOG `INTAKE-REQUESTER`
- ADR-0025 D1/D2 · ADR-0026 D1/D5 · ADR-0011 D3 · ADR-0008 D6 · CLAUDE.md §5 H1 / H5
