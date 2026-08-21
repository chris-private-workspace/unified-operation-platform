---
bug_id: BUG-012
report_ref: ./report.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
---

# BUG-012 — Progress

> 每 commit 必須對應一個 Day-N entry mention(R2)。

---

## Day 1 — 2026-08-21

### Done

- Chris 喺 DEV(`dev-4a92be0`)`/requests/cmt13zzdw0033zg018t1ckmu0` 撳
  `Run AI Assist`,畫面零反應,console 得一行 `POST /api/agent/runs 400`
- 靜態追完成條路:`mutations.ts` → `api.ts` → `ai-assist-card.tsx`,確認 error
  **一路傳到元件**先至死
- 開單(report + checklist + 本檔),**未落任何 code**

### Diagnosis update

🔴 **一開始睇落似一件事,實際係兩件,而且唔同層:**

- **A**(未定)—— server 點解返 400。三條可能,全部有明文 message,見 `report.md §6`
- **B**(**已證**)—— 呢個 message **結構上冇可能出現喺畫面**

**B 唔使等 A。** `ai-assist-card.tsx:251` 有個 `if (!run) return`,而 error 個 render
喺 `:309`(early return 之後);而 `Run AI Assist` 個掣**只喺 `!run` 分支出現** ⇒
`start.mutate()` 失敗嗰刻必然 `run == null` ⇒ 去唔到 `:309`。

🟢 **另外三個 mutation 冇事** —— `abort` / `hide` / `decide` 全部只可能喺有 run 嗰陣觸發。
**唔係成個 error 區塊擺錯位,係得 `start` 一個企錯咗邊。** 呢個分辨好緊要,
因為佢直接決定 fix 係「搬一個」定「搬成塊」。

### Decisions

- **本單 scope = B 一件事。** A 無論最後係邊條,B 都要修 —— 而 A 有兩條(profile 相關)
  嘅答案根本唔係 code 問題,係 DEV 資料
- **唔加 pre-flight / 唔 disable 個掣 / 唔加 profile picker**(§1.2)——
  本單修「唔講」唔係修「點解拒絕」
- Severity **Sev3**,理由 + 唯一會升做 Sev2 嘅條件寫咗喺 `report.md §5`

### Blockers

- 🔴 **A 攞唔到答案** —— 要登入 session 先打得 `POST /agent/runs` 攞個 body,
  而 AI 側刻意唔喺瀏覽器打 break-glass 密碼(H4,沿用 CH-015 / CH-032 / CH-034 先例)。
  ⇒ 已寫好一段 console `fetch` 交返 Chris(先讀 profiles 後 POST,先唯讀嘅次序)
- ⏸️ **等 triage confirm** —— PROCESS §4.5 步驟 2,用戶 confirm repro + severity 先開始投查

### 值得記低嘅一件事

**「有 render code」同「嗰段 render code 行得到」係兩件事,而 test 冇問到第二件。**

`ai-assist-card.test.tsx:337` 係唯一一條 error test,驗 `hide`;佢 `showRun(RUN({status:
'completed'}))` ⇒ 有 run ⇒ 走到 `:309` ⇒ 綠。個 assert 本身冇問題,**佢證嘅嘢亦係真嘅** ——
只不過佢證嘅係「`hide` 嘅 error 睇得到」,而唔係「呢個 render 位置對每個 mutation 都啱」。
`start.error` **一條 test 都冇** ⇒ 冇任何嘢會紅。

📌 同 W45 `apiPatch`(UI test 自砌 `ApiError` 連 `detail`)、BUG-011(三層各自喺自己邊緣停低)
**同族第五次**:每一層都正確,而缺陷住喺兩層之間 —— 今次係住喺**同一個檔嘅兩條分支之間**。

---

## Day 1(續)— Chris confirm Sev3 ⇒ 修 B

### Done

- Branch `fix/bug-012-ai-assist-start-error-invisible`(由 `main` `cc75e61` 開)
- **先寫 test 後寫 fix**,fails-before 真跑:**1 failed / 26 passed** ⇒ 再實作 ⇒ **27 綠**
- Fix:`failureNote` **hoist** 出兩個分支之上,`!run` 分支包一個 `flex flex-col gap-[14px]`
  (逐字同有 run 嗰邊一樣 —— `Card` body 唔會幫 children 加間距)
- Falsification **三道全部真跑**,見 `checklist.md`
- root gate:api **1495 / 98** · web **579 / 51**(+2)· lint 0 · build 0
- `G5` 掃同族面 ⇒ 掃到一件唔喺 scope 嘅嘢,登咗 `report.md §9`

### Decisions

- 🔴 **修法唔係「把 error 區塊搬去 `!run` 分支」,係 hoist** —— 因為
  `abort` / `hide` / `decide` 喺原本位置**完全正確**(佢哋只可能喺有 run 嗰陣觸發)。
  搬走佢哋 = 為咗修一個而整爛三個;抄多份 = 兩個分支將來對「失敗長咩樣」各講各。
  ⇒ **本單真正嘅缺陷係「`start` 一個企錯咗邊」,唔係「個區塊擺錯位」**,而呢個分辨
  直接令 diff 由「搬一大嚿」變成「三行」。
- **`T2`(`shows no banner…`)明文標成 guard 唔係 regression test** —— 佢 fix 前後都綠。
  🔴 唔標清楚嘅話,收單時數「兩條新 test」就會**高估咗證據**:真正證到嘢嘅得一條。
- **`/assistant` 唔郁**(§1.3)—— 掃到但唔喺 scope,交返 Chris 決定(`report.md §9`)。

### Blockers

- 🚧 **`G6` render 未做** —— 要起本機 stack,而 5433 喺 `ai-doc-extraction-db` 手上,
  **要 Chris 批**。⚠️ **唔可以因為「理論上冇分別」就當佢冇風險**:`!run` 分支多咗一層
  flex wrapper,而三個「應該冇事」嘅理由**全部係推論**。
- 🚧 **`G8` DEV 未驗** —— 兼且有前提(A 要仲係失敗狀態)。
- ⚠️ **A 到而家仲係未知** —— console 一句未跑。**本單刻意冇等佢**,因為 B 唔依賴 A。

### 值得記低嘅第二件事

**falsification 道 2 一次過答咗兩條唔同嘅問題,而佢哋方向相反。**

拆走**有 run** 分支個 `{failureNote}` 之後:
- `surfaces a failed hide` **紅** ⇒ 舊 test 真係守住嗰半(我 hoist 冇整爛佢)
- 新 test **照綠** ⇒ 佢**冇**偷偷同時蓋住兩邊

📌 如果三道都拆同一個位,「兩個分支互相獨立」呢件事**由頭到尾冇驗過** ——
同 CH-032 道 2「刻意拆 dock 唔拆 `assistant.tsx`」係同一個手法。

### Effort

- Planned:—;Actual:診斷 0.5h + 修 1.0h;Variance:—

### Commits

| Hash | Subject |
|---|---|
| `7b1256b` | `fix(web): BUG-012 —— Run AI Assist 失敗要講出嚟` |

---

## Day 1(續 2)— Chris 兩個決定:做 `G6` · `/assistant` 一併修

### Done

- **`/assistant` 一併修**(`G9`)—— test +2,falsification **道 4:恰好 2 紅**,零誤傷
- **`G6` render 做咗** —— 借返 5433(Chris 批;`ai-doc-extraction-db` 停咗,image
  `postgres:15-alpine` **pinned** ⇒ 還原安全)· 起 stack(api 200 @ 15s · web 200 ·
  proxy 200 · 進程 11 健康)· 四張 light/dark,**verdict 四個全 `true`**
- root gate 重跑:api **1495 / 98** · web **581 / 51**(**+4**)· lint 0 · build 0

### Decisions

- 🔴 **`/assistant` 唔跟 card 用同一個修法,而唔同係啱嘅** —— card 要 hoist 係因為
  **有 early return**;`/assistant` 只有一個分支,直接加返 render 就夠。
  📌 **為咗「兩邊睇落一致」而抄一個唔需要嘅結構,就係 §1.2 講嗰種 over-engineering。**
  真正需要逐字一致嘅係**文案**(fallback 抄 dock),唔係結構。

### 值得記低嘅第三件事(本單最抵)

**一個為咗驗 A 而做嘅 probe,順帶捉到 B —— 而 B 冇任何 gate 捉得到。**

`G6` 個 probe 本來只係想答一條:我喺 `!run` 分支加嘅 `flex flex-col` wrapper,
有冇郁到 EmptyState 個 box(答案:冇 —— 兩個都係 **337**)。
但同一份 report 印低嘅座標,順手證偽咗**我自己啱啱寫落 `assistant.tsx` 嗰句註釋**:
我寫「Sits BELOW the button」,實測 banner `top: 165` 喺一個 `flex flex-wrap
items-center` row(`top: 157`,高 34)入面 ⇒ **佢喺個掣右邊,唔喺下面**。

🔴 **點解冇嘢會紅**:test 問「訊息喺唔喺畫面」⇒ 綠;lint / tsc ⇒ 綠;
而註釋描述嘅係**視覺位置**,DOM 順序上佢**確實**喺 button 之後 ⇒ **半啱**,
連讀 code 嗰個都好可能唔會停低。

📌 同 CH-033「兩份註釋互相矛盾」同族,但機制唔同:嗰次係兩份文件對唔上,
**今次係一份註釋同 render 出嚟嘅畫面對唔上**。
⇒ **幾何 probe 印低嘅座標,順帶就係註釋嘅事實核查** —— 呢個係做 render 嘅第二個回報,
而佢唔喺任何 acceptance 入面。

### Blockers

- 🚧 **`G8` DEV 未驗** —— 要部署,兼且有前提(A 要仲係失敗狀態)。
- ⚠️ **A 仍然未知** —— console 一句由頭到尾未跑過。**本單由頭到尾冇等佢**,而事後睇,
  呢個判斷係啱嘅:B 修完,A 係邊條都唔改變 diff。

### Effort

- Planned:—;Actual:診斷 0.5h + 修 1.0h + `/assistant` & render 1.0h

### Commits(續)

| Hash | Subject |
|---|---|
| `6be2d5d` | `fix(web): BUG-012 G9 —— /assistant 開對話失敗一樣要講 + G6 render` |

### 收工

- 5433 **還咗** —— `docker compose … up -d --force-recreate postgres`(**`--force-recreate`
  唔可以慳**,SOP 實測慳咗就白做一輪);收貨標準係 **`docker port` 有 binding +
  真 TCP `True`**,唔係 `docker ps` 個 healthy flag。
- 覆核:`ai_document_extraction` DB 喺返度(named volume 冇冧)· 同項目其餘四個
  container **uptime 全部 5 days,冇動** · `uop-redis` 刻意留住(佔 6379,唔衝突)。

---

---

## Day 1(續 3)— 部署 #15 + `G8` 收 + A 有答案

### Done

- **部署 #15(`dev-7dc3811`)** —— 七步同 #6–#14 一致,五條證據全中,詳見
  `docs/13-deployment/09-dev-as-built.md`
- **`G8` 收** —— Chris 喺 DEV 撳,**紅框出咗**:
  `This request has no free-text wording for AI-Assist to read`
- **A 同時答咗 = `A3`**

### 🔴 我估錯咗 A,而擋住個錯結論嘅係一句寫低咗嘅限制

開單時我寫「**A1 嫌疑最大**」,理由係部署 #12 收工紀錄寫住 DEV 三個 profile 全部
`active: false`。**答案係 `A3`。**

🟢 但我同時寫咗「呢個係**紀錄唔係當日實測**,唔可以當答案」。
⇒ **如果當時把 A1 當事實,下一步就會係「開返一個 profile」,而開完之後個 400 照出**
—— 因為根因由頭到尾唔喺嗰度。📌 **一個標明咗「未驗」嘅假設,同一個當咗事實嘅假設,
喺文件上只差一句,喺後果上差一整輪白做。**

### 🔴 一個唔可以順住推落去嘅位

**`A3` 出現,推論唔到 DEV profile 嘅狀態。** `assertHasText` 喺
`ai-assist.service.ts:150`,而 `resolveForRun` 喺 `:258`(`queueRun` 入面)⇒
執行停咗喺文字檢查,**profile 三條閘由頭到尾冇跑過**。

📌 同「`sync-check` 返 `FOUND` 證明唔到個 user 存在」同族:
**一個閘冇報錯,唔等於佢後面嗰啲閘過咗。**

---

## Closeout(status = closed)

### Root Cause(final)

**兩件事,唔同層。**

**B(本單修嘅)**:`ai-assist-card.tsx` 個 error banner 排喺 `if (!run) return` **下面**,
而觸發佢嘅 `Run AI Assist` 掣**只存在於上面嗰個分支** ⇒ `start.mutate()` 失敗嗰刻必然
`run == null` ⇒ **結構上永遠 render 唔到**。error 本身一路傳到咗元件(`apiPost` 行
`errorFrom`,帶 body)—— **唔係「冇寫」,係「寫咗但去唔到」**。
`G5` 掃同族面喺 `/assistant` 揾到**第二個實例**(`create.error` 零 render)。

**A(觸發場景,唔係 bug)**:嗰張 request 冇 free-text remark,`assertHasText` 拒絕。
**平台拒絕係啱嘅** —— 本單修好嘅係:呢個啱嘅拒絕,由「撳極都冇反應」變成一句人睇得明嘅說話。

### Fix Summary

`ai-assist-card.tsx` 把 banner **hoist** 做 `failureNote`,兩個分支共用(**唔係**搬 ——
`abort`/`hide`/`decide` 喺原位完全正確);`!run` 分支包一個 `flex flex-col gap-[14px]`,
逐字同另一邊一樣。`assistant.tsx` 直接喺個掣後面加返 render(**冇 hoist**,佢只有一個分支
—— 為咗「兩邊睇落一致」而抄一個唔需要嘅結構就係 over-engineering)。
零新 token · 零新 button · 零 api 改動 · 零 schema · 零 ADR。

### Regression Test

- `ai-assist-card.test.tsx` › `no run yet` › **`says why a refused start was refused`**
  —— `start.error` + `showRun(null)`。**fails-before 真跑:1 failed / 26 passed**
- `assistant.test.tsx` › **`says why a refused open was refused`** +
  **`falls back to the dock's wording when there is no server sentence`**
- ⚠️ `shows no banner when the start has not failed` **fix 前後都綠** ⇒ 佢係 **guard
  唔係 regression test**,已喺 test 註釋標明

**Falsification 四道全部真跑,每道紅嘅條數同身份都對得上**(1 / 1 / 1 / 2 紅,零誤傷)。

### Lessons

1. 🔴 **「有 render code」同「嗰段 render code 行得到」係兩件事,而 test 冇問第二件。**
   唯一一條 error test 驗 `hide`,而 `hide` 一定有 run ⇒ 個位置對佢完全正確 ⇒ 綠。
   `start.error` 零 test ⇒ 冇任何嘢會紅。(⇒ 升級做 **`R38`**)
2. 🔴 **修法係 hoist 唔係搬,而呢個分辨令 diff 由「一大嚿」變三行** ——
   分清「個區塊擺錯位」同「其中一個 source 企錯咗邊」。
3. 🔴 **falsification 道 2 一次過答咗兩條方向相反嘅問題** —— 拆走**有 run** 分支個
   banner ⇒ 舊 test 紅(佢真係守住)+ 新 test 照綠(佢冇同時蓋兩邊)。
   若四道都拆同一個位,「兩個分支互相獨立」由頭到尾冇驗過。
4. 🔴 **`G6` render 順帶證偽咗我自己啱啱寫嘅一句註釋**(`report.md §10`)——
   「Sits BELOW the button」實測係喺個掣**右邊**。冇任何 gate 捉得到,因為
   DOM 順序上佢確實喺 button 之後 ⇒ **半啱**。
   ⇒ **幾何 probe 印低嘅座標,順帶就係註釋嘅事實核查。**
5. 🔴 **一個標明咗「未驗」嘅假設,救咗一輪白做** —— A1 估錯,而「紀錄唔係實測」
   嗰句令我冇去開 profile。
6. 🔴 **`A3` 推論唔到 profile 狀態** —— 閘有先後,前面嗰個攔住咗,後面嗰啲根本冇跑。

### 證據來源要分清楚

| 收貨項 | 來源 |
|---|---|
| `G1`–`G7` · `G9` · falsification ×4 | **AI tool 驗**(test 輸出 · render probe · gate) |
| 部署 #15 五條證據 | **AI tool 驗**(HTTP · `docker cp` · ARM) |
| **`G8` DEV 睇實物** | **Chris 人手**(要登入,H4 —— AI 唔打 break-glass 密碼) |

---

**End of BUG-012 progress**
