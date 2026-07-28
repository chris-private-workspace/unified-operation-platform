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

### 下一步

F1 —— `TicketUpdateProvider` 抽象 + `DirectTicketProvider` + boundary spec。
