---
change_id: CH-016
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
---

# CH-016 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — 2026-08-02

### Done

**Backend** — B1~B8。新 `POST /license/ledger/allocation/reset`,dry-run default,寫入只有一句 `updateMany`。
**Test** — T1~T10。api **719 / 63 suites**(+19)· web **225 / 27 files**(+12)。
**Frontend** — F1~F8。`AllocationResetCard` 落 Settings → integrations,`danger` variant + Dialog confirm。
**Live** — V1~V9 全部真 output 核過(見 checklist);**V10 browser 未驗證**(見 Blockers)。

### Decisions

- **Spec approved**(Chris,2026-08-02)。三個開放決定即場拍板:
  ① **獨立 reset endpoint**(AI 原建議係 import 加 `mode: replace`)② 一律歸 0、絕不刪 row ③ 權限 **ADMIN + REGIONAL**(AI 原建議 ADMIN only)。
- **判定唔觸發 H1**:只寫 `allocatedQuantity`,而「import / reset 唔可以掂 `assignedQuantity`」正正係 ADR-0004 嘅 invariant —— 本 CH 係**遵守**佢,唔係改佢。冇改 schema / vendor / module 邊界。
- **點解唔刪 row**(呢個先係本 CH 最核心嘅決定):`OpcoSkuLedger` 冇 FK 指向 request,所以「刪咗都唔會影響 request」呢個直覺**成立**;但 `assignedQuantity` 係 assign 累積出嚟嘅真數,刪 row 會 ① drift 對帳全爆(平台側變 0 而 tenant 側唔變)② 所有 assign 被 ADR-0016 budget gate 擋死 ③ `LedgerAdjustment` cascade 消失。**歸 0 一樣達到「重來」嘅目的,而三個爆點全部避開。**
- **前端擺位**:`AllocationResetCard` 落 `settings.tsx` 做 `AllocationImportPanel` 嘅**兄弟**,唔係巢喺 import panel 入面。第一版係巢住,結果既有 5 條 import test 即刻掛(佢哋 `vi.mock` 成個 mutations module,新 hook 唔喺 mock 入面)。呢個唔止係 test 問題 —— 佢講緊 import panel 冇理由要知道 reset 用咩 hook。搬做兄弟之後視覺位置一樣,兩者互不相干,既有 test 亦自然回綠。
- **接受中間態**(spec §2.4 / R1):清零之後未 import 之前,受影響組合 `allocated = 0` ⇒ assign 被擋。呢個係「獨立 endpoint」形態嘅固有代價,Chris 睇過 preview 之後仍然揀咗佢。緩解唔靠人記得 —— dry-run default + API 回應同 UI 都硬帶警告。

### 🔴 Live 驗證揭出 spec 一句係錯嘅(§2.5 由此而來)

Spec §2.3 原本寫住「reset 之後嘅復原手段就係重新 import 一份正確 CSV」。**跑 V7 嗰刻先發現呢句對 inactive SKU 唔成立。**

- Reset scoped RTW(4 格)→ 重新 import → **只還原到 2 格**。
- 原因:import 只讀 `active: true` 嘅 catalog(`allocation-import.service.ts:42-44`),而 `STANDARDPACK` / `VISIO_PLAN1` 兩個 SkuCatalog row 係 `active = f` ⇒ **佢哋嘅 cell,import 無論如何寫唔到**。
- 唯一救返嘅路係逐格 `PATCH /license/ledger/:id`(我就係咁復原 dev DB 嘅)。

⇒ Chris 拍板「照清但標明不可逆」(另外兩個選項:預設排除 inactive / 淨係改文件)。落成 `skuActive` + `irreversible` + warning 追加句 + Dialog 逐行標示,spec §2.5 + §7 changelog 已 log(R3)。

**閉環**:同一批真數據重驗 → `irreversible: 2`,認出嘅正正係之前 import 救唔返嗰兩格。

### Blockers

_(無 —— V10 一度卡住,session 中途 Playwright MCP 接上之後解決,見下)_

### 🟢 V10:本項目第一次由 AI 自己 render 驗到前端

Extension 一度連唔上(同 CH-015 一樣),Chris 重新接駁 **Playwright MCP** 之後行到。呢個直接動搖咗 memory `ui-verification-route` 記錄嘅結構性缺口 —— 之前每個前端 CH 嘅最後一哩路都要人手。

驗到嘅嘢(全部真 DOM,唔係推論):

- reset card 位置:import panel **正下方**、ServiceNow import 之上
- 掣 class `bg-danger-soft text-danger`,**唔含 `bg-accent`** ⇒ H6 成立
- 揀 RTW → Dialog 真彈:`4 ledger cells in scope RTW` · `2 of them cannot be undone` · `VISIO_PLAN1`/`STANDARDPACK` 逐行標 inactive(**同真 DB 兩個 `active=f` 嘅 SKU 完全對得上**)· footer `Reset 4 cells` danger 冇 accent
- **light + dark 都截圖睇過,dark 零爆** ⇒ DS-4 首次真正驗到
- 🔴 **全程零寫入**:browser 完之後 DB 仍係 `150 | 10 | 6049 | 10373`

⚠️ Playwright 會喺 **repo root** 掉低嘢(截圖 + `.playwright-mcp/`)—— memory 早有警告,收工已清,`git status` 空。

### Live 驗證原始結果

| # | 對象 | 結果 |
|---|---|---|
| V2 | dry-run(全平台 150 格) | `affected: 150`,DB 零改動 |
| V3/V4 | commit scope RTW | 4 格歸 0;**`assigned_sum` 6049→6049 · `ledger_rows` 150→150 · `LedgerAdjustment` 8→8 · `allocated_sum` 10373→10262(精確 −111)** |
| V5 | 鄰居 RTMEAP | 8 行一格都冇郁 |
| V6 | audit | `allocation.reset` · `{"scope":"RTW","affected":4}` — 過到 allowlist |
| V7 | reset → import | active 全還原;**inactive 兩格還原唔到** ⇒ §2.5 |
| V8 | §2.5 閉環 | `irreversible: 2`,認出嘅正正係嗰兩格 |
| V9 | dev DB 復原 | `allocated_sum` 返 10373;`adjustments` 8→10 = 兩次人手 PATCH |

> ⚠️ 揀 RTW 做目標唔係隨機:佢四格嘅 `assignedQuantity` **全部非 0**(22/20/19/17)。揀一個 assigned 全 0 嘅 OpCo,「assigned 冇變」就會退化成 0→0 —— 壞咗都照綠(memory `verification-that-proves-nothing`)。

### Effort
- Planned:1 日;Actual:約 3h;Variance:−5h

### Commits
| Hash | Subject |
|---|---|

---

## Closeout — 2026-08-02

### Acceptance verification

**spec §3 全部 ✅**,而且**冇一條要靠人手代驗**(CH-015 嗰次前端要 Chris 睇,今次 Playwright 行到):

| 條 | 證據 |
|---|---|
| OpenAPI endpoint + shape | AI 真跑 |
| dry-run 零寫入 / commit 歸 0 / opcoCode filter / 未知 code 404 | AI 真跑(live + test) |
| **`assignedQuantity` 不變 · row 數不變 · `LedgerAdjustment` 不變** | **真 DB 前後對比** |
| audit 過 allowlist | live 查 `AuditLog` + test 直接 call `pickAuditFields` |
| §2.5 `irreversible` / 逐行標示 | live 真數據閉環(`irreversible: 2`)+ browser 真 DOM |
| 前端三態流程 · danger 非 primary · **light + dark** | **Playwright 真 render** |
| api/web 全套 + `npm run lint` | 719 / 225 / exit 0 |

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| 1 | 8 | ~3.5 | −4.5 |

### Lessons

**work**
- **揀驗證對象時先問「壞咗會唔會變紅」**。RTW 之所以係啱嘅目標,係因為佢四格 `assignedQuantity` 全部非 0(22/20/19/17);揀個 assigned 全 0 嘅 OpCo,「assigned 冇變」就退化成 0→0,壞咗都照綠。呢個決定花咗一句 SQL,但佢係成個 V4 有冇意義嘅分水嶺。
- **先查再答**。Chris 問「刪咗有冇影響」,直覺答案(冇 FK ⇒ 冇影響)喺 schema 層面係啱嘅,但 `assign.service.ts:264` 一行 `increment: 1` 就推翻咗結論。如果照直覺答,就會做咗一個刪 row 嘅 reset。
- **`npm run lint` 排入收工清單**(CH-015 教訓)。今次中途紅過一次,**喺 push 前捉到**。

**didn't / friction**
- **第一版把 reset card 巢喺 import panel 入面**,即刻整爛 5 條既有 import test(佢哋 mock 成個 mutations module)。表面係 test 問題,實際係 import panel 冇理由要知 reset 用咩 hook —— 搬做兄弟之後視覺一樣、耦合消失、test 自然回綠。**test 掛得咁齊整,通常係設計喺度講嘢。**
- **PowerShell ↔ `curl.exe` / `psql` 嘅 quoting**又中兩次(JSON body、SQL)。修法同 CH-015 一樣:**寫檔案再餵**,唔好同 quoting 鬥。
- **Playwright 掉嘢喺 repo root**(截圖 + `.playwright-mcp/`),而且 `filename` 唔接受 scratchpad 絕對路徑(allowed roots 只有 repo)。收工要記得清。

**carry-over(已入 BACKLOG,本 CH 冇處理)**
- Catalog 有 **active/inactive 重複 `skuPartNumber`** 嘅 row ⇒ ledger 同一個 OpCo × 同一 partNumber 出現兩行(例:PFU-HK `SPE_E3` 94 同 108)。影響 ledger 顯示同 import 對映。

### Component design note status updates
- 無 —— 新 service 落既有 `LicenseModule`,前端係 Settings 既有 tab 加一張 card。

---

**End of CH-016 progress**
