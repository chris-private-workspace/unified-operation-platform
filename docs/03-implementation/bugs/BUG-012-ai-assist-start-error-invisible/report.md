---
bug_id: BUG-012
title: "撳 Run AI Assist 失敗時畫面完全冇反應 —— error 分支結構上去唔到"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: verifying       # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-08-21
reporter: "Chris(DEV live)"
affects_components: [apps/web/components/requests/ai-assist-card]
spec_refs:
  - CH-032 §「一句話蓋兩件事」—— 失敗要講出嚟,唔可以留白
  - CH-035 §4 —— run 失敗要喺畫面講(本單係同族嘅上游:run 開都開唔到)
  - ADR-0029 —— 錯誤原因要到得返操作員面前(W45 `apiPatch` 同族)
---

# BUG-012 — 撳 `Run AI Assist` 失敗時畫面完全冇反應

> **Report version**:1.1(§6 補 `G5`、新增 §9)
> **Triage approver**:**Chris(2026-08-21 — confirm Sev3,開工修 B)**

## 1. Symptom

喺 request detail 頁撳 `Run AI Assist`,**畫面一啲反應都冇** —— 冇 run 出現、冇錯誤訊息、
冇 toast,個掣彈返原狀。淨係開 browser console 先見到:

```
index-9VsTcD40.js:336  POST https://rapo-uop-web-dev.rci-t.com/api/agent/runs 400 (Bad Request)
```

🔴 **兩件事要分清楚,佢哋唔同層**:

| | 事實 | 狀態 |
|---|---|---|
| **A** | server 返 400,而且**佢有講原因**(NestJS error body 有 `message`) | 根因未定,見 §6 |
| **B** | 呢個原因**結構上冇可能出現喺畫面** | **已由 code 證實** |

**本單修嘅係 B。** A 係觸發場景 —— 而無論 A 最後係邊條,B 都一樣要修,因為 B 令
**任何**一種失敗都變成靜默。

## 2. Reproduction Steps

### 2a. 用戶實際踩到嗰條(DEV)

1. 登入 `https://rapo-uop-web-dev.rci-t.com/`
2. 去 `/requests/cmt13zzdw0033zg018t1ckmu0`
3. 喺 AI Assist card 撳 `Run AI Assist`
4. **觀察**:畫面零變化;console 有 `POST /api/agent/runs 400`

**Reproduction reliability**:Always
**Environment**:DEV(`dev-4a92be0`,部署 #14)· Chrome

### 2b. 結構性重現(唔使 DEV,唔使真 400)

任何令 `POST /agent/runs` 失敗嘅情況都得,因為缺陷唔喺 400 嗰邊:

1. 令 `useStartAgentRun` 個 mutation 進入 error 狀態(test 側 = `start.error` 畀個 `Error`)
2. 而 `run == null`(即冇 run —— 呢個係撳嗰個掣嘅**唯一**前提)
3. **觀察**:個 error `<div>` 唔會 render

⚠️ 呢條係本單真正嘅 repro —— 佢**唔需要**知道 A 係咩,亦即係話 fix 唔應該等 A。

## 3. Expected vs Actual

- **Expected**:server 拒絕開 run 時,拒絕嘅**原因**出喺 AI Assist card 上面
  (三句可能嘅原文見 §6),同 `hide` / `abort` / `decide` 失敗時嘅行為一致。
- **Actual**:`start` 失敗**冇任何 UI**。而 error 本身**一路傳到咗元件**:
  - `apps/web/src/lib/api.ts:130-144` — `apiPost` 行 `errorFrom(res, …)` ⇒ **body 有帶落嚟**
    (W45 修 `apiPatch` 嗰次順帶記低咗 `apiPost` 由 CH-019 起就有)
  - `apps/web/src/hooks/mutations.ts:174-182` — `useStartAgentRun` 冇食 error
  - `apps/web/src/components/requests/ai-assist-card.tsx:309` — 有 render code,`start.error` 排第一個

  ⇒ **唔係「冇寫」,係「寫咗但去唔到」。**

## 4. Impact

- **Affected users / scenarios**:所有 ADMIN / REGIONAL 用戶,喺 `POST /agent/runs`
  被拒嘅**每一種**情況(§6 列三種,將來新增嘅一樣中)。
- **Workaround available?**:Yes,但**唔係一般用戶做得到嘅** —— 要開 browser console
  自己打 `fetch` 讀個 body。
- **Data loss / corruption?**:No。
- **Security implication?**:No。⚠️ 但反方向值得記:fix 係**把 server 個 message 出畫面**,
  而嗰三句已經係受控文案(唔含 UPN / secret / 內部座標),同 CH-035 `D1`=C 揀「受控字彙
  唔顯示 raw error」嘅理由一致 —— 呢度唔會引入新嘅外洩面。

## 5. Severity Justification

**Sev3**(`PROCESS.md §4.4` = Minor feature degraded / specific impact):

- **唔係 Sev2** —— AI Assist 係 assistive surface,唔喺 licence 履行 critical path
  (sync gate / assign / ledger 全部唔受影響);request 照開照派。
- **唔係 Sev4** —— 唔係 cosmetic。用戶得到嘅資訊係**零**,而且「冇反應」呢個外觀
  同「系統壞咗」無法分辨 ⇒ 佢會重覆撳,或者當整個 AI Assist 壞咗。
- 🔴 **提升 Sev3 → Sev2 嘅唯一條件**:如果 §6 個根因係 **A(零 active profile)**,
  咁 DEV 側「AI Assist 完全用唔到」已經係事實 —— 但嗰個係**環境資料**問題,
  唔係本單修嘅 code,所以唔喺本單提 severity。

## 6. Initial Diagnosis(updated as investigation progresses）

### 已證實(2026-08-21,靜態 code 分析)

**`ai-assist-card.tsx` 有一個 early return,而 error render 喺佢下面:**

| 行 | 內容 |
|---|---|
| **251** | `if (!run) { return <Card …>` … `EmptyState` + `Run AI Assist` 掣 … `</Card>; }` |
| **276** | `return (<Card …>` ← 有 run 先到呢度 |
| **309** | `{(start.error \|\| abort.error \|\| hide.error \|\| decide.error) && <div …>}` |

而 `Run AI Assist` 個掣**只喺 `!run` 嗰個分支出現**(251-274) ⇒
`start.mutate()` 可以失敗嘅唯一時刻就係 `run == null` ⇒
**`start.error` 結構上冇可能行到 line 309。**

🟢 另外三個(`abort` / `hide` / `decide`)**冇問題** —— 佢哋全部只可能喺有 run 嗰陣觸發,
即個 render 位置對佢哋完全正確。**只有 `start.error` 一個企錯咗邊。**

### 點解四層 test 全綠(值得記,同 W45 / BUG-011 同族)

`ai-assist-card.test.tsx:337` `surfaces a failed hide instead of swallowing it` —— 
**唯一一條 error test 驗嘅係 `hide`**,而佢 `showRun(RUN({ status: 'completed' }))`
⇒ 有 run ⇒ 走 line 276 嗰個分支 ⇒ **綠**。

**`start.error` 一條 test 都冇。** 個 render 位置對已測嗰個 case 完全正確,
所以「同一個位置對另一個 case 去唔到」冇任何嘢會紅。

### 待定 — A(400 本身係邊條)

`POST /agent/runs` 有**三條** 400 路,body 個 `message` 逐句唔同:

| # | 條件 | server 原文 | 出處 |
|---|---|---|---|
| A1 | **零** active profile | `This agent has no active profile, so there is no model to run it on` | `agent-profile.service.ts:270-274` |
| A2 | **多過一個** active 而 body 冇 `profileId` | `This agent has N active profiles — say which one to run on` | `agent-profile.service.ts:275-277` |
| A3 | request 冇 free-text remark | `This request has no free-text wording for AI-Assist to read` | `ai-assist.service.ts:1322-1326` |

🟢 **排除咗 DTO validation**:`StartAgentRunDto.requestId` 係 `@IsString()`
(`dto/agent-run.dto.ts:25`),而 URL 個 id `cmt13zzdw0033zg018t1ckmu0` 係 cuid ⇒ 合法。

🔴 **`useStartAgentRun` 從來唔送 `profileId`**(`mutations.ts:177`
`apiPost('/agent/runs', { requestId })`)⇒ A1 / A2 兩條**都**行得通。

**A1 嫌疑最大但未經實測** —— 部署 #12 收工紀錄寫住「DEV 三個 `AgentProfile` 全部
`active: false`」。⚠️ 呢個係**紀錄唔係當日實測**,唔可以當答案(§9 反覆踩過嘅形狀)。
攞答案要一句 console `fetch`(要登入 session,AI 側唔打 break-glass 密碼,H4)。

### 同族面 —— 掃咗,兩個唔同答案(2026-08-21)

`G5` 掃 dock / `/assistant` 開對話(`POST /agent/conversations`)個失敗路:

| 畫面 | `create.error` | 判斷 |
|---|---|---|
| **dock** | `agent-dock.tsx:180` 傳做 `error` prop → **`:415-420` 真係 render**(`ApiError` 出原文,否則 `That could not be started.`) | 🟢 **冇問題** |
| **`/assistant`** | `assistant.tsx:95` `useCreateConversation()` · `:235` `create.mutate(…)` · **`create.error` 零 render** | 🔴 **同一個形狀** |

⚠️ `/assistant` 個場景比本單窄:佢送 `profileId: agentId`(`:236`)⇒ A2 中唔到,而
零 active profile 時 `agents.length === 0` 令個掣 **disabled**(`:240`)⇒ A1 亦撳唔到。
**剩返嘅係 race**(profile 啱啱被關 / 中途 403 / server 側新增嘅拒絕理由)—— 少見,
但一發生就同本單一樣**完全靜默**。

📌 **唔喺本單 scope**(另一個檔、另一個畫面,§1.3),**亦唔可以當冇見過** ⇒ 見 §9。

## 7. Acceptance for Fix

- [x] `G1` Reproduction confirmed —— §2b 結構性重現:新 test 喺 fix 之前 **1 failed / 26 passed**,
      而 vitest 個 DOM dump 直接印出 `!run` 分支入面**只有** EmptyState + button,零 error 元素
- [x] `G2` Root cause identified —— **B 已證**(§6)。⚠️ **A 仍然未知**,而本單刻意唔等佢
- [x] `G3` Fix implemented —— `failureNote` hoist 咗,兩個分支共用
- [x] `G4` Regression test added —— **fails-before 真跑**:1 紅 → **27 綠**
- [x] `G5` 同族面掃過 —— **兩個唔同答案**,見 §6 表(dock 🟢 · `/assistant` 🔴 → §9)
- [ ] 🚧 `G6` H6 light + dark render —— **未做**,要起本機 stack(要借返 5433)。
      ⚠️ 風險唔係零:`!run` 分支多咗一層 `flex flex-col gap-[14px]` wrapper ⇒
      **理論上**零視覺分別(EmptyState 本身 block + 撐滿 · `gap` 對單一 child 無效 ·
      class 逐字重用),但**呢個係推論唔係實測**,而「字喺邊」正正係 test 問唔到嗰半
      (CH-030 `items-center` 同族)
- [x] `G7` root gate —— api **1495 / 98 suites**(冇掂後端)· web **579 / 51**(**+2**)·
      lint **exit 0** · build **exit 0**
- [ ] 🚧 `G8` Verified in env —— **有前提**:要 A 嗰邊仲係失敗狀態先驗到(見 checklist)

## 8. Report Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-21 | Initial triage(draft) | Chris DEV live 撞到 | _待 confirm_ |
| 2026-08-21 | **Sev3 confirmed,開工修 B** | Chris | **Chris** |
| 2026-08-21 | §6 補 `G5` 同族面結果;新增 §9 carry-over | 掃到 `/assistant` 有同一形狀 | — |

## 9. 掃出嚟嘅 carry-over(唔喺本單 scope)

**`ASSISTANT-CREATE-SILENT`** —— `/assistant` 開新對話失敗一樣冇任何 UI(§6 表)。
同本單**同一個形狀、唔同檔**。修法會係同一招(hoist 一個 `failureNote`),成本三行,
但佢係 scope 擴張 ⇒ **交返 Chris 決定**:一併修入本單,定另開一張單。
**未經決定之前唔會郁 `assistant.tsx`。**

---

**Lifecycle reminder**:Sev3 → `postmortem.md` optional(`PROCESS.md §4.4`);
🟡 但本單同 W45 `apiPatch` / BUG-011 / CH-032 / CH-035 **同族第五次**
(「訊息到咗但去唔到用戶眼前」),recurring pattern ⇒ closeout 時決定寫唔寫。
**Gate reminder**:AI 起草 report,**用戶 confirm repro + severity 先開始投查**(PROCESS R1.bugfix)。
