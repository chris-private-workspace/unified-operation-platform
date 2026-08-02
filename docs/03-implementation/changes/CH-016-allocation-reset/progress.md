---
change_id: CH-016
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
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

- 🔴 **V10 browser 驗證做唔到,唔當佢過(H7)**。`claude-in-chrome` 連唔上(同 CH-015、同 memory `ui-verification-route` 一致),本 session 冇 Playwright MCP。
  - 替代證據:12 條 component test 真 render + 真 assert;所有 API 行為已用真 DB 前後對比證實。
  - **仍未證**:實際 light / dark render 觀感。→ 交 Chris 人手。

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

## Closeout(填於 status=closed)

### Acceptance verification
_(填)_

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Lessons
_(填)_

### Component design note status updates
_(填)_

---

**End of CH-016 progress**
