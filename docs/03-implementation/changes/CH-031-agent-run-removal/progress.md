---
change_id: CH-031
status: done          # 🟢 2026-08-17 merged(PR #117)· 🚧 淨低 G1/G2 DEV live,等部署 #10
---

# CH-031 — progress

## Day 1 — 2026-08-17(開單 → merge,同一日)

### 發生咗咩

Chris 要求「開單處理 `DELETE /agent/runs/:id`」,起因係部署 #9/#9b 喺 DEV 留低兩個測試 run 清唔到。

**查證之後交嘅嘢唔係佢逐字要求嗰樣**,而個轉向係本單最重要嘅內容:

1. 三張子表(`AgentStep` / `AgentMessage` / `AgentProposal`)喺 **migration SQL 層面**全部
   `ON DELETE CASCADE`,而佢哋就係 audit 真相 ⇒ hard delete 會帶走 transcript
   (推翻 `ADR-0036 D6`)同 `approvedById`。
2. `ADR-0022 D1` 喺 `OpcoSkuLedger` 撞過**結構上一模一樣**嘅形狀,原文:「同樣效果,單邊代價
   ⇒ 唔取」。
3. ⇒ 提咗四個選項畀 Chris 揀,**佢揀 B(soft-hide)**,`ADR-0040` 寫咗兼同日 Accepted。

### 時序

| 步 | 內容 |
|---|---|
| 開單 | `spec.md` v0.1 `proposed`,§6 acceptance **刻意留空**(選項未定就填 acceptance 係假嘅) |
| 決定 | Chris 揀 B → spec v1.0 `approved` + `ADR-0040` 八條 D |
| 批 ADR | Chris 批,連 §4.2 兩條 AI 加嘅 deviation(`unhide` · ADMIN-only)|
| 實作 | schema + migration + API + audit + 前端 + boundary 守衛 |
| Gate | api 1362 → **1381 / 92** · web 439 → **450 / 43**,零紅;lint / build / tsc 全 exit 0 |
| 真環境 | `A2` migration 對真 PG · `E3` light+dark 真 render |
| Merge | PR **#117**,四個 commit 逐個 `--is-ancestor` 驗過,branch 兩邊已刪 |

## 🔴 值得記低嘅(唔係流水帳)

### 1. 「守衛缺席」同「守衛放行」係兩件事

`agent.boundary.spec.ts` 有一條「一張表一個 writer」嘅靜態 test,覆蓋 `agentStep` /
`agentProposal` / `agentMessage` —— **但冇 `writersOf('agentRun')`**。即係話當時喺任何檔案加一句
`prisma.agentRun.delete(...)`,**冇任何一條 test 會紅**。

呢個唔係「有人決定過刪 run 冇問題」,係**冇人問過呢條問題**。本單自己新增咗一個 `agentRun`
writer,所以順手補咗(`ADR-0040 D8`)。⚠️ verb list **仍然冇 `deleteMany`** ⇒ 登咗
`agent-boundary-gaps`。

### 2. 加咗守衛之後一定要驗佢會唔會空轉

補完 `writersOf('agentRun')`,我喺**第二個檔案**加咗一個**真** `agentRun.update` writer
⇒ **1 紅 / 16 綠**。⚠️ 唔用註釋做 falsification —— 個 check 係文字比對,註釋會**假紅**
(W38/CH-029 撞過:「我自己寫嘅註釋整紅咗 seam boundary test」)。

### 3. assert query,唔 assert 數字

`C1` 要證「hide 唔會郁 R13」。**冇**去比較 hide 前後兩個數字,而係 assert `review-stats` 兩個
`where` **永遠唔提 `hiddenAt` / `run`**。

理由:**數字可以啱得好彩,一個從來冇提過嗰個欄嘅 `where` 結構上濾唔到。**
順帶用 `JSON.stringify(where).not.toContain('hidden')` 兜住 nested 寫法 —— `toHaveProperty(key)`
對 `undefined` 一樣 pass(BUG-011 教訓)。

### 4. 有時「唔寫新 test」先係啱

`C2`(kill switch 唔受影響)我**冇寫新 test** —— 既有嗰條本身就係 exact-match
`toHaveBeenCalledWith`,加 `hiddenAt` 落去佢自己會紅。只補咗註釋標明佢而家兼任 `D4` 守衛。
**寫多一條係重複,唔係嚴謹。**

### 5. RBAC 用 derive 出嚟嘅矩陣驗,好過自己砌 mock guard

`permissions.spec.ts.snap` 由 `@Roles` decorator **真 derive**。加兩條 route 之後 diff 係
**`2 insertions, 0 deletions`,兩行都 `→ roles [ADMIN]`** —— 呢個直接證明 `D7` 收窄生效,
比任何 controller unit test 都強。

### 6. render 前後對照,比單張截圖有用

`E3` 影咗**兩組**:before(最新 run `awaiting_approval`)有 `Stop` 冇 `Hide`;真 API abort 之後
有 `Stopped` + `Hide` 冇 `Stop`。**個對照本身就係 `D6` 個閘嘅證據**,單影一張證唔到。

## ⚠️ 環境上撞到嘅嘢(全部 §9 早有記錄,靠佢慳返時間)

| 撞到 | 點解決 |
|---|---|
| **本機 DB 同另一個 worktree 共用,佢開緊 W47** | DB 有 `w47_agent_profile` 而本 branch 冇 ⇒ **唔可以 `migrate dev`**(會提議 reset),改用 **`migrate deploy`**。已寫入 BACKLOG + SESSION_SUMMARY |
| **build-cache 假綠燈** | `verify.ps1` 90s 後 3100 仍 FREE + leak watch 偏少 ⇒ SOP 個 discriminator `Test-Path dist\main.js` = False ⇒ 刪 `*.tsbuildinfo` + `dist/` 直接起,**10 秒起到** |
| **交還 5433** | 必須 `--force-recreate`(慳咗會「Started 但 host 冇 listener」);`docker port` + 真 TCP 驗,其餘四個 container uptime 冇動 |
| **另一個 worktree 跑緊 jest** | `kill-zombies` dry-run 逐行核過:19 條全部 trace 得返本 worktree,零條屬人哋 |
| **Git Bash 把 `/requests/...` 當路徑轉換** | 改用 PowerShell 跑 `render-check.mjs` |
| **`.git/index.lock` 殘檔** | 0 bytes、無 git process ⇒ 確認 stale 先清 |

## H4

- 為登入而 seed 嘅 `admin@uop.local` **已刪**;密碼隨機生成、寫入 scratchpad、**冇印出嚟**、用完刪咗
- 兩組截圖含真 UPN ⇒ **驗完即刪**(`render-check.mjs` header 自己都咁要求)
- ⚠️ seed 順帶 upsert 咗 **24 個 OpCo + 兩個既有 user**(值同原本一樣,但**冇逐個對過**)

## 測試資料還原

改之前 SELECT 過**每一個會寫嘅欄**(CH-030 教訓)。還原後:
`awaiting_approval` / `endedAt` NULL / **6 steps** 逐字對返;唯一 proposal 全程冇變
(佢一早 `failed`,冇 pending ⇒ abort 結構上掂唔到佢,而呢個係**事前預測、事後驗證**嘅)。

## 🚧 淨低

- **`G1` / `G2`** —— DEV live:兩個測試 run 真係唔再喺 request detail 出現,而 `GET :id`
  仍然攞得返(**兩邊都要驗,只驗一邊證唔到 `D3`**)。要**部署 #10**。
- `agent-boundary-gaps`(`deleteMany` verb)—— 獨立候選。
