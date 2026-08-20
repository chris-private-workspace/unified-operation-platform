# CH-032 — progress

## Day 1 — 2026-08-20(開單 → 收尾,一日)

### 做咗咩

`spec.md` 早一輪已經寫好等批;今日 Chris 批咗(**D1/D2/D3 三條全部照建議**),然後
實作 → test → falsification → root gate → light/dark render 一次過做完。

三個位:①「一句話蓋兩件事」拆成兩句 ②加返 dock 早就有嘅 disconnected banner
③`forbidden` 補返 `profiles.error`。**零 schema · 零 migration · 零新 endpoint ·
零新 dep · 零新 token · 零新 primitive · 零新 icon · 零 ADR。**

### 數字

| | 前 | 後 |
|---|---|---|
| api test | 1491 / 98 suites | **1491 / 98**(一個字冇掂後端) |
| web test | 547 / 49 files | **555 / 49**(+8,冇新檔) |
| `assistant.test.tsx` | 18 | **26** |
| lint / build | 0 / 0 | **0 / 0** |

### 🔴 值得記低嘅四件事

**1. 「逐字抄」逼出咗一個冇人見過嘅差異。**
`D2` 本來只係防漂移,但一擺埋一齊就發現 dock 嗰句係**兩截**,`/assistant` 只有頭半截:

| | |
|---|---|
| dock | `No agent is switched on. An admin can turn one on under Agent.` |
| `/assistant`(改之前) | `No agent is switched on.` |

⇒ **「邊個可以整返掂」呢半 `/assistant` 由頭到尾冇講過**,而兩個畫面都「有講嘢」,
所以任何「呢度有冇文案」嘅檢查都會話 OK。📌 **兩句「差唔多」嘅文案,要逐字擺埋
一齊先睇得出邊句蝕底。**

**2. Falsification 道 2 刻意拆 dock 唔拆 `assistant.tsx` —— 而個理由先係重點。**
四道入面得道 2 係「恰好 1 紅」,因為佢**唔掂 `/assistant` 嘅行為**,所以剩返嗰條紅
只可能嚟自跨檔比對 ⇒ **`R1` 擔心嘅 tautology 真係證到冇發生**。
如果四道都拆 `assistant.tsx`,`G2` 每次都紅,而「佢究竟有冇真係讀第二個檔」由頭到尾
冇驗過 —— 睇落四道全紅好安心,實際上最關鍵嗰個問題冇問過。

**3. 一個 probe 可以樣樣做齊,但問錯咗問題。**
`D3`(banner 唔可以跟住 transcript 捲走)第一版 probe 寫 `banner.closest('.overflow-y-auto')`,
返 **`true`** —— 睇落即係「banner 喺 scroll 區入面 ⇒ D3 唔成立」。
實際上嗰個 scroller 係 **`AppShell` 個 main 區**,而**頁面上每一個 element 都喺佢入面**
⇒ 呢個 assert 結構上冇可能返 false。
🔎 揭穿佢嘅係同一份 report 入面 `transcriptTop: 56` —— 一個「兩張 card 之下嘅面板」
唔可能由第 56 px 開始。改問 `transcript.contains(banner)` 之後:
`contains: false` · `bannerIsBefore: true` · `sameParent: true`,
而且 **banner `bottom: 362.25` 逐格等於 `transcriptTop: 362.25`**。
📌 同 `CLAUDE.md §9` 嗰個「assert 瞄準嘅嘢唔存在」同族,但機制唔同:**呢次瞄準嘅嘢存在,
只係佢答緊另一條問題。**

**4. banner 要「真斷線」先 render 得到,而唔使殺 api。**
committed 嘅 `render-check.mjs` 幫唔到手 —— 一個正常 load 嘅頁面 `disconnected` 永遠
係 false。用 `page.route('**/agent/conversations/*/events', r => r.abort())` 斷 SSE:
`MAX_CONSECUTIVE_FAILURES = 3` 幾秒內就到,而**其餘每條 query 照常答**,
正正就係 banner 存在嘅那個狀態(內容喺畫面、live 更新唔喺)。
比殺 api 快,亦唔會連 transcript 都冇埋。

### 證據(唔係推論)

- **token 真 swap**:`--panel` `#ffffff` → `#0f0f11` · `--border` `#e9e9ec` → `#242427` ·
  banner 文字 `rgb(99,99,108)` / `rgb(157,157,167)` 逐個對返 `--fg-muted`
- **DS-3**:`accentButtons` 兩個 theme 都係 **`["Send"]`** —— banner 冇加第二個 primary
- **`Reconnect`**:`tag: BUTTON` · `textDecoration: underline` · `bg: rgba(0,0,0,0)` ⇒ link 樣唔係掣
- **零橫向溢出**:`scrollWidth 1440 === clientWidth 1440` 兩個 theme

### 🚧 carry-over

- **DEV live 驗**唔喺本單 acceptance,留返下次部署順手做。
  ⚠️ **banner 喺 DEV 可能出唔到** —— 部署 #12 實測 DEV(nginx + ACA)斷線會 fire `error`
  兼 **3.2 秒自動重連**,同本機(vite proxy,零 event)相反 ⇒ 要 api 真係返唔到嚟先見到。

### 狀態

**done** — `G1`–`G7` 七條全 ✅。
`RISK R35` 三個未完項全部收齊(DEV 側 · heartbeat coupling · `/assistant`)⇒ **🟡 → 🟢**。
