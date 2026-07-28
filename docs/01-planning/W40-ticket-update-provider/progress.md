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

### 下一步

D0 gate 未解除。五個 OQ + 一個 H1 approve 全部要 Chris 拍板,尤其 **OQ-A**(`addWorkNote` 點算)同 **OQ-E**(邊個 code path 有權真 close 一張客戶單)。

⚠️ 辛同前三階段本質唔同:戊己庚都係平台讀 / 建自己嘅嘢,辛係**第一次**把「改客戶張真飛嘅狀態」變成可切換行為,而 **close 冇 undo**。
