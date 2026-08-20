---
change_id: CH-032
title: /assistant 兩個「畫面講嘅嘢同真相唔同」嘅位
status: approved        # proposed | approved | done
approved: 2026-08-20    # Chris Lai — D1/D2/D3 全照建議
owner: Chris Lai
author: AI
opened: 2026-08-20
source: BACKLOG ASSISTANT-HONESTY · RISK_REGISTER R35
---

# CH-032 — `/assistant` honesty

> **狀態:`approved`(Chris Lai,2026-08-20)—— 三條 D 全部照建議。**
> 分類理由見 §0;決定見 §3。

---

## 0. 分類

`PROCESS §1.2` 之下呢單**跨兩類**,所以講清楚點解揀 Change:

| 位 | 性質 |
|---|---|
| ① 一句話蓋兩件事 | **畫面講大話** ⇒ 似 Bug-fix |
| ② `/assistant` 忽略 `disconnected` | **dock 有而佢冇** ⇒ 似 Change(缺口,唔係壞咗) |

⇒ 主體係「**令兩個畫面對同一件事講同一句真話**」,而且掂 UI(H6),< 1 日 ⇒ **Change**。
⚠️ owner 可以 override 做 Bug-fix,咁就改寫 `report.md`;**唔影響實作內容**。

---

## 1. Context —— 三個位,逐個有 code 證據

### ① 一句話蓋兩件事(`assistant.tsx:126` + `:177-181`)

```tsx
const agents = profiles.data ?? [];                      // :126
...
{!profiles.isLoading && agents.length === 0 && (         // :177
  <span className="text-[12.5px] text-fg-muted">
    No agent is switched on.
  </span>
)}
```

`profiles` request **失敗**(403 / 500 / 網絡)⇒ `data` 係 `undefined` ⇒ `agents = []`
⇒ **顯示同一句**。而嗰一刻佢係**假**嘅:平台唔知有冇 agent 開住,佢只係攞唔到個列表。

🔴 **2026-08-19 喺 DEV 真撞到**(W49 `F4-0`):三個 profile 全部 `active: false`,
`New conversation` 撳唔到,而畫面嗰句**啱得嚟令人以為冇第二個可能** —— 當時我自己都差啲
斷錯症做「一個 profile 都冇」,要 `?includeInactive=true` 先揭穿。

### ② `R35` 喺 `/assistant` 一樣適用但冇處理(`assistant.tsx:95`)

```tsx
useAgentConversationEvents(selected);      // 返回值直接掉咗
```

W49 `F4-3` 令呢個 hook 返 `{ disconnected, reconnect }`,而 `/assistant` **忽略佢**
⇒ SSE 斷咗之後**畫面唔講**,而**一條靜咗嘅 thread 同一條冇人覆嘅 thread 睇落一模一樣**。

⚠️ 部署 #12 實測:DEV 側斷線會 fire `error` 兼自動重連,所以 banner **平時唔會出** ——
但 `readyState === CLOSED` 同 60s staleness 兩條路仍然真實存在(api 返唔到嚟嗰種)。

### ③ 順帶(BACKLOG 用「⚠️ 順帶」記住)—— `forbidden` 唔睇 `profiles.error`

```tsx
const forbidden =                                        // :97-99
  (list.error instanceof ApiError && list.error.status === 403) ||
  (thread.error instanceof ApiError && thread.error.status === 403);
```

**冇 `profiles.error`** ⇒ profiles 返 403 唔會出 `Access required`,會靜靜跌落 ① 嗰句。
呢個係 ① 嘅**同一個根**:三個 query 兩個當 first-class,一個當「有就有冇就當空」。

---

## 2. Scope

### In

- ① `/assistant` 把一句拆成兩句(**逐字抄 dock**,見 `D2`)
- ② `/assistant` 加 disconnected banner + `Reconnect`(**逐字抄 dock**)
- ③ `forbidden` 加埋 `profiles.error`(**建議入,見 `D1`**)

### Out(明文)

- ❌ **唔掂 dock**(`agent-dock.tsx` 已經做啱,呢單係追平)
- ❌ **唔改 hook**(`useAgentConversationEvents` 一個字唔郁 —— W49 `F4-3` 啱啱驗過兼有 12 條 test)
- ❌ **唔改後端**(零 API / 零 schema / 零 migration)
- ❌ **唔重新設計 `/assistant` 版面** —— 只加一個 banner,唔郁既有 layout
- ❌ **唔處理 `AGENT-DOCK-VS-ASSISTANT`** —— `OQ-C` 2026-08-20 已答 A(兩個都留),本單建基於嗰個答案

---

## 3. Decisions —— ✅ **2026-08-20 Chris Lai 三條全部照建議**

| # | 問題 | 決定 | 理由 / 唔跟嘅代價 |
|---|---|---|---|
| **D1** | 第 ③ 個位(`forbidden` 唔睇 `profiles.error`)入唔入 scope? | ✅ **入** | 佢同 ① 係同一個根;唔入就會出現「拆咗兩句,但 403 嗰句仍然錯」——**修咗一半反而更難發現剩返嗰半** |
| **D2** | 文案自己寫定逐字抄 dock? | ✅ **逐字抄** | 兩邊各寫一句 = **必然漂**,而漂咗**冇嘢會紅**(同 `TurnBubble` 抽出嚟嗰個理由一樣) |
| **D3** | banner 擺邊? | ✅ **conversation header 之下、transcript 之上**,同 dock 一致 | 擺入 scroll 區內就會跟住 transcript 捲走,而佢係一個**狀態**唔係一條訊息 |

### D2 落地時揭到嘅一件事(唔改決定,但要記低)

「逐字抄」逼出咗一個本來睇唔見嘅差異:**dock 嗰句係兩截,`/assistant` 只有頭半截**。

| | 文案 |
|---|---|
| dock | `No agent is switched on. An admin can turn one on under Agent.` |
| `/assistant`(改之前) | `No agent is switched on.` |

⇒ 後半截「**邊個可以整返掂**」`/assistant` 由頭到尾冇講過。呢個**唔係 spec 寫嗰陣預見到嘅**
—— 當時當佢係「同一句話」。📌 **兩句「差唔多」嘅文案,要逐字擺埋一齊先睇得出邊句蝕底。**

---

## 4. Deliverables

| # | 內容 | 檔 |
|---|---|---|
| `A` | 兩句分開(`agentsFailed` / `agentCount === 0` 兩個分支) | `apps/web/src/pages/assistant.tsx` |
| `B` | disconnected banner + `Reconnect`(`WifiOff` icon,已喺 lucide 用緊) | 同上 |
| `C` | `forbidden` 加 `profiles.error`(`D1` 批咗先做) | 同上 |
| `D` | Test | `apps/web/src/pages/assistant.test.tsx` |

**零新 dep · 零新 token · 零新 primitive · 零新 icon**(`WifiOff` dock 一早用緊)⇒ **唔觸發 H2 / H6 STOP**。

---

## 5. Acceptance

| # | 準則 | 收貨標準 | Block? |
|---|---|---|---|
| `G1` | 「攞唔到列表」同「冇 agent」分開 | 兩條 test:profiles **error** ⇒ 出「Could not load」兼**唔出**「No agent is switched on」;profiles **成功但空** ⇒ 反過來 | **Yes** |
| `G2` | 兩邊文案逐字一致 | 一條 **source scan**:`assistant.tsx` 兩句同 `agent-dock.tsx` 兩句**逐字相等**(⚠️ 見 `R1`) | **Yes** |
| `G3` | disconnected banner | `disconnected: true` ⇒ 有 banner + `Reconnect`;撳 `Reconnect` 真 call `events.reconnect` | **Yes** |
| `G4` | 403 出 `Access required` | profiles 403 ⇒ 出 forbidden 分支,**唔跌落 ① 嗰句**(`D1` 批先做) | D1 決定 |
| `G5` | H6 light + dark | banner 兩個 theme 都 render 過 · 零橫向溢出 · **一個 view 一個 primary**(banner 個 `Reconnect` 係 underline link 唔係掣) | **Yes** |
| `G6` | root gate | test / lint / build 三個 exit 0 | **Yes** |
| `G7` | falsification | 每道新閘一次,**真紅零誤傷** | **Yes** |

---

## 6. Falsification 計劃(逐道拆,唔一次過 —— W49 `F1-5`)

| 道 | 拆咩 | 預期 | **實際(2026-08-20 真跑)** |
|---|---|---|---|
| 1 | 把兩個分支合返一句(即今日嘅 code) | `G1` 恰好 1 紅 | 🔴 **2 紅** — `says it could not read the agent list`(行為)**+** `uses the same words as the dock`(點名 **`assistant.tsx` is missing**) |
| 2 | 改**dock** 一句文案一個字(`Agent` → `Agents`) | `G2` 恰好 1 紅,訊息要**點名邊句** | ✅ **恰好 1 紅**,訊息 `agent-dock.tsx is missing: No agent is switched on. An admin can turn one on under Agent.` |
| 3 | 拆走 banner | `G3` 恰好 1 紅 | 🔴 **2 紅** — `says when live updates have stopped`(行為)**+** `uses the same words as the dock`(點名 `assistant.tsx`) |
| 4 | `forbidden` 移返 `profiles.error` | `G4` 恰好 1 紅 | ✅ **恰好 1 紅** — `Unable to find … Access required` |

**零誤傷**:四道加埋冇一條無關 test 變紅(其餘每次都係 24 或 25 綠)。

### 為咗記住:點解「恰好 1 紅」呢個預期本身寫錯咗

道 1 同道 3 唔係測試出事,係**我寫 spec 嗰陣冇為 `G2` 諗過佢會一齊響**。
`G2` 個 source scan 問「呢句字喺唔喺兩個檔入面」,而**拆走一個分支同時抹走嗰句字** ⇒
「行為冇咗」同「文案冇咗」必然一齊紅。⇒ **兩道各 2 紅係結構性必然,唔係誤傷。**

📌 順帶,道 2 之所以問得準,係因為佢拆嘅係 **dock**(唔係 `assistant.tsx`):
`/assistant` 側行為一個字冇變,所以剩返嗰條紅**只可能**嚟自跨檔比對 ——
**呢個先真係證到 `R1` 擔心嘅 tautology 冇發生**。如果四道都只拆 `assistant.tsx`,
`G2` 每次都會紅,而「佢究竟有冇真係讀第二個檔」由頭到尾冇驗過。

---

## 7. Risks

| # | 風險 | 處理 |
|---|---|---|
| `R1` | **`G2` 個 source scan 可能係 tautology** —— 如果兩句都由同一個常數嚟,佢永遠綠而證明唔到嘢 | 兩個檔各自寫死字串,scan **逐字比對兩個檔**;falsification 道 2 就係驗佢捉唔捉到 |
| `R2` | banner 令 `/assistant` 多咗一個視覺元素 ⇒ 可能撞 DS-3 | `Reconnect` 用 **underline link 唔用 Button**(dock 就係咁),`G5` live probe `accentButtons` |
| `R3` | **要起本機 stack 做 light/dark render** ⇒ 要借 5433 | 🔴 **要 owner 批**(`ai-doc-extraction-db` 係另一個項目);見 §8 |

---

## 8. 🔴 兩件要 owner 知嘅事

1. **`G5` 要借 5433** —— render 驗證要起 api + web,而 5433 可能畀 `ai-doc-extraction-db` 佔住。
   停佢**要你批**,用完要 `--force-recreate` 還原兼真 TCP 驗(`restart-stack` skill 硬規則 3)。
   ⚠️ 如果唔想借,`G5` 可以**押後到下次有 stack 嗰陣**,其餘六條唔受影響。
2. **做完呢單 `RISK R35` 就收得成 🟢** —— R35 三個未完項,DEV 側同 heartbeat coupling
   2026-08-20 已經收咗,**`/assistant` 側就係最後一個**。

---

## 9. 估算

半日以內。三個位合共**十幾行 code**,而 dock 側有寫好嘅版本可以照抄 —— 大部分成本喺 test
同 render,唔喺實作。
