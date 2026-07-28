---
phase: W40-ticket-update-provider
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: draft
last_updated: 2026-07-28
---

# W40 — Progress

## Day 0 — 2026-07-28 · Kickoff(D0 gate 未解除)

ADR-0017 rollout **最後一階段**。戊(W36)· 己(W38)· 庚(W39)已收,辛做完就 4/4。

### 揀號

`git fetch --all --prune` 後掃晒所有 branch + git history 嘅 `docs/01-planning/W4*` → **零命中**,W40 可用。呢一步係 BACKLOG 頂部「兩個 W36」事件之後定落嘅規則(PROCESS §2.1),今次照做。

### 落手前實讀 workflow JSON —— 揪到一個 blocking 落差

W39 嘅教訓係「**凡平台送出 / 解析嘅嘢,JSON 係 SSOT,唔可以照抄 ADR 轉述**」。今次一開始就逐個 node 讀 2004,結果又中:

**ADR-0017 D3 把 `addWorkNote(sysId, note)` map 去 2004 mode 1。但 mode 1 一定會 `state:'2'`。**

平台今日 assign 成功之後只加一條 work note,**唔掂 state**。照 ADR 做 =

```
direct：assign 成功 → 加 note，state 不變
n8n   ：assign 成功 → 加 note + 張單被標成 Work in Progress
```

兩個問題:**違反 D0**(切掣就靜靜改咗對外行為),而且**語意係相反嘅** —— 成功咗反而標「進行中」。

2004 sticky 自己寫住「RITM ONLY. 3 fields ... deliberate」,即係 n8n 側**刻意**唔提供 note-only 能力。所以呢個唔係佢哋做漏,係兩邊對「回寫」嘅定義本來就唔同。

⇒ plan §8 OQ-A,本 phase 最重要一個決定。

### 另外兩個查 code 先見到嘅嘢

**① 命名撞晒。** ADR D3 個 `DirectServiceNowProvider` —— 呢個名 **W25 已經用咗**(`RequestSubmissionProvider` 嘅建單實作)。

**② `addWorkNote` 有兩個 caller。** 除咗 `assign.service:306`,仲有 `outbound-retry.service:180` 個 `repairWorkNote`。同 W38 揪到「`getSubscribedSkus` 原來有 4 個 consumer」係同一種發現 —— **接縫化之前一定要數清 caller**,否則 seam 只覆蓋你當時望住嗰個。

### 一件證明 doc 寫啱地方嘅事

加 `n8n-ticket` connector **必然要改 schema**(`ConnectorConfig` 係具名 column 唔係 key-value bag)。

W39 就係喺呢度撞到 H1 —— kickoff 假設「零 schema」破產。當時把教訓寫入 **ADR-0013 實作補註**而唔止寫喺 W39 progress,理由係「**下一個加 connector 嘅人會踩同一個坑**」。

今次係**事前**知,唔使再撞一次。

### ⚠️ 辛同前三階段本質唔同

戊己庚都係平台讀 / 建自己嘅嘢。辛係**第一次**把「改客戶張真飛嘅狀態」變成可切換行為,而 **close 冇 undo**。

## Day 0(續)— D0 gate 解除

Chris 五個 OQ + H1 **全部跟建議**(plan §8 有表)。

**OQ-A = A**:`addWorkNote` 唔入介面。呢個令接縫 ④ 嘅覆蓋面**細過** ADR D3 個表 —— 同 W38 收窄 D2(5 個方法收 3 個)係同一個判斷:**vendor 冇對應能力,就唔好喺介面度假裝有**。硬塞落 mode 1 會令切掣變成改行為。

**OQ-E = 1 + 2 一齊做**:close 同 WIP 兩個 trigger 都接。理由係 rollout 表寫死咗辛嘅驗收就係「RITM 狀態正確,無雙重 close」—— 只交付 provider 唔接 trigger,等於留返一個未收嘅尾。

### 拍板之後自查,揪到我自己一個事實錯誤

我喺 OQ-E 個選項描述寫住「WIP 要接 ADR-0016 預算 gate(**未實作**)」。

**錯 —— 預算 gate W36 已經完成。** `assign.service` 入面嗰個 `budgetOverride` audit metadata 就係佢。

唔影響拍板(Chris 揀嘅係選項 1,唔係因為呢句),但**影響 F4**:`markInProgress` 唔係「等一個未來 feature」,而係即刻有嘢接。錯事實留喺 plan 度會令 F4 走錯方向,所以入咗 §8 + changelog。

> 根因同 **AP-13** 同源:我腦入面嗰份「邊個 ADR 實作咗未」係一份**手抄清單**,而佢已經 stale。真相喺 BACKLOG row 同 code 度。

### 連帶揪到一個 OQ-E 冇覆蓋嘅設計問題

拍板係「預算 gate 擋 → `markInProgress`」。但操作員可以**不斷重試**同一個被擋嘅 line item ⇒ 每擋一次 PATCH 一次真單。

`closeComplete` 同理:同一張 RITM 唔可以 close 兩次。

⇒ 兩個都唔可以照 `if (blocked) markInProgress()` 落去,要**只喺狀態轉變時寫**。已入 plan §8 + F4 checklist,**留 F4 定案唔喺 kickoff 猜**。

## Day 1 — 2026-07-28 · F1 ✅

三個新檔落 `integration/ticket-update/`(對齊 W38 `license-ops/`):抽象 + `DirectTicketProvider` + boundary spec,另加 6 條行為 spec。

**538 / 538**(528→538)· lint 0 · tsc 0。

### 條 test 嘅正面半邊捉到我一個真錯

boundary spec 原本用 `Object.getOwnPropertyNames(TicketUpdateProvider.prototype)` 去讀介面有邊幾個方法。

**TS `abstract` 方法冇 runtime 存在** —— 個 array 淨係 `["constructor"]`。

即係話 `expect(methods).not.toContain('addWorkNote')` **無論介面寫成點都會綠**。一條永遠綠嘅 test,而佢個名講住佢守住 OQ-A。

捉到佢嘅係**正面半邊**(`toContain('markInProgress')` 紅咗)。呢個正正係 W38 開始配對正負半邊嘅理由 —— 今次即刻兌現。

> 同 **AP-13** 講嘅「兩種都會令 test 保持綠」係同一件事:一條 assert 唔到嘢嘅 test,同一份 stale 手抄清單一樣,都係**用綠色掩蓋事實**。

改成 match 宣告形式 `abstract X(` —— 唔用裸名,因為呢個檔嘅 comment 大篇幅討論 `addWorkNote`(解釋點解佢唔喺度),裸名檢查會把解釋本身當成違規。W39 喺 integration-probe 踩過同一個坑。

### 兩個同 W38 有意識唔同嘅決定

**① transport 失敗 throw,但唔 wrap 成 503。**

W38 個契約係「transport 失敗 throw 503,各實作自己 wrap」。呢度**跟原則唔跟實作**:seam ④ 嘅 caller 按 ADR-0011 OD4 **一定**會 swallow 咗個 error 再入佇列(唔可以令一個已成功嘅 assign 變失敗),所以 503 呢個 HTTP 語意**永遠冒唔出去**。wrap 佢等於砌一個冇人收得到嘅形狀。

**② table 寫死 `sc_req_item`,唔跟 `SERVICENOW_DEFAULT_TABLE`。**

2004 個 patchUrl 焗死咗 `/api/now/table/sc_req_item/`。direct 側若然跟 config,兩條「理應等價」嘅路徑就會喺有人改設定嗰日靜靜分叉 —— 一個設定值默默決定緊其中一邊寫邊張表。已經加咗 test 守住。

### fails-before

介面加 `abstract addWorkNote` + `outbound-retry` 加 seam import → **兩條真紅**;額外收穫係 **TS 都爆**(`DirectTicketProvider` 冇實作嗰個方法),即係呢條邊界有兩層守。還原後 `grep` = 0。

### ⚠️ 順帶見到,**冇順手修**

`servicenow.service.ts:71-72` 個 `request()` 失敗時 `logger.error(...)` **原封 log 咗 response text**。

同 **BUG-004** 係同一類(外部字串當安全內容 log)。但:

- BUG-004 收窄範圍嘅理由係「**直接處理 user identity** 嘅 vendor 呼叫」,而 ticket 路徑處理嘅係 sysId + 平台自己寫嘅 note
- 修佢會掂到**所有** SN 呼叫(intake / outbound / retry),明顯超出 W40 範圍(H3)

⇒ 唔喺本 phase 修,記低做 follow-up 候選。**唔當佢唔存在,亦唔順手改**。

### 下一步

F2 —— `N8nTicketProvider`(2004)。
