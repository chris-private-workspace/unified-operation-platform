---
name: anti-patterns
description: 項目反模式自檢清單 — review / commit / 驗收 user-facing feature 之前掃一次。專治本項目反覆出現嘅坑。Use when reviewing a diff, before committing, or before marking a user-facing feature done.
---

# 反模式自檢清單(AP)

> 用法:review diff / commit 前 / 驗收 user-facing feature 前,逐條答 ✅ / ❌ / N/A。
> 由項目自身 bug / memory / retro 實證累積而成 —— **新項目應由幾條通用嘅開始,踩到坑就加**。
> 與 CLAUDE.md §12 self-verification、§5 hard constraints 並行(呢度係 *症狀導向* 補強,唔取代 hard constraint)。

| # | 反模式 | 症狀 / 實證 | 自我檢查 |
|---|---|---|---|
| AP-1 | **假驗收(gate-only)** | 「測試 pass / gate 綠」就當 done,冇實際行行 user flow | 有冇真係行過一次真實情境,唔淨係睇 test? |
| AP-2 | **mock 當 real** | demo 用 mock data / stub,但當成真實 pipeline 通咗 | 呢個結果係經真實服務 / 真實資料出,定係 mock? |
| AP-3 | **stale 數字** | 文件 / 手冊寫死嘅預設值同 code 唔同步(改咗 code 冇改 doc) | 呢個數字同 code 對過未?(尤其 config 出廠值) |
| AP-4 | **silent scope drift** | 順手改咗 request 以外嘅嘢 / plan 改晒但冇 changelog | 每行改動 trace 得返 request 嗎?deviation log 咗嗎? |
| AP-5 | **over-engineering** | 加咗未 request 嘅 flexibility / abstraction | senior engineer 會唔會話 over-engineered? |
| AP-6 | **fallback 假象** | in-memory / default fallback 令「睇落 work」但唔係真 backing | 依賴嘅真實 backing(DB / 服務)真係接通咗? |
| AP-7 | **stale running process** | 改咗 code 但 running server 冇 reload,跑緊舊 code | running 進程啟動時間 ≥ 最後相關 commit 嗎? |
| … | {加你項目踩到嘅坑} | {實證} | {檢查} |

## 輸出
逐條答 ✅ / ❌ / N/A;任何 ❌ = 未 done,先處理。

## 維護
- 每次踩到新反模式(尤其 Sev1/Sev2 bug postmortem 揭出嘅)→ 加一行。
- 對應 memory(feedback 類)可以 link。
