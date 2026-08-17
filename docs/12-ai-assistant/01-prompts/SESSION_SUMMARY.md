# Unified Operation Platform — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:精簡即時摘要,由 SessionStart hook 每 session 自動注入。詳版 → `session-start.md`;憲法 → `CLAUDE.md`。
> 此處只補當前座標 + runtime 實況。**維護**:每個 phase closeout doc-sync 一併更新。

**身份**:Unified Operation Platform,spec `docs/architecture.md`,IT operation / support 管理 + 操作平台(逐步引入 AI);第一個模組 LicenseOps(M365 onboarding license 履行)。

## 🔴 **先講一件會令你用錯前提嘅事(2026-08-17)**

**你多數喺 branch `feat/w46-agent-runtime`,而佢由頭到尾未 merge 落 `main`。**

| | `main` | branch `feat/w46-agent-runtime` |
|---|---|---|
| test | api **1044 / 74** · web **377** | api **1355 / 92** · web **433**(+6 pre-existing 紅) |
| ADR | 到 **0035** | 到 **0039**(0036 / 0037 / 0038 / 0039 **全部住喺 branch**) |
| 有冇 agent | **冇** | 有(`src/agent` + `src/agent-approval` 兩個 module) |

⇒ **下面「`main` 嘅座標」嗰段仍然啱,但佢唔係你 working tree 嘅樣。**

**W46 `agent-runtime` 2026-08-17 收尾** —— 21 條 acceptance **19 條 ✅**,淨低兩條
(`A1` DEV 半邊 · `B6` SSE 喺 DEV 真通),而**兩條都係卡 Redis,唔係卡 Azure OpenAI**。
🟢🟢 **`A14` 同日全收** —— Chris 開咗 Azure OpenAI resource,agent **第一次真跑**:
`awaiting_approval` → **approve → `completed`**,落 DB 對數(proposal `executed` +
`approvedById` 有值 + 2 條 line item 逐字對返兩個 GUID)。
🔴 **批准嗰半分兩次先收齊,而第一次「失敗」嗰次先係最有價值**:撞 **409
`This request is complete…`** ⇒ **`F8-3` 卡上嗰句「Approving runs the platform's normal
checks — they can still refuse」第一次真驗證**(閘喺 `RequestService.addLineItem`,唔喺
agent 側)。
🟡 **封信仍然未發**(`docs/13-deployment/11-azure-openai-infra-request.md`)—— 但**佢而家
淨係為 Redis 而存在**;幾時發係 owner 決定。Chris 2026-08-17 傾過:W46 code 一行都未入
`main`,喺呢個時候叫人開 production tenant 嘅資源,次序係反嘅。
⚠️ **本機開發完全唔受影響** —— 本機一直有 Redis(`docker-compose.yml:23-32`)。
🔴 **本機 LLM 唔再全部 mock** —— `AZURE_OPENAI_*` 三個 env 一填就打真 Azure(缺一即 503,
冇 default)。

🔴 **一件部署前一定要知嘅事**:`main` 一 merge 咗 W46,**部署 DEV 之前 Redis 要喺度**,
否則 `POST /agent/runs` 直接 503(`ADR-0039 F1`:個 POST 而家只 enqueue)。呢個同
Azure OpenAI **唔同**級別 —— 冇 Azure OpenAI 只係少一條 live 驗,冇 Redis 係 agent 整個停。

---

**`main` 嘅座標(2026-08-14)**:git 連 GitHub **private**(`chris-private-workspace`,`main`)。Backend `apps/api`(NestJS)、`/docs/api` 200、DB seeded(**24** OpCos + admin + catalog SKU)。`apps/web` = **約 10 個實畫面**(Overview / SKU Catalog / Requests + detail + new[開單] / Drift / License Assets / Settings / **Audit log** / **Delivery failures** / Login)。**api 1044 test(74 suites)· web 377 passed**(⚠️ 另有 **6 條 pre-existing 紅**,見下)。ADR 到 **0035**(🟢 **0035 = Accepted 2026-08-14** —— 平台自己開嘅 licence REQ 號碼落 `Request`,**非 `@unique` 兼唔准入任何 `where`**,呢個限制本身就係決定;落地單 = **CH-030**)(🟢 **0034 = Accepted 2026-08-13**,落地單 **CH-029**)(🔴 **0031 = Rejected**,見下)· CH 到 **030**(🟢🟢 **030 = 2026-08-14 一日收晒** —— 實作 + test + migration + H6 light/dark 真 render;✅ `OD-1` backfill **= 唔做,Chris 同日拍板** ⇒ 新欄只對 ADR-0035 之後開嘅 request 有值,**已收嘅決定唔係遺留待辦**)(🟢🟢 **029 = 2026-08-14 全收 closed** —— 實作 + test + `F5-4` render + **`D-C` live @ DEV** + **`D-A` live @ 本機**,三個 deliverable 各自都有 live 證據) · BUG 到 **011**(✅ closed)。

⚠️ **上面呢句 2026-08-13 更正過兩處,而兩處都係同一格入面自己同自己唔同步**:CH-029 喺同一句出現兩次,一處寫 `approved 未開工`、另一處寫 `proposed,三條 OQ 未答` —— 而**兩個都已經過時**。⇒ **改一個 ID 嘅狀態之前,先 grep 成份檔數吓佢有幾多個 entry**(呢個形狀 2026-08-13 一日內中咗六次)。

🟢 **CH-021 ✅ closed(2026-08-11)** —— onboarding intake 通知(該 OpCo `OPCO_IT` + `OPS_NOTIFICATION_MAILBOX`),**A12 live 真寄兼 Chris 確認收到**。🔴 **A12 喺本機做,唔喺 DEV**:本機 ACS 憑證係真值,`ACS_SENDER_ADDRESS` 逐字等於 `CH-012-verify A4`(真送達過)⇒ DEV 換唔到嘢返嚟;而 **canonical intake 路零外部副作用**(唔掂 SN、唔掂 Graph)。⚠️ **fixture 一定要揀冇 `OPCO_IT` 用戶嘅 OpCo** —— seed 嗰個係 `opco.it.rhk@rapo.com.hk`,**真公司 domain**,用預設 RHK 會真寄畀佢。

🟢 **CH-024 / 025 / 026 / 027 四單 2026-08-12 一日內全部 closed 兼 merged**(PR #84 / #85 / #87 / **#88**)。**CH-027 = ADR-0033 落地** —— `owned` 由 `prepaidUnits.enabled` 改成 `enabled + warning`,assign gate 跟住走 ⇒ **由拒絕 32/101 個 SKU 收窄到 11 個,而 11 個個個講得出理由**(6 個真係用晒 + 5 個訂閱已取消)。🟢 **`warning` seat 派得到係實測唔係推論**(`AAD_PREMIUM_P2` `enabled=0`/`warning=10` → Graph HTTP 200,`consumed` 0→1,移返後 0)。

🟢🟢 **五項真環境驗證 2026-08-12 全部收咗**(Chris 批准停 `ai-doc-extraction-db`,一氣呵成):migration 對真 DB **21/21 applied** · **真 sync 驗到 `SPE_E3` `owned` 21 → 4498**(21 + 4477 grace)、`SPE_E5` 4502 → 4744 ⇒ **CH-020 嗰個「dev tenant 超支 33」之謎解開兼修好** · **gate 拒絕 `32 → 11`,同 ADR-0033 D4 個表逐字一樣** · light+dark 六張截圖。⇒ **CH-026 / CH-027 兩單都 closed。**

🟢🟢 **CH-022(`INTAKE-REQUESTER`)2026-08-12 `A7` live 收 ⇒ closed** —— 端到端第 2 步(UOP 收到 n8n intake 之後喺 SN 開 O365 單)**由 W43 交付以嚟第一次真流量行得通**。四個證據冇一個靠 intake 回應:api log `Ordered ServiceNow request REQ0044083 (1 RITM)`(**零** `Could not raise…` = 08-07 三次全部掛嗰句)· SN `sc_req_item` 真出 **`RITM0047389`**(`cat_item=efe38ade…`,count **1**)· `REQ0044083` 個 `requested_for` **逐字等於源 `REQ0044067` 個 `opened_by`**(ADR-0030 修法)· 本機 DB 重讀 line item RITM 已填。📌 **`requesterEmail` 係故意送一個 SN 必然反查唔到嘅地址** —— 舊 code 就死喺呢格,單照開得成 ⇒ **`A1` 嘅 live 版**。🔴 **intake 回應永遠證明唔到 RITM 開咗**(`created` 喺 `raiseLicenceRequest` 之前 snapshot ⇒ line item `serviceNowSysId` 恆為 null)。🔴 **08-11「留返 DEV 做」個前提打咗折**:DEV **一樣缺** `DEFAULT_ONBOARDING_SKU_ID`(grep 零命中,只剩 DB override),而兩邊 `SERVICENOW_INSTANCE_URL` **逐字一樣** ⇒ 同 Graph tenant 論證同族第三次。⚠️ **留低咗一張真單 `REQ0044083`/`RITM0047389` 待決定收唔收**(平台冇 cancel,H3 out-of-scope;同 CH-020 leftover 同族)。

🟢🟢 **CH-028(`ASSETS-IN-M365`)2026-08-12 closed 兼 merged(PR #90)** —— Platform view 加一欄 **`In M365`**(`tenantConsumed`)⇒ **`Assigned`(平台自己嘅帳 = Σ `OpcoSkuLedger.assignedQuantity`)同 M365 真實用量第一次並排**。🔴 **刻意唔計個差**(Chris 拍板 D2-A):`In M365 − Assigned` **就係 `DriftAlert.delta` 嘅定義**(兩條 sum 逐字相同),但**兩邊個 `tenantConsumed` 唔同源** —— Drift 頁行 **live Graph**(`reconcile.service.ts:50`,OD2「fresh tenant totals, not a stored snapshot」)、Platform view 行 **stored snapshot**(`tenant-owned.service.ts:89`,OD4「never calls Graph」)⇒ 喺呢度計 delta = 養一個同 Drift 對唔上嘅第二真相。**有一條 test 專門守住,falsification 真跑過**(加 delta 副行 ⇒ 只有嗰條紅,1/11)。**D3-B**:grand total 加 `TenantSkuStatsDto.totalConsumed`,scope 跟 `totalAssigned`(all rows)唔跟 `totalOwned`(prepaid-only)。🟢 **H6 真數據 render**(唔使造 fixture,101 個 row 有 70 個帶真值):`totalConsumed = 25275`,**grand total(endpoint)同 subtotal(前端計)兩條獨立路徑對得上**;`Teams_Premium` owned **0** / In M365 **2**、`VIVA` owned **0** / In M365 **30** —— 平台以為冇、M365 話有人用緊。🔴 **兩樣淨係真 render 先捉到**:①`In M365` 兩字喺窄 numeric 欄換行令 header 高過其餘六欄(加 `whitespace-nowrap`,實測七個 `th` 全部 36px)②表 **溢出 28px @1440px**(加欄前係零溢出)。⚠️ **順帶揭咗一個 ledger leftover(Chris 決定唔動)**:`POWERAUTOMATE_ATTENDED_RPA` `alloc=0` / **`assigned=1`** / **`In M365=90`** —— 個 `1` 係 **W45 `F4-4` 真派嗰次留低**(Graph 側移返咗、ledger 冇跟住減),而 **Drift 頁零 alert**(sweep 未跑)⇒ **呢個落差今日之前冇任何畫面顯示過**,新欄第一日就派上用場。🔴 **spec 途中一句我自己嘅推論被實測推翻(R3 已 log)**:D3 寫「controller 逐個欄砌(ADR-0013 D2)」係由 `IntegrationController`(BUG-011)**推**去 `LicenseController`,實讀 `license.controller.ts:251-255` **佢直接 return service object** ⇒ **同族第七次,而今次係喺自己份 spec 度製造。**

🟢🟢 **CH-026 `G-7` 2026-08-13 做咗 ⇒ CH-026 全收**(Chris 批准由 AI 經 API 做):22 × `PATCH /license/catalog/:id` **全部 200** ⇒ **`Available seats` KPI `4,270,779` → `50,779`**、`unlimitedSkus` `0` → **22**,light + dark 真 render 過(unlimited 行出 `Unlimited` / `—` / neutral badge / 冇 owned bar,常態行一個字冇郁)。三條獨立路徑對數:endpoint `totalOwned` = 我自己由 79 個 prepaid row 加返嘅總和 = 算術 `4,270,779 − 4,220,000` = **50,779**。
🔴 **`G-7` 只做咗喺本機** —— 當時 **DEV 做唔到**:佢跑緊 `dev-86ed450`(08-10),**冇 CH-026**(row 冇 `seatModel`、stats 冇 `unlimitedSkus`),亦冇 CH-024/025/027/028 ⇒ **DEV 落後 `main` 五個 CH**。
🟢🟢 **CH-029 merge(PR #101 → `2a68f8d`)之後 DEV 又落後一次,同日 部署 #7(`dev-2a68f8d`)追返** —— 驗證同 #6 一樣唔睇 revision status,改睇新 code 先出到嘅嘢(enum 11 個兼 `holding` 排位啱 · `skippedUnlimited` · web bundle 六個字串)。🟢 **今次多咗一種 #6 冇嘅證據**:輪詢第 1 次 200 但**冇** `holding`、第 2 次(+10 秒)**有** ⇒ **同一個 URL 由舊變新**,排除咗「一直都喺度 / 舊 cache」。⇒ **`CH-029` `D-C` live 同日收**(`reconcile` 201 `{"resolved":16,"skippedUnlimited":22,"drift":56}`;獨立 join `alert.sku.skuId` 對數 72/16 → 56/**0**;audit **16/16** 帶 `reason=unlimited-sku`)。🟢🟢 **`D-A` 2026-08-14 收咗,但唔係喺 DEV 撳** —— 唯讀探測發現 DEV 三條 `READY` **全部同一人同一 SKU**,而 target SKU `POWER_BI_PRO` **Graph 答佢冇持有** ⇒ 撳落去只會驗到「未持有」嗰條路(即本來就有嘅行為),代價係一個真 licence ⇒ **唔撳**。改喺本機驗(**同一個 Graph tenant / 同一個 app**,而 `HoldingCheckService` 就係打 Graph;DEV 側 gate 已由 OpenAPI enum 確認在 wire)。fixture 用 `FORMS_PRO`(**`unlimited` ⇒ 萬一讀錯 seat 成本係零,fail-safe 唔係自信**)。結果:`holding`/`seats`/`assign`/`ledger` 四個全 `skipped`,**ledger `5/0` 一個字冇變**,`stage → ASSIGNED`。📌 **「撳之前先唯讀探測」呢條 R10 規矩今次真係攔咗一次冇意義嘅真派。**⚠️ **「DEV 追齊咗」唔可以當狀態寫 —— 佢每次 merge 就過期**(呢格半日內由 ✅ 變返 🔴)⇒ **驗 DEV 之前一律先確認佢跑緊邊個 tag。**

🟢🟢 **部署 #6(`dev-53965f3`)—— 嗰刻 DEV 追齊五個 CH**。驗證**唔睇 revision status**(entrypoint 令 migrate/seed 失敗 NON-FATAL ⇒ `Healthy` 證明唔到 DB 通),改睇只有新 code 先出到嘅嘢:row 有 **`seatModel`**(順帶證明 **migration 真跑咗** —— 冇嗰條 column,Prisma query 會爆 500)· stats 有 **`totalConsumed: 25292`** · web bundle 有 `In M365` / `unlimited excluded` / `grace` / `Completed`,而 **ADR-0033 移走咗嘅 `No seats enabled` 唔喺度**(**負面命中先係最強證據**)。
🟢 **DEV 側 `G-7` 同日亦做咗**(Chris 批,部署 #6 之後先做得到):pre-state `prepaid=22` ⇒ 22 × PATCH 全部 200,`totalOwned` **4,240,459 → 20,459**、`unlimitedSkus` **22**,三路對數。⚠️ **curate 係 DB 資料唔係 code,唔會跟住部署過去** —— 兩個環境各做一次。
🔴 **DEV 揭到一個本機睇唔到嘅後果:`totalUnallocated` 變負數(`−25,151`)**。條數係**啱**嘅:`totalAllocated`(58,814)**包含** unlimited row 嘅 allocation,而 `totalUnallocated` **只計 prepaid** ⇒ `20,459 − 45,610`。即 **CH-026 progress 決定 #4 個「兩個 KPI 範圍唔同」代價,喺真 allocation 數據下第一次浮面**(本機 `totalAllocated = 0` 所以由頭到尾睇唔到)。**#4 預見咗範圍唔同,冇預見會出負數。🚧 未處理未開單** —— 同 CH-026 spec §4 個「unlimited SKU drift 點計」屬同一批「unlimited 落地之後先睇得到」嘅問題。
📌 順帶:KPI 實際叫 **`Available seats`** 唔係 CH-026 doc 寫嗰個 `Prepaid seats`(CH-027 之後改咗名);`FLOW_FREE` `In M365 = 4,521` ⇒ **unlimited SKU 嘅 drift 點計仍然未處理**(spec §4 標低咗,要另開)。

🔴 **一個落差要記住**:gate 仲擋住嗰 11 個,**組成同 ADR-0033 寫嘅唔同** —— ADR 寫「6 用晒 + 5 `Suspended`」,實測 **7 + 4**(總數啱)。**呢個差異本身就係證據**:probe 嘅數字會郁,而 `capabilityStatus` 唔會 —— 正正就係 D1 揀「存 status」唔揀「由四個數推」嘅理由。

🟢 **stale branch 2026-08-12 清晒**:本地 **8 條**(`git branch -d`)+ remote **18 條**(`git push origin --delete`)—— 全部先跑 `--merged origin/main` 實測過命中先刪,唯一未 merge 嗰條(當時進行中嘅 PR)留低。⇒ **本地剩 `main`、remote 剩 `origin/main`**。💡 **remote 側數量多過本地側**(18 vs 8)—— 本地嗰啲之前有刪過,remote 冇跟,所以查嘅時候兩邊都要查。以下保留做背景 ———— `git branch --no-merged main` **空**,即係全部安全刪得。**下次開工仍然由 `main` 開新 branch**。⚠️ **呢度刻意唔寫 `main` 嘅 commit hash** —— 寫低嗰個 commit 本身就令佢過時(實犯:PR #80 寫住 `main = 8f7711a`,而 merge 佢即刻變 `6bb8e0c`)。要當下真相跑 `git log --oneline -1`。

🔴 **PR merge 之後一定要逐個 commit 查有冇入齊,唔可以睇個 `MERGED` 就算** —— **PR #87 實測只 merge 咗 6 個入面嘅頭 2 個**,靠 checkout 之後見到舊版 working tree 先揭穿。方法:`git merge-base --is-ancestor <sha> origin/main` 逐個行(#88 六個已咁樣查過,全部 `True`)。

🟢 **W44 2026-08-13 closed ⇒ 而家零個 phase 未收**(下面原文保留)(🔴 **2026-08-12 更正** —— 下面 W45 同 CH-023 兩行**已經 closed**,原文保留做背景;呢段一過時就正正係 §14 警告嗰種「下個 session 用錯前提開始」):
- **W44 = 部署上新 Azure DEV 環境** —— 🟢 **2026-08-13 closed**。~~已部署三次,🔴 卡環境(F6 卡 `B8` private DNS · F9 卡 `B9` SSO 真人驗)~~ ⇒ **已部署 5 次**;`B8` 2026-08-12 解封(custom domain 由呢台機直接打得通),`B7` 2026-08-06 解封。**收尾收咗** `F6-6`(break-glass 真登入 DEV:200 + `uop_access`/`uop_refresh` + role `ADMIN`)· `F6-14`(**400 body 290 B 完整過 ACA ingress + nginx**,`steps[]`/`failedAt`/`whoFixes` 齊)· `F2-13` · `F9-9`(原來一早做咗)。🟢🟢 **`F9-8` 同日全收**(SSO 嗰半 Chris 本人測試確認可以)⇒ **`AUTH-2b` 亦 closed**。🚧 **淨低**:**F7 五條 n8n 接線**(target = ADR-0017 三接縫 phase)。🔴 **新 RISK `R10`**:**叫做「DEV」嘅環境對真 production M365 tenant 有寫權** ⇒ 撳 assign 之前一律先唯讀探測。
- ✅ **W45 = assign 過程可見性(ADR-0029)—— 2026-08-12 `F4-4` live 收 ⇒ closed**。⚠️ **下面「卡 `B8`」嗰句已經唔啱** —— 真正卡住嘅係「要唔要真派一個 licence」呢個**決定**(本機同 DEV 打緊同一個 tenant / 同一個 Graph app);失敗路已併入 W44 `F6-14`。以下保留做背景 —— 🟢 **實作全部收晒**(後端十步回傳 `{outcome, failedAt?, steps[]}` · 前端 `AssignResultDialog` · light+dark 真 render 驗過)。🔴 **淨低 F4-4 live 驗,卡同一個 `B8`**。🔴 **branch 座標(2026-08-11 最新)**:W44 三個 phase 嘅 code 全部落咗 `main`(PR **#77** / **#78** / **#79**)—— ⚠️ **「本地已經冇任何 feature branch」呢句 2026-08-12 已經唔啱**(而家 8 條已 merge 未刪,見上面)。`chore/b8-live-verification` 已 merge 兼刪。剩低嘅嘢**全部係 live 驗**(W44 F6-4/5/6 + F9-8 · W45 F4-4b · CH-023 G9),卡同一個 `B8`,**由 `main` 開一條新 branch 一齊做**。
- ✅ **CH-023 = assign 之後 ServiceNow 側結果留得低 —— 2026-08-12 `F3-5` live 收 ⇒ closed**(驗到嘅正正係 `skipped` 分支 = 本 CH 個 driver;NOTE 同 dialog step 逐字一樣,零 drift)。⚠️ 下面「卡 `B8`」同樣唔啱。以下保留做背景 —— 🟢 **實作收晒**(`f219676`)。🔴 **`ADR-0031`(`AssignAttempt` 新表)= Rejected** —— Chris 揀咗 Option A(一條 `RequestEvent` NOTE)。**呢個係一個「提案被自己嘅代價否決」嘅例**,值得記形狀:D4「refusal 路開始寫狀態」係全份提案入面**唯一推翻既有約束**嘅位(第二次軟化 `ADR-0016 D6`),而佢**淨係為 refusal 路存在**;而 refusal「邊道閘擋住」係撳嗰刻見到、改完即刻再撳嘅嘢,**本身唔係「三日後要翻查」嗰種事實** ⇒ 覆蓋面大過需求。⇒ 零 schema / 零 migration / **零前端**。ADR-0031 全文保留唔改寫,將來要「翻查每次嘗試」由 D1-D6 重開。

> 🔴 **2026-08-10 撞到一個所有 test 層都捉唔到嘅 bug,形狀要記住**:`apiPatch` 由頭到尾 hand-roll `new ApiError(status, message)`,**冇第三個參數** ⇒ error body 永遠唔會落 `ApiError.detail`(只有 `errorFrom` 會,而 `apiPatch` 從來冇用過佢)。ADR-0029 個 steps 就係擺喺 400 body,所以**喺瀏覽器永遠到唔到前端,dialog 一世開唔到** —— 而 **api test 917 綠 / web test 綠 / tsc 0 / lint 0**,因為 UI test **自己手砌 `ApiError` 連 detail 落去**。⇒ **教訓唔係「漏咗一條 test」,係「條 test 放錯層」**:一條手砌自己期望嘅 error 嘅 UI test,永遠唔可能喺 transport 層失敗。已修(`d43b7a9`)+ 補 transport 層 test。⚠️ **`apiGet` 一樣冇 detail,刻意冇改**(現時冇 caller 需要)。
>
> 🔴 **同一日第二次同一形狀(BUG-011,`5314664`)**:`IntegrationController.list()` **逐個欄砌回應、明文唔 spread**(ADR-0013 D2 **刻意設計,應該保留**)⇒ 我加咗 `pendingRestart` 落 read-model,**個欄根本冇出到 API**,而三層 test 全綠(service spec 打 service · UI test 自砌 fixture · **DTO 冇宣告嗰個欄所以 tsc 唔返佢完全合法**)。⇒ **兩單嘅共同形狀:每一層 test 都喺自己嗰層邊緣停低,而 bug 就住喺兩層之間。** D2 嗰個代價(**新欄唔會自己流出去**)之前冇人寫低過,而家寫低咗 + `integration.controller.spec.ts` 守住。⚠️ **而第一版 guard 自己都係假嘅**:`toHaveProperty(key)` 對 `undefined` 一樣 pass ⇒ **一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事;唯一分辨方法係拆走實作睇佢紅唔紅。**
>
> ⚠️ **本機 `apps/web` 有 6 條 test 一直紅**(`local-profile.test.ts` 5 條 `localStorage.clear is not a function` + `reset-password.test.tsx` 1 條 timeout)。**`git stash` 實測 baseline 一模一樣 = pre-existing**,已登 BACKLOG `WEB-TEST-JSDOM`。⇒ 見到 `6 failed` **唔好當係自己搞壞咗**,但亦唔好當佢唔存在。
>
> ⚠️ **`npm run lint`(root)只 lint api**。web 要 `-w @uop/web` 另跑,而佢**本身紅住 16 條 prettier**(全部同 W45 無關,見 BACKLOG `LINT-web`)。
>
> 🔴 **`nest start --watch` build-cache 假綠燈 —— 診斷方法 2026-08-11 更正咗**:`Test-Path apps\api\dist\main.js` **唔可靠**(CH-021 A12 實測:watch 跑咗 90 秒佢仍然返 `True`,而真兇就係佢,害我白等 180 秒)。**唯一可靠信號 = `Found 0 errors` 同 `MODULE_NOT_FOUND` 一齊出**,但 `start-detached.ps1` **唔 capture api stdout** ⇒ 要用 `Start-Process … -RedirectStandardOutput` 起一次先睇到。修法次序不變:刪 `*.tsbuildinfo` **同** `dist/` → **直接起,中間唔插 `npm run build`**。
>
> ⚠️ **本機 5433 有 port 衝突**:`ai-doc-extraction-db` 同 `uop-postgres` 搶同一個 host port,**只可以二揀一**。W45 + BUG-011 + CH-021 各借用過一次(Chris 批)之後都已還原 = `ai-doc-extraction` 五個 container 跑緊、UOP stack 停咗。要起 UOP 就要再停佢哋一次。
> 🔴 **還原有個「靜靜失敗」陷阱(BUG-011 實測)**:如果 `docker start ai-doc-extraction-db` 嗰陣 `uop-postgres` 未停,佢會搶唔到 port,而**之後即使停咗 UOP、`docker restart` 都唔會重新 attach** —— container `healthy` · DB 內部 `accepting connections` · `docker inspect` 見到 `PortBindings` 仲喺,**但 host 5433 零 listener**(= restart-stack skill 硬規則 3 嗰個形狀)。修法 = `docker compose up -d <svc>` recreate,**而且要真 TCP connect 驗,唔好睇 health flag**。
> ## 🔴 環境:「Azure UAT」係誤名(2026-08-04 Chris 更正)—— 呢格睇漏會用錯前提開始
>
> **W32/W33 部署嗰個唔係企業 UAT,只係一個自建測試 Azure 環境**:自建 RG(`RG-RCITest-RAPO-N8N`)/ ACR / ACA env(**冇 VNet 整合**)+ PG public,住喺 Azure 公網,**同企業網絡零連繫**。
>
> ⇒ **佢同 n8n 兩個方向都接唔通**:inbound 冇企業 domain 入口;**outbound 打唔入內網**(n8n 住 on-prem / 內部 VM)。
> 🔴 **呢個就係 W36–W42 一路 carry 嗰句「n8n 側從未真接通,三個 seam 零 live 驗證」嘅根本原因 —— 唔係漏做,係環境上做唔到。**
>
> **檔名 / ADR 標題刻意保留**(改名會令 git history 永久對唔上,W36 判斷)⇒ 讀 `07-uat-as-built.md` / ADR-0012 嗰陣,把「UAT」讀成「**第一個 Azure 環境(自建測試)**」;兩個檔頂都有更正 blockquote。
>
> **真正接得通企業網絡嘅環境 = `RG-RAPO-UOP-DEV`**(infra 2026-08-04 交付 · 企業共用 ACA env `acaen-rapo-dev` + hub VNet PE + custom domain `rapo-uop-web-dev.rci-t.com`)—— 🟢 **已部署 5 次**(#1 = 2026-08-06 raw ARM PATCH;現行 `dev-86ed450`),**W44 2026-08-13 closed**。~~W44 進行中,仍未部署~~ ⚠️ **原文呢句由 08-06 起就唔啱,carry 咗七日** —— 正正係 §14 警告嗰種。
>
> **已解封 / 已交付**:**ADR-0027 Accepted**(Chris 揀 **Option A** —— api ingress 收返 internal,對外只剩 web 一個 hostname;🔴 **cookie / CORS / 前端一個字唔變**,兩個選項嘅分別只在 machine-to-machine)· `deploy/azure/aca-dev.json`(**唔建 ACA env**,只 update 兩個既有 app;`validate` **Succeeded**)· `aca.params.dev.json`(gitignored,已證)· **`what-if` 已跑**:零 Delete、9 個無關資源 `Ignore`、**custom domain + `workloadProfileName` 保留** · PG database **`platform` 已自建**(management plane,唔使連到 PG)· `nginx.conf.template` **零改動**(Option A 令 F4 消失)· vendor **暫時全 placeholder**(F3-6 拍板:部署成功再逐個接)。
>
> 🟢 **B1(image build)2026-08-05 解封** —— registry `acrrci3ailanding1.azurecr.io`(跨 tenant 企業中央 ACR)。解封方式 = **換一台唔喺公司網嘅 build host**(出口 IP `52.187.129.166`,Azure 段):Docker Hub ✅ · ACR `Login Succeeded` ✅ · api image(BUG-008 個 `test -f dist/main.js` 硬閘過)+ web image 都 build 成功 ✅ · **push 真證到**(api `sha256:5a8d48cd…` / web `sha256:1d543670…` —— 之前四輪只證到 `login`,冇 image 可推)。params tag = **`dev-0d01f0c`**,`what-if` 重跑同 baseline 一致。
>
> ⚠️ **三件唔可以靜靜當佢消失**:①呢條路**繞開**公司 proxy,唔係令部署鏈喺公司網跑得到 ⇒ **解法 ①(SP 攞 registry `read` + `scheduleRun/action`)仍然最乾淨,infra 唔應該撤走**(🔴 `AcrPush` **唔包** `scheduleRun/action`)②之前四條解法**全部 assume 咗「build 一定要喺公司網嗰台機做」而冇人立過呢個 assumption** ③F5 由 `az acr build` 改本地 `docker build` = **R3 deviation**,已 log。
>
> 🟢 **2026-08-06 已部署上 DEV(部署 #1)** —— 但 **🔴 唔可以講「部署成功」**,見下面 B7。
> **B4**:`az deployment group create` 撞 `LinkedAuthorizationFailed`(SP 冇 `managedEnvironments/join/action`;env `acaen-rapo-dev` 住喺**另一個 RG** `RG-RAPO-ContainerAPP-DEV`,SP 實測**只有** `[Contributor] RG-RAPO-UOP-DEV`)。
> 🟢 **繞過 = `az rest --method patch`,body 唔含 `environmentId`**。🔴 **`az containerapp update`/`registry set` 一樣 403**(CLI read-modify-write 會連 `environmentId` 送返去)⇒ **一定要 raw ARM PATCH**。腳本 = **`deploy/azure/patch-deploy-dev.ps1`**(無參數 = dry-run 印 masked body;`-Send` 先真送)。
> 🟢 **PATCH 比 ARM full PUT 更安全** —— 唔 unset 冇送嘅 property ⇒ infra 配嘅 `customDomains`+SNI / `workloadProfileName` **結構上掂唔到**(實測完好)。`aca-dev.json` 保留做宣告式真相。
> **實測**:api `--0000002` `Healthy`/`RunningAtMaxScale` · web `--0000001` `Healthy`/`Running` · 🟢 **ACA 由 VNet 內 pull 到 registry**。
>
> 🟢🟢 **B7 已解封(infra 2026-08-06 畀咗 `managedEnvironments/read` + enable log)⇒ 三個未知數全部收齊**。container log 原文:
> ```
> 04:14:26 [entrypoint] prisma migrate deploy
> 04:14:27 19 migrations found in prisma/migrations
> 04:14:28 The following migration(s) have been applied:
> 04:14:28 [entrypoint] seeding (idempotent upserts)
> 04:14:30 Seeded 24 OpCos + admin + RHK OPCO_IT user.
> 04:14:31 [NestApplication] Nest application successfully started
> ```
> **零 `WARN: migrate deploy failed` · 零 `WARN: seed failed` · 零 Error** ⇒ **B3(ACA 連 private endpoint PG)✅** · **PG v18 migration(G8)✅ 19 個全部 applied** · **seed ✅ 精確 24 個 OpCo**。
> ⚠️ **陷阱以後仍然成立**:`docker-entrypoint.sh` 令 migrate/seed 失敗 **NON-FATAL** ⇒ revision `Healthy` **證明唔到 DB 通**,驗證一定要睇 log 或 HTTP。
> 🟢 **B9(SSO)—— 2026-08-07 靠改設計解封。code 齊,但仍未 live 驗過,而家仍然行緊 break-glass `admin@uop.local`。**
> **舊前提已作廢,唔好照 W44 前四日嗰套做**:ADR-0003(MSAL SPA)嘅三個硬需求(SPA platform / Application ID URI / `access_as_user` scope)infra 個 app 三樣都冇,而**三輪往返都攞唔到 Application ID URI**。查證揭到重點:**佢哋配嘅嘢本身就係另一條路嘅完整形狀** —— client secret ✅ + redirect URI ✅ + confidential client ✅。**Chris 拍板** ⇒ **ADR-0028 Accepted**(server-side authorization code exchange,**supersedes ADR-0003**;ADR-0002 唔推翻,驗證邏輯移去 callback endpoint)。
> **而家嘅 flow**:前端只送人去 Entra + 交返 `code` → **API 用 client secret 喺 server 側換 token** → 驗 `id_token`(aud = client id,**唔需要任何自訂 scope**)→ upsert `AppUser` → 發**平台自己**嘅 httpOnly cookie ⇒ **SSO 同 break-glass 由 `auth.service.grantSession` 開始完全一樣**。三條 route:`GET /auth/sso/status` · `GET /auth/entra/start` · `POST /auth/entra/callback`。
> 🔴 **`VITE_ENTRA_*` 已經冇咗,MSAL 兩個 dep 已移除。** 四個 `ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID`/`ENTRA_CLIENT_SECRET`/`ENTRA_REDIRECT_URI` 由 **API runtime** 讀 ⇒ **改配置唔使重 build web image**(舊設計嗰個「估錯要重 build 10 分鐘」嘅風險已消失)。範本喺 `apps/api/.env.example` 認證段。
> ⚠️ **兩個「紅得靜」陷阱已處理,但形狀要記住**:①guard(`resolveSessionUser`)同 `refreshSession` 原本硬性 `authProvider:'local'` —— 唔拆嘅話 SSO **登入睇落成功**然後每個 request 401,錯誤指向 token 唔指向 provider 過濾 ②state cookie 喺 callback **驗證之前**就清,免得失敗後 reload replay 用過嘅 code。
> 🟢 **F9-7(PATCH 四個 env)一早做咗** —— 2026-08-12 打 `/api/auth/sso/status` 返 `{"enabled":true}` 先發現(**唔係新做,係發現咗做過**)。🟢 **F9-8 嘅 break-glass 嗰半 2026-08-13 收咗**(`F6-6`)。🟢🟢 **SSO 嗰半 2026-08-13 收咗 —— Chris 本人測試確認可以登入** ⇒ **`F9-8` 全收,`AUTH-2b`(掛咗一個月)同時 closed**。🔴 **證據來源分清楚**:break-glass = AI tool 驗;**SSO = Chris 人手驗**(Entra 互動要真人 + MFA,AI 結構上做唔到)——兩者都算數但唔可以寫成同一種(沿用 `CH-015` 先例)。
> 🟢 **可回退**:`login.tsx` 本地表單永遠喺;SSO 未配置 → `/auth/sso/status` 返 `{enabled:false}`,個掣自動暗住。
> 🟢 **Graph app 權限齊**(`LicenseAssignment.Read.All` / `User.Read.All` / `LicenseAssignment.ReadWrite.All`)⇒ F3-7 接真 Graph 冇障礙。🔴 client secret **exp 2028-07-28** 要入 RISK。
> 💡 **測 Entra 一定要用真瀏覽器** —— 命令列打 authorize endpoint 會攞到「200 冇錯誤」嘅**假陽性**(現代登入頁係 SPA,錯誤由 JS 畫)。跑一個**故意錯**嘅對照 case 先信自己個測試。
>
> ⚠️ **呢台機嘅 az session 唔穩定** —— 一日內撞過 **4 個唔同 SP**(`d2f094a3` / `a19dfe76` / `2ae44f00` / ACR `4a6e1474`),錯身份會畀出**誤導性 error**(403 睇落似權限未落,其實係身份唔啱)。⇒ **做 az 操作一律用獨立 `AZURE_CONFIG_DIR` 登入 SP**(憑證喺 `apps/api/.env` 尾段)。
> 🔴 **B8(新)= 企業 DNS 冇我哋條記錄**。2026-08-06 由**公司網絡**(DNS `10.160.92.1`)實測:`rapo-n8n-uat.rci-t.com` → **`10.160.71.243`** ✅ 但 `rapo-uop-web-dev.rci-t.com` → **Non-existent domain** ⇒ **infra 漏咗建** ⇒ custom domain **連喺企業網都訪問唔到**。⚠️ 之前「ACA 綁 custom domain 要 hostname 驗證 ⇒ DNS 應該配好」呢個推論**已被一條 `nslookup` 推翻**。
> ⛔ ~~🟢 **B8 唔 block 驗證** —— 由**公司網絡**打 **ACA 預設 FQDN**(internal env 喺 hub VNet private DNS 一定有記錄):`https://aca-rapo-uop-web-dev.nicesea-c3849dba.eastasia.azurecontainerapps.io/` + `/api/docs/api` ⇒ **F6-4/5/6 即刻收得**,custom domain 嗰半留 B8 解封後補驗。~~
> 🔴 **上面成句已被實測推翻(2026-08-10),原文保留做方法論記錄。** 個「**一定**」係推論唔係實測 —— ACA 預設 FQDN **一樣訪問唔到**(env `internal=true`,`staticIp=10.160.71.70` 私有 IP,靠嘅 private DNS zone **冇 link 到企業網**);而「F6-4/5/6 即刻收得」跟住錯,**被當成事實用咗四日**。
> 🟢 **實際結局(2026-08-12 / 08-13)**:`F6-5` / `F6-6` / `F6-14` 全部**經 custom domain `https://rapo-uop-web-dev.rci-t.com/`** 收咗,**ACA 預設 FQDN 由頭到尾冇用過一次**。⇒ **凡要 live 驗,第一件事係真打一次 custom domain**(30 秒,兩個結果都有路行)。
> 🔴 **仍要一次直接驗證先收尾**(row count / admin 帳號 / API 200):**最快 = 上面條 ACA FQDN**;其次 ①infra 畀 `managedEnvironments/**read**`(純唯讀,比 join 細)②Chris 個人帳號睇 Azure Portal log。
> 💡 **方法論(值得帶去下一個環境)**:直接路封死唔等於冇路 —— **部署權限 / 觀測權限 / metrics 係三套唔同嘢**,而 metrics 一直喺我哋 RG Contributor 範圍內,四日嚟冇人諗過用。同 Day 3「有咩前提我根本冇寫落嚟」同一族。
>
> ⚠️ 仍未掂:**n8n 雙向**(base URL = `http://rapo-n8n-uat.rci-t.com/`,🔴 **http 明文** = B6)。
> ADR-0027 · `docs/13-deployment/09-dev-as-built.md` · `W44-azure-dev-deploy/`。

> 🔴 **W43 最要緊嗰三件(ADR-0025 / 0026)**:
> ① **onboarding intake 收貨即刻自己建一張 `O365 User License Maintenance Request`**(catalog `order_now`/cart,**唔係** Table API insert —— `sc_request` insert 403,BUG-010)。once-guard = **line item 自己嘅 `serviceNowSysId`**;冇佢嘅話 n8n 每重推一次就開多一張**真飛**,而平台側完全睇唔出。
> ② **assign 由單閘變雙閘**:`azureSyncedAt`(Graph)**同** `serviceNowUserSyncedAt`(SN 有冇呢個人)。兩個都**冇得 override** —— `budgetOverrideReason` override 唔到,因為 sync gate 唔係決定,係「呢個人存唔存在」嘅事實。sweep 一個 vendor 一個 abort flag。
> ③ 🔴 **`target_user` 永遠指住 requester,唔會變**(ADR-0026):`sc_item_option` update **403 ACL**,回填已經拆走,改行 work note。真 target 一律睇 `target_users_email`。
> 🔴 **ServiceNow 逐個 table 分開開權,唔可以由「某張表寫得」推論「另一張寫得」**:`sc_request` insert **403** · `sc_item_option` update **403** · `sc_req_item` / `sc_task` update ✅ · catalog `order_now` ✅。
> 🔴 **UOP 同 n8n 共用 SN 帳號 `n8napiservice1`**(RISK **R7**)⇒ `sys_updated_by` / `assigned_to` 永遠分唔到邊個系統做,**唯一指紋係 `close_notes`**。ADR-0024 D5 個 rationale 就係喺呢個歧義上寫錯咗。查 SN 側「邊個做過乜」一律唔可以信 `sys_updated_by`。
> ⚠️ **SKU Catalog 而家有三個 CSV 動作,唔好撈亂**:①`Export CSV`(CH-018)= 攞走成個 **active** catalog;②`Import CSV`(CH-019)= 改完傳返上去**批量 curate**(對帳鍵 = `SkuId` GUID,只寫 alias / category / base,**永不新建 SKU**,dry-run 先行);③`Download template`(Settings → Integrations,W35 F2)= **allocation** 範本,pre-fill curated alias 同現有數字,拎去改 seat 數 —— 佢同 ①② 係**完全唔同嘅檔同唔同嘅 endpoint**。三者都**只有 active SKU**(`catalog.service.ts:112` 硬 filter)。
> 🔴 **改 `businessAlias` 有一道 fail-closed 閘**(CH-019 / ADR-0023 D5):任何令**兩個 active SKU 撞同一個 alias** 嘅改動 —— 批量 import **同**單筆 `PATCH catalog/:id` —— 一律 **400 整批唔寫**。原因係 `businessAlias` schema 冇 unique constraint,而前端範本 first-wins(`allocation-template.ts:63-67`)、後端 import last-wins 兼冇 `orderBy`(`matrix-csv.ts:86-90`)⇒ 撞咗會**靜靜**把 allocation 寫落錯嘅 SKU。**清空 alias**(→ null)唔算撞、唔會被擋,但批量清要 `confirmClears`(清咗嗰個 SKU 退出 import scope,而佢 ledger 舊數會**凍結**留低)。
> 🔴 **Ledger 有兩個 reset,名近似而風險唔同級**(CH-016 / CH-017,對照表 → `CH-017-ledger-full-reset/spec.md §2.2`):`POST /license/ledger/allocation/reset`(ADMIN+REGIONAL)只清 `allocatedQuantity`,**重新 import 救得返**;`POST /license/ledger/reset`(**ADMIN only** + 打字確認)連 `assignedQuantity` 一齊清,**任何 import 都救唔返**(ADR-0004 #5),只能重跑 `npm run baseline:assigned`。改任何一個之前先睇清楚係邊個。
> ⚠️ **dev DB 現況**:`150 rows | alloc 41 | assigned 5971 | adjustments 14` —— RTW 一個 OpCo 已被 CH-017 驗證 full reset 過(其餘 23 個完好)。全平台清空係 Chris 自己撳,順序見 `CH-017/progress.md` closeout。
> 🟡 **前端驗證:睇你今次 session 有冇 browser tool,唔可以當佢一定喺度。** 2026-08-02 有 **Playwright MCP**(`mcp__plugin_playwright_playwright__*`)嗰陣 AI 自己 render 得到、light/dark 都截到圖;但 **2026-08-04 實測同一個 repo 冇咗** —— 只剩 `claude-in-chrome`,而佢 `list_connected_browsers` 返 `[]`。⇒ **開工先確認,唔好假設**;真係冇就**照寫「未 render 驗」,唔可以用「token 兩邊都有定義」冒充**(W43 F5-3 / G9 就係咁留低)。⚠️ 有 Playwright 嗰陣佢會喺 **repo root** 掉低截圖同 `.playwright-mcp/`,**收工要清**。

> 🔴 **`apps/api/.env` 喺主 checkout(`C:\Users\CLai03\unified-operation-platform`)係有嘅,而且入面係真憑證**(真 `ricohapdev` ServiceNow + 真 Graph tenant + 真 ACS)。2026-07-31 實證:live 打真 SN / 真 Graph 完全做得到。⚠️ 之前呢度寫住「本 worktree 冇 `.env`」—— 嗰句只對**另一個 worktree** 成立,喺主 checkout 讀會令你以為做唔到 live 驗證。**開工前自己確認一次係邊個 checkout。**
> 🔴 **port 3100 跑緊嘅唔一定係本 worktree** —— 驗證前**必查 process ancestry**(AP-11,W36 同 W38 各中過一次)。
> 🔴 **`POST /requests/intake` 而家有兩張合約**(CH-020 / ADR-0024 D2),靠 **body 有冇 `mode`** 分流:冇 `mode` = W24 嗰張 locked canonical(`N8nIntakeRequestDto`,**一個字冇改**);`mode: 1` = n8n 1001 今日實際送嘅 flat 形狀(`N8nFlatIntakeDto`);其他值 **400 fail-closed**。**被共用嘅係 URL 唔係 contract** —— 唔好「順手」把 canonical 兩個 required 欄放寬,`serviceNowSysId` 係 `@unique` idempotency key。Flat 路多兩個 line item 欄 `serviceNowTaskSysId`/`serviceNowTaskNumber`,**刻意唔喺 canonical DTO 出現**。<br>🔴 **W43 更新(ADR-0025 D1)**:嗰兩個欄由「驅動 by-task close」改成**純 traceability,唔再驅動任何嘢**(欄冇 drop)。**by-task close 已停用** —— 實測 n8n 自己閂埋 WDA task,留住嗰條分支只會令每次 assign 都 PATCH 一張已閂嘅 task,被 `active` 閘正確拒絕,再為一個唔存在嘅問題開一條 Delivery failure。`mode` 分流本身**一個字冇改**。
> 🔴 **seam ④ 收 `TicketTarget` union 唔再收 bare sys_id**(`{kind:'ritm'|'task', sysId}`)。`task` 分支 **patch 之前一定要驗 `active=true`**,fail closed —— n8n 會送已閂 task(REQ0044049 實例)。改呢度之前睇 `direct-ticket.provider.ts` 個 `openTask()`。
> ⚠️ **維護**:呢段同 `CLAUDE.md §0/§9` 每次 closeout 一齊掃 —— 兩份都係無條件注入每個 session,過時 = 下一個 session 用錯前提開工(2026-07-31 實犯)。

**開發路線全鏈完成(詳細歷史 → `BACKLOG.md` + memory `MEMORY.md`,此處唔重複)**:
- **後端業務層**:W02 C(catalog+對帳)/ W03 D-1(intake)/ W04 D-2(assign+ledger)✅ · **前端全鏈**:W05 scaffold / W06 FE-1(Overview+Catalog)/ W07 FE-2(Requests+detail 讀寫)/ W08 FE-3(Drift + BE-graph-harden)✅ · **BUG-002 ✅**(Graph error wrap→503)。
- **AUTH 全鏈 ✅**:W09 AUTH-1(後端 Entra JWT + `@Roles` guard,ADR-0002)→ W10 AUTH-2a(FE MSAL scaffold,ADR-0003 — ⚠️ **2026-08-07 已被 ADR-0028 推翻,MSAL 已由 `apps/web` 移除**)→ W11 AUTH-3a(OPCO_IT 後端 per-OpCo scope)→ W18-21 AUTH-4a/b/c(本地登入 / user 管理 / 密碼生命週期 / session hardening,ADR-0005/0006)→ W22 AUTH-3b(FE 真 role scope)→ **W44 F9 SSO server-side code exchange(ADR-0028)**。
- **FE-Assets 鏈 ✅**:W13-17(allocation import[ADR-0004 curation-as-scope]+ ledger read/write + By-OpCo inline edit[ADR-0007])。
- **ADR-0008 request 建單 rollout 全 4 階段 ✅**(2026-07-15):W24 **甲** inbound intake(n8n→平台 `POST /requests/intake` m2m)/ W25 **乙** outbound direct(平台→SN + 前端 `/requests/new`)/ W26 **丙** n8n outbound(`N8nWorkflowProvider` env 選路)/ W27 **丁** D365 scope(平台早 SKU-agnostic → confirm+test+doc)。

**當前 pending(rolling JIT,待 Chris 揀)**:🔴 **AUTH-2b**(真 SSO e2e — ⚠️ **唔再卡 IT 開 SPA app reg**:ADR-0028 之後現有 app registration 直接用得,code 亦已齊;✅ **2026-08-13 closed** —— `F9-7`(四個 `ENTRA_*` env)**一早做咗**、break-glass **AI tool 驗**(`F6-6`)、**SSO Chris 本人測試確認可以**。🔴 **兩半證據來源唔同要標明**(SSO 嗰半 AI 結構上做唔到 —— Entra 互動要真人帳號 + MFA;沿用 `CH-015` 先例)。⚠️ 由 **08-07 ADR-0028** 起就唔再係技術阻塞,**掛咗六日淨係差一撳**。`W10/AUTH-2b-RUNBOOK.md` 個 MSAL 前提**已過時**)· **DEPLOY**(生產部署 + 真數 curation)· honest-gap 三項(activity feed / Drift Resolve / AI-Assist)· 🟡 AUTH-4c-C(email reset)/ DD-2(npm vuln)。
**Deploy-time carry(非 repo)**:真 SN/n8n 建單合約對齊(`docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md` 🅐–🅙 待 SN owner 填)· 真 D365 SKU curation(`W27/CURATION-D365.md` runbook)。

**誠實資料原則**:缺 endpoint(handler name / AI parse / My queue …)一律 EmptyState/coming-soon/略去,絕不砌假數。前端 = **H6 保護**,token-only 唔 eyeball,**寫前對 prototype render 睇**(computed 查證,唔靠畫面名估),跑 `ui-design` skill,vite dev 5173 —— 見 [[ui-design-fidelity]]。

**提醒(完整見 CLAUDE.md §5)**:掂 H1-H8 第一句 **STOP+ask**(H1 架構 / H2 vendor / H3 scope / H4 security / H5 test / H6 UI design fidelity / **H7 tool-result integrity**:絕不作 tool 輸出 · send tool 即收口 · 講 pass/done/rendered 前 trace 一個真 tool_result,見 `docs/03-implementation/incidents/INC-001` / **H8 tool-usage discipline**:讀檔/搜尋用 Read/Grep/Glob 唔用 bash cat/grep · 唔 echo 拼裝 · 單一重定向)。**繁中回覆**。非 trivial 工作先 pre-doc gate(R1)。

**Runtime 實況(避坑,CLAUDE.md 冇)**:
- **起後端**:`docker compose up -d`(postgres **5433** + redis)→ `apps/api/.env`(gitignored)→ root `npm run start:dev` → `http://localhost:3100/docs/api`。
- ⚠️ **Prisma engine CDN(`binaries.prisma.sh`)俾公司 proxy 封(503)**:clean reinstall(刪 node_modules)後要**轉流動網路**跑一次 `npm run prisma:generate` + `prisma migrate` cache engine。其他 TLS 用 `NODE_EXTRA_CA_CERTS=C:/Users/CLai03/ricoh-ca.pem`。
- ⚠️ **Port**:3000 俾 Langfuse 佔 → 用 `PORT=3100`;5432 俾既有 Postgres 佔 → docker postgres host 5433。
- **Auth**:controllers 全域 guard(`@Roles`);OPCO_IT per-OpCo scope(AUTH-3a/3b)+ 本地登入/密碼/session(AUTH-4a-c)。🔴 **兩個 provider 只有一種 session** —— break-glass 同 Entra SSO 都發同一個 httpOnly `uop_access`/`uop_refresh` cookie(ADR-0028);guard 唔再按 `authProvider` 分流。**前端零 token、零 auth library**(MSAL 已移除)。**本地要 `AUTH_DEV_BYPASS=true`**(api `.env`)+ **`VITE_AUTH_DEV_BYPASS=true`**(web)否則 `/api` 401 / FE gate 去 login。扮 OPCO_IT 加 `AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk`。**真 SSO e2e 仍未驗**(W44 F9-8)。ADR-0002/**0028**/0005/0006(**ADR-0003 已 superseded**)。
- **Request 建單(ADR-0008)**:inbound intake `POST /requests/intake`(m2m `X-Intake-Key`,`INTAKE_API_KEY`);outbound `POST /requests` provider 由 **`REQUEST_SUBMISSION_PROVIDER=direct|n8n`** 選(default direct→SN Table API / n8n→webhook `N8N_OUTBOUND_WEBHOOK_URL`+`_KEY`)。**代表性合約**,真上線待 `docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md`。
- **Demo harness**:`apps/api/scripts/demo-harness/`(npm `demo:mock-sn`/`demo:mock-n8n`/`demo:cleanup`)—— dev-bypass + mock 底下 live 跑 ADR-0008 request 雙向閉環(甲/乙/丙 + assign 回寫),零新 dep;runbook 見該 folder README。
- **SKU 一律用 `skuId`(GUID)唔靠名**;assign 前必過 `azureSyncedAt` sync gate(`findUser` null = 未 sync)。
- **UI**:token-only,唔 hardcode / eyeball;寫前跑 `.claude/skills/ui-design`;視覺真相 `design_handoff_licenseops/`。
- **git push**:upstream 已設,直接 `git push`;public→已轉 private,唔好 push 真實 secret(`.env` 已 ignore)。

**Detail on-demand**:`session-start.md`(詳版)· active phase folder(hook 自動注入)· `docs/02-architecture/design-system.md`(UI)· memory `MEMORY.md`。
