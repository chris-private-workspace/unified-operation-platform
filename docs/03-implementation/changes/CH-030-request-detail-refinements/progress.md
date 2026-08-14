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

---

## Day 1(續)— DB + live 驗證(Chris 批咗停 `ai-doc-extraction-db`)

一氣呵成做完先還原(佢會自己返嚟搶 port,§9 實測兩次)。

### A2 — migration

`migrate status` 先行:**21 migrations · `Database schema is up to date`** ⇒ 零 drift,`migrate dev` 唔會想 reset。然後:

```
Applying migration `20260814020512_ch030_licence_req_number`
Your database is now in sync with your schema.
```

🔴 **睇實際 SQL 唔係信 prisma**:

```sql
ALTER TABLE "Request" ADD COLUMN     "serviceNowLicenceReqNumber" TEXT;
```

**一行,冇 `UNIQUE`,冇 index** ⇒ ADR-0035 D1 喺 SQL 層面再確認一次。

### A5-1 — 真打 API

`GET /fulfilment/requests/:id` response key 清單含 **`serviceNowLicenceReqNumber`**(`hasLicenceReqCol=True`),值 `null`。⇒ **既證明欄出到 wire,亦即場示範咗 D5 講嘅舊資料情況**(DB 三張單全部 null)。

### E3 — H6 render

DB 三張單個新欄全部 null 兼兩道 gate 未開 ⇒ **render 驗唔到 F1 新行同 F3 時間戳**。喺一張單設定輸入狀態(**唔係偽造顯示**,同 CH-029「造 input 唔等於造 output」同理):`lic = REQ0044083`(而 onboarding REQ = `REQ0044067`,兩個刻意唔同)· 三個時間戳**刻意唔同月**(`Jun 15` / `Jul 20` / `Aug 4`,咁 AD 洩漏就一眼見到)· line stage → `ASSIGNED`。

📌 **設 `ASSIGNED` 一石二鳥**:終端步渲染得到(F2),而且**成頁冇一個 enabled `Assign now`** —— 本機 Graph 係通嘅,誤撳一次就真派一個 licence。

**真 render 結果**(evaluate 讀 `document.body.innerText`,再兩張截圖肉眼看):

| 項 | 證據 |
|---|---|
| F1 | 三個 label 齊;`tickets` 順序 `REQ0044067` → `REQ0044083` → `RITM0047389` ⇒ **兩個 REQ 各歸各位** |
| F2 | `Step 4/4 · Completed` |
| F3 | `Jul 20, 13:30` + `Aug 4, 17:15` 在;**`Jun 15` 零命中** |
| F4 | `historyIdx 929 < aiIdx 1041` |

light + dark 兩張都真截真睇。截圖含真 domain UPN ⇒ **用完即刪**,連 `.playwright-mcp` 一併清,`git status --untracked-files=all` 驗過零剩餘。

### 🔴 E3-4 — render 揭到一個 test 睇唔到嘅視覺缺陷(本單新增)

F3 令 AD 步**矮咗一行**(佢冇時間),而個 row 一直係 `items-center` ⇒ **三個 title 唔喺同一水平線**,checkmark 亦錯位。

**四層 test 全綠都捉唔到** —— 佢哋問「呢段字喺唔喺度」,而呢個缺陷係「佢喺邊」。⇒ **H6 真 render 唔係走過場**,佢係唯一會捉到呢類嘢嘅一關。

修:row `items-center` → `items-start` · 連接線 `mt-[10px]`(由 22px 圓圈算出,唔係 eyeball)· 右邊狀態 / 按鈕 `self-center`(佢屬於成行,唔屬於最後一步)。改完重截確認對齊。

### `ui-design` 自檢(E3-1)

| # | 結果 |
|---|---|
| DS-1 token-only | ✅ 色全部用 token(`text-fg-subtle`);新增只有 layout utility |
| DS-2 唔 eyeball | ✅ `mt-[10px]` 由 `h-[22px]` 圓圈算出(22/2 − 2/2),唔係憑感覺 |
| DS-3 單一 accent | ✅ 冇加 accent |
| DS-4 light + dark | ✅ 兩個都真 render |
| DS-5 數字 / 識別碼 mono | ✅ 時間戳 · REQ / RITM · `Step 4/4 · Completed` 全 mono |
| DS-6 lucide stroke | ✅ 冇加 icon |
| DS-7 平面 | ✅ 冇加陰影 / gradient |
| DS-8 Badge semantic | N/A 冇改 |
| DS-9 motion | N/A 冇加 |
| DS-10 voice | ✅ 短名詞 · Sentence case · 冇 emoji |
| DS-11 對 prototype | ⚠️ prototype **冇**呢個 ticket 面板 —— CH-024 C 已經定咗呢個 pattern,本單只係加一行同類,**唔係新 pattern** |
| DS-12 唔捏造 logo | N/A |

### 🔴 收工揭到一件事:跑 full web suite 之前應該停 dev server

改完 layout 重跑 full suite,**多咗一條紅**:`requests.new-request-flag > redirects /requests/new` `Test timed out in 5000ms`。單獨跑佢 **綠,1089ms**;停晒 stack 再跑 full suite **回到 6 紅**。

⇒ 唔係我改動,係 **api + web dev server + docker 一齊跑令並發 suite 撞爆 5s timeout**。📌 值得記住嘅係**分辨方法**:timeout ≠ assertion failure,而「單獨跑 + 換負載條件」兩次對照先講得出係邊樣。

### 還原

kill list **12 條逐條核對過 trace 得返本項目**(路徑含 `unified-operation-platform` 或 `@uop/*`;`esbuild` / `conhost` 各自 ppid 對得上)⇒ `-Execute`,port 3100 / 5173 free。`docker stop uop-postgres uop-redis` → `docker start ai-doc-extraction-db` → 🔴 **真 TCP probe 5433 = `True`**(§9 嗰個「還原會靜靜失敗」嘅陷阱,唔可以睇 health flag)。

### 🚧 本機測試 DB 留低咗嘅狀態

`cmsq0p4ou0001xgekk80kf1mi`(CH-022 A7 嗰張已收單)俾改成 `ASSIGNED` + 三個時間戳 + `lic REQ0044083`。**冇還原** —— 本機測試 DB,唔影響任何真實系統,而且佢而家係唯一一張示範得到 ADR-0035 新形狀嘅 fixture。

### Commit

| Hash | 內容 |
|---|---|
| `3c44d54` | spec + ADR-0035(proposed) |
| `cf8da20` | 實作 + test + falsification ×3 |
| _(下一個)_ | migration + render 對齊修正 + doc |
