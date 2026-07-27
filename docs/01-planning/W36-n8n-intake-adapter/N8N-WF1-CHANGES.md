---
phase: W36-n8n-intake-adapter
deliverable: F1c
status: 待 Chris 喺 n8n UI 執行
owner: Chris Lai(n8n workflow 管理者)
---

# F1c — n8n 側 WF1 改動指示(1001 + 1005)

> **點解要改**:Chris 2026-07-27 拍板 **發現 B**(送 `jobFunction` 唔送 AI 抽嘅 `department`)+ **發現 C**(payload 用 validated 值)。
> **好消息**:所有需要嘅值 **已經喺上游 node 現成**,唔使新增運算,只係改讀邊個 node。
> **證據**:`prepare approval data` 個 return block 實讀(`1001` JSON),見下 §0。
> **平台側對應**:`MAPPING.md §1` 18 條精確 key 表 · adapter fail-closed(ADR-0017 D4)。

---

## 0. 前提事實(實讀 `1001` node `prepare approval data` 個 return)

```js
return [{ json: {
    department: department,        // 保留 AI Brain 原始值用於顯示   ← 而家 WF1 送緊呢個
    // User details (validated by 1004)
    username: username,            // ✅ validated
    sAMAccountName: sAMAccountName,// ✅ validated
    derivedEmail: derivedEmail,    // ✅ validated（validated username + jobFunction 推 domain）
    firstName, lastName, activateDate, copyFromEmail,
    ...
    jobFunction: jobFunction,      // ✅ 1004 form dropdown 精確值 ← 應該送呢個
} }];
```

⇒ `jobFunction` 同 validated 三寶**已經存在**,只係 `WF1 - Prepare UOP Intake` 冇讀佢,而係去咗讀 `$('Ultimate AI Agent')`。

---

## 1. 1001 — `WF1 - Prepare UOP Intake`(即時路徑)

### 改動

| 欄位 | 現時(AI Brain,未驗證) | 改成(validated) |
|---|---|---|
| `request.department` | `u.department` | **`p.jobFunction`** |
| `targetUser.firstName` | `u.firstName` | `p.firstName` |
| `targetUser.lastName` | `u.lastName` | `p.lastName` |
| `targetUser.username` | `u.candidateUsername` | **`p.username`** |
| `targetUser.email` | `u.derivedEmail` | **`p.derivedEmail`** |
| `targetUser.validated` | `false` | **`true`** |
| `targetUser.sAMAccountName` | (冇) | **`p.sAMAccountName`**(新增,方便平台日後對帳) |

### 加一行取得 `p`

```js
const p = $('prepare approval data').first().json;
```

### 保持不變(仍然讀 AI Brain —— 呢啲冇 validated 版本)

`event` · `idempotencyKey` · `sentAt` · `request.requestId` · `request.openedDate` · `request.remarks` · `request.source.{subject,sender}` · `targetUser.raw` · **`licenseItems[]` 整個**(來自 `aiBrain.other_items`)· `_uopNeeded` gate 邏輯。

> ⚠️ **gate 唔好郁**:`lic = other.filter(it => it.status === 'pending_license' || /O365/i.test(it.ritmTitle))` 保持原樣。

---

## 2. 1005 — 排程路徑(三個 node)

### 2.1 現況比 1001 更接近正確

1005 個 `WF1 - Prepare UOP Intake` 已經讀 `ctx.username` / `ctx.derivedEmail`,而 `execution_context` 嗰兩個值**本來就係 validated 嘅**(源頭同樣係 `prepare approval data`)。所以 1005 只差兩樣:`jobFunction` 冇存落 `execution_context`,同埋 `validated` 標錯 `false`。

### 2.2 改動

**① `Check Activate Date`** —— 個 `payload` object 加一行:

```js
jobFunction: data.jobFunction,
```

(該 node 已經有 `const data = $('prepare approval data').first().json;`,直接攞得到)

**② `Prepare Schedule Record`** —— 個 `execution_context: JSON.stringify({...})` 入面加一行:

```js
jobFunction: data.jobFunction,
```

**③ `WF1 - Prepare UOP Intake`(1005)**:

| 欄位 | 現時 | 改成 |
|---|---|---|
| `request.department` | `ctx.department` | **`ctx.jobFunction`** |
| `targetUser.validated` | `false` | **`true`** |
| `targetUser.sAMAccountName` | (冇) | `ctx.sAMAccountName`(需 ①② 一併加存,可選) |

### 2.3 🔴 `WF1 - Call UOP Intake` 仍然 DISABLED

1005 個 Call node 由 kickoff 至今仍係 disabled(plan R3)。**要 enable,否則排程路徑永遠唔會 push 入平台**,而排程係 onboarding 嘅正常情況(未到入職日)。

---

## 2.5 🔴 三個 **blocking** wiring 缺口(2026-07-27 F4 實讀 node 參數發現)

> 呢三個唔關 payload 內容事,係 HTTP node 本身嘅接線。**未補之前,無論 payload 幾正確都入唔到平台。**
> 證據 —— 兩個 `WF1 - Call UOP Intake` 嘅 `parameters` 實際內容:
> ```json
> { "method": "POST", "url": "={{ $env.UOP_INTAKE_URL }}",
>   "sendBody": true, "specifyBody": "json",
>   "jsonBody": "={{ JSON.stringify($json._uopPayload) }}", "options": {} }
> ```
> `credentials: []`,而且**冇 `sendHeaders`**。

| # | 缺口 | 後果 | 點補 |
|---|---|---|---|
| **1** | 🔴 **完全冇送 `X-Intake-Key` header** | 平台 guard fail-closed → **每一 call 都 401**,一張都入唔到 | HTTP node 開 **Send Headers**,加 `X-Intake-Key` = 平台交嘅 `INTAKE_API_KEY`(用 n8n credential / env,**唔好硬寫落 node**) |
| **2** | `UOP_INTAKE_URL` 指邊條 route 未定 | 指去 `/requests/intake`(canonical)會因為送緊名而唔係 GUID → 400 | 設成 **`{平台 base}/requests/intake/n8n`**(adapter route)。**好消息:URL 係 `$env`,改 env 就得,唔使郁 node** |
| **3** | 1005 個 Call node `disabled = true` | 排程路徑(未到入職日,即 onboarding 正常情況)**永遠唔會 push** | enable(同 §2.3) |

✅ **確認冇問題嘅兩樣**:
- `onError = continueRegularOutput` 兩邊都設咗 → **fire-and-forget**,平台掛咗都唔會阻住 onboarding(合 CONTRACT A3)。
- body 兩邊都送啱嘢:1001 送 `$json._uopPayload`(prepare node 包咗一層),1005 送 `$json`(prepare node 直接 return payload)。**兩者最終 body shape 一致。**

---

## 2.6 ⚠️ `licenseCode` 可能係 `null`(payload 層,唔係 wiring)

兩個 prepare node 都係噉砌:

```js
licenseCode: (it.variables && it.variables.License) || null
```

即係 SN catalog 個 `License` variable 攞唔到 → 送 `null`。平台 DTO 要求 string 非空 ⇒ **成張單 400**(唔係「跳過嗰個 line」)。

**呢個係刻意 fail-closed** —— 唔知客戶叫緊咩 licence 就唔應該建單。但要知:**一個 line item 唔掂 = 成張單拒收**。錯誤訊息會係 `licenseItems.0.licenseCode must be a string` 咁款,講到邊個 index,講唔到邊個 RITM。

⇒ **OQ-4 嘅發現機制**:第一張真單入嚟就會自報 SN `License` variable 實際係咩值(命中就 201,唔命中就 400 兼回顯個值)。

---

## 3. 驗收(平台側點知你改好咗)

改完之後,同一張 onboarding 送入平台,平台側應該見到:

| 檢查 | 期望 |
|---|---|
| `request.department` | 係 **18 條 Job Function 之一**(如 `RHK IT`),唔係自由文本(如 `RHK/Information Technology`) |
| `targetUser.validated` | `true` |
| `targetUser.email` | 同真正建咗嘅 AD 帳號 UPN **一致**(呢個直接決定 sync gate 過唔過到) |
| 兩條路徑 | 1001(即時)同 1005(排程)送出嘅 payload **shape 一樣** —— ✅ **2026-07-27 已實讀兩個 prepare node 逐欄對過,確認一致**(差別只喺**取值來源**:1001 由 `aiBrain`,1005 由 `execution_context`) |
| HTTP 回應 | **201**(而唔係 401)—— 401 = §2.5 #1 個 header 未補 |

⚠️ 平台 adapter 係 **fail-closed**:`department` 對唔上 18 條 key 就回 4xx 唔建單(唔會好似 n8n `resolveOU()` 咁 fallback 落 `RAPO/IT`)。所以改之前送入嚟嘅單會被拒 —— 呢個係刻意,唔係 bug。

---

## 4. 未改之前平台側點做

adapter 照 **精確 key** resolve(`MAPPING.md §1`),對唔上就 4xx 並喺錯誤訊息講明收到咗咩值。即係:

- n8n 未改 → 平台拒單,但錯誤訊息會告訴你實際收到嘅 `department` 長成點
- n8n 改咗 → 直接命中

呢個安排令「n8n 改動」同「平台落 code」可以**並行**,唔使互等。
