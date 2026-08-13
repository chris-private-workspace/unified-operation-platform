# CH-029 — Progress

> **spec** `spec.md`(`approved`)· **決策 SSOT** `ADR-0034`(Accepted)
> Branch `feat/ch-029-ledger-truth-gaps`,由 `main`(`1c98a5a`)開。

---

## Day 1(2026-08-13)—— 三個 deliverable 一日做齊,live 驗未做

### 交付

| | 做咗乜 |
|---|---|
| **D-A** | 新 gate **`holding`**:assign 之前由平台自己打 Graph 問「呢個人持唔持有呢個 SKU」。持有 ⇒ **唔 call provider · ledger 唔加 · line item 照推 `ASSIGNED`(D3=A)· timeline 講明**。新 `HoldingCheckService` + `GraphService.getUserAssignedSkuIds` |
| **D-B** | **零計算改動**(D5)。KPI sub-line 負數改讀成 `N over-allocated (prepaid SKUs)`;scope note 補一句解釋「點解 Allocated 減 Available 對唔返」 |
| **D-C** | `reconcile` 跳過 `seatModel = unlimited`,**兼且主動 resolve** 佢既有嘅 OPEN alert(D4)。`ReconcileResult.skippedUnlimited` 新增 |

### 驗證(全部真跑)

| 項 | 之前 | 之後 |
|---|---|---|
| api test | 1012 / 73 suites | **1040 / 74 suites**,全綠 |
| web test | 362 passed · 6 紅 | **368 passed · 6 紅**(逐個對得返 `WEB-TEST-JSDOM`,**零新增**) |
| api tsc / web tsc | 0 / 0 | **0 / 0** |
| api lint | 0 | **0** |
| web lint | 16 | **16**,而且實測落係 `allocation-reset.tsx` / `allocation-reset.test.tsx` / `request-detail.sync-check.test.tsx` **三個我冇掂過嘅檔** |

**+28 條 test 拆得開**:`holding-check` 7 · `assign.service` 13 · `reconcile.service` 6 · seam boundary `describe.each` 多一個 entry ×2 = 2。

### 🔴 Falsification —— 三個都真跑真紅

| 拆走乜 | 結果 |
|---|---|
| `alreadyHeld` 硬設 `false`(gate 冇咗效力,但 step 形狀保留) | **7 紅 / 84 綠** —— 七條全部係 CH-029 新加,**零誤傷** |
| `reconcile` 個 unlimited 分支改成永遠唔中 | **5 紅 / 11 綠** —— 五條全部係 D4 新加 |
| KPI sub-line 還原成舊寫法 | **1 紅 / 13 綠** |

🟢 **一條刻意留返綠嘅,而佢綠得有道理**:`still marks the line ASSIGNED and recomputes the request status` 喺 falsification 之下**冇紅**。啱嘅 —— **D3 揀咗 A 就係話呢一步兩條路一模一樣**,佢係一條釘住「D3 揀咗 A」嘅 assert,唔係一條區分新舊行為嘅 assert。⇒ **falsification 唔紅 ≠ 條 test 冇用**,但要講得出佢釘緊咩。

---

## 🔴 開工先查到嘅設計約束(spec 冇寫,而佢決定咗 D-A 個形狀)

`license-ops.boundary.spec.ts:101-108`(W38 OQ-1)明文 assert:

```
expect(assign).toContain('license-ops/license-ops.provider');
expect(assign).not.toContain('graph/graph.service');
```

即係 **`assign.service.ts` 唔可以 import `GraphService`**。而 **ADR-0034 D1 又要求呢個 read 唔經 seam**。兩條規矩夾埋 ⇒ **唔可以喺 assign.service 入面直接打 Graph**。

🟢 **解法唔使發明** —— `SyncCheckService` 就係同一個處境嘅先例,而 `fulfilment.module.ts:127-131` **逐字寫低咗理由**:「boundary rule 喺一個只做一件事嘅 class 上面易守啲」。⇒ 開 `HoldingCheckService`,`AssignService` 注入佢而唔係 `GraphService`,再喺 `MUST_STAY_DIRECT` 加一行(連理由)。

📌 **值得記嘅係:呢個約束令設計變好咗,唔係變差。** 一個獨立 service 令 fail-open(D6)有自己嘅 spec,而 `HoldingStatus` 三個值(`held`/`not-held`/`unknown`)先有地方住 —— 塞返落 assign.service 就會變成一個 boolean,而 `unknown` 一 collapse 落 `not-held` 就正正係 D6 講嗰種「靜靜退化」。

---

## 決定 / 偏離(R3)

### #1 🔴 `holding` 排喺 `budget` 之後、`seats` 之前 —— ADR 冇指定,呢個係本單決定

ADR-0034 D1 只寫「喺 `assignLicense` 之前,同其餘 pre-flight gate 一齊」。實際位置兩邊都有論據:

- **排喺 `budget` 之後** —— ADR-0016 D5 明文:「爆自己 OpCo budget 唔應該花一個 vendor round-trip」。而 `holding` **就係**一個 round-trip ⇒ 排喺 budget 前面就係同 D5 打對台。
- **排喺 `seats` 之前** —— 已持有嘅人**唔食多一個 seat**。排喺 `seats` 後面嘅話,tenant 冇 seat 就會擋住一單**根本唔使 seat** 嘅 assign,而 **`seats` 冇 override 出路**(`budget` 有)⇒ 操作員行到死路,唯一「解法」係買佢唔需要嘅 seat。W44 `F7-7`(n8n 2003 要求 skip 已持有 E5 嘅 user)正正就係 seat 緊張嗰個場景。

⚠️ **代價寫低**:`budget` 仍然會擋住一單已持有嘅 assign(ledger 唔會郁,所以嗰次 refusal 對帳目冇意義)。接受,因為 ① 佢有 admin override 出路 ② 「呢個 OpCo 用爆咗 allocation」本身係一個真事實,講出嚟冇錯。

### #2 `ReconcileResult` 加 `skippedUnlimited` —— ADR 冇要求

冇佢就**冇任何辦法由 endpoint 觀察到 D4 生效**,而 spec `A-3` 要求實測數。`checked` 維持 `catalog.length`(佢答「行過幾多個 row」,冇講大話),但單靠佢個 scope 會靜靜縮water ⇒ 兩個數要一齊出。Drift 頁個 toast 亦跟住講,**但只喺 `> 0` 嗰陣先講**(每個租戶都掛住 `· 0 skipped` 就係噪音)。

### #3 fail-open 個 step 用 `skipped` 唔用 `failed`

D6 只要求「唔可以扮成 `ok`」。兩個候選:

- `failed` —— 大聲,**但會改咗一個既有語意**:`failedAt` 同「有一個 `failed` 嘅 gate」喺今日之前係同一件事(`fail()` 係唯一產生者),而 `AssignResultDialog` 就係咁讀嘅(`gates.find(s => s.status === 'failed')` ⇒ 「Stopped at …」)。一個「failed 但冇停住任何嘢」嘅 gate 會令個 summary 講大話。
- 🟢 `skipped` —— 唔係 `ok`,summary 出「N skipped」而唔係當佢 pass,而個 `detail` 逐字講「無法確認」。

揀 `skipped`,**再加兩重補償**:①`logger.warn` ②**條 timeline note**(唔止 dialog)。D6 講明 residual risk 係「冇人主動發現」,而一個關咗就冇咗嘅 modal 唔算防線。

### #4 `already_assigned` 個 handling 一個字冇改

`assign.service.ts:428` 嗰段 W39 OQ-1 comment 原本收尾寫住 `fixing it is a separate change that has to fix both paths at once`。**本單就係嗰個 change,而佢係靠唔改嗰行嚟修兩條路** —— 道閘搬咗去上游,所以已持有嘅 case 根本到唔到嗰行。今日仲到得到嗰行嘅,淨返兩種:holding read 撻咗(D6,而個 step 有講),或者 race。兩種之下,舊行為都仍然係啱嘅。有一條 test 專門釘住呢件事(`leaves the provider-reported already_assigned path exactly as W39 left it`),因為「我哋修好咗 double-count」好易靜靜變成「我哋改咗 provider 個答案嘅意思」= 正正係 D0 違規。

---

## 途中撞到 / 值得記

### 🔴 我自己寫嘅註釋整紅咗 seam boundary test —— 而佢 W39 已經中過一次

`holding-check.service.ts` 個 docblock 原本寫住 ``(`license-ops.boundary.spec.ts`)`` 去解釋點解要獨立開一個 service。而嗰條 test 係 `expect(src(file)).not.toContain('license-ops')` —— **substring**。⇒ 一個**解釋規矩**嘅註釋觸發咗嗰條規矩。

W39 為咗同一件事鬆過一次(spec 入面自己寫住:「the file's own comments name the abstraction (to explain why it is not used), and a substring check on the name flagged that as a violation」)—— 嗰次改成只 match import path。**呢次個 check 唔係 import path 嗰條,係 `MUST_STAY_DIRECT` 嗰條,佢仲係 substring。** 冇再鬆佢(佢守住嘅嘢係啱嘅),改咗自己個註釋。

### 🔴 scope note 寫到啱,就令一條 test 因為啱而紅 —— CH-028 `F3-8` 同一個坑

D-B 要「面向操作員嘅解釋」,所以 scope note 要**指名**兩張卡(`Allocated to OpCos` / `Available seats`)。一寫落去,`platform-view.test.tsx` 條 `getByText('Available seats')` 即刻 **multiple elements**。

⚠️ **最易做錯嗰步係改成 `getAllByText(...).length > 0`** —— 咁樣佢會**淨係靠段散文都 pass**,即係 KPI label 真係改錯咗都照綠。改成 `within(getByTestId('tenant-kpis'))`,兩個負面 assert(`Prepaid seats` / `Owned in M365` 唔存在)一齊縮返入卡片範圍先有意義。

### `AssignResultDialog` 個成功 banner 由 CH-029 開始會講大話

佢一直寫死 `License assigned · ledger updated`,而佢係**唯一唔使展開就睇到嘅一行**。已持有嗰條路兩句都唔啱。改成由 **`ledger` step 讀**(唔係由 `holding` 重新推導)—— 一個畫面對同一件事有第二個意見,就係 dialog 同自己嘅 row 開始漂嘅方法。

---

## 🚧 未做

- [ ] **F5-4 H6 light + dark 真 render** —— 🔴 **卡住**:本機 5433 畀 `ai-doc-extraction-db` 佔住(實測 `Up 4 hours (healthy)`),停佢係另一個項目嘅事,**要 Chris 批**。
  - ⚠️ 而且**負數嗰個分支本機 render 唔到** —— 本機 `totalAllocated = 0` ⇒ `totalUnallocated` 一定係正數。要造 allocation fixture 先睇到 `over-allocated` 嗰句。**跟 CH-028 `F4-4` 先例**:唔為咗湊一張截圖去造假 row,由 unit test 蓋住(兩條,正負各一)。
  - ⇒ 本機真 render 驗到嘅係:**正數分支冇 regression** + scope note 排版 + dialog 兩句 banner。
- [ ] **live 驗 D-A** —— 要一個**真係已經持有某 SKU** 嘅 user 兼一張 `READY` line item。🔴 **RISK `R10`**:DEV 對真 production M365 tenant 有寫權 ⇒ 撳之前一律先唯讀探測。
- [ ] **live 驗 D-C** —— DEV 跑一次 `reconcile`,睇 `skippedUnlimited` 同 `resolved`。**預期**:`skippedUnlimited = 22`(DEV 已 curate),OPEN alert **72 → 56**,而 16 個 unlimited alert 變 `RESOLVED`(唔係消失)。⚠️ reconcile 對 Graph 唯讀,**R10 唔適用**。
- [ ] **部署 #7** —— DEV 要有 code 先驗得到 D-A / D-C。

## 🚧 明文唔喺本單(spec §2 已排除,再確認一次)

- `POWERAUTOMATE_ATTENDED_RPA` 個 ledger leftover(Chris 已決定暫時唔動)
- `OD1` daily reconcile 啟用
- **68/72 個 alert `ledgerAssignedSum = 0`** ⇒ 「今日大部分 drift 唔係拉開咗,係從來未記錄過」—— 指向 `ADR-0014` baseline,ADR-0034 §Consequences 明文標低咗唔喺範圍
