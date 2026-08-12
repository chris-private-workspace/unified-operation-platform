# CH-022 — Requester sys_id 由 REQ 個 `opened_by` 攞(ADR-0030 落地)

- **Status**:✅ **completed**(2026-08-12 — A7 live 驗收咗;approved 2026-08-10 — Chris)
- **ADR**:**ADR-0030**(**Accepted** 2026-08-10 ⇒ H1 gate 已過)
- **Owner**:Chris Lai
- **BACKLOG**:`INTAKE-REQUESTER`

## 1. 問題

端到端第 2 步(UOP 收到 n8n onboarding 之後喺 SN 建 O365 單)**由 W43 交付到今日,喺真流量下一次都冇成功過**。

2026-08-07 三次 n8n intake(`REQ0043934` / `REQ0044049` / `REQ0044057`)全部掛喺同一句:

```
WARN [IntakeAdapterService] Could not raise the ServiceNow licence request for <cuid>:
     The requester was not found in ServiceNow, so the request cannot be raised
```

**根因(ADR-0030 Context 有完整推導)**:n8n `1001…json:1486` 把 `requesterEmail` map 做**觸發 onboarding 嗰封 Outlook email 嘅寄件人**,而 ADR-0025 D1 消費佢嗰陣當咗係「ServiceNow 用戶」。兩個 domain 冇任何保證對得上。

## 2. Scope

### In

1. `resolveReqSysId` 除咗 `sys_id`,順手 return `opened_by` 個 sys_id
2. submit payload 加 optional `requesterSysId`;`DirectServiceNowProvider` 有就直接用,冇就行返 email 反查(**outbound 路**)
3. `RequestSubmissionProvider` interface + `N8nWorkflowProvider` 跟住改
4. test:H5 critical path 覆蓋(見 §4)

### Out(明確唔做)

- ❌ **唔改 n8n** — ADR-0030 A1 已否決。修好之後 n8n 送咩都唔再阻塞
- ❌ **唔寫 migration / backfill** — ADR-0030 **D4**:08-07 三張靠 Delivery failures `REQUEST_SUBMIT` retry 補
- ❌ **唔解 outbound 路個同款失敗點** — IT 自己開單冇 REQ 可攞,依然靠 email 反查(ADR-0030 D3 明文限定範圍)
- ❌ **唔掂 `target_user` 語意** — 佢仍然係 placeholder(ADR-0026 已定死),真 target 睇 `target_users_email`

## 3. 設計

### 3.1 `resolveReqSysId` 改返兩個值

`intake-adapter.service.ts:545-565`。今日淨係攞 `record.sys_id`,而 `getRecordByNumber`(`servicenow.service.ts:172-183`)**冇落 `sysparm_fields`** ⇒ 成個 REQ record 一直喺手。

⚠️ **`opened_by` 係 reference 欄** — 唔加 `sysparm_display_value` 嘅時候,ServiceNow 返嘅係 `{ link, value }`,**sys_id 喺 `.value`**,唔係直接一個 string。呢個係最易寫錯嘅一格。

🔴 **`opened_by` 空要 fail-loud** — 同 `resolveReqSysId` 搵唔到 record 一樣行 `BadRequestException`,**唔准**靜靜跌返去 email 反查。理由見 ADR-0030 D3(已知 0% 嘅路留低,下手會當佢係 repair 機制)。

### 3.2 payload 加 optional `requesterSysId`

`DirectServiceNowProvider.submit`(`direct-servicenow.provider.ts:70`):

```
requesterSysId 有  → 直接用(intake 路)
requesterSysId 冇  → resolveRequester(payload.requesterEmail)(outbound 路,行為一個字唔變)
```

`buildVariables`(`:200-209`)個 `requester_name` / `target_user` 兩個欄照舊食同一個 sys_id。

### 3.3 `N8nWorkflowProvider`

同一個 interface,要跟住加欄。佢今日 fail-loud(`n8n-license` 掣鎖死 `direct`,CH-010 遺留),所以**唔需要真行為**,但**唔可以令 type 對唔上**。

## 4. Acceptance(H5 — critical path)

| # | 準則 | 點驗 |
|---|---|---|
| A1 | intake 路用 `opened_by`,**完全冇 call** `findUserSysIdByEmail` | unit:assert 個 mock **零次** call |
| A2 | `opened_by` 係 `{link,value}` 時攞到 `.value` | unit |
| A3 | `opened_by` 空 / 缺 → **fail-loud**,唔跌返 email 反查 | unit:assert throw **兼且** email 反查零次 call |
| A4 | outbound 路(冇 `requesterSysId`)行為**一個字唔變** | 既有 `direct-servicenow.provider.spec.ts:291` / `:301` 兩條**繼續綠**,並改註釋講明佢哋而家守緊 outbound |
| A5 | `requesterEmail` 送乜都唔阻塞 intake(包括 undefined / Outlook sender / SN 冇嘅地址) | unit:三種輸入都建到單 |
| A6 | api test 全綠 · root lint exit 0 · tsc 兩邊 0 | 本地跑(本地 stack 已起) |
| A7 | **live**:DEV 收一次真 n8n intake → SN 出到一張 O365 RITM | 🔴 **本機做唔到**(ACA internal,DNS 唔解析)⇒ 要喺公司網,或者用 Delivery failures retry 一張既有嘅 |

🔴 **A7 唔可以當「A1-A6 綠就等於通」** — W43 `target_user` 回填就係全綠然後一打真 SN 撞 403(ADR-0026)。呢個 CH 未經 A7 **唔算完成**。

## 5. Effort

0.5–1 日(改動細,但 H5 test + 既有 test 語意調整佔一半)。

## 6. Dependencies

- 🔴 **ADR-0030 要 Accepted**(H1 gate)
- ✅ 唔需要新 SN 權限(`sc_request` read 一直行緊,F7-6 證過)
- ✅ 唔需要 n8n 側任何改動
- ⚠️ A7 要 DEV 環境 + 公司網

## 7. 已知代價(ADR-0030 Consequences 摘要)

- ⚠️ **`target_user` 對 n8n 建嘅單會變成 `n8napiservice1`**(實測 `REQ0044049`/`REQ0044057` 個 `opened_by` 就係佢)。語意企得住,但 **SN owner 要知道呢個係設計唔係 bug**
- ⚠️ outbound 路個失敗點仍然存在,只係唔再影響 onboarding 主線

## 8. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-10 | Initial draft | `INTAKE-REQUESTER` 診斷收晒,根因確認為接縫語意錯配;ADR-0030 提出修法 | Chris |
| 2026-08-10 | approved + 實作完成(A1–A6) | ADR-0030 Accepted ⇒ H1 gate 過 | Chris |
| 2026-08-12 | **A7 live 收 ⇒ status `completed`** | 本機真撳一次,SN 真出 `RITM0047389`;`requested_for` 逐字等於 `REQ0044067` 個 `opened_by` | Chris |

### 實作實績(2026-08-10)

- **`N8nWorkflowProvider` 唔使改** — ADR-0030 Consequences 預咗要跟改,實際上 `requesterSysId` 係 **optional** 欄,structural typing 下唔會 break。ADR 嗰句係保守估計,記低以免下手以為漏咗。
- **api test 900 → 905**(69 suites 全綠)· root lint **exit 0** · `tsc --noEmit` **exit 0**
- ⚠️ **途中撞到一條假綠**:A3 嗰條 test(`opened_by` 缺 → 唔准 submit)第一版**冇 mock line items**,而 `raiseLicenceRequest` 喺冇 line 嗰陣本來就 early-return ⇒ `submit` 冇被 call 係「因為錯嘅理由」而通過。已補 `findMany` mock,個 assert 先真係守到 D3。**同 W44 Day 6 嗰句同源:斷言通過唔等於斷言有意義。**
### 部署(2026-08-10,DEV 部署 #3)

只 rebuild **api**(改動全部喺 `apps/api`),web 維持 `dev-3971ad3`。

| 步驟 | 證據 |
|---|---|
| build `dev-31d5970` | `exit 0`(Dockerfile 有 BUG-008 `test -f dist/main.js` gate ⇒ artifact 確認存在) |
| push | `digest: sha256:e8e0c48f…` |
| PATCH | api + web 兩個 `exit 0` |
| revision | `--0000005` `RunningAtMaxScale`,image `dev-31d5970` |
| **DB 通** | `19 migrations found` · `No pending migrations to apply.` · **`Seeded 24 OpCos + admin + RHK OPCO_IT user.`** |
| **app 起** | **`Nest application successfully started`** · 零 ERROR |

🔴 **冇用 revision 狀態落結論** —— entrypoint 令 migrate/seed 失敗 NON-FATAL,`RunningAtMaxScale` 證明唔到 DB。真證據係 `Seeded 24 OpCos`。

### A7 狀態

🟢🟢 **✅ 收咗(2026-08-12,本機,Chris 拍板喺本機撳)** —— 四個證據,冇一個靠 intake 回應:

| 證據 | 真值 | 意義 |
|---|---|---|
| api log | `Ordered ServiceNow request REQ0044083 (1 RITM)` · `Raised ServiceNow licence request REQ0044083 for cmsq0p4ou… (1 RITM)` | **零** `Could not raise the ServiceNow licence request` —— 就係 08-07 三次全部掛嗰句 |
| SN `sc_req_item` | `RITM0047389`,`cat_item = efe38adedbef6f80a98e75868c961936`,count = **1** | 逐字等於下面「副作用」段講嗰個 O365 catalog item;一張,唔多唔少 |
| SN `sc_request` | `REQ0044083` `requested_for = 7ee1a1921b877ed40148eacfe54bcb5e` | **逐字等於 `REQ0044067` 個 `opened_by`** ⇒ ADR-0030 修法真生效 |
| 本機 DB 重讀 | line item `serviceNowNumber = RITM0047389` / `sysId = e6897e53…` | 由 DB 讀返,唔係 intake 回應嗰份 |

📌 **fixture 刻意咁揀,唔係將就**:`requesterEmail` 送咗 `no-such-sn-user@example.com`(SN **必然**反查唔到)—— **舊 code 就係死喺呢一格**。單照開得成 ⇒ **`A1`(intake 路完全冇 call `findUserSysIdByEmail`)嘅 live 版**,順帶連 `A5`(requesterEmail 送乜都唔阻塞)一齊收。

🔴 **intake 個回應證明唔到 RITM 開咗,唔好用佢做證據** —— `created` 喺 `raiseLicenceRequest` **之前**就 snapshot(`intake-adapter.service.ts:232` vs `:238`)⇒ 回應入面 line item 個 `serviceNowSysId` **永遠係 null**,即使 RITM 真係開咗。上表後三行全部係**平台以外**或**事後重讀**攞返嚟。同「revision `Healthy` 證明唔到 DB 通」同族。

**三個配置點**(全部行 shell env,冇改 `.env`,守 §4.4):

- `SERVICENOW_O365_CATALOG_ITEM_SYS_ID` —— 用**返 DEV 同一個值**(`aca.params.dev.json`),唔係造一個假值
- `DEFAULT_ONBOARDING_SKU_ID` = `SPE_E3` `05e9a617-0261-4cee-bb44-138d3ef5d965`。⚠️ 本機 catalog **零個 SKU 有 `businessAlias`**(實測 `IS NOT NULL` → 0 rows)⇒ 只可以靠 GUID,而 ADR-0020 D4 本來就係咁要求
- `OPS_NOTIFICATION_MAILBOX` = Chris 個地址;OpCo 揀 **`PFU-HK`** —— 實測 24 個 active OpCo 入面 **23 個冇 `OPCO_IT` 用戶**,唯一有嘅係 `RHK`(`opco.it.rhk@rapo.com.hk`)⇒ **收件人淨係一個**

🟢 **順帶第二次 live 驗到 CH-021**:`Sent 'onboarding-intake' via ACS (operation 6d83b7d6-…)` · `notified 1 recipient(s)` —— 亦順帶再證咗 shell env 真係入到 process(唔傳就會 log `nobody`)。

🔴 **08-11 拍板「留返 DEV 做」嗰個前提,2026-08-12 打咗折**:當時理由係「本機要造兩個配置,DEV 零個」。實測兩件事推翻咗佢 ——

1. **DEV 一樣缺 `DEFAULT_ONBOARDING_SKU_ID`**:全 repo grep,`patch-deploy-dev.ps1` / `aca-dev.json` **零命中**,而佢係 DB-then-env ⇒ 只剩 DB override 一條路,而 seed 唔設佢 ⇒ 差距係 **1 vs 0,唔係 2 vs 0**。(⚠️ DEV DB 個值**未實測** —— 打唔到 private endpoint,要登入 UI 先驗到。呢句係推論,標明。)
2. **兩邊 `SERVICENOW_INSTANCE_URL` 逐字一樣**(`https://ricohapdev.service-now.com`,實測)⇒ 開出嚟嗰張單一模一樣,**去 DEV 換唔到嘢返嚟**。同 W45 `F4-4` / CH-023 `G9` 嗰個 Graph tenant 論證**同一族第三次**。

⚠️ **留低咗一張真單**:`REQ0044083` / `RITM0047389` 仲喺 `ricohapdev`(`state=1`)。平台冇 cancel 功能(H3 out-of-scope),要收就要喺 SN 側做 —— **待 Chris 決定**。同 CH-020 leftover **同族**:呢種「驗證留低嘅真嘢」冇任何 checklist 會自動提醒,所以寫喺呢度。

> ## 🔴 2026-08-11 更正 —— 上面原本寫嘅「路 1」唔通，會白撳一次
>
> 原文寫住兩條路都做得,第一條係「公司網撳 **Delivery failures** 個 `REQUEST_SUBMIT` retry(08-07 三行應該仲喺;`REQUEST_SUBMIT` 語意 = 外面乜都冇改過,repair 就係重新 submit)」。
>
> **實讀 code 之後:嗰條路一定會原封不動再失敗一次。** 兩處各自獨立證實:
>
> | 出處 | 事實 |
> |---|---|
> | `outbound-failure-fields.ts` `PAYLOAD_WHITELIST['request.submit']` | 只存 **5 個欄**:`targetUpn` / `targetDisplayName` / `opcoCode` / `requesterEmail` / `remark`。**冇 `requesterSysId`** |
> | `outbound-retry.service.ts:160-170` `repairSubmit` | **逐個欄明文重砌** submit payload,一樣**冇送 `requesterSysId`** |
>
> ⇒ retry 去到 `direct-servicenow.provider.ts:81` 嗰句 `payload.requesterSysId ?? await this.resolveRequester(payload.requesterEmail)` 一定行右邊 —— 即係 **W44 實測對 intake 路 0% 嘅 email 反查**(`n8napiservice1` 個 `email` 欄係空)⇒ **同一句 `The requester was not found in ServiceNow` 再出一次。**
>
> 🔴 **呢個唔係 bug。** ADR-0030 **D3** 明文寫住個 `??` **刻意唔係 fallback 鏈**、唔准救一個被拒絕嘅 id。真相係:**ADR-0030 同 repair 路之間有一條冇人接埋嘅縫** —— D3 只講咗 submit 嗰刻,冇講 repair 嗰刻。
>
> 📌 **錯法值得記**:原文由「`REQUEST_SUBMIT` 嘅 repair 語意 = 重新 submit」推去「所以補得返」,**冇查 payload 實際存咗乜**。BACKLOG `INTAKE-REQUESTER` 行有同一句,而佢自己仲寫住「嗰三行 failure row **未眼見過,由 code path 推**」—— **已經標明咗係推論,只係推得唔夠遠**。同一族第六次。

**⇒ A7 剩返嘅路:**

| 路 | 通唔通 | 備註 |
|---|---|---|
| ~~DEV 撳 Delivery failures retry 補 08-07 三張~~ | 🔴 **唔通** | 見上面。⚠️ **撳咗之後 `attemptCount` 會加一、row 維持 `open`**(I2),唔會整壞嘢,但係白撳 |
| DEV 收一次**新**的 flat intake | 🟢 通 | 新 payload 行 `intakeFlat` → `raiseLicenceRequest` 直接帶住 `openedBySysId`,唔經 failure queue |
| 本機造新單 | 🟢 通 | 但要補兩個配置,見下 |

🔴 **⇒ A7 唔係「順路喺 Track A 撳一撳」。** 佢要一張**新** intake,唔係補舊嗰三張。

### 🔴 撳之前要齊四個前提（2026-08-11 本機查證，兩個係缺嘅）

| # | 前提 | 唔滿足會點 |
|---|---|---|
| 1 | `SERVICENOW_O365_CATALOG_ITEM_SYS_ID` | `resolveCatalogItem` 喺 **step 1** throw(**掂 SN 之前**),寫一行 `REQUEST_SUBMIT` failure ⇒ **症狀同本 CH 要修嘅 bug 一模一樣,原因完全唔同**,只可以靠讀 message 分(`catalog item is not configured` vs `requester was not found`) |
| 2 | `ConnectorConfig.defaultOnboardingSkuId` | 🔴 **最陰濕** —— `intakeFlat` 永遠 `applyDefaultSku([], …)`,冇配就建**零 line item**,`raiseLicenceRequest` 見 `lines.length === 0` **early-return** ⇒ **零 SN 動作、零 failure row、零 log**。靜靜 no-op |
| 3 | 一個真 REQ number 且 `opened_by` 有值 | `resolveReqSysId` 400 |
| 4 | submit provider = `direct` | unset → fail-safe 落 `direct`(`fulfilment.module.ts:52`),✅ 預設就啱 |

**本機實測(2026-08-11)**:①**冇設**(`.env` 得 4 個 `SERVICENOW_*` key)②**NULL** ③✅ `REQ0044067`(in_process)/ `REQ0044068`(closed)兩張都在兼有 `opened_by` ④✅。
⇒ Chris 2026-08-11 拍板 **收手,留返 DEV 做**,理由:兩邊 SN 副作用一樣(**開一張全新 REQ + 一張 RITM**),而本機要先造兩個配置先撳得到 —— **配置得越多,驗到嘅嘢離真實路徑越遠**。

### 副作用（比原文寫嘅大）

`DirectServiceNowProvider.submit` 走 catalog `order_now` ⇒ ServiceNow 會開**一張全新 `sc_request`(REQ)+ 一張 `sc_req_item`(RITM)**,唔止一張 RITM。⚠️ **而且而家仲會觸發 CH-021 通知**(flat 路會寄信)—— 揀一個冇 `OPCO_IT` 用戶嘅 OpCo 就唔會寄。

🟢 **驗證唔使截圖** —— 撳完之後由本機直接查 `sc_req_item`(今日證過打得通 `ricohapdev`),見到一張新 O365 RITM(`cat_item = efe38adedbef6f80a98e75868c961936`)就等於 A7 過。

---

**Lifecycle reminder**:spec locked after status=approved。重大 deviation → §8 changelog。
