---
bug_id: BUG-012
report_ref: ./report.md
status: in-progress     # in-progress | done
last_updated: 2026-08-21
---

# BUG-012 — Checklist

> 由 `report.md §7` acceptance 推導。
> ⚠️ **未開工** —— 等 Chris confirm repro + severity(PROCESS §4.5 步驟 2)。

## Investigation

- [x] **靜態證實 B** —— `ai-assist-card.tsx:251` early return 之下先至係 `:309` 個
      error render,而 `Run AI Assist` 只喺 `!run` 分支出現 ⇒ `start.error` 去唔到
      (2026-08-21,見 `report.md §6`)
- [x] **證實 error 一路傳到元件** —— `api.ts:130-144` `apiPost` 行 `errorFrom`(帶 body)·
      `mutations.ts:174-182` 冇食 error
- [x] **排除 DTO validation** —— `requestId` 係 `@IsString()`,cuid 合法
- [x] **列齊三條 400 路** —— `agent-profile.service.ts:270-277`(×2)·
      `ai-assist.service.ts:1322-1326`
- [x] **證實點解 test 全綠** —— `ai-assist-card.test.tsx:337` 唯一一條 error test 驗 `hide`,
      而 `hide` 一定有 run ⇒ 個位置對佢正確;`start.error` **零 test**
- [ ] 🔴 **A —— 攞 DEV 個 400 body 真文字**(要登入 session ⇒ **Chris 跑一句 console
      `fetch`**;AI 側唔打 break-glass 密碼,H4)。順帶攞
      `GET /agent/profiles?includeInactive=true` 每個 `active`
- [ ] `report.md §6` 補返 A 嘅答案

## Fix

- [x] **最小改動**(§1.3)—— 唔係喺 `!run` 分支抄多份,而係把個 banner **hoist** 做
      `failureNote`,兩個分支共用。⚠️ **兩份 JSX 就係兩個分支開始對「失敗長咩樣」
      有唔同意見嘅方法**
- [x] ⚠️ **`abort` / `hide` / `decide` 一個字冇改** —— 佢哋只可能喺有 run 嗰陣觸發,
      原本個位置對佢哋**完全正確**。本單唔係「error 區塊擺錯位」,係 **`start` 一個企錯咗邊**
- [x] ⚠️ **冇加 pre-flight / 冇 disable 個掣 / 冇加 profile picker**(§1.2)
- [x] 零 orphan —— inline 個 `(start.error || …)` 表達式整條由 `failureNote` 取代,冇剩
- [x] `!run` 分支包咗 `flex flex-col gap-[14px]`,**逐字同有 run 嗰邊一樣**
      (`Card` body 唔會幫 children 加間距,`card.tsx:47`)

## Regression Test

- [x] `T1` `says why a refused start was refused` —— `start.error` + **`showRun(null)`**
      ⇒ 訊息喺畫面。**fails-before 真跑:1 failed / 26 passed**
- [x] `T2` `shows no banner when the start has not failed` —— 🔴 **佢 fix 前後都綠**,
      所以佢**唔係** regression test 係 **guard**(擋住「render 一個 `undefined` 紅框」
      都算數);已喺 test 註釋寫明,唔可以當佢係第二條證據
- [x] `T3` 既有 `surfaces a failed hide` 仍然綠
- [x] `T4` / `T5` `/assistant` 兩條(`G9`)—— server 原句 · non-`ApiError` fallback
      (後者順帶 assert **唔會**印 raw JS error,同 CH-035 `D1`=C 一條線)
- [x] root gate —— api **1495 / 98** · web **581 / 51**(**+4**)· lint 0 · build 0

## Falsification(三道,全部真跑)

- [x] **道 1** = fails-before 本身 —— **1 紅**(新 test),而 vitest 個 DOM dump 印咗
      `!run` 分支入面只有 EmptyState + button
- [x] **道 2** 拆走**有 run** 分支個 `{failureNote}` —— **恰好 1 紅**,而紅嗰條係
      `surfaces a failed hide`。🟢 **兩件事一次過證到**:①舊 test 真係守住嗰半
      ②新 test **冇**同時蓋住兩邊(佢照綠)⇒ 兩個分支互相獨立
      (CH-035 `G5` 學到「互斥要拆分支先證得到」)
- [x] **道 3** 把 `start.error` 由 `failure` 個 `??` 鏈拆走(**保留 render**)——
      **恰好 1 紅**,紅嗰條係新 test ⇒ 佢綁住嘅係 **`start` 呢個來源**,
      唔係「畫面有個紅框就算數」
- [x] **道 4** 拆走 `/assistant` 個 render(`G9`)—— **恰好 2 紅**,兩條都係新加嘅,零誤傷

## Verification

- [x] `G5` **同族面掃過 —— 兩個唔同答案**:dock 🟢 `create.error` 真係 render
      (`agent-dock.tsx:180` → `:415-420`)· `/assistant` 🔴 **零 render**
      (`assistant.tsx:95`/`:235`)
- [x] `G9` **`/assistant` 一併修**(Chris 2026-08-21 決定,`report.md §9`)——
      ⚠️ **修法同 card 唔同,而唔同係啱嘅**:嗰邊要 hoist 係因為有 early return,
      呢邊只有一個分支 ⇒ 直接加返 render 就夠,**唔好為咗「一致」而抄一個唔需要嘅結構**。
      Test **+2**(server 原句 · non-`ApiError` fallback);fallback 文案**逐字抄 dock**
      (CH-032 `D2` 同一理由)。**falsification 道 4:拆走佢 ⇒ 恰好 2 紅**,零誤傷
- [x] `G6` H6 light + dark render —— **四張,verdict 四個全 `true`**(Chris 2026-08-21
      批准借 5433;`page.route` 注入 400,冇殺 api)。
      🟢 **`V3`(本條真正嘅理由)**:`emptyState.width` **337** = `wrapper.width` **337**,
      wrapper class 讀返出嚟逐字係 `flex flex-col gap-[14px]` ⇒ **量緊嘅就係我新加嗰個**
      (CH-034 教訓:連身份一齊印),而佢**冇改變 EmptyState 個 box**
      🟢 `V2` banner 底 483 + `gap-[14px]` ≈ emptyState top 498 · `V1` 主句逐字 ·
      `V4` `overflowsX: false` ×4
      🟢 **token 真 swap**:`rgb(200,30,30)` → `rgb(244,113,113)`(fg)·
      `rgb(252,234,234)` → `rgb(42,17,19)`(bg)⇒ DS-1 唔係 hardcode。**零新 button** ⇒ DS-3 冇郁
      🔴 **順帶捉到一句寫錯咗嘅註釋** —— 見 `report.md §10`
- [ ] 🚧 `G8` **DEV 重跑 `report.md §2a`** —— ⚠️ **有前提**:要 A 嗰邊仲係失敗狀態先驗到。
      若 A 係 profile 問題而中途開返咗 profile,呢條就**冇嘢可以驗**
      (同 CH-032 banner / CH-035 提示「上到機唔等於見到」同族)⇒ 到時要人為造一次失敗

## Closeout

- [ ] `progress.md` closeout summary(timeline + root cause + lessons)
- [ ] Sev3 ⇒ `postmortem.md` optional。🟡 **但本單係同族第五次**,closeout 時決定寫唔寫
- [ ] `RISK_REGISTER.md` —— 睇下「UI 有 render code 但分支去唔到」算唔算新 pattern
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `report.md` status → `done`;`progress.md` status → `closed`
- [ ] `CLAUDE.md §0` + `SESSION_SUMMARY` 換座標

---

## Cross-Cutting

- [ ] 每個 commit 對應 `progress.md` Day-N(R2)
- [ ] Commit message `fix(web): …`
- [ ] 零 ADR 觸發(純 UI render 位置,唔掂架構)—— closeout 時覆核(R5)
- [ ] 冇 open question 變動(R4)
