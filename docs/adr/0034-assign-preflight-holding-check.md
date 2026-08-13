# ADR-0034 — Assign 之前由平台自己查 M365 有冇持有;Drift 跳過 unlimited SKU

**Status**: **Accepted**(Chris Lai,2026-08-13 —— **D3 揀 A**[照推 `ASSIGNED`]· **D4 由「跳過」擴成「跳過 + 主動 resolve」** · **D6 fail-open + 大聲**)
**Date**: 2026-08-13
**Deciders**: Chris Lai
**Supersedes / Amends**: **唔推翻任何嘢。**
 · `ADR-0017` **D0 一個字唔改** —— 本 ADR 反而係 D0 嘅正確應用(見 §Context 3)
 · `ADR-0015` 嘅 drift 語意**唔改**,只係收窄佢**適用範圍**(D4)
 · `ADR-0032` / `ADR-0033` 唔掂
**Triggers**: **H1** ×2(**ledger `assignedQuantity` 語意改** = §5.1 lock 決策 · **對帳方案甲適用範圍收窄** = §5.1 lock 決策)· **H5**(改 assign critical path)

---

## Context

### 1. 起因 —— Chris 一條問題

2026-08-13 Chris 問:「**如果用戶已經有相關 license,現在可以再重新 assign?**」

查證答案(由 code 讀返):

| 情況 | 行為 | 出處 |
|---|---|---|
| 同一條 line item 再撳 | ⛔ **擋**(400 `Line item must be READY to assign (currently ASSIGNED)`) | `assign.service.ts:175` |
| **另一張 request,同一個人 + 同一個 SKU** | ✅ **唔擋**,而且 **ledger `assignedQuantity` +1** | `assign.service.ts:428-454` · `:462` |

**M365 側唔會真係多派一個**(Graph `POST /users/{id}/assignLicense` idempotent),**但平台個數會多**。

### 2. 呢個唔係 bug —— 係一個拍過板嘅決定

`assign.service.ts:428-436` comment 逐字:

> `'already_assigned' is treated EXACTLY like 'assigned' — ledger increment included.`
> `Only the n8n provider can report it; Graph's POST is idempotent and says nothing, so on that path a replay has always counted as a fresh assign.`
> `Acting on n8n's extra knowledge here would mean switching provider also switches ledger semantics, which is precisely what D0 forbids.`
> `The double-count risk is real but PRE-EXISTING: fixing it is a separate change that has to fix both paths at once.`

⇒ **W39 OQ-1(Chris,2026-07-28)**:兩個 provider 嘅回應都當 `assigned`,**理由係 ADR-0017 D0**「只換執行器唔換決策者」—— 若果 n8n 路唔加而 Graph 路加,就變成**換 provider = 換語意**。

### 3. 🟢 關鍵洞察:「平台自己查」令當年嗰個兩難消失

W39 當時個問題係:「**n8n 報 `already_assigned` 而 Graph 唔報,聽邊個?**」——喺嗰個框架入面,無論點揀都會令兩條 provider 路唔一致,所以 D0 逼住要「兩個都當 `assigned`」。

**但如果道閘唔問 provider,而係平台自己打 Graph 問一次,個框架就唔同咗**:

- 道閘企喺 **provider 之前** ⇒ 兩條路**收到同一個決定**
- 平台**冇**依賴 provider 嘅額外知識 ⇒ **D0 冇被軟化**
- 反過來:D0 講「所有 gate 留平台」,而呢個正正係**把一個本來散落喺 provider 側嘅知識,收返平台做 gate**

⇒ 🟢 **本 ADR 唔推翻 W39 OQ-1 個 *理由*,佢係令嗰個理由唔再適用。** `ADR-0017` 一個字唔使改。

### 4. 同日浮面嘅第二件:Drift 對 unlimited SKU 冇意義

`reconcile.service.ts` **完全冇 `seatModel` 概念**:

```
delta = tenantConsumed (LIVE Graph) − ledgerAssignedSum      // :22, :77
delta !== 0 → 開(或 refresh)OPEN DriftAlert                  // :83
```

而 `ADR-0032` 之後,`seatModel = unlimited` 嘅 SKU **冇 seat 概念** —— 佢個 `owned` 已經被剔出 `totalOwned`(CH-026),但 **drift 仍然照計**。

**實測(2026-08-13,DEV,`POST /license/reconcile` → 201)**:

| 指標 | 數 |
|---|---|
| OPEN drift alert 總數 | **72** |
| **屬 `unlimited`** | **16(22.2%)** · delta 總和 **8,211** |
| 屬 prepaid | 56 · delta 總和 17,687 |
| 🔴 `ledgerAssignedSum ≠ 0` 嘅 | **只有 4 個** |

最大幾個 unlimited alert:`FLOW_FREE` **4,524** · `POWER_BI_STANDARD` 3,065 · `POWERAPPS_DEV` 236。

⚠️ **22 個 unlimited SKU 只有 16 個出 alert**(另外 6 個 `In M365 = 0` ⇒ `delta = 0`)⇒ **跳過 unlimited 嘅實際效果係 72 → 56(−22.2%)**。

---

## Decision

### D1 — Assign 之前,由**平台自己**打 Graph 問「呢個 user 而家持唔持有呢個 SKU」

- 位置:喺 `licenseOps.assignLicense(...)` **之前**,同其餘 pre-flight gate 一齊
- 手段:**Graph read**(`/users/{upn}` 個 `assignedLicenses`,或者等效唯讀查詢)—— **唔經 `LicenseOperationsProvider` seam**
- 🔴 **點解唔經 seam**:seam 係「執行器」,而呢個係「決策者要嘅事實」。經 seam 就會令答案隨 provider 變,即係倒返轉頭撞返 D0

### D2 — 已持有 ⇒ **唔 call provider、ledger 唔加**,回一個 `skipped` step

- ADR-0029 個 step 出 `status: 'skipped'`(**唔係 `failed`**)—— 同 `CH-026` 個 unlimited seat gate 同一手法
- `outcome` **唔係 `blocked`** —— 呢個唔係拒絕,係「已經係目標狀態」
- **ledger `assignedQuantity` 唔加** ← **呢個就係本 ADR 觸 H1 嘅位**

### D3 — skip 咗之後,line item **照推去 `ASSIGNED`** 🟢 **(Chris 2026-08-13 揀 A)**

| 選項 | 意思 | 結果 |
|---|---|---|
| 🟢 **A —— 採納** | **照推去 `ASSIGNED`** | 對操作員嚟講「呢個人有咗呢個 licence」**係真嘅**,單應該收得。**唔掂 stage machine ⇒ 唔使升 Phase** |
| B | 停喺 `READY`,要人手處理 | 單永遠收唔到 ⇒ 實務上製造積壓。**冇採納** |
| C | 新 stage(`ALREADY_HELD`) | 🔴 會掂到 stage machine(§5.1 lock 決策)⇒ 要升 Phase + 另開 ADR。**冇採納** |

**A 要承擔嘅語意拉扯,同埋點處理**:`assignedAt` 有值但 **ledger 冇加**。
⇒ **`RequestEvent` timeline 必須寫明「已持有,平台冇再派」** —— 否則三日後冇人分得出「呢條 line 加咗 ledger」定「冇加」,而 ledger 對唔上嗰陣就會查唔到源頭。**呢個唔係 nice-to-have,係 A 成立嘅條件。**
(手法同 `CH-023` 一樣:由 `steps` 個對應 step 推導文案,**唔另寫一份**,否則 dialog 同 timeline 各自漂。)

### D4 — Drift 對 `seatModel = unlimited` **跳過,兼且主動 resolve 既有 OPEN alert** 🟢 **(Chris 2026-08-13 擴闊)**

- `reconcile` 唔再對 unlimited SKU **開 / update** DriftAlert
- 🟢 **兼且:遇到 unlimited SKU 而佢有 OPEN alert ⇒ 順手 `resolve` 佢**
- 🔴 **點解唔用一次性 script 清走** —— 咁只解決今日嗰 16 個。**下次有人 curate 一個新 SKU 做 `unlimited`,佢個舊 alert 又會留低**,而嗰陣冇人記得要清。放喺 `reconcile` 入面先係**結構性**解決。
- 📌 **順帶令語意更準**:唔係「唔理佢」,係「**主動收返**」—— 一個 unlimited SKU 嘅 drift alert 唔係「未處理」,係「**唔應該存在**」,而 `resolve` 正正就係咁講。
- 🟢 **`ADR-0015` 嘅 drift 語意一個字唔改** —— 改嘅係**適用範圍**:drift 係「seat 帳對唔對」,而 unlimited SKU **根本冇 seat 帳**

### D6 — Graph read 失敗 ⇒ **fail-open,但要大聲** 🟢 **(Chris 2026-08-13)**

- Graph read(查有冇持有)失敗 ⇒ **照 assign 落去**(= 退返今日行為,最壞情況係 double count,**而今日本身就係咁**)
- 🔴 **但個 step 必須明確講「無法確認是否已持有」,唔可以扮成 `ok`** —— 否則就變成一個「靜靜退化」嘅 gate:睇落有守門,實際冇
- **點解唔 fail-closed**:呢道 gate 係**帳目準確性優化**,唔係**安全邊界**。fail-closed 等於「為咗防一個帳目誤差,而阻止一個真實需要嘅 licence 派出去」。
- ⚠️ **同 `ADR-0016` budget gate 唔同,分別要記住**:budget gate 係**業務規則**(唔准超支)⇒ 擋得有道理;呢個係**帳目準確性** ⇒ 擋唔過。**兩者都叫「gate」但性質唔同,將來加新 gate 要問返呢條。**
- **先例**:`ADR-0020`(default SKU 注入 fail-soft)· `CH-011`(email 失敗 fail-soft)—— 同一個判斷家族

### D5 — `totalUnallocated` 出負數:**維持,唔改計算**

Chris 2026-08-13 裁決「負數係誠實」。DEV 實測 `−25,151`,而 `skusOverAllocated: 68` —— **佢冇講錯**。
⇒ 只做呈現側嘅解釋,**唔改任何聚合公式**,亦**唔推翻 `CH-026` 決定 #4**。

---

## Alternatives Considered

| 方案 | 點解唔揀 |
|---|---|
| **維持現狀,只喺 ADR 寫低** | 唔解決問題。而且 `POWERAUTOMATE_ATTENDED_RPA`(`alloc=0`/`assigned=1`/`In M365=90`)已經係一個活例:**ledger 唔會自我修正,加減都唔會** |
| **靠 provider 報 `already_assigned`** | 🔴 **正正係 D0 禁嘅嘢** —— 只有 n8n 報得到,Graph 報唔到 ⇒ 換 provider = 換語意。呢個亦係 W39 OQ-1 當年否決咗嘅方向 |
| **平台自己記住邊個持有咩(新 model / 新欄)** | 🔴 H1 + schema;而且同 `ADR-0018`「CMDB 唔做 source of truth」精神相衝 —— 平台又養多一份會 drift 嘅副本 |
| **Drift 對 unlimited 照計但分類** | 唔解決核心問題:個 delta 本身**唔對應任何要人做嘅嘢**。分類只係把噪音搬去另一個抽屜 |
| **Drift 對 unlimited 換 delta 定義** | 最貴,而且要發明一個 Microsoft 冇承諾過嘅語意 —— 同 `ADR-0032` 否決 threshold 同源 |

---

## Consequences

### 正面

- **double-count 唔會再增加** —— 而且係**兩條 provider 路一齊**,唔使等 n8n 接通
- **Drift alert 減 22.2%**(72 → 56,實測)⇒ 個清單開始可讀
- 🟢 **ADR-0017 D0 冇被軟化** —— 反而係被更嚴格咁應用

### 負面 / 要接受嘅代價

- 🔴 **每次 assign 多一個 Graph read** —— 延遲增加,而且多一個失敗點。🟢 **失敗行為已由 D6 定死:fail-open + 大聲**。⚠️ **要接受嘅殘留風險**:Graph read 長期失敗嘅話,系統會**靜靜退化返今日行為**(繼續 double count)而唔會有人主動發現 —— **唯一防線就係 D6 要求嘅「step 講明無法確認」**,所以嗰句唔可以省
- 🔴 **既有嘅錯數唔會自動修正**:
  - `POWERAUTOMATE_ATTENDED_RPA` 個 leftover **維持**(`CH-028 F4-7`,Chris 已決定暫時唔動)
  - 🟢 **既有 16 個 unlimited drift alert 會被自動 resolve**(**D4 擴闊之後**)—— 起初本 ADR 只寫「跳過」,而咁樣會令佢哋**永遠停喺 OPEN**(冇 code 再掂)。Chris 2026-08-13 揀咗「跳過 + 主動 resolve」⇒ **陷阱消失,而且將來 curate 新 unlimited SKU 都自動處理**
- **`skipped` 呢個 outcome 會令 `AssignResultDialog` 個 summary 要再改一次**(CH-026 已經改過一次:`6 checks passed · 1 skipped`)
- 🔴 **本 ADR 唔碰嘅一件大事**:實測顯示 **68/72 個 alert 嘅 `ledgerAssignedSum = 0`**,即「M365 有人用但平台由頭到尾冇記錄」。⇒ **今日大部分 drift 唔係『拉開咗』,係『未記錄過』。** 呢個指向 allocation / `assigned` baseline(`ADR-0014`)嗰條線,**明文唔喺本 ADR 範圍**,但唔處理嘅話「drift alert 有幾多個」呢個指標長期唔可讀

### 🟢 原本三條「未答」2026-08-13 全部答齊

| # | 問題 | 答案 |
|---|---|---|
| 1 | D3 揀邊個 | 🟢 **A —— 照推 `ASSIGNED`** ⇒ **唔掂 stage machine,唔使升 Phase** |
| 2 | Graph read 失敗 fail-open 定 fail-closed | 🟢 **fail-open + 大聲** ⇒ 新增 **D6** |
| 3 | 既有 16 個 unlimited alert | 🟢 **跳過 + 主動 resolve** ⇒ **D4 擴闊咗**(唔用一次性 script) |

⇒ **本 ADR 冇未決項,可以開工。**

### 🔴 實作時仲要守嘅三條(唔係未決,係執行紀律)

1. **H5** —— 改到 assign critical path ⇒ 必須同步 test,而且 **Graph / n8n 兩條 provider 路都要**(雖然 D1 令兩條路行為一致,但 test 要證到佢真係一致)
2. **falsification 要真跑真紅** —— 拆走新 gate 之後,**只應該有新嗰幾條紅**;若果常態路都紅,即係 gate 位置錯咗(`CH-026` E-1 同一手法)
3. **test 唔可以淨係喺 UI 層砌 fixture** —— `W45 apiPatch` + `BUG-011 pendingRestart` 兩次教訓:**bug 住喺兩層之間**,而每層 test 都喺自己嗰層邊緣停低

---

## References

- `apps/api/src/fulfilment/assign.service.ts:175`(stage 閘)· `:428-454`(W39 OQ-1 comment)· `:462`(ledger upsert)
- `apps/api/src/license/reconcile.service.ts:22` / `:77` / `:83`(delta 定義同 alert 開合)
- **`ADR-0017` D0** —— 只換執行器唔換決策者(**本 ADR 唔改佢**)
- **`ADR-0015`** —— drift / sync 語意(**本 ADR 只收窄適用範圍**)
- `ADR-0032`(seat model)· `ADR-0033`(可用 seat 定義)· `ADR-0029`(assign step 結果)· `ADR-0014`(`assigned` baseline)
- `CH-029-ledger-truth-gaps/spec.md`(本 ADR 嘅來源單,含三條 OQ 同實測數)
- `CH-026` progress 決定 #4(`totalAllocated` / `totalUnallocated` 範圍差)· `CH-028 F4-7`(`POWERAUTOMATE_ATTENDED_RPA` 活例)
- W44 `F7-7` —— n8n 2003 sticky 早就要求 assigner skip 已持有 E5 嘅 user(**平台一直未做**)
