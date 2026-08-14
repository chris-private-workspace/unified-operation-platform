# CH-030 — Progress

---

## Day 1 — 2026-08-14

### 做咗

**閘**:spec `proposed → approved` · ADR-0035 `Proposed → Accepted`(Chris 同日批兩樣)。

**F1(ADR-0035)**
- `schema.prisma` `Request` 加 `serviceNowLicenceReqNumber String?`,**冇 `@unique`**,comment 寫明同 `serviceNowNumber` 嘅分別 + 點解唔可以入 `where`
- `intake-adapter.service.ts` — `$transaction` 由 array-of-updates 改成 `[...RITM updates, request.update]`,**同一個 transaction**
- `api-types.ts` + `request-detail.tsx` `ServiceNowTickets` 由兩行變三行

**F2** `Step 4/4` → `Step 4/4 · Completed`(步名由同一個 `steps` array 讀,同啲 dot 唔會漂)
**F3** `SyncStep` 收 optional `at`;Azure / ServiceNow 顯示,**AD 唔顯示**
**F4** `Operational history` 搬到 `AI Assist` 之上

### 驗證(全部真跑,output 喺 scratchpad)

| 項 | 結果 |
|---|---|
| api test | **1044 passed / 74 suites**(CH-029 基線 1040 ⇒ **+4**) |
| web test | **377 passed / 383**(基線 368 ⇒ **+9**);**6 紅 = pre-existing `WEB-TEST-JSDOM`**,逐條對過(reset-password 1 + local-profile 5) |
| tsc api | **exit 0** |
| tsc web | **exit 0** |
| api lint | **exit 0** |
| web lint | **16**,**同基線同一批三個檔**(`allocation-reset.test.tsx` 11 + `allocation-reset.tsx` 4 + `request-detail.sync-check.test.tsx` 1)—— **我新增 / 改過嘅檔零 error** |

### Falsification ×3(全部真紅、零誤傷)

| # | 拆走乜 | 結果 |
|---|---|---|
| **A4** | intake-adapter 個 `request.update` | **2 紅 / 55 綠** —— `records the licence REQ number…` + `keys that write on the row id…` |
| **B2** | `· {steps[stepNo - 1]}` | **3 紅 / 42 綠** —— F2 三條 |
| **C2** | 畀 AD 步傳 `at={req.accountCreatedAt}` | **1 紅 / 6 綠** |

🔴 **A4 順帶揭到一件要記住嘅嘢**:第三條 test(`records no licence REQ number when the submit was refused`)喺拆走實作之後**仍然綠**。佢 assert `not.toHaveBeenCalled()`,而冇咗實作就更加冇 call ⇒ **佢單獨證明唔到實作存在**,只有夾住頭兩條先有意義。同 CH-029 嗰句「一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事」同源 —— 而呢次係**做 falsification 先發現**,唔係靠睇。

🔴 **C2 值得做 falsification 嘅理由**:佢係 negative assert(`queryByText(...)).toBeNull()`),而 negative assert 係最容易 vacuously pass 嗰種。實測真紅 ⇒ 佢真係守住緊「AD 唔顯示時間」。

📌 **F4 冇改 code 做 falsification,改為喺 test 內加反向 assert** —— `compareDocumentPosition` 個 bitmask 好易寫成永遠 truthy;加一條 `ai.compareDocumentPosition(history) & FOLLOWING` 要 falsy,錯咗個 mask 就會紅。比搬走再搬返兩個 Card 平且安全。

### 決定 / 偏離

**D-1 — `RequestDto` 唔加新欄(偏離 A5-3 嘅字面讀法,R3)**
查證:`RequestDto` 只宣告 **8 個欄**,而實際 response 出 20 幾個(`azureSyncedAt` / `serviceNowUserSyncedAt` / `accountCreatedAt` 全部唔喺 DTO),而 `main.ts` **冇 `ClassSerializerInterceptor`** ⇒ DTO 唔會過濾 response,只係 OpenAPI 文件。加一個而其餘十幾個仍然缺,反而製造「呢個欄特別」嘅假象。跟既有 pattern 唔加(§13)。**OpenAPI 契約落後於實際 response 係既有情況,唔喺本單範圍。**

**D-2 — A5-2 改用 query-shape test,唔用 controller pass-through test**
controller 只係 `return this.requests.getRequestDetail(...)`,而 prisma 喺 spec 度係 mock ⇒ 任何「返嘅 object 有冇呢個欄」嘅 assert 都只係喺檢查自己個 mock(tautology)。改為 assert **query 本身**:`findUnique` 冇 top-level `select`、有 `include` ⇒ 所有 scalar 自動出。**真正嘅風險係將來有人改成 `select` 白名單**,而呢條 test 正正喺嗰刻紅。

**D-3 — 舊資料嘅 RITM 行維持無條件**
`Licence item(s)` 嗰行**唔**掛喺 REQ 之下。若果掛咗,ADR-0035 之前開嘅每一張單(即今日 DB 入面大部分)個 licence section 會**變空白** —— 一個比原本問題更差嘅畫面,而且淨係餵新資料嘅 test 完全睇唔到。已由 `still shows the RITMs on a request raised before ADR-0035` 釘住。

### 🚧 未做(全部卡同一件事:本機 5433)

`ai-doc-extraction-db`(另一個項目)佔住 5433,`uop-postgres` `Exited`。停佢要 Chris 批,而佢會自己返嚟搶 port(CLAUDE.md §9)⇒ 要一氣呵成:

- **A2-1 / A2-2** migration 生成 + 對真 DB 跑
- **A5-1** 真打一次 API 確認新欄出到 wire(呢個先係 A5 嘅真證據;上面 D-2 條 test 只守住 query 形狀)
- **E3-1 / E3-2 / E3-3** H6 light + dark 真 render

### Commit

| Hash | 內容 |
|---|---|
| `3c44d54` | spec + ADR-0035(proposed) |
| _(下一個)_ | 實作 + test + falsification |
