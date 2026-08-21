# CH-035 — checklist

> 由 `spec.md` §4 deliverable + §5 acceptance derive(PROCESS §3.4 步驟 4)。
> `D1` = **C**(「失敗咗」+ `whoFixes`),`D2` / `D3` 照建議。三個 deviation 見 `spec.md §9`。
> **2026-08-21 一日做完。**

## 落地

- [x] `A` **API** —— 抽 `RUN_SELECT` 常數(跟 `TURN_SELECT` 先例,`DEV-2`),nested 攞
      最後一條 `failed` step 嘅 `whoFixes`,map 成純量。⚠️ `detail` **刻意唔 select**
- [x] `B` **DTO** —— `AgentConversationRunDto.whoFixes`(nullable · enum 六個值)
- [x] `C` **`lib/who-fixes.ts`** —— 由 `assign-result-dialog.tsx` 抽出,**一個字冇改**;
      順手刪咗嗰邊變成 orphan 嘅 `AssignStepOwner` import(§1.3)
- [x] `D` **`api-types.ts`** —— `AgentConversationRun.whoFixes`
- [x] `E` **`lib/assistant.ts`** —— `latestRunFailure()` + `FAILED_STATUSES`
      (`failed` + `expired`,**`aborted` 明文排除**,`DEV-1`)
- [x] `F` **`assistant.tsx`** —— failed 分支,transcript 之內、最後一個 turn 之下(`D3`)
- [x] `G` **`agent-dock.tsx`** —— 同一個分支,**主句逐字一致**(`D2`)
- [x] `H` **Test** —— helper 7 條(**新檔**)· `/assistant` +4 · dock +2 · **api +4**

## Acceptance

- [x] `G1` helper 認得 —— **7 條**(`failed` · `expired` · `aborted` 唔算 · `completed` ·
      舊 failed 被蓋過 · 新 failed 喺舊 success 之後 · 空/undefined)
- [x] `G2` `/assistant` 講得出 —— `failed` 出 + `whoFixes` 句 · `expired` 出但**冇**
      第二句(`operator` 冇 line)· `completed` **唔出**
- [x] `G3` dock 講得出 —— 正面 + 負面各一
- [x] `G4` 兩邊**主句**逐字一致 —— source scan 第四句;falsification 道 2 **拆 dock 唔拆
      assistant** ⇒ `assistant.tsx` 三條行為 test 全綠 ⇒ **證到唔係 tautology**
- [x] `G5` 唔會同 `Thinking…` 一齊出 —— 🔴 **佢嘅獨立性由道 4 證,唔係由自己個 test 結構證**
      (見 `spec §6` ①)
- [x] `G6` H6 light + dark —— 四張 render:`insideTranscript: true` ×4 ·
      `thinkingOnScreen: false` ×4 · icon 色真 swap(`#c81e1e` → `#f47171`)·
      `accentButtons` assistant **1** / dock **0** · `overflowsX: false` ×4
- [x] `G7` root gate —— api **1495 / 98**(+4)· web **577 / 51**(+13)· lint 0 · build 0
- [x] `G8` falsification ×4 —— **4 / 2 / 1 / 2 紅,零誤傷**(見 `spec §6`)

## 收尾

- [x] `spec.md` §6 補實際結果 + §9 三個 deviation
- [x] `progress.md` 完成摘要(五件值得記住嘅事)
- [x] `BACKLOG` `AGENT-RUN-FAILED-SILENT` → done
- [x] `CLAUDE.md §0` + `SESSION_SUMMARY` 換座標
- [x] 🔴 **清返 render probe 嘅副作用** —— 兩條被誤 archive 嘅 thread 已 unarchive,
      DB 覆核 `archived = 0`(見 `progress.md` ④)
- [x] 🟢🟢 **DEV 上機 —— 部署 #14(`dev-4a92be0`)2026-08-21 做咗**。
      主句 marker **×0 → ×2**;`AgentConversationRunDto` props 由 `id, status, startedAt`
      → **`id, status, startedAt, whoFixes`**(enum 六個值逐個對上),`api-json`
      **90,341 → 90,596 B**。
      🔴 **開工揭到一個假 marker,而佢係我哋自己寫落文件嗰個** —— 本 checklist 上一版寫住
      CH-034「靠 CSS `self-start`」,而 `self-start` 喺舊版**四個檔已經用緊** ⇒ Tailwind
      一早生成咗嗰條 rule,`×0 → ×1` 結構上冇可能成立。改用 `max-w-full`(舊版**零檔**)。
      📌 **一份交接文件推薦嘅 marker,同一個外人推薦嘅,一樣要驗。**
- [ ] 🚧 **live 行為驗證(睇實物)** —— Chris 人手(要登入,AI 側刻意唔打 break-glass 密碼,H4)。
      ⚠️ 而本單個提示**喺 DEV 平時唔會出** —— 要一條真失敗嘅 run,而 DEV 側 Azure OpenAI 通
      ⇒ 同 CH-032 個 disconnected banner 一樣,**上到機唔等於見到**。
