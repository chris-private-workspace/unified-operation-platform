---
change_id: CH-013
spec_ref: ./spec.md
checklist_ref: ./checklist.md
adr_ref: ../../../adr/0021-user-authenticated-servicenow-request-import.md
status: in-progress     # in-progress | closed
---

# CH-013 — Progress

> Day-N entries + 結尾 closeout。每個 commit 必須對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-31（spec + ADR,未寫任何 code）

### Done

- 開 `CH-013` folder,寫 `spec.md`(status: proposed)
- BACKLOG **C 區**(blocked on 用戶決定)加 CH-013 行(R7)
- Chris 三項拍板 → spec status `proposed` → **approved**
- 寫 **ADR-0021** + 入 `docs/adr/README.md` index(R5)
- 由 spec §3 衍生 `checklist.md`

### Decisions

**① H1 approved —— `IntakeService` 開第二個 caller。**

落 spec 途中揪出:兩條 intake route(`/requests/intake` · `/requests/intake/n8n`)**都係** `@Public()` + `IntakeKeyGuard`,即 `IntakeService` 今日只有一個入口、一個 caller、一個 m2m shared secret ——而 ADR-0017 D4 OQ-3 係明文咁揀(「one caller, one trust boundary, one secret to rotate」,逐字記錄喺 `intake.controller.ts:50-52`)。

前端唔可以持 `INTAKE_API_KEY`(H4:落到 bundle 就等於公開)⇒ 呢個功能**無論點做**都要開一條 user-authenticated 路 ⇒ OQ-3 嗰個前提由本 CH 落地起唔再成立。

⇒ Chris approve,**ADR-0021 Accepted**。要留意嘅區分:被改嘅係**入口唯一性**,唔係 **secret 強度** —— 新路徑用一個完全獨立、而且**更嚴格**(具名 JWT + ADMIN + audit)嘅信任模型,唔係把既有嗰個放寬。

**② 定位 = 長期 admin 補救工具**(唔係「n8n 通咗就刪」)。

呢個係整件事嘅前提。如果佢係即棄品,理性答案應該係**唔做 UI、繼續用 script** —— 唔值得為一個會死嘅功能去改 intake 信任邊界 + 寫 ADR。所以 ADR-0021 個 Option D(「唔做 UI」)係**被定位 reject,唔係被質素 reject**,呢點喺 ADR 寫實咗,免得日後有人以為當時冇考慮過。

**③ 角色 = `ADMIN` only。** 除咗 fail-safe,仲有一個結構理由:OpCo 由 SN 個 Job Function 推導,要**反查完先知** ⇒ 「你有冇權導呢張單」要打完 SN 先答到,呢種 gate 形狀本身易錯。放寬 = 重開 ADR-0021 D3,唔可以喺實作裡面順手加。

**④ 沿用 ADR-0017 D4 嘅 pattern,唔發明新嘢。** D4 當年面對同類問題(n8n 信封 vs canonical DTO 對唔上)嘅答案係「唔改 LOCKED 合約,另開一條 route」。本 CH 係同一 pattern 第三次應用 —— 所以 ADR-0021 D2 把四項檔案嘅 **diff = 0** 寫成硬邊界,並落咗 checklist C1 做實際驗證項,唔靠自律。

### Blockers

- 冇。三項 gate 已於同日全部清。

### Effort

- Planned:—(spec/ADR 唔計入 §5 嘅 1.5–2 日估算);Actual:~1h

### Commits

| Hash | Subject |
|---|---|
| `0d68a48` | `docs(planning): CH-013 spec draft — 由 SN REQ 號碼喺 UI 導入 request` |
| _(pending)_ | ADR-0021 + spec approved + checklist/progress |

---

## Day 1 — 2026-07-31（A 組 + C 組）

### Done

- **A1** `ServiceNowLookupService` — `src/integration/servicenow/`,module provider + export 佈線
- **A2** `intake-from-servicenow.ts` 改為 consume 佢(`--req` + `--list` 兩個 mode)
- **A3** 11 個 unit test(SN 全 mock)
- **C1** ADR-0021 D2 硬邊界 `git diff` 實證
- **C2** 既有 test 全綠,零 assertion 改動

### Decisions

**① service 放 `src/integration/servicenow/` 而唔係 `src/fulfilment/`。**

ADR-0021 D6 兩個位置都容許。揀前者因為佢係純 SN 查詢 —— 零 domain 邏輯、零 Prisma ⇒ script 手動 wire 只需傳一個 `ServiceNowService`(script 唔 boot AppModule,理由見佢檔頭:`createApplicationContext` 會起 ScheduleModule,而 ADR-0015 sync sweep **會寫**)。放 fulfilment 層就要拖多啲嘢入 script 嘅手動 wiring。

**② `LookedUpRitm.activeTasks` 帶 raw record,但型別上明文標「server-side only」。**

兩個 caller 要唔同深度:UI 只需要 count,terminal 要 state / assigned_to。如果 service 只返 count,script 就要自己再查一次 task ⇒ 正正係 D6 想避免嘅 drift。所以 service 返 raw,**由 HTTP 層負責收窄**(B 組 DTO 要逐個欄 pick,唔可以直接序列化)。呢個邊界寫咗入 type 嘅 doc comment,唔係口頭約定。

**③ 順序 loop,唔用 `Promise.all`。**

一張 REQ 已經係 `1 + N` 個 GET,`listRecent` 再乘以頁數。呢啲跑喺撳掣之後,唔喺 request path,latency 唔係任何人嘅瓶頸 —— 但係打嘅係公司共用 instance。

### 驗證（唔係「跑咗就當過」）

| 項 | 證據 |
|---|---|
| **fails-before 實證** | 把 `importable: count === 1` mutate 成 `count >= 1` → 「two active tasks」條 test **真係紅**,diff 顯示 `importable: false → true`。改返即綠。⇒ 嗰條 assertion 真係睇住行為,唔係陪跑 |
| **零寫入** | 兩條 `expect(updateRecord/createRecord).not.toHaveBeenCalled()`。lookup 今日全部係 GET,但冇任何結構性嘢阻止日後有人加寫入,而寫入喺 preview 路徑會**每次撳掣都 fire** |
| **refactor 行為保持** | 真 SN 跑 `--req=REQ0044038`,refactor 前後輸出**逐個字一致**;`--list` 15 張單,舊嗰批 REQ 嘅 ✅/🔴 判斷同時間戳全部對得上 |
| **C1 硬邊界** | `git diff --stat origin/main` 對六個檔 → **完全空** |
| **全 suite** | api **672 passed / 60 suites**(A 組前 661)· `lint exit=0` 零 error 零 warning |

### Blockers

- 冇。

### Effort

- Planned:0.25 日(A 組);Actual:~0.3 日

### Commits

| Hash | Subject |
|---|---|
| _(pending)_ | `refactor(integration): 抽 ServiceNowLookupService,script 同未來 endpoint 共用(CH-013 A1-A3)` |

---

## Day 2 — 2026-07-31（B 組 + D 組 · 後端完成）

### Done

- **B1–B8** 兩條 endpoint + DTO + service + audit,全部落新 `ServiceNowImportController` / `ServiceNowImportService`
- **D2–D5** 13 個 unit test;api **672 → 685 / 61 suites**,`lint exit=0`
- 🚧 **D1 部分** —— 見下「未當作已驗嘅嘢」

### Decisions

**① 新 controller,唔加落 `IntakeController`。**

除咗 D2 硬邊界(嗰個檔 diff 必須 0)之外,更根本嘅理由:`IntakeController` 成個 class 都係 `@Public()` + `IntakeKeyGuard`。一個 controller 揸兩種信任模型,就係日後有人加 route 加落錯嗰邊嘅溫床。

**② body 收 `skuId` GUID,唔係 `skuCatalogId`(spec deviation ①,已 log §7)。**

canonical DTO 本身收 `skuId`,而 `IntakeService` 自己 resolve 並對唔存在 / inactive 報 400 ⇒ 傳 GUID 即係「**得一個地方**決定 SKU 存唔存在」。傳 `skuCatalogId` 要多一層轉換 = 多一個會同 canonical 判斷唔一致嘅位。

**③ `opcoCode` 由 operator 揀(spec deviation ②,已 log §7)。**

canonical 要 `opcoCode`,但 SN 單唔帶平台嘅 OpCo 概念。n8n 路徑「自動推導」得成,係因為 **n8n 送 Job Function**;而 ops script 一直係 operator 自己指定(`--job-function` 預設 hardcode `'RHK IT'`)。所以對呢條路而言,「推導」只係換個方式問同一條問題 —— 不如直接問。

**④ audit metadata 用既有 key,唔擴白名單。**

原本想放 REQ number / RITM number 落 metadata。查 `AUDIT_METADATA_KEYS` 先發現佢只認七個 key,自訂嘅會被 `pickAuditMetadata` **靜靜丟棄** —— 正正係 W36 D6 中過嗰招。改為跟 `intake-adapter` 先例把資訊放入既有 `reason`(自由文字,REQ number 非 PII)+ `source`。擴白名單係 privacy 決定,唔應該為方便而做。

**⑤ 新 targetType `Request`,白名單 `[]`。**

audit 對象係「一次導入」,產生一張 Request。既有 `AuditTargetType` 冇 `Request`,而用 `RequestLineItem` 指住其中一條 line 係唔準確嘅表達。加一個 event-only target(白名單空),跟 `RequestLineItem` 完全一樣嘅理由:Request 帶 `targetUpn` / `requesterEmail`,複製過嚟就係把 PII 搬入一張**讀權限唔同**(audit = ADMIN-only)嘅表。

**⑥ audit 唔同 intake 同一個 transaction —— 接受,唔繞。**

`IntakeService` 自己揸 `$transaction`,而 D2 禁止改佢。所以 failure mode 係「request 建咗、audit row 冇」,達唔到 W29 喺其他地方做到嘅原子配對。**冇繞過**,因為唯一繞法就係伸手入 `IntakeService` 穿條 tx 出嚟 —— 正正係 ADR 禁嘅嗰個 edit。已寫入 code comment,免得日後被讀成疏忽。

### 🔴 W28 個防護網真係 fire 咗

加完兩條 route,`permissions.spec.ts` 即刻兩條紅(controller 未入 list + matrix snapshot 唔對)。呢個正正係 W29 retro 講嘅「加 `AuditController` → snapshot 即捉到新 route 要 review」。

**冇 reflexive `jest -u`** —— 先睇 diff:只有兩行,`POST /requests/import-from-servicenow → roles [ADMIN]` 同 `GET /requests/servicenow-lookup → roles [ADMIN]`,零既有 route 移位。確認之後先更新。`has no unguarded routes` 由頭到尾冇紅 ⇒ 兩條 route 嘅 `@Roles` 真係生效。

### 驗證

| 項 | 證據 |
|---|---|
| **fails-before(第二次)** | 把 RITM 匹配由 `find(i => i.number === choice.ritmNumber)` mutate 成 `items[0]` → **兩條**安全邊界 test 齊紅(「唔屬該 REQ」+「blocked 判斷」)。改返即綠 |
| **D5 結構性保證** | body **根本冇 `ritmSysId` 欄位** —— 唔係「唔信 client」,係 client 結構上傳唔到 |
| **preview 唔洩漏** | test assert 序列化後唔含 `assigned_to` / 內部描述 / RITM sys_id |
| **audit 唔含 UPN** | test assert metadata 序列化後唔含 target UPN |
| **re-import 唔造假 audit** | test assert `intake` 照 call(佢揸 idempotency)但 `audit.log` **零次** |
| **全 suite** | api **685 / 61 suites** · snapshot 1 passed · `lint exit=0` |

### Live 驗證（同日補做,🚧 D1 已清）

Chris 指定用 **`REQ0044061`**(`RITM0047356` · 1 active task)。

⚠️ **導入前 flag 咗一件事**:呢張係 **"New Hire Windows Domain Account"**,即 **AD 類 RITM**。ADR-0017 D3 硬規矩係「n8n 1007 只 close AD 類、平台只 close license 類,兩邊**永不**掂對方嘅」。**純導入唔踩線**(導入唔 close 任何嘢),所以照做 —— 但**呢張單唔可以推去 assign**,一 assign 平台就會去 close 一張屬於 1007 嘅 task。已同 Chris 講明。

| 驗證 | 證據 |
|---|---|
| lookup 200 | `activeTaskCount: 1` / `importable: true`,同 script `--list` 判斷一致(G3 精神);task 只出 `number` + `state`,**冇 sysId、冇任何 raw SN 欄位** |
| import 201 | OpCo 解析成 RHK · **`azureSyncedAt: null`**(sync gate 冇被偷開)· line item 個 `serviceNowSysId` = `3bd2a42f…`,**由 server 反查得出,client 從來冇傳過**(D5 實證) |
| **idempotent** | 同一 body POST 兩次 → DB:request **1** 行 · line item **1** 行 · audit **1** 行 |
| **audit metadata 真係存到** | DB 查到 `{"reason": "imported from ServiceNow REQ0044061 — 1 line item(s), OpCo RHK", "source": "servicenow-import"}` —— 兩個 key 完整倖存,即係**冇被 `pickAuditMetadata` 丟棄**。呢個係 W36 D6 教訓嘅直接反驗 |
| **audit 冇 PII** | SQL 掃 `metadata` / `before` / `after` 搵 target UPN → **0 rows** |
| **403** | 同一份 `dist` 另起 instance 喺 3200,`AUTH_DEV_USER_EMAIL=opco.it.rhk@…`。**control**:`/me` 真返 `role: OPCO_IT`。兩條 route 都 `403 Insufficient role`,而同刻 3100 嘅 ADMIN 200/201 ⇒ A/B 對照 |
| **401** | 同樣手法,`AUTH_DEV_BYPASS=false`。**control**:`/me` 亦 401(證明 bypass 真係關咗)⇒ 兩條 route 都 401,即**唔係 `@Public()`** |

兩次臨時 instance 都用**現成 `dist`**(watch mode 已 rebuild),唔重新 build、唔郁 running stack;驗完即殺,3100 仍然健在。

### Blockers

- 冇。

### Effort

- Planned:0.5 日(B 組)+ 0.25(test);Actual:~0.6 日

### Commits

| Hash | Subject |
|---|---|
| _(pending)_ | `feat(fulfilment): CH-013 B 組 — SN REQ 導入 endpoint(lookup + import,ADMIN only)` |

---

## Day 3 — 2026-07-31（E 組 + F 組 · 前端）

### Done

- `ServiceNowImportPanel` 落 Settings › Integrations,兩步流程
- `api-types` / `mutations` 加型別同兩個 hook;`apiGet` 修正(見下)
- 8 個 component test;web **196 → 204 / 25 files**,`lint exit=0`,`tsc --noEmit` 過

### Decisions

**① lookup 用 `useMutation`,唔用 `useQuery`。**

佢係一個 read,但每次都係打真 ServiceNow(`1 + N` 個 GET,共用企業 instance)。`useQuery` 會 mount / focus / reconnect 各自重跑一次 —— 冇一次係操作員要求嘅。呢個只喺撳掣嗰刻 fire。

**② 順手修咗 `apiGet` —— 呢個唔係「順便 refactor」。**

`apiPost` / `apiPatch` / `apiDelete` 三個都會 surface server 個 `message`,**只有 `apiGet` 唔會**(拋 generic `GET … failed (404)`)。而我特登喺後端寫嘅 404「一張見唔到嘅單同一張唔存在嘅單,Table API 分唔開」正正靠佢傳到 UI —— 唔修就等於後端嗰句白寫。

先 Grep 全 repo 確認**零 test / 零 caller 依賴舊格式**先改。改完四個 helper 行為一致,既有 caller 只會由 generic message 變成更好嘅 message。

**③ blocked 原因用 server 原文,唔喺前端另寫一套。**

`blockedReason` 直接顯示。同一句話寫兩次就係兩個會 drift 嘅地方,而呢句嘢嘅真相喺 ADR-0018 D3,唔喺 UI。

### H6 自檢（DS-1 ~ DS-12）

| | |
|---|---|
| DS-1 / DS-2 token-only、唔 eyeball | ✅ 全部既有 class(`text-fg-muted` / `border-border` / `text-danger` / `bg-card` / `text-fg-subtle`),零 hex |
| DS-3 單一 accent + 一個 primary | ✅ 只有 `Import` 係 primary;`Look up` secondary、`Cancel` ghost |
| DS-5 數字 / 識別碼 mono | ✅ REQ / RITM / SCTASK / UPN / 日期全部 `font-mono` |
| DS-6 lucide stroke-only | ✅ `Search` / `Check` / `ArrowRight` / `AlertTriangle`,`strokeWidth={2}` |
| DS-7 平面美學 | ✅ 深度只靠 1px border + radius,零 blur / gradient / colored-left-border |
| DS-8 狀態走 Badge + semantic | ✅ importable → `ok`,blocked → `danger` |
| DS-9 motion | ✅ 冇加任何動畫 |
| DS-10 voice / casing | ✅ Sentence case、短名詞、chrome 內零 emoji |
| DS-11 / DS-12 | N/A — 呢個 panel 唔喺 prototype 入面(同 `/audit` 一樣屬 owner-approved 新畫面);冇掂 logo |
| **DS-4 light + dark** | 🚧 **未行過** — 見下 |

### 兩件冇做足、唔當佢做咗

**① 🚧 E5 「連去 request detail」冇做。** `Toast` primitive 得 `message` + `tone`,冇 action slot。加一個 = 改**共用 primitive**,而 H6 講明新 pattern 要先問 owner —— 唔喺一個 CH 裡面順手改。現時 toast 講明 request number,操作員去 Requests 頁搵得返。

**② 🚧 F4 light / dark 未實際行過。** `claude-in-chrome` 喺呢部機一直連唔上(memory 有記),Playwright MCP 亦唔喺工具清單 ⇒ 開唔到 browser。用嘅全部係既有 token class(其他 panel 一直用緊,兩個 theme 都有定義),所以**大概率冇事** —— 但「大概率」唔係驗證。要 Chris 開 Settings › Integrations 目視一次。

### 順帶記低一個既有張力（唔屬本 CH 引入）

integrations tab 同時 render `AllocationImportPanel` + 本 panel。前者喺「揀咗 CSV 之後」亦會出一個 primary,所以嗰一刻同一個 view 會有**兩個 primary**。本 CH 冇造成佢,但令佢更易撞到。要收就要重新諗呢個 tab 點分頁,屬另一件事。

### Effort

- Planned:0.5(前端)+ 0.25(test);Actual:~0.7 日

### Commits

| Hash | Subject |
|---|---|
| _(pending)_ | `feat(web): CH-013 E/F 組 — Settings 匯入 panel(ADMIN only,兩步)` |

---

## Closeout（填於 status=closed）

### Acceptance verification

（spec §3 逐條 ✅ / ⚠️ / ❌）

### Effort summary

| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Lessons

- What worked
- What didn't / unexpected friction
- Carry-overs

---

**End of CH-013 progress**
