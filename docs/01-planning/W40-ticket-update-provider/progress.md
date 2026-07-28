---
phase: W40-ticket-update-provider
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: draft
last_updated: 2026-07-28
---

# W40 — Progress

## Day 0 — 2026-07-28 · Kickoff(D0 gate 未解除)

ADR-0017 rollout **最後一階段**。戊(W36)· 己(W38)· 庚(W39)已收,辛做完就 4/4。

### 揀號

`git fetch --all --prune` 後掃晒所有 branch + git history 嘅 `docs/01-planning/W4*` → **零命中**,W40 可用。呢一步係 BACKLOG 頂部「兩個 W36」事件之後定落嘅規則(PROCESS §2.1),今次照做。

### 落手前實讀 workflow JSON —— 揪到一個 blocking 落差

W39 嘅教訓係「**凡平台送出 / 解析嘅嘢,JSON 係 SSOT,唔可以照抄 ADR 轉述**」。今次一開始就逐個 node 讀 2004,結果又中:

**ADR-0017 D3 把 `addWorkNote(sysId, note)` map 去 2004 mode 1。但 mode 1 一定會 `state:'2'`。**

平台今日 assign 成功之後只加一條 work note,**唔掂 state**。照 ADR 做 =

```
direct：assign 成功 → 加 note，state 不變
n8n   ：assign 成功 → 加 note + 張單被標成 Work in Progress
```

兩個問題:**違反 D0**(切掣就靜靜改咗對外行為),而且**語意係相反嘅** —— 成功咗反而標「進行中」。

2004 sticky 自己寫住「RITM ONLY. 3 fields ... deliberate」,即係 n8n 側**刻意**唔提供 note-only 能力。所以呢個唔係佢哋做漏,係兩邊對「回寫」嘅定義本來就唔同。

⇒ plan §8 OQ-A,本 phase 最重要一個決定。

### 另外兩個查 code 先見到嘅嘢

**① 命名撞晒。** ADR D3 個 `DirectServiceNowProvider` —— 呢個名 **W25 已經用咗**(`RequestSubmissionProvider` 嘅建單實作)。

**② `addWorkNote` 有兩個 caller。** 除咗 `assign.service:306`,仲有 `outbound-retry.service:180` 個 `repairWorkNote`。同 W38 揪到「`getSubscribedSkus` 原來有 4 個 consumer」係同一種發現 —— **接縫化之前一定要數清 caller**,否則 seam 只覆蓋你當時望住嗰個。

### 一件證明 doc 寫啱地方嘅事

加 `n8n-ticket` connector **必然要改 schema**(`ConnectorConfig` 係具名 column 唔係 key-value bag)。

W39 就係喺呢度撞到 H1 —— kickoff 假設「零 schema」破產。當時把教訓寫入 **ADR-0013 實作補註**而唔止寫喺 W39 progress,理由係「**下一個加 connector 嘅人會踩同一個坑**」。

今次係**事前**知,唔使再撞一次。

### ⚠️ 辛同前三階段本質唔同

戊己庚都係平台讀 / 建自己嘅嘢。辛係**第一次**把「改客戶張真飛嘅狀態」變成可切換行為,而 **close 冇 undo**。

## Day 0(續)— D0 gate 解除

Chris 五個 OQ + H1 **全部跟建議**(plan §8 有表)。

**OQ-A = A**:`addWorkNote` 唔入介面。呢個令接縫 ④ 嘅覆蓋面**細過** ADR D3 個表 —— 同 W38 收窄 D2(5 個方法收 3 個)係同一個判斷:**vendor 冇對應能力,就唔好喺介面度假裝有**。硬塞落 mode 1 會令切掣變成改行為。

**OQ-E = 1 + 2 一齊做**:close 同 WIP 兩個 trigger 都接。理由係 rollout 表寫死咗辛嘅驗收就係「RITM 狀態正確,無雙重 close」—— 只交付 provider 唔接 trigger,等於留返一個未收嘅尾。

### 拍板之後自查,揪到我自己一個事實錯誤

我喺 OQ-E 個選項描述寫住「WIP 要接 ADR-0016 預算 gate(**未實作**)」。

**錯 —— 預算 gate W36 已經完成。** `assign.service` 入面嗰個 `budgetOverride` audit metadata 就係佢。

唔影響拍板(Chris 揀嘅係選項 1,唔係因為呢句),但**影響 F4**:`markInProgress` 唔係「等一個未來 feature」,而係即刻有嘢接。錯事實留喺 plan 度會令 F4 走錯方向,所以入咗 §8 + changelog。

> 根因同 **AP-13** 同源:我腦入面嗰份「邊個 ADR 實作咗未」係一份**手抄清單**,而佢已經 stale。真相喺 BACKLOG row 同 code 度。

### 連帶揪到一個 OQ-E 冇覆蓋嘅設計問題

拍板係「預算 gate 擋 → `markInProgress`」。但操作員可以**不斷重試**同一個被擋嘅 line item ⇒ 每擋一次 PATCH 一次真單。

`closeComplete` 同理:同一張 RITM 唔可以 close 兩次。

⇒ 兩個都唔可以照 `if (blocked) markInProgress()` 落去,要**只喺狀態轉變時寫**。已入 plan §8 + F4 checklist,**留 F4 定案唔喺 kickoff 猜**。

## Day 1 — 2026-07-28 · F1 ✅

三個新檔落 `integration/ticket-update/`(對齊 W38 `license-ops/`):抽象 + `DirectTicketProvider` + boundary spec,另加 6 條行為 spec。

**538 / 538**(528→538)· lint 0 · tsc 0。

### 條 test 嘅正面半邊捉到我一個真錯

boundary spec 原本用 `Object.getOwnPropertyNames(TicketUpdateProvider.prototype)` 去讀介面有邊幾個方法。

**TS `abstract` 方法冇 runtime 存在** —— 個 array 淨係 `["constructor"]`。

即係話 `expect(methods).not.toContain('addWorkNote')` **無論介面寫成點都會綠**。一條永遠綠嘅 test,而佢個名講住佢守住 OQ-A。

捉到佢嘅係**正面半邊**(`toContain('markInProgress')` 紅咗)。呢個正正係 W38 開始配對正負半邊嘅理由 —— 今次即刻兌現。

> 同 **AP-13** 講嘅「兩種都會令 test 保持綠」係同一件事:一條 assert 唔到嘢嘅 test,同一份 stale 手抄清單一樣,都係**用綠色掩蓋事實**。

改成 match 宣告形式 `abstract X(` —— 唔用裸名,因為呢個檔嘅 comment 大篇幅討論 `addWorkNote`(解釋點解佢唔喺度),裸名檢查會把解釋本身當成違規。W39 喺 integration-probe 踩過同一個坑。

### 兩個同 W38 有意識唔同嘅決定

**① transport 失敗 throw,但唔 wrap 成 503。**

W38 個契約係「transport 失敗 throw 503,各實作自己 wrap」。呢度**跟原則唔跟實作**:seam ④ 嘅 caller 按 ADR-0011 OD4 **一定**會 swallow 咗個 error 再入佇列(唔可以令一個已成功嘅 assign 變失敗),所以 503 呢個 HTTP 語意**永遠冒唔出去**。wrap 佢等於砌一個冇人收得到嘅形狀。

**② table 寫死 `sc_req_item`,唔跟 `SERVICENOW_DEFAULT_TABLE`。**

2004 個 patchUrl 焗死咗 `/api/now/table/sc_req_item/`。direct 側若然跟 config,兩條「理應等價」嘅路徑就會喺有人改設定嗰日靜靜分叉 —— 一個設定值默默決定緊其中一邊寫邊張表。已經加咗 test 守住。

### fails-before

介面加 `abstract addWorkNote` + `outbound-retry` 加 seam import → **兩條真紅**;額外收穫係 **TS 都爆**(`DirectTicketProvider` 冇實作嗰個方法),即係呢條邊界有兩層守。還原後 `grep` = 0。

### ⚠️ 順帶見到,**冇順手修**

`servicenow.service.ts:71-72` 個 `request()` 失敗時 `logger.error(...)` **原封 log 咗 response text**。

同 **BUG-004** 係同一類(外部字串當安全內容 log)。但:

- BUG-004 收窄範圍嘅理由係「**直接處理 user identity** 嘅 vendor 呼叫」,而 ticket 路徑處理嘅係 sysId + 平台自己寫嘅 note
- 修佢會掂到**所有** SN 呼叫(intake / outbound / retry),明顯超出 W40 範圍(H3)

⇒ 唔喺本 phase 修,記低做 follow-up 候選。**唔當佢唔存在,亦唔順手改**。

## Day 1(續)— F2 ✅

`N8nTicketProvider` + connector 註冊 + migration。**555 / 555**(538→555)· lint 0 · tsc 0。

### 🔴 R3 — 我 plan 嘅任務切分同型別現實矛盾

原 plan:F2 寫 provider,F3 註冊 connector。落手先發現**做唔到** —— `ConnectorConfigService.resolve()` 第一個參數係 typed `ConnectorKey`,所以 `'n8n-ticket'` 未入 `CONNECTORS` 之前,provider 一行都編譯唔過。

⇒ 註冊 + schema + `list()` row 提前落 F2,F3 淨低選路 factory + wire。已入 plan §7 changelog。

> 呢個唔係「順手做多咗」,係**原本嗰條線畫喺一個唔存在嘅接縫上**。

### 順帶修一個既有 AP-13 缺口 —— 而佢揭穿咗四個真窿

G1 leak test(assert 冇任何 config 值洩漏落 `/admin/integrations` 回應)個 env fixture 係**手抄清單**。加新 connector 唔會自動被覆蓋。

呢個正正係我今朝先寫落 skill 嘅 **AP-13 子型 ①**。所以冇再手抄多三行,而係加咗一條守門:**fixture 嘅覆蓋面必須等於 `CONNECTOR_CONFIG` 宣告嘅全部 key**。

寫完即刻紅 —— 揭穿 **4 個從來未被驗過**嘅 key:

```
GRAPH_TENANT_ID · GRAPH_CLIENT_ID · SERVICENOW_DEFAULT_TABLE · SERVICENOW_USER
```

`SERVICENOW_USER` 係 **secret**(basic-auth 帳號),而佢由條 test 存在到今日一直冇被驗過。

⚠️ **呢個係 scope 以外嘅嘢,我冇靜靜做**:補齊七個 key(4 個既有 + 3 個 W40)寫入 checklist、本段同 commit message。做嘅理由係唔補就等於「知道有窿而唔補」,而補法只係 fixture 加值,零行為風險。

**fixture 本身仍然手寫** —— 具體形狀有價值(一個真嘅 instance URL 先令 `not.toContain('service-now.com')` 有意義)。derive 嘅係**覆蓋面**,唔係內容。

### fails-before 證到一件比預期更重要嘅事

刪走 `list()` 個 n8n-ticket row + 抽走 leak fixture 一個 key → **5 failed / 15 passed**。

🔴 而且 **TypeScript 一句都冇投訴**少咗一個 row。

即係話 W39 個病(新 connector 註冊咗但 `list()` 冇出，而條手抄 test 照綠)**確實可以完全靜靜發生** —— 冇任何編譯期防線,只有嗰條 derive test。

> 第一次插探針時我用 `.map()` 包住個 row,結果 TS 型別推導壞咗、compile 直接爆。咁係「證咗另一件事」,唔係證到守門。改成**純刪除**先係真正重現嗰個 bug 嘅形狀。

## Day 1(續)— F3 ✅

選路 factory + wire 落 `IntegrationModule`。**564 / 564**(555→564)· lint 0 · tsc 0。

三個 seam 而家全部有掣,**預設全部係現行行為**。

### 一個同 seam ② 唔同嘅寫法,有理由

seam ② 個 factory 係 **inline** 喺 module 度,所以冇 test。呢個 factory 寫成 **exported function**(跟 `requestSubmissionProviderFactory` 嘅先例),因為 fail-safe 方向係本 seam **唯一**值得單獨 test 嘅性質:

> 寫反咗**乜都唔會爆** —— app 照 boot、test 照綠 —— 只係 ticket closure 靜靜開始經第三方出去。

所以 near-miss 逐個獨立 assert(`N8N` · ` n8n` · `n8n ` · `nn8n` · `true` · `''`),唔併埋一條。呢個值係 admin 打入 DB 欄嘅,大小寫同前後空格唔係天方夜譚。

⚠️ **冇順手改 seam ② 個 inline factory**(§1.3,冇 break 就唔郁),但佢確實冇同等 test —— 記低。

### 又更正咗自己一項

checklist 原本寫「n8n 選咗但 URL 未配置 → **boot 失敗**(同 outbound factory 一致)」。

**唔應該咁做。** `N8nTicketProvider` 同 `N8nLicenseProvider` 一樣係 **per-call resolve** URL(唔喺 constructor 攞),所以 boot 再 resolve 一次就係**兩處各自維護同一件事** —— AP-13 子型 ②。

跟 outbound 個 pattern 表面上「一致」,實際上係抄咗一個唔適用嘅形狀。URL 缺失喺 per-call 報,F2 已經有 test 蓋住。

### fails-before 揀咗真實形狀

把 `choice === 'n8n'` 改成 `choice ?` —— 呢個係 fail-safe 搞反嘅**實際寫法**(有人想「有值就用 n8n」),唔係一個為咗令 test 紅而砌嘅改動。

**6 failed / 3 passed**:`'direct'` 同全部 near-miss 一齊紅,而 unset 仍然綠(truthy 對 `undefined` 啱好答啱)。呢個分佈本身就講清楚咗:**淨係測 unset 係測唔到呢個 bug 嘅**。

## Day 1(續)— F4 ✅ **新對外行為落地**

**575 / 575**(564→575)· lint 0 · tsc 0。Chris 三個拍板全部跟建議。

### 查證推翻咗 OQ-E 一個假設(令佢變簡單)

OQ-E 寫「一張 RITM 嘅**全部** line item 都完成 → close」。查 schema:`RequestLineItem.serviceNowSysId` 個 comment 明寫 **「THIS line's RITM」**(ADR-0008 D6 兩層)⇒ **一個 line item = 一張 RITM**。

所以根本冇「全部 line item」呢回事,條件簡化成「呢個 line item ASSIGNED → close 佢自己嗰張」。

### 🔴 close 唔 fallback 去 parent REQ

既有 work note 寫 `item.serviceNowSysId ?? request.serviceNowSysId`。close **冇**照抄呢個 fallback:

1. REQ 係 `sc_request`,而 seam ④ 只寫 `sc_req_item`(2004 patchUrl 焗死表名)
2. close 一張 REQ ≠ close 一張 RITM —— **其他 line 可能仲開住**
3. ADR-0017 D3 明文:平台只 close license RITM

> ⚠️ 順帶見到:**既有 work note 個 fallback 本身有問題** —— 佢攞 REQ sysId 去配 `'sc_req_item'` table,即係用 REQ 嘅 id 去搵一張 RITM。冇修(既有行為,超出 F4),記低。

### close 唔使守門,因為已經有人守住

原本諗住要防重複 close。查證之後發現**唔使**:stage gate(`item.stage !== READY` → 400)保證一個 line item 只會成功 assign 一次,所以只會 close 一次。

呢個係「唔加唔需要嘅嘢」(§1.2)—— 但係**查證得出**,唔係假設。

### `ticketHeldAt` —— 呢個先係真需要守嗰個

hold 冇同等保護:被擋嘅 assign 會 throw,而操作員會**不斷重試**(加 allocation、再試、搵 admin、再試)。冇 flag 就每次都 PATCH 一次真單。

⚠️ **只喺寫入成功之後先記 flag**。失敗就唔記,下次再試 —— 寧可多試一次(state 2→2 冪等),都好過標住「已 hold」而其實冇。

### 兩個 AP-13 味嘅位,順手用正解

**① 一個 kind 唔係兩個。** close 同 hold 失敗共用 `servicenow.ticket_update`,靠 payload `transition` 分。兩個 kind 就要兩份講同一件事嘅 whitelist。

**② `pickFailurePayload` 個 `kind !== 'servicenow.worknote'`。** 「除咗嗰個之外」等於**將來每個新 kind 自動 opt-in** —— W40 加咗一個唔應該有 lineItems 嘅 kind,啱好撞正。改成正面清單 `KINDS_WITH_LINE_ITEMS`:新 kind 而家要**主動要求**先有。

### 一個我放寬咗嘅守門 —— 理由要留低

F1 我把 OQ-D 寫成「`outbound-retry` **完全唔可以** import seam」。F4 證明呢個**闊過**個決定本身:

- **work note** retry:payload 記低嘅係一個 direct call 失敗咗,重發 = 做返同一件事 ⇒ 直連係啱
- **ticket state** retry:嗰個失敗係**當時選中嗰個 provider** 產生嘅,直連重發 = 用 Table API 修一個 n8n close ⇒ **必須**走 seam

⚠️ W39 有條相反嘅先例(boundary test 捉到 probe import → **收緊**)。今次係放寬,所以我冇靜靜改:靜態嗰條收窄成「work note 仍然直連」,而**真正嘅保證**(邊個 repair 去邊個系統)改由 `outbound-retry.service.spec` 嘅**行為** test 守 —— 一旦兩條路都 import 咗,靜態檢查根本分唔到佢哋。

### 又一個偏離 checklist,講清楚

checklist 寫「spec **唔** mock provider,wire 真 `DirectTicketProvider`」(抄 W38 G2 手法)。**冇跟。**

W38 嗰個手法有具體理由:mock 走 provider 會令 raw→503 個 wrap 跌出測試鏈,兩條 BUG-002 regression 會靜靜降級。**seam ④ 冇同等嘢** —— 兩個實作已經返同一詞彙,而佢哋自己各有 spec。呢度 mock 抽象先係啱嘅層次。

抄一個手法之前要問佢原本解緊咩問題。

### fails-before

拆走 `ticketHeldAt` 守門 + 令 close fallback 去 REQ → **4 failed / 45 passed**。兩條新守門紅之餘,**兩條既有 test 都一齊捉到**(happy path 個 work note assertion + W31 queue test)。

> 第一次插 REQ-fallback 探針時 TS narrowing 直接爆(`string | null`)—— 即係 TS 本身都擋住咗一部分呢個錯誤形狀。改成 type-safe 版本先真正證到條 test。

## Day 1(續)— F5 ✅

Contract test + 1007 分工邊界。**588 / 588**(575→588)· lint 0 · tsc 0。

### 1007 分工邊界 —— 由 assume 變成事實

plan §5 R1 把「雙重 close」列做最高風險,而 ADR-0017 D3 只係**聲明**兩邊唔重疊。1007 已經自己 PATCH `state=3`,所以呢個必須係查得實嘅嘢。

實讀 1001 `Prepare Approval Data`:

```
actionItems  ← phase1Items only
               create_user / add_user_to_group / setup_abw_folder 三個
               全部 .find()/.filter() 自 phase1Items,帶住 1007 之後 close
               嗰啲 ritmSysId。other_items 一次都冇入過 actionItems。

licenseItems ← other.filter(status === 'pending_license' || /O365/i)
               即 other_items only。呢個先係 intake 變成
               RequestLineItem.serviceNowSysId 嘅來源。
```

⇒ **兩套 sys_id 來自同一份 AI Brain output 嘅兩條互斥分支。**

⚠️ 但呢個保證**冇任何自動守門** —— 一個 RITM sys_id 兩邊長得一模一樣,平台分唔出邊個係邊個。所以 code comment 除咗寫結論,仲寫明「**一旦 n8n 側改咗,呢個 comment 會係第一樣唔再成立嘅嘢,而平台偵測唔到**」。

### Contract test:刻意唔 assert 嘅三樣

跟 W39 同一個判斷 —— 要求兩邊相同,有時本身就係要求錯嘢:

| 唔 assert | 理由 |
|---|---|
| **notes 文字** | 2004 必然 append `'Handled & generated by n8n.'` + 截 3900。呢個係**好事**:張單上面睇得出邊條路寫嘅 |
| **error message** | vendor 掛咗,運維要知係**邊個**掛 ⇒ 兩句必須唔同 |
| **refusal shape** | 真不對稱,獨立釘死(見下) |

### 真不對稱:SN 拒絕 PATCH

```
direct  ServiceNowService 對任何 non-2xx throw      → caller 收到 exception
n8n     2004 用 neverError:true,webhook 照答 200   → caller 收到 error outcome
```

兩個都係啱嘅(各自 transport 決定),所以**冇夾硬統一**。獨立釘死嘅係**共通點**:兩者都唔可以被當成成功 —— 「報告一張從來冇郁過嘅單已經 closed」正正係呢個 seam 最唔可以有嘅 failure mode。

有人日後想「統一」佢哋(令 n8n 側 throw,或者令 direct 側 swallow),條 test 會紅並且送佢返嚟先睇呢段。

### fails-before 揀真實錯誤形狀

令 n8n `read()` 當 HTTP 200 就係成功。呢個唔係砌出嚟嘅改動 —— 佢係一個**好合理嘅誤會**:「`call()` 已經檢查咗 `res.ok`,仲使檢查咩?」

**3 failed**(contract 1 + provider spec 2)。

### ⚠️ 一個分層事實,唔可以當有雙重保險

`assign.service` 嗰條「queues an error outcome」**冇紅** —— 因為 F4 決定咗 mock 抽象,所以佢餵嘅 `{status:'error'}` 係直接砌出嚟,唔經真 provider。

呢個係正常嘅分層分工(provider 側嘅 mapping 由 provider spec 守),但要記住:**assign 側守唔到 provider 側嘅 mapping bug**。

### 兩個順手收窄

- 一條 test 叫 `both target sc_req_item`,但 n8n 嗰半根本 assert 唔到表名(表名喺 2004 個 patchUrl 入面,平台冇送)⇒ **名闊過 assert**(BUG-004 教訓),改成 `direct names sc_req_item; n8n names the RITM and the mode`
- 刪走一句冗餘 assertion(`toBe('error')` 之後再 `not.toBe('updated')`)

### 下一步

F6 —— doc-sync(ADR-0017 補註 · BACKLOG · runbook 08 · ADR-0016 D6 那句)。
