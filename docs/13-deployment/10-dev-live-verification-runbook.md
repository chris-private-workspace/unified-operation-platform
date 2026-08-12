# Live 驗證 runbook —— 收 W44 / W45 / CH-023 三個 phase 嘅尾

> **點解要呢份**:三個 phase 嘅**實作全部收晒**,剩低嘅**全部係「要有人真撳一次」**。散喺三個 checklist 各撳一次會漏,亦會重複登入 / 重複開單。
> **對應項**:W44 `F6-5` / `F6-6` / `F9-8` · W45 `F4-4b`(G11)· CH-023 `F3-5`(G9)。**呢份唔取代嗰三個 checklist** —— 撳完要返去逐個勾,證據貼返各自 `progress.md`。
> **建立**:2026-08-11 · **v2**(同日改寫,見下面「v2 改咗乜」)

---

## 🔴 分兩條 track —— 佢哋卡住嘅嘢唔同，唔應該綁埋

| Track | 內容 | 卡住嘅嘢 | 副作用 |
|---|---|---|---|
| **A · DEV 場** | Step A0-A5:custom domain · API proxy · break-glass · **SSO** · Graph · W45 **失敗路** | 🔴 **`B8`(環境)** —— 一定要喺公司網 | 🟢 **零** |
| **B · 一次真 assign** | W45 **成功路** + CH-023 **timeline NOTE** | 🔴 **一個決定**:要唔要真派一個 licence、派畀邊個、之後點收 | 🔴 **真派 licence** |

### ⚠️ v2 改咗乜（原本 v1 把兩條綁埋喺 DEV，而嗰個係錯嘅）

v1 跟住三份 checklist 照搬,把 CH-023 `G9` 同 W45 成功路一齊掛喺 `B8` 底下。**冇問過一條該問嘅問題:去 DEV 換返嚟啲乜?**

🔴 **查證(`BACKLOG` `DEV-GRAPH-PLACEHOLDER` 行,2026-08-10)**:DEV 個 `GRAPH_TENANT_ID = d1ea071a-…`(**公司 M365 tenant**),而 `GRAPH_CLIENT_ID` 同本機 `.env` **完全一致**(`27d329e5-…`)。

⇒ **DEV 同本機打緊同一個 tenant、同一個 Graph app。喺 DEV 撳一次成功 assign,同喺本機撳,真派出去嗰個 licence 一模一樣。**

⇒ **Track B 卡住嘅從來唔係 `B8`,係「要唔要真派」呢個決定** —— 而個決定兩邊等價,**本機仲快**(唔使等公司網)。

📌 **同一族第五次**:「由一個相關但唔對位嘅觀察,推去一個更強嘅結論」——「兩件都係 live 驗」推去「兩件都卡同一個環境」。

---

# Track A —— DEV 場（🟢 零副作用，卡 `B8`）

## 🔴 A0 — 先解一個文件之間嘅矛盾（30 秒，而且佢決定成條 track 點行）

三份文件對「custom domain 打唔打得開」講緊**唔同嘢**:

| 出處 | 講咩 | 屬性 |
|---|---|---|
| `09-dev-as-built.md:668-672`(**本區 SSOT**) | 🟢 **2026-08-06 稍後 B8 已解決** —— infra 建咗記錄,**Chris 由公司網絡實測 `https://rapo-uop-web-dev.rci-t.com/` 開到 login 頁面** ⇒ F6-4 收 | **實測** |
| `W44/checklist.md:102` | F6-4 **`[x]`**,同上 | **實測** |
| `CLAUDE.md §9`(2026-08-10 更正) | 🔴 「**兩個 hostname 都打唔到**」 | ⚠️ **一半實測、一半推論** |

**⚠️ 拆開嚟睇,08-10 嗰條更正只有一半有實測支持**:

- 🟢 **有實測** —— **ACA 預設 FQDN** 打唔到。`az` 查證亦解釋到:env `vnetConfiguration.internal = true` · `staticIp = 10.160.71.70`(私有 IP)⇒ 個 FQDN 要靠 private DNS zone `nicesea-c3849dba.eastasia.azurecontainerapps.io` 解析,而**嗰個 zone 冇 link 到企業網**。
- 🔴 **冇實測** —— 「**custom domain 一樣打唔到**」。08-10 **冇任何一次 custom domain 嘅測試記錄**,而佢 08-06 係**開到 login 頁面**嘅。
- 🔴 **兩者本來就係兩條唔同嘅解析路**:custom domain 靠 **企業 DNS** 一條 A record(infra 08-06 建咗);ACA 預設 FQDN 靠 **Azure private DNS zone**(冇 link)。**一條唔通推論唔到另一條唔通。**

### ⇒ 做法:第一件事就打佢

```
瀏覽器打:  https://rapo-uop-web-dev.rci-t.com/
```

| 結果 | 意思 | 落一步 |
|---|---|---|
| 🟢 **見到 login 頁** | custom domain 一直都通,**B8 從來冇 block 過呢條路** | **直接落 A1**,hosts 完全唔使掂 |
| 🔴 **打唔開** | 08-06 之後有嘢變咗(記低係 timeout 定 DNS 唔解析 —— **兩者意思唔同**) | 落 **A0b** |

### A0b — 只喺 A0 失敗先做:hosts 繞路（**未驗證過**）

```
以管理員身分編輯   C:\Windows\System32\drivers\etc\hosts
加一行:            10.160.71.70  rapo-uop-web-dev.rci-t.com
```

- 🔴 **一定要用 custom domain,唔好用 ACA 預設 FQDN** —— infra 綁咗 SNI cert 喺 custom domain,而且 `ENTRA_REDIRECT_URI` 就係佢;打 ACA FQDN 會撞憑證錯,SSO 亦一定失敗。
- 💡 **支持呢條繞路嘅係間接證據,唔係實測**:同一段嘅 `rapo-n8n-uat.rci-t.com` → `10.160.71.243` 喺公司網通,而我哋個 `staticIp` 係 `10.160.71.70`。
- ⚠️ 驗完**記得刪返嗰行**,否則 infra 將來改 IP 你會撞一個查極都查唔到嘅問題。

---

## A1 — F6-5:API 經 nginx proxy 通

```
打:  https://rapo-uop-web-dev.rci-t.com/api/docs/api
```

✅ **收貨條件**:見到 Swagger UI(唔係 404 唔係 502)。
📌 **佢驗緊咩**:web container 個 nginx 把 `/api` **strip 咗**再轉去 internal 嘅 api container —— 呢條 internal ingress 係 `ADR-0027` Option A 嘅核心(api 對外冇 hostname)。**502 = api 側死咗;404 = proxy 規則冇生效。**

---

## A2 — F6-6:break-glass 登入

| 欄 | 值 |
|---|---|
| Email | `admin@uop.local` |
| 密碼 | 🔴 **`deploy/azure/aca.params.dev.json` 個 `localAdminInitialPassword`**(gitignored,**唔好貼落任何文件 / commit / chat**) |

✅ **收貨條件**:入到 Overview,右上角 role badge = **Admin — all OpCos**,左邊見到 admin 專用 nav(Settings / Audit log / Delivery failures)。

⚠️ **若果彈 force-change-password** —— 係預期(W20 `mustChangePassword`),改完照計。**改咗記低新密碼**,`aca.params.dev.json` 嗰個之後唔再有效。

---

## A3 — F9-8:SSO 通 **而且** break-glass 仍然通

🔴 **兩邊都要驗,唔可以只驗新嗰邊** —— 呢條就係 F9-8 寫死嘅要求。

1. **登出** → login 頁應該見到 **`Sign in with Microsoft`** 個掣**著住**
   - 掣暗住 / 唔見 ⇒ `GET /auth/sso/status` 返緊 `{enabled:false}` ⇒ 四個 `ENTRA_*` env 有一個冇 PATCH 上去(**F9-7**)。**呢個情況唔使再試,先補 env。**
2. **撳佢** → Microsoft 登入頁 → **公司帳號**登入 → 彈返 `rapo-uop-web-dev.rci-t.com` → **入到 Overview**
3. **再登出,用 break-glass 再登入一次** → 仍然入到

✅ **收貨條件**:**兩種登入方式各成功一次**。

🔴 **兩個「紅得靜」陷阱嘅形狀,見到就係佢**:
- **登入睇落成功,但之後每個 request 401** ⇒ guard / `refreshSession` 側嘅 `authProvider` 過濾。⚠️ **錯誤訊息會指住 token,唔會指住 provider** —— 見到就唔好順住 token 嗰條線查。
- **回到 callback 頁但 reload 之後壞** ⇒ state cookie 時序。

📌 **A3 係整份 runbook 入面唯一「非 DEV 不可」而且完全冇替代**嘅一項 —— `ENTRA_REDIRECT_URI` 就係 DEV 個 hostname。

---

## A4 — 順手收 `DEV-GRAPH-PLACEHOLDER`（唯讀，零副作用）

**Settings → Integrations → Microsoft Graph → Test connection**

✅ **收貨條件**:`active`。
📌 **點解要順手做**:BACKLOG 嗰行寫住「placeholder 已經冇咗,**但 Graph 通唔通仍未驗**」——「08-08 之後零 `AADSTS` error」證明唔到通,因為 `SyncSweepService` **冇 pending request 就唔會打 Graph**(同「revision `Healthy` 證明唔到 DB 通」一模一樣嘅形狀)。

---

## A5 — W45 F4-4b **失敗路**（🟢 零副作用）

**目的**:證 `AssignResultDialog` 個 400 body **捱得過真 ACA ingress + nginx proxy**。

> 💡 **注意呢一步喺 DEV 嘅價值同本機唔同**。dialog 嘅**邏輯**本機已經 **100% 真驗過**(`W45/progress.md:308`:blocked 兩張截圖係真 400、真 steps、light + dark)。**DEV 加嘅只有「過真 proxy」呢一層** —— 但佢唔係多餘:`apiPatch` 個 `detail` bug 正正就係「body 到唔到前端」嗰一族。

**點造一個「一定失敗」嘅局**:揀一條 line item,佢個 OpCo × SKU 喺 ledger 嘅 `allocatedQuantity` = 0 ⇒ 撳 Assign 會被 **OpCo budget 閘**擋住(閘喺 tenant seat read 同 `assignLicense` **之前**,有 test 釘住)。

✅ **收貨條件**(逐個睇,唔好只睇「有 dialog 彈出」):
- [ ] dialog 開到,**唔係一個乾巴巴嘅 toast** ← 呢個先係「400 body 過到 proxy」嘅證據
- [ ] pre-flight 七道閘摺埋,擋住嗰道標到出嚟
- [ ] `failedAt` 指住 **budget** 嗰道
- [ ] 有 `whoFixes` 文案
- [ ] **DB 零改動** —— 返去 Request detail,stage 冇變、timeline 冇新 event

🔴 **dialog 開唔到但本機開得到 ⇒ 就係 proxy 食咗 400 body**,唔好再查前端。

---

# Track B —— 一次真 assign（🔴 真派 licence · **本機做，唔使等 `B8`**）

> 🔴 **落呢條 track 之前要有一個明確決定。** 唔可以「試下先」——
> 平台**冇 un-assign 功能**(offboarding 屬 H3 out-of-scope),派咗要去 Entra portal 手動收。
> **CH-020 個先例**:V5d 撳完之後 Chris 個帳號**至今仲掛住一個 Power BI Free**。

## B0 — 要先答三條

| # | 問題 | 備註 |
|---|---|---|
| 1 | **派畀邊個** | 建議一個測試帳號,唔好用真人 |
| 2 | **派邊隻 SKU** | 建議 `POWERAUTOMATE_ATTENDED_RPA`(W43 查證,**要先喺 ledger 加 `allocated`**)。🔴 **唔好用 `SPE_E5`** —— dev tenant 08-03 實測 consumed 4535 / prepaid 4502 = **超支 33**,tenant seat 閘會擋死(呢個唔係 bug,係閘做緊嘢) |
| 3 | **之後點收** | 邊個去 Entra portal un-assign、幾時。同 CH-020 嗰個 Power BI Free 一齊收 |

## B1 — 起本機 stack

```
/restart
```

🔴 **要先停 `ai-doc-extraction-db`**(搶同一個 host port 5433,**只可以二揀一**,係另一個項目 ⇒ **要 Chris 批**)。
⚠️ **還原嗰陣有個「靜靜失敗」陷阱**:`docker start` 撞正 `uop-postgres` 未停就搶唔到 port,之後即使停咗 UOP、`docker restart` 都**唔會重新 attach** —— container `healthy`、`inspect` 見到 `PortBindings` 仲喺,**但 host 零 listener**。要 `docker compose up -d postgres` recreate,**兼且真 TCP connect 驗,唔好睇 health flag**。

## B2 — 撳之前兩個唯讀確認（唔好靠估）

| 查 | 點查 | 點解 |
|---|---|---|
| **Graph 通** | Settings → Integrations → Microsoft Graph → **Test connection** = `active` | 唔通就 assign 唔到 |
| **ServiceNow 通** | 同一個 panel → ServiceNow → **Test connection** = `active` | 🔴 **CH-023 條 NOTE 個內容由 ticket step 推導** —— SN 唔通只會驗到 `failed` 嗰個分支,驗唔到 `ok`(`RITM close requested`) |
| **sync gate** | 開 Request detail,確認 target user `azureSyncedAt` **非空** | 空 = **唔會 assign**(Phase 1 sync gate)。`SyncSweepService` 每 10 分鐘掃一次 |

💡 **本機打得通真 SN 有前例** —— CH-020 V5d(2026-08-03,DEV 08-06 先存在)喺本機真撳,`SCTASK0071830` state 1→3。但**仍然要撳一次 Test connection**,唔好由前例推論今日。

## B3 — 撳 Assign

### ✅ 收貨條件 A —— W45 F4-4b 成功路
- [ ] dialog 顯示 **十步**:七道閘全綠 + 三個副作用逐個
- [ ] `outcome` = 成功
- [ ] ⭐ **睇實 ticket 嗰格** —— 佢係 `skipped` 定有真 status,直接決定下面 B 睇到咩
- [ ] 🔴 **呢一步先係「成功路第一次真驗」** —— 本機之前四張截圖入面,`success` / `skipped` / `overridden` 三個狀態係**攔截 PATCH 造出嚟**嘅(`W45/progress.md:308`),唔係真回應

### ✅ 收貨條件 B —— CH-023 G9(timeline)
- [ ] Request detail → **Operational history** 多咗一條 `NOTE`
- [ ] 內容形狀 = **`ServiceNow {status}: {detail}`**
- [ ] 🔴 **佢同 dialog 個 ticket step 逐字一樣** —— CH-023 明文由**同一個 step 推導**,唔另寫文案。**兩處對唔上就係 drift,即刻記低**
- [ ] **關窗、reload、再開一次** —— 條 NOTE 仲喺 ⇒ 呢個就係 CH-023 存在嘅**全部理由**(「嗰行字得五秒命」)

### ✅ 收貨條件 C —— 順手
- [ ] ledger `assignedQuantity` +1
- [ ] Delivery failures **零新行**
- [ ] Audit log 有對應 row
- [ ] 🔴 **SN 側自己查一次** —— 唔好只信平台講。⚠️ **唔可以信 `sys_updated_by`**(UOP 同 n8n 共用 `n8napiservice1`,RISK **R7**),唯一指紋係 `close_notes`

## B4 — 收拾

- [ ] 去 Entra portal **un-assign 返**(連 CH-020 嗰個 Power BI Free)
- [ ] 本機 ledger / request 係 dev 資料,唔使清

---

# 🔴 CH-022 A7 —— 明文**唔喺**呢兩條 track 入面

**唔好順路撳。** 2026-08-11 查證推翻咗兩份文件寫嘅做法。

### 原本寫住嘅路唔通

`CH-022/spec.md` 同 BACKLOG `INTAKE-REQUESTER` 都寫住「公司網撳 **Delivery failures** 個 `REQUEST_SUBMIT` retry 補返 08-07 三張」。**實讀 code:嗰條路一定會原封不動再失敗一次。**

| 出處 | 事實 |
|---|---|
| `PAYLOAD_WHITELIST['request.submit']` | 只存 5 個欄,**冇 `requesterSysId`** |
| `outbound-retry.service.ts:160-170` `repairSubmit` | **逐個欄明文重砌**,一樣冇送 |

⇒ 去到 `direct-servicenow.provider.ts:81` 個 `payload.requesterSysId ?? resolveRequester(email)` 一定行右邊 = **W44 實測對 intake 路 0% 嘅 email 反查** ⇒ 同一句 `The requester was not found in ServiceNow` 再出一次。

🔴 **唔係 bug** —— ADR-0030 D3 明文寫住個 `??` 刻意唔係 fallback 鏈。真相係 **ADR-0030 同 repair 路之間有條冇人接埋嘅縫**。

⚠️ 撳咗**唔會整壞嘢**(row 維持 `open`、`attemptCount` 加一,I2),但係**白撳**。

### A7 真正要嘅嘢

**一張新 intake**,唔係補舊嗰三張。而且撳之前要齊**四個前提**:

| # | 前提 | 唔滿足會點 |
|---|---|---|
| 1 | `SERVICENOW_O365_CATALOG_ITEM_SYS_ID` | step 1 throw(**掂 SN 之前**)⇒ 症狀同要修嗰個 bug 一樣,**只可以靠讀 message 分** |
| 2 | `ConnectorConfig.defaultOnboardingSkuId` | 🔴 **靜靜 no-op** —— 零 line item ⇒ `raiseLicenceRequest` early-return ⇒ 零 SN 動作、零 failure row、零 log |
| 3 | 真 REQ + `opened_by` 有值 | `resolveReqSysId` 400 |
| 4 | submit provider = `direct` | unset → fail-safe 就係 `direct`,預設啱 |

🔴 **DEV 側 ② 未查過** —— `patch-deploy-dev.ps1` 送嘅係 **env**,而 `defaultOnboardingSkuId` 係 **DB config**(`ConnectorConfig`),兩本帳。**撳之前喺 Settings → Integrations 睇一睇。**

### 副作用

catalog `order_now` ⇒ ServiceNow 開**一張全新 REQ + 一張 RITM**(唔止一張 RITM)。⚠️ 而且會觸發 **CH-021 通知** —— 揀個冇 `OPCO_IT` 用戶嘅 OpCo 就唔會寄信。

---

# 收尾（唔好省，呢部分先係「收得到 phase」嗰半）

1. **證據貼返各自 `progress.md`** —— W44 / W45 / CH-023 三份,**貼真 output / 截圖,唔好寫「pass」**(§5.7 **H7**)
2. **逐個 checklist 勾**:W44 `F6-5`/`F6-6`/`F9-8` · W45 `F4-4b` · CH-023 `F3-5`
3. **BACKLOG(R7)**:`ASSIGN-PROGRESS` 同 `CH-023` 兩行由 🟢「實作完成 · 淨低 live 驗」改 ✅ closed
4. 🔴 **A0 個結果一定要寫返落 `CLAUDE.md §9` + `09-dev-as-built.md`** —— **無論通定唔通**。呢個矛盾已經令兩個 session 用錯前提開工,唔寫返實測結果就會有第三個
5. **Track B 派咗嘅 licence** —— 記低邊個帳號、邊隻 SKU、收咗未

---

# 一頁摘要

## Track A · DEV（零副作用，卡 `B8`）

| # | 做咩 | 收貨條件 |
|---|---|---|
| A0 | 打 `https://rapo-uop-web-dev.rci-t.com/` | login 頁 render |
| A0b | *(只喺 A0 失敗)* hosts 加 `10.160.71.70` | 同上 · **記得刪返** |
| A1 | `/api/docs/api` | Swagger UI |
| A2 | break-glass 登入 | Admin badge |
| A3 | SSO 登入 **+ break-glass 再登入** | 兩邊各成功一次 ← **唯一非 DEV 不可** |
| A4 | Graph test connection | `active` |
| A5 | allocated=0 撳 Assign | dialog 開到（= 400 body 過到 proxy）· DB 零改動 |

🔴 **CH-022 A7 唔喺呢條 track** —— 唔好順路撳 Delivery failures retry，佢一定會再失敗一次。見上面「CH-022 A7」整段。

## Track B · 一次真 assign（🔴 真派 licence，本機做）

| # | 做咩 | 收貨條件 |
|---|---|---|
| B0 | 答三條:派畀邊個 / 邊隻 SKU / 點收 | 有明確答案先做 |
| B1 | `/restart`（要停 `ai-doc-extraction-db`，**Chris 批**） | 真 TCP connect 驗 |
| B2 | Graph + SN test connection · sync gate | 三個都確認咗 |
| B3 | 撳 Assign | dialog 十步 · timeline 留低 NOTE · **reload 仲喺** |
| B4 | Entra portal un-assign | 收埋 CH-020 嗰個 |

---

# ✅ 2026-08-12 執行結果（v3 註記）

## Track B — **收咗**

Chris 批准真派一次 licence（target = 佢自己，SKU `POWERAUTOMATE_ATTENDED_RPA`）。一個 session 內**撳三次收齊三條路**：

| # | 局 | HTTP | `failedAt` | steps |
|---|---|---|---|---|
| 1 | 原 fixture（target = 砌出嚟嘅 UPN） | **400** | `directory` | 4 步 |
| 2 | 換真人、冇 override | **400** | `budget` | 6 步 |
| 3 | 加 ADMIN override | **200** | — | **10 步 · `assigned`** |

- **W45 `F4-4`** ✅ · **CH-023 `F3-5`** ✅（timeline NOTE 同 dialog step 逐字一樣，零 drift）
- **Graph 側獨立覆核**：`holds true` → 移返後 `false`，`consumed 92 → 91`，**零殘留**
- 順帶收埋 **CH-020 個九日 leftover**（Power BI Free，`consumed 3067 → 3066`）

### 🔴 B0 表要加一行 —— 呢次先發現

`B0` 原本問三條（派畀邊個 / 邊隻 SKU / 之後點收）。**漏咗第四條，而佢會令你白撳一次**：

> **④ 條 request 個 `targetUpn` 係咪 tenant 內真實存在？**

- `sync-check` 返 `FOUND` **證明唔到** —— 2026-08-12 硬對照：同一個 UPN、同一分鐘，`sync-check` = `FOUND`，而真 assign 個 `directory` 閘 = `Target user not found in Azure AD`。**兩個相反答案。**
- ⇒ **撳之前直接打 Graph `/users/{upn}`**（scratchpad `probe-target-user.js`），唔好信 `sync-check`。
- ⚠️ 而且 `targetUpn` 喺 `azureSyncedAt` 之後 **改唔到**（`PATCH :id` → 409，「it is the key the assignment flow uses」）。個 guard 係啱嘅 ⇒ **要換 target 就要改本機 fixture 個 DB row**。

### 💡 B2 加一句：過 budget 閘揀邊條路

Runbook 原文假設「先喺 ledger 加 `allocated`」。實際上：

- `ledger/import` 走 CSV matrix **兼要 `businessAlias` 已 curate**（ADR-0004）⇒ 冇 alias 嘅 SKU **行唔通**
- ⇒ **用 ADMIN `budgetOverrideReason` 更直接**，而且順帶把 `budget: overridden` 由「攔截 PATCH 造出嚟」變成**真回應**
- ⚠️ 代價：`budget` 個 `ok` 分支就冇 live 驗到（有 unit test 蓋住）

## Track A — 部分收咗

- **A0**（custom domain）✅ · **A1 / `F6-5`**（`/api/docs/api` 200）✅ —— 2026-08-12 由開發機直接打得通，**`B8` 解封**
- **A5** ➡️ 併入 **W44 `F6-14`**（Chris 拍板）—— 佢淨係驗「400 body 過唔過得到 proxy 鏈」= 部署層問題
- **A2 / A3 / A4** 仍未做（`F6-6` 要 admin 密碼 · `F9-8` 要你本人 + 公司網 · Graph test connection **本機已驗 `ok`**，DEV 側未）
