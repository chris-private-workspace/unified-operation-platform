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
| AP-8 | **SKU 靠名唔靠 GUID** | 用 Excel friendly name / 記憶中 part number 對 SKU,對唔返 tenant | SKU 操作全部用 `skuId`(GUID)做鍵? |
| AP-9 | **跳 sync gate 就 assign** | user 未 sync(`findUser` null / `azureSyncedAt` 空)就叫 `assignLicense` → fail | assign 前確認過 Phase 1 sync gate? |
| AP-10 | **對帳撈錯數字** | 用 `allocatedQuantity`(budget)去 reconcile,而唔係 `assignedQuantity`(baseline) | drift 只比 `sum(assignedQuantity)` vs tenant `consumedUnits`? |
| AP-11 | **驗錯咗第二個 checkout** | 呢部機有**多個 worktree**(`orca/workspaces/*` + `C:\Users\CLai03\unified-operation-platform`)。W36 F4:port 3100 個 API 係**另一棵樹**跑,新 route 回 404 —— 差啲當咗 stale build 去重啟,實情重啟幾多次都唔會有你啲 code | 落 curl 之前查過 `(Get-CimInstance Win32_Process).CommandLine` 個**路徑**係咪你而家改緊嗰個 worktree? |
| AP-12 | **只驗 happy path,冇驗「唔應該發生嘅嘢真係冇發生」** | 拒收 case 淨係睇到 4xx 就收貨,冇查佢**有冇偷偷寫咗嘢**(W36 G3 實證:守衛一拆走,歧義 case 靜靜建咗完整 Request) | 每個 reject case 有冇查過 DB 零行 / 下游服務 log 冚唔到佢? |
| AP-13 | **同一件事實喺兩處各自維護,冇嘢逼佢哋一致** | 兩個子型,W39 + BUG-004/005 累計撞到 **6 次**(TD-1 更早,W39 引用佢做同病先例):<br>① **手抄清單扮完整清單** —— probe G2 手抄 4 個 key 而自稱 `run every probe there is` · TD-1 audit options · `integration-status.list()` 手寫陣列 · 條 test 自己再手抄多一份<br>② **兩處各自答同一個問題** —— BUG-005 面板 `config.get()`(env only)vs runtime `resolve()`(DB-then-env),`fulfilment.module.ts:96` 個 comment stale 兩個月;BUG-004 comment 寫住 `never log the target UPN` 而下面三行照 log<br>🔴 **兩種都會令 test 保持綠**:`reports all four connectors` 喺新 connector **完全冇顯示**嗰陣仍然綠 —— 因為條 test 本身就係第三份手抄<br>**同 AP-3 分野**:AP-3 係一個**數值** stale 咗;AP-13 係**機制**冇綁埋,所以佢會一路 stale 落去 | ① 呢個 diff 加咗**新成員**(connector / provider / role / route / enum 值)嗎?→ grep 佢個 inventory 常數,**逐個列出冇由佢 derive 嘅清單,test 同 comment 都要計**<br>② 有冇兩處各自答同一個問題?(runtime vs 面板 / code vs comment / code vs test 名)<br>→ 有 = 改成**由單一來源 derive**;derive 唔到就寫一條**直接對比兩邊**嘅 test |
| AP-14 | **build 綠 ≠ artifact 起得身**(gate 全部喺睇 source) | BUG-008(Sev2):CH-011 加 `scripts/*.ts` → tsc 冇 `rootDir`,emit 根由 `src/` 抬到 `apps/api/` → `main.js` 靜靜搬去 `dist/src/main.js`,而 entrypoint 跑 `node dist/main` ⇒ **每個容器一起身即 CrashLoopBackOff**。626 test / lint / `nest build` / `az acr build` **五道全綠**,冇一道問過「build 出嚟嗰嚿嘢行唔行」<br>🔴 子型 —— **build 靜靜 skip**:`tsc --noEmit` 唔建 outDir,把 incremental 狀態寫去 `dist/` **外面**(`apps/api/tsconfig.build.tsbuildinfo`),之後每次 `nest build` 都當「已是最新」→ **exit 0、零輸出、零檔案**,清 `dist/` 清唔到佢<br>**同 AP-1 分野**:AP-1 係「冇行 user flow」;AP-14 係**連 artifact 存唔存在都冇人驗**,而 test 天生見唔到(ts-jest 跑 `src/**`) | ① 改到 build config(`tsconfig*` / `nest-cli.json` / Dockerfile / 新增 `src/` 外嘅 `.ts`)嗎?→ **實際 `Test-Path dist/main.js`**,唔好信 build 綠<br>② 部署類改動有冇一道 gate 係驗 **artifact** 而唔係 source?(Dockerfile `RUN test -f dist/main.js` 就係)<br>③ build 完「零輸出零檔案」→ 先搵 stray `*.tsbuildinfo`,唔好即刻懷疑 fix 方向 |
| … | {加你項目踩到嘅坑} | {實證} | {檢查} |

## 輸出
逐條答 ✅ / ❌ / N/A;任何 ❌ = 未 done,先處理。

## 維護
- 每次踩到新反模式(尤其 Sev1/Sev2 bug postmortem 揭出嘅)→ 加一行。
- 對應 memory(feedback 類)可以 link。
