# CH-035 — checklist

> 由 `spec.md` §4 deliverable + §5 acceptance derive(PROCESS §3.4 步驟 4)。
> `D1` = **C**(「失敗咗」+ `whoFixes`),`D2` / `D3` 照建議。三個 deviation 見 `spec.md §9`。

## 落地

- [ ] `A` **API** —— 抽 `RUN_SELECT` 常數(跟 `TURN_SELECT` 先例,`DEV-2`),nested 攞
      最後一條 `failed` step 嘅 `whoFixes`,map 成純量
- [ ] `B` **DTO** —— `AgentConversationRunDto` 加 `whoFixes`(nullable · 受控字彙)
- [ ] `C` **`lib/who-fixes.ts`** —— 由 `assign-result-dialog.tsx` 抽出 `WHO_FIXES`,
      兩邊 import(`DEV-3`)。⚠️ 唔改文案一個字
- [ ] `D` **`api-types.ts`** —— `AgentConversationRun` 加 `whoFixes`
- [ ] `E` **`lib/assistant.ts`** —— `latestRunFailure()`:最新 run 係 `failed` / `expired`
      ⇒ 返佢,否則 `null`(`DEV-1`)
- [ ] `F` **`assistant.tsx`** —— failed 分支,transcript 之內、最後一個 turn 之下(`D3`)
- [ ] `G` **`agent-dock.tsx`** —— 同一個分支,**主句逐字一致**(`D2`)
- [ ] `H` **Test** —— helper · `/assistant` · dock · source scan

## Acceptance

- [ ] `G1` helper 認得 —— 三條:`failed` ⇒ 真 · `completed` ⇒ 假 ·
      **舊 run failed 但最新 `running` ⇒ 假**(「只睇最新」要同 `isThinking` 一致)
      ➕ `DEV-1` 加一條:`expired` ⇒ 真
- [ ] `G2` `/assistant` 講得出 —— `failed` ⇒ 出;`completed` ⇒ **唔出**
- [ ] `G3` dock 講得出 —— 同上
- [ ] `G4` 兩邊**主句**逐字一致 —— source scan(⚠️ 只守主句,`whoFixes` 係共用 const,
      見 `DEV-3`);falsification 道 2 **拆 dock 唔拆 assistant**
- [ ] `G5` 唔會同 `Thinking…` 一齊出 —— 明文 assert 互斥(`F5-3` 撞過「兩樣嘢一齊喺畫面」)
- [ ] `G6` H6 light + dark —— 兩 theme 真 render · 零橫向溢出 · `accentButtons` 最多一個
- [ ] `G7` root gate —— test / lint / build 三個 exit 0
- [ ] `G8` falsification ×4 —— 每道真紅零誤傷

## 收尾

- [ ] `spec.md` §6 補實際 falsification 結果
- [ ] `progress.md` 完成摘要
- [ ] `BACKLOG` `AGENT-RUN-FAILED-SILENT` → done
- [ ] `CLAUDE.md §0` + `SESSION_SUMMARY` 換座標
- [ ] 🚧 **DEV 上機** —— 要部署 #14(連同 CH-034)
