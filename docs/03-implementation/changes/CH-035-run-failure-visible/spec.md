---
change_id: CH-035
title: 一條 failed 嘅 run,喺兩個 chat 面完全唔顯示
status: proposed        # proposed | approved | done
owner: Chris Lai
author: AI
opened: 2026-08-20
source: 2026-08-20 本機實測(配 Azure OpenAI 之前撞到)· 同族 CH-032 · RISK R16
---

# CH-035 — run 失敗要講出嚟

> **狀態:`proposed`** —— 等 owner 批 §2 scope + §3 三條 D + §5 acceptance。
> 分類理由見 §0。**未批之前唔落任何 code。**

---

## 0. 分類 —— 點解係 Change 唔係 Bug-fix

`PROCESS §3.1` 個判準係「**行為本來啱**,而家要改」vs「**行為本來就錯**」,而呢單踩正中間:

| 角度 | 讀法 |
|---|---|
| 全 repo **冇任何 spec / ADR / test** 講過「run failed 要喺 chat 顯示」 | ⇒ 唔算「本來就錯」 |
| 用戶送咗一句,畫面之後**一個字都冇** | ⇒ 睇落就係壞咗 |

⇒ 直接沿用 **CH-032 個先例**(同一個檔、同一個主題、同一個分類問題):主體係「**令一個失敗睇落唔再等於乜都冇發生**」,掂 UI(H6),< 1 日 ⇒ **Change**。
⚠️ owner 可以 override 做 Bug-fix,改寫 `report.md` 就得,**唔影響實作內容**。

---

## 1. Context —— 實測,唔係推論

### 1.1 點樣撞到

2026-08-20,主 worktree 嘅 `apps/api/.env` 未配 `AZURE_OPENAI_*`。Chris 喺 `/assistant` 撳 `New conversation`、打咗一句、撳 Send ⇒ **畫面之後乜都冇**。

平台側**其實一切正常**,DB 逐格答得出:

```
AgentRun cmt180d3m0008xgn8ops9rklh   status = failed
AgentStep:
  start | ok     | Run started from conversation … with no request context
  run   | failed | AI-Assist inference is restricted to the company Azure OpenAI
                   resource (ADR-0037 E1). Set AZURE_OPENAI_ENDPOINT — …
AgentMessage: 0 行
```

⇒ **run 有、step 有、原因有、`whoFixes: 'platform'` 有 —— 只係冇一個字去到畫面。**

### 1.2 三個顯示 agent run 嘅面,一個講咗兩個冇講

| 面 | 檔 | `failed` 點處理 |
|---|---|---|
| request detail 個 AI Assist card | `ai-assist-card.tsx:80-83` | 🟢 **有** —— `RUN_LABEL.failed = 'Failed'` + `RUN_TONE.failed = 'danger'` |
| `/assistant` | `assistant.tsx:366-391` | ❌ **冇分支** |
| dock | `agent-dock.tsx:215-240` | ❌ **冇分支** |

兩個 chat 面都只有 `thinking` 同 `awaiting` 兩個分支。

### 1.3 好消息:唔係「永遠轉圈」,係「一片空白」

`lib/assistant.ts:26-30` 個 `LIVE_STATUSES` **冇包 `failed`** ⇒ `isThinking()` 返 `false`。

⇒ 缺陷嘅實際形狀係:**user turn 留喺畫面,之後乜都冇,spinner 都停埋**。比「永遠轉圈」好,但**同樣講唔出發生咗咩事**——而且更靜。

📌 順帶:`assistant.ts:22-24` 個註釋寫住「a status added later is far more likely to be terminal than live, so the unknown case should read as *finished*」—— **嗰個選擇係啱嘅**,而佢正正製造咗呢個缺口:collapse 去「finished」之後,**「完成」同「失敗」就冇分別**。

### 1.4 冇一條 test 會紅

`assistant.test.tsx` / `agent-dock.test.tsx` 冇任何一條 assert 掂 `failed`。⇒ 呢個唔係「有 test 但太弱」,係**呢件事從來冇人問過**。

---

## 2. Scope

### In

- `A` `/assistant` 加一個 run-failed 分支
- `B` dock 加同一個(**逐字抄**,見 `D2`)
- `C` 一個 `lib/assistant.ts` helper 答「最新嗰條 run 係咪失敗咗」(跟 `isThinking` 先例:規則寫喺 component 入面就冇得單獨測)
- `D` Test 兩邊各自 + helper 自己

### Out(明文)

- ❌ **唔加 retry 掣** —— 再送一次就係新 turn,呢條路一早通;一個「再試」掣要處理「試緊」「又失敗」兩個新狀態,唔值
- ❌ **唔改 `ai-assist-card.tsx`** —— 佢一早做咗
- ❌ **唔改 `LIVE_STATUSES` / `isThinking`** —— `D9`/`F5-3` 啱啱驗過,而佢個選擇係啱嘅(見 §1.3)
- ❌ **唔改 run 執行邏輯 / 唔改後端錯誤處理** —— 平台側由頭到尾正確
- ❌ **唔顯示 raw error detail 畀 operator** —— 見 `D1`

---

## 3. Decisions —— 🔴 三條全部要 owner 答

| # | 問題 | 建議 | 理由 / 唔跟嘅代價 |
|---|---|---|---|
| **D1** | 顯示幾多?<br>**A** 淨係「失敗咗」<br>**B** 加埋失敗原因<br>**C** 「失敗咗」+ `whoFixes`(邊個可以整返掂) | **C** | **B 要改 API**(`GET /agent/conversations/:id` 個 `runs` 而家 select `{id,status,startedAt}`,冇 detail),兼且**audience 唔啱** —— 今次真實嗰句係 `Set AZURE_OPENAI_ENDPOINT`,叫一個 operator 去做佢做唔到嘅事。**C 跟返 ADR-0029 個 `whoFixes` 詞彙**(`AgentStep.whoFixes` 一早有值,`failRun` 寫 `'platform'`),而 A 就會重演 CH-032 揾到嗰個「有文案但冇講邊個可以整返掂」。⚠️ **C 一樣要 API 送多一個欄**(`whoFixes`),只係送嘅係一個**受控字彙**唔係自由文字 |
| **D2** | 文案兩邊各寫定逐字抄? | **逐字抄 + source scan** | **CH-032 `D2` 個先例**:兩邊各寫一句 = 必然漂,而漂咗冇嘢會紅 |
| **D3** | 擺邊? | **transcript 之內、最後一個 turn 之下** | 同 `thinking` / `awaiting` 一致 —— 佢係**對嗰句嘢嘅回應**,唔係畫面狀態。⚠️ **同 CH-032 `D3` 相反**(嗰個 disconnected banner 擺 scroll 區**之外**),而個分別係實質嘅:斷線係**成個畫面**嘅狀態,run 失敗係**某一句**嘅結果 |

---

## 4. Deliverables

| # | 內容 | 檔 |
|---|---|---|
| `A` | `latestRunFailed()`(或同義)helper | `apps/web/src/lib/assistant.ts` |
| `B` | `/assistant` failed 分支 | `apps/web/src/pages/assistant.tsx` |
| `C` | dock failed 分支(逐字同 B) | `apps/web/src/components/shell/agent-dock.tsx` |
| `D` | API 送 `whoFixes`(**淨係 `D1` = C 先做**) | `agent-conversation.service.ts` `CONVERSATION_SELECT` + DTO |
| `E` | Test ×3 | `assistant.test.tsx` · `agent-dock.test.tsx` · `assistant.test.ts`(helper) |

**零 schema · 零 migration · 零新 dep · 零新 token · 零新 primitive**。
Icon:`CircleAlert`(`ai-assist-card.tsx` 一早用緊)⇒ **唔觸發 H6 STOP**。

---

## 5. Acceptance

| # | 準則 | 收貨標準 | Block? |
|---|---|---|---|
| `G1` | helper 認得 `failed` | 三條 test:最新 run `failed` ⇒ true;最新 `completed` ⇒ false;**舊 run failed 但最新 `running` ⇒ false**(`isThinking` 嗰個「只睇最新」規則要一致) | **Yes** |
| `G2` | `/assistant` 講得出 | run `failed` ⇒ 畫面出得到嗰句;`completed` ⇒ **唔出** | **Yes** |
| `G3` | dock 講得出 | 同上,對 `agent-dock.tsx` | **Yes** |
| `G4` | 兩邊逐字一致 | source scan 逐字比對兩個檔(**falsification 要拆 dock 嗰邊**,見 §6) | **Yes** |
| `G5` | 唔會同 `Thinking…` 一齊出 | 一條 test 明文 assert 兩者互斥 —— `F5-3` 撞過「兩樣嘢一齊喺畫面」,而**每條 assert 只問「某樣嘢喺唔喺度」嗰種寫法結構上捉唔到** | **Yes** |
| `G6` | H6 light + dark | 兩 theme 真 render · 零橫向溢出 · `accentButtons` 最多一個 | **Yes** |
| `G7` | root gate | test / lint / build 三個 exit 0 | **Yes** |
| `G8` | falsification | 每道新閘一次,真紅零誤傷 | **Yes** |

---

## 6. Falsification 計劃

| 道 | 拆咩 | 預期 |
|---|---|---|
| 1 | 拆走 `/assistant` 個分支 | `G2` 紅(⚠️ `G4` 會**一齊**紅 —— 同 CH-032 道 1/3 一樣係結構性必然,唔係誤傷) |
| 2 | **改 dock 一個字**(唔掂 `assistant.tsx`) | **恰好 `G4` 一條紅** ⇒ 呢道先真證到 scan 唔係 tautology(CH-032 道 2 個手法) |
| 3 | helper 改成「有任何一條 run failed」 | `G1` 第三條紅(舊 failed + 新 running) |
| 4 | 把 failed 分支同 `thinking` 改成可以同時出 | `G5` 紅 |

---

## 7. Risks

| # | 風險 | 處理 |
|---|---|---|
| `R1` | `G4` source scan 可能係 tautology | 兩個檔各自寫死字串;道 2 就係驗佢 |
| `R2` | `D1` 揀 C ⇒ 要郁 `CONVERSATION_SELECT`,而 W46/W47 **各漏過一次欄** | 跟 service 檔頭嗰句:改**一個共用常數**,唔喺 call site 逐個加 |
| `R3` | 要起本機 stack 做 light/dark render ⇒ 借 5433 | 🔴 **要 owner 批**(`ai-doc-extraction-db` 係另一個項目);用完 `--force-recreate` 還原 + 真 TCP 驗 |
| `R4` | **本機而家配好咗 Azure OpenAI ⇒ 冇咁易再自然撞到 `failed`** | render 驗證用 `page.route(… , r => r.abort())` 造(CH-032 用過同一招逼 disconnected) |

---

## 8. 🔴 三件要 owner 知嘅事

1. **`D1` 揀 B 或 C 都要改 API**,只係 C 送嘅係受控字彙。揀 A 就零後端改動 —— 但會重演 CH-032 修好嗰個問題。
2. **`R4`:呢個缺陷而家喺本機重現唔到咗**(2026-08-20 配好 Azure OpenAI 之後 run 全部 `completed`)⇒ 驗證要靠攔 route 造出嚟,唔可以等佢自然發生。
3. **順帶記低一個唔喺本單 scope 嘅矛盾**:`lib/assistant.ts:5-6` 個註釋寫住 dock 「**copies rather than imports**」,而 `agent-dock.tsx:22-26` **真係 import 緊**。同 CH-033 揾到嗰個「兩份註釋互相矛盾咗一段時間而冇嘢會紅」同族。**本單唔改**(§1.3 surgical),記喺度等下次掂到嗰個檔順手清。

---

## 9. 估算

**半日以內。** 三個分支加埋幾十行,而 `ai-assist-card.tsx` 有寫好嘅 `failed` 呈現可以參考。
成本主要喺 test(尤其 `G5` 個互斥 assert)同 render,唔喺實作。
`D1` 揀 C 就多一個 API 欄 + DTO,再加約一個鐘。
