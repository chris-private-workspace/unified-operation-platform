---
change_id: CH-029
title: "Ledger 同 M365 真相之間三個語意缺口(double-count · totalUnallocated 負數 · unlimited SKU 嘅 drift)"
status: proposed          # proposed | approved | done
created: 2026-08-13
target_completion: TBD    # 🔴 未定 —— 見 §5,三條 OQ 未答之前唔開工
affects_components: [apps/api/fulfilment, apps/api/license, apps/web]
spec_refs:
  - ADR-0017 D0(只換執行器唔換決策者)· W39 OQ-1(Chris 2026-07-28)
  - ADR-0032 / CH-026(unlimited seat model)
  - ADR-0015(對帳方案甲 · drift 語意)
  - docs/02-architecture/licenseops/DESIGN.md §5(三層 owned → allocated → assigned)
---

# CH-029 — Ledger 同 M365 真相之間嘅三個語意缺口

> **Spec version**:1.0(**proposed** —— 三條 OQ 未答,**未 approve,未開工**)
> **Owner**:Chris Lai
> **分類**:Change(**待確認會唔會升做 Phase**,見 §6)
> 🔴 **觸發 H1** —— 見 **§4**。**一行 code 都未寫,亦唔應該寫**,直到 §5 三條 OQ 答完 + ADR 寫好。

---

## 1. 點解要(三件事,逐個有證據)

Chris 2026-08-13 問:「**如果用戶已經有相關 license,現在可以再重新 assign?**」查證之後發現呢個問題連住兩件同日先浮面嘅嘢 —— **三者都住喺同一條線上面:平台自己嘅帳(`assignedQuantity`)同 M365 真相(`consumedUnits`)之間嘅語意**。

### 1.1 🔴 **A — 重複 assign 會令 ledger 多數一次(double-count)**

**現況(由 code 讀返,唔係推論)**:

| 情況 | 行為 | 出處 |
|---|---|---|
| **同一條 line item 再撳** | ⛔ **擋** —— `stage` 閘,400 `Line item must be READY to assign (currently ASSIGNED)`,`whoFixes: 'operator'` | `assign.service.ts:175` |
| **另一條 line item / 另一張 request,同一個人 + 同一個 SKU** | ✅ **唔擋**,而且 **ledger `assignedQuantity` +1** | `assign.service.ts:428-454` · `:462` |

`assign.service.ts:428-436` 個 comment 逐字:

> `'already_assigned' is treated EXACTLY like 'assigned' — ledger increment included.`
> `Only the n8n provider can report it; Graph's POST is idempotent and says nothing, so on that path a replay has always counted as a fresh assign.`
> `Acting on n8n's extra knowledge here would mean switching provider also switches ledger semantics, which is precisely what D0 forbids.`
> `The double-count risk is real but PRE-EXISTING: fixing it is a separate change that has to fix both paths at once.`

⇒ 三件事要分清楚:
1. **M365 側唔會真係多派一個** —— Graph POST idempotent。
2. **平台側個數會多咗** —— ledger `+1`,而 M365 冇動。
3. **呢個唔係 bug** —— 係 **W39 OQ-1(Chris,2026-07-28)嘅拍板結果**,理由係 **ADR-0017 D0**「只換執行器唔換決策者」:若果 n8n 路唔加而 Graph 路加,就變成**換 provider = 換語意**。

🔴 **所以本項唔可以當 bug 修** —— 要改就係**推翻一個既有 decision**,見 §4。

**活例(唔係理論)**:`POWERAUTOMATE_ATTENDED_RPA` 而家 `alloc=0` / **`assigned=1`** / `In M365=90` —— W45 `F4-4` 真派嗰次留低,**Graph 側移返咗但 ledger 冇減**(CH-028 `F4-7` 記低,Chris 決定暫時唔動)。**同族形狀:ledger 唔會自我修正,加減都唔會。**

**相關已有記錄**:W44 `F7-7`「2003 sticky 要求 assigner **skip 已持有 E5 嘅 user**」—— **n8n 側早就提出過呢個要求,平台未做**(2026-08-13 標咗 defer 去 `N8N-SEAMS`)。

### 1.2 🔴 **B — `totalUnallocated` 喺真 allocation 數據下變負數**

**實測(DEV,2026-08-13 curate 之後)**:

```
{"totalOwned":20459,"totalAllocated":58814,"totalAssigned":41,
 "totalConsumed":25292,"totalUnallocated":-25151,"skusOverAllocated":68,"unlimitedSkus":22}
```

**核過條數係啱嘅**:`totalAllocated`(58,814)**包含 unlimited row 嘅 allocation**(約 13,204),而 `totalUnallocated` **只計 prepaid** ⇒ `20,459 − 45,610 = −25,151`。

⇒ 呢個正正係 **CH-026 progress「決定 / 偏離」#4** 寫低嗰個代價:

> 「`totalAllocated` / `totalAssigned` **唔剔** unlimited(佢哋喺 unlimited SKU 上係**真數字**)… 代價係兩個 KPI 範圍唔同 ⇒ 靠 sub-line 明文講(`(prepaid SKUs)`)」

**#4 預見咗「範圍唔同」,但冇預見「會出負數」。** 本機 `totalAllocated = 0`,所以由頭到尾睇唔到 —— **要真 allocation 數據先浮面**。

### 1.3 🔴 **C — Drift 對 unlimited SKU 冇意義,但照計照開 alert**

**現況(`reconcile.service.ts` 實讀)**:

```
delta = tenantConsumed (LIVE Graph) − ledgerAssignedSum        // :22, :77
delta !== 0 → 開(或 refresh)一個 OPEN DriftAlert               // :83
```

**成個 reconcile 完全冇 `seatModel` 概念。**

⇒ `FLOW_FREE`(`In M365 = 4,521`、ledger assigned `0`)會產生一個 **`delta = 4521`** 嘅 alert。而 unlimited SKU **冇 seat 概念**,呢個 delta 唔對應任何要人處理嘅嘢。

CH-026 spec §4 **明文標低咗要另開**:

> 「❌ **Drift 計算**(`ledgerAssignedSum` vs `tenantConsumed`)對 unlimited SKU 意味住乜 —— ⚠️ 呢條數唔細(`FLOW_FREE` 用緊 4525),但佢係獨立一個問題,要另開」

⚠️ **未驗證**:實際跑一次 reconcile 會出幾多個無意義 alert。**冇跑過** —— reconcile 要主動撳,而佢會打真 Graph(RISK **R10**),`OD1` daily cron 亦仲未啟用(ADR-0015 明文只係「鋪路」)。**唔可以當已知。**

---

## 2. Scope

### In
- **A**:重複 assign 嘅偵測 / 處理語意(**包括決定「唔改」都要寫低理由**)
- **B**:`totalUnallocated`(同任何同族聚合數)喺 unlimited 存在時嘅定義
- **C**:Drift 對 `seatModel = unlimited` 嘅 SKU 應該點做

### Out(明確排除,防止本單膨脹)
- ❌ **修正既有錯數** —— `POWERAUTOMATE_ATTENDED_RPA` 個 leftover 由 Chris 另外決定(CH-028 `F4-7`,已決定暫時唔動)
- ❌ **`OD1` daily reconcile 啟用** —— 獨立決定,ADR-0015 明文只係鋪路
- ❌ **n8n 三接縫真切換** —— `N8N-SEAMS`,卡外部
- ❌ **改 Drift resolve 流程 / DD-3 create 缺口** —— `Drift-resolve` 另一單
- ❌ **改 `owned` 定義** —— ADR-0033 啱啱先定咗(CH-027),唔喺本單重開

---

## 3. Deliverable(🔴 形態未定 —— 視乎 §5 點答)

> **本節刻意唔寫實作方案。** 三條 OQ 每條都可以令對應 deliverable 由「改 code」變成「只寫低理由」,而反過來亦然。**先答 OQ,再寫 §3。**

| # | 對應 | 要交出嘅嘢(無論點答都要有) |
|---|---|---|
| D-A | §1.1 | 一個**明確寫低**嘅 double-assign 語意 —— 改或者唔改都要有 ADR 級記錄,唔可以再留喺一個 code comment 度 |
| D-B | §1.2 | `totalUnallocated` 喺 unlimited 存在時嘅**定義**,加上 UI 點呈現(負數 / `—` / 換算法) |
| D-C | §1.3 | Drift 對 unlimited SKU 嘅**處理規則**,加上「跑一次真 reconcile 會出幾多個 alert」嘅**實測數字** |

---

## 4. 🔴 Hard constraint 分析(H1 觸發點)

| 項 | 觸唔觸 H1 | 理由 |
|---|---|---|
| **A(double-count)** | 🔴 **觸發** | ①**ledger 兩層數字(`allocatedQuantity` / `assignedQuantity`)係 CLAUDE.md §5.1 明列嘅 lock 決策** ②要改就係**推翻 W39 OQ-1**(Chris 2026-07-28 親自拍板)③而 W39 OQ-1 個理由係 **ADR-0017 D0**,即係推翻一個 **Accepted ADR 嘅不變式** ⇒ **必須 STOP + approve + 寫新 ADR**(ADR-0017 本身唔改 —— Accepted 唔改內容) |
| **B(`totalUnallocated`)** | 🟡 **可能唔觸** | 佢係 **read-model 聚合**,唔改 schema、唔改 ledger 語意、唔改對帳方案。⚠️ **但如果修法係「`totalAllocated` 改為剔走 unlimited」,就會改到 CH-026 決定 #4** —— 嗰個唔係 ADR 級,但**要 log R3 deviation 兼講清楚點解反口** |
| **C(unlimited drift)** | 🔴 **好可能觸發** | **對帳方案甲(SKU 總量層對帳)係 §5.1 明列嘅 lock 決策**,而 ADR-0015 定咗 drift 語意。「某類 SKU 唔計 drift」= 改對帳範圍 ⇒ **要 ADR** |

🔴 **本 spec 唔提出任何修法,亦唔應該提** —— H1 流程要求嘅次序係:**STOP → 講明想改咩 / 點解現 spec 唔啱 / 建議替代 → 等 approved → 寫 ADR**。而「建議替代」要建基於 §5 嘅答案,所以而家寫方案就係倒轉次序。

---

## 5. Open questions(🔴 全部未答 —— 答完先 approve)

### OQ-1(A)— 重複 assign 應該點?

| 選項 | 意思 | 代價 |
|---|---|---|
| **①維持現狀,但寫低** | 行為一個字唔改,只係把 W39 OQ-1 個決定由 code comment 升做 ADR + 喺 UI 講清楚 | 零風險;但 double-count 繼續存在,而 ledger 會慢慢同 M365 拉開 |
| **②assign 之前查 M365 有冇** | 多一個 Graph read,已持有就 `skipped`(似 CH-026 個 unlimited seat gate) | 多一個 Graph call;**要同時處理 n8n 路**(comment 明文要求「fix both paths at once」);要決定 skip 咗之後 stage 點走 |
| **③平台自己記住邊個持有咩** | 新 model / 新欄 | 🔴 **明顯 H1 + schema**,而且同 ADR-0018「CMDB 唔做 source of truth」精神相衝 |

🔴 **呢條唔可以由 AI 揀** —— 佢係一個**業務語意決定**(「平台個數代表咩」),而且 ① 同 ② 嘅差別會一路影響對帳。

### OQ-2(B)— `totalUnallocated` 出負數,係誠實定係要改?

- **A:誠實,唔改** —— DEV 真係 `skusOverAllocated: 68`,個負數冇講錯,只係難睇。可能只需 UI 加一句解釋。
- **B:改範圍** —— `totalAllocated` 亦剔走 unlimited,兩個 KPI 範圍拉返一致。⚠️ **會推翻 CH-026 決定 #4**(嗰度講明 unlimited SKU 上嘅 allocation 係**真數字**,剔走 = 少報)。
- **C:改呈現** —— 保留計算,但負數時顯示成 over-allocated 狀態而唔係一個負數 KPI。

### OQ-3(C)— Drift 對 unlimited SKU 點做?

- **A:跳過** —— `seatModel = unlimited` 唔參與 drift。⚠️ 要答「咁 `FLOW_FREE` 4,521 個真實使用者,平台仲要唔要知?」
- **B:照計但分類** —— 仍然開 alert,但標成另一類(唔要求 resolve)。
- **C:換 delta 定義** —— 對 unlimited SKU 改用另一個比較基準。🔴 **最貴,最觸 H1。**

⚠️ **答 OQ-3 之前建議先攞一個數**:真跑一次 reconcile,睇實際會出幾多個 alert、幾多個屬 unlimited。**呢個係 §3 D-C 要求嘅實測**,但佢會打真 Graph(**R10**),要 Chris 明示批准先做。

---

## 6. 分類待確認:Change 定 Phase?

**寫本 spec 嗰刻嘅判斷**:三件事共用一條線(ledger vs M365 真相),所以**一單開**好過散三單 —— Chris 2026-08-13 亦係咁揀。

🔴 **但如果 OQ-1 答 ② 或 ③、又或者 OQ-3 答 C,本單就唔係 <3 日,應該升做 Phase**(PROCESS §2)。⇒ **OQ 答完之後要重新分類,唔好硬塞落 Change workflow。**

---

## 7. Acceptance(暫定 —— OQ 答完要重寫)

- [ ] A-1 三個缺口各有一個**明文決定**(改 / 唔改都要有理由,唔可以留喺 code comment)
- [ ] A-2 凡觸發 H1 嗰啲,有對應 **ADR**(Accepted)先開工
- [ ] A-3 **實測數字**:真跑一次 reconcile,記低 alert 總數同 unlimited 佔幾多
- [ ] A-4 若果改到 assign 路 → **H5**:critical path 必須同步 test(Graph / n8n **兩條路都要**)
- [ ] A-5 若果改到聚合數 → 前端要有對應 test,而且 **test 要落 transport / service 層唔可以只砌 UI fixture**(W45 `apiPatch` + BUG-011 兩次教訓)
- [ ] A-6 R3:任何偏離 CH-026 決定 #4 / ADR-0015 嘅地方要 log

---

## 8. Risk

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 🔴 **本單天然想「順手」修埋既有錯數** | High | High | §2 明文排除;`POWERAUTOMATE_ATTENDED_RPA` 由 Chris 另外決定 |
| R2 | 改 assign 路撞到 critical path | Med | 🔴 High | H5:兩條 provider 路都要 test;falsification 要真跑真紅 |
| R3 | 真跑 reconcile 打真 Graph | Med | Med | **R10**:要 Chris 明示批准;或者只讀唔寫嘅方式估算 |
| R4 | 三件事夾埋令本單無限膨脹 | **High** | Med | §6:OQ 答完重新分類;三個 deliverable 各自可獨立收 |

---

## 9. Changelog

| 日期 | 版本 | 改動 | 決策者 |
|---|---|---|---|
| 2026-08-13 | 1.0 | 開單(`proposed`)。起因 = Chris 問「已經有 license 可唔可以再 assign」,查證後連埋同日浮面嘅另外兩件。**三條 OQ 全部未答,未 approve,零 code。** | Chris Lai(開單)· AI(查證 + 起草) |
