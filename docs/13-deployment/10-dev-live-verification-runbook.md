# DEV live 驗證 runbook —— 一次過收三個 phase 嘅尾

> **點解要呢份**:W44 / W45 / CH-023 三個 phase 嘅**實作全部收晒**,剩低嘅**全部係「要有人喺公司網真撳一次」**,而且卡同一個 `B8`。散喺三個 checklist 入面各撳一次會漏,亦會重複登入 / 重複開單。
> **對應項**:W44 `F6-5` / `F6-6` / `F9-8` · W45 `F4-4b`(G11)· CH-023 `F3-5`(G9)。**呢份唔取代嗰三個 checklist** —— 撳完要返去逐個勾,證據貼返各自 `progress.md`。
> **執行者**:Chris(要公司網絡)。**建立**:2026-08-11。

---

## 🔴 Step 0 — 先解一個文件之間嘅矛盾（30 秒,而且佢決定成份 runbook 點行）

三份文件對「custom domain 打唔打得開」講緊**唔同嘢**:

| 出處 | 講咩 | 屬性 |
|---|---|---|
| `09-dev-as-built.md:668-672`(**本區 SSOT**) | 🟢 **2026-08-06 稍後 B8 已解決** —— infra 建咗記錄,**Chris 由公司網絡實測 `https://rapo-uop-web-dev.rci-t.com/` 開到 login 頁面** ⇒ F6-4 收 | **實測** |
| `W44/checklist.md:102` | F6-4 **`[x]`**,同上 | **實測** |
| `CLAUDE.md §9`(2026-08-10 更正) | 🔴 「**兩個 hostname 都打唔到**」 | ⚠️ **一半實測、一半推論** |

**⚠️ 拆開嚟睇,08-10 嗰條更正入面只有一半有實測支持**:

- 🟢 **有實測** —— **ACA 預設 FQDN** 打唔到。`az` 查證亦解釋到點解:env `vnetConfiguration.internal = true` · `staticIp = 10.160.71.70`(私有 IP)⇒ 個 FQDN 要靠 private DNS zone `nicesea-c3849dba.eastasia.azurecontainerapps.io` 解析,而**嗰個 zone 冇 link 到企業網**。
- 🔴 **冇實測** —— 「**custom domain 一樣打唔到**」。08-10 **冇任何一次 custom domain 嘅測試記錄**,而佢 08-06 係**開到 login 頁面**嘅。
- 🔴 **而兩者本來就係兩條唔同嘅解析路**:custom domain 靠 **企業 DNS** 一條 A record(infra 08-06 建咗);ACA 預設 FQDN 靠 **Azure private DNS zone**(冇 link)。**前者打唔到推論唔到後者,反過嚟一樣。**

📌 **呢個正正係 `CLAUDE.md §9` 自己嗰段點名嘅「第三次同一族」錯誤** ——「由一個相關但唔對位嘅觀察,推去一個更強嘅結論」。同一段落一邊寫住「§9 入面凡係推論必須標明」,一邊自己藏咗一個冇標明嘅推論。**第四次。**

### ⇒ 做法:第一件事就打佢,兩個結果都有路行

```
瀏覽器打:  https://rapo-uop-web-dev.rci-t.com/
```

| 結果 | 意思 | 落一步 |
|---|---|---|
| 🟢 **見到 login 頁** | custom domain 一直都通,**B8 從來冇 block 過 custom domain 呢條路** | **直接落 Step 1**,hosts 檔完全唔使掂 |
| 🔴 **打唔開** | 08-06 之後有嘢變咗(記低係 timeout 定 DNS 唔解析 —— **兩者意思唔同**) | 落 **Step 0b** |

### Step 0b — 只喺打唔開先做:hosts 繞路（**未驗證過**）

```
以管理員身分編輯   C:\Windows\System32\drivers\etc\hosts
加一行:            10.160.71.70  rapo-uop-web-dev.rci-t.com
```

- 🔴 **一定要用 custom domain,唔好用 ACA 預設 FQDN** —— infra 綁咗 SNI cert 喺 custom domain,而且 `ENTRA_REDIRECT_URI` 就係佢;打 ACA FQDN 會撞憑證錯,SSO 亦一定失敗。
- 💡 **支持呢條繞路嘅係間接證據,唔係實測**:同一段嘅 `rapo-n8n-uat.rci-t.com` → `10.160.71.243` 喺公司網通,而我哋個 `staticIp` 係 `10.160.71.70`。
- ⚠️ 驗完**記得刪返嗰行**,否則 infra 將來改 IP 你會撞一個查極都查唔到嘅問題。

---

## Step 1 — F6-5:API 經 nginx proxy 通

```
打:  https://rapo-uop-web-dev.rci-t.com/api/docs/api
```

✅ **收貨條件**:見到 Swagger UI(唔係 404 唔係 502)。
📌 **佢驗緊咩**:web container 個 nginx 把 `/api` **strip 咗**再轉去 internal 嘅 api container —— 呢條 internal ingress 係 `ADR-0027` Option A 嘅核心(api 對外冇 hostname)。502 = api 側死咗;404 = proxy 規則冇生效。

---

## Step 2 — F6-6:break-glass 登入

| 欄 | 值 |
|---|---|
| Email | `admin@uop.local` |
| 密碼 | 🔴 **`deploy/azure/aca.params.dev.json` 個 `localAdminInitialPassword`**(gitignored,**唔好貼落任何文件 / commit / chat**) |

✅ **收貨條件**:入到 Overview,右上角 role badge = **Admin — all OpCos**,左邊見到 admin 專用 nav(Settings / Audit log / Delivery failures)。

⚠️ **若果撳落去彈 force-change-password** —— 係預期(W20 `mustChangePassword`),改完照計。**改咗就記低新密碼**,`aca.params.dev.json` 嗰個之後唔再有效。

---

## Step 3 — F9-8:SSO 通 **而且** break-glass 仍然通

🔴 **兩邊都要驗,唔可以只驗新嗰邊** —— 呢條就係 F9-8 寫死嘅要求。

1. **登出** → login 頁應該見到 **`Sign in with Microsoft`** 個掣**著住**
   - 掣暗住 / 唔見 ⇒ `GET /auth/sso/status` 返緊 `{enabled:false}` ⇒ 四個 `ENTRA_*` env 有一個冇 PATCH 上去(**F9-7**)。呢個情況**唔使再試**,先補 env。
2. **撳佢** → 應該去到 Microsoft 登入頁 → 用**公司帳號**登入 → 彈返 `rapo-uop-web-dev.rci-t.com` → **入到 Overview**
3. **再登出,用 break-glass 再登入一次** → 仍然入到

✅ **收貨條件**:**兩種登入方式各成功一次**。

🔴 **兩個「紅得靜」陷阱嘅形狀,見到就係佢**:
- **登入睇落成功,但之後每個 request 401** ⇒ guard / `refreshSession` 側嘅 `authProvider` 過濾。⚠️ **錯誤訊息會指住 token,唔會指住 provider** —— 見到就唔好順住 token 嗰條線查。
- **回到 callback 頁但 reload 之後壞** ⇒ state cookie 時序。

---

## Step 4 — 順手收 `DEV-GRAPH-PLACEHOLDER`（唯讀,零副作用）

**Settings → Integrations → Microsoft Graph → Test connection**

✅ **收貨條件**:`active`。
📌 **點解要順手做**:BACKLOG 嗰行寫住「placeholder 已經冇咗,**但 Graph 通唔通仍未驗**」——「08-08 之後零 `AADSTS` error」證明唔到通,因為 `SyncSweepService` **冇 pending request 就唔會打 Graph**(同「revision `Healthy` 證明唔到 DB 通」一模一樣嘅形狀)。
🔴 **而 Step 6 一定要 Graph 通先做得** —— 喺呢度撳一撳,好過落到 assign 先撞。

---

## Step 5 — W45 F4-4b **失敗路**（🟢 零副作用,建議由呢度入手）

**目的**:證 `AssignResultDialog` 喺 DEV 真係開到,而且七道閘顯示正確。

**點造一個「一定失敗」嘅局**:揀一條 line item,佢個 OpCo × SKU 喺 ledger 嘅 `allocatedQuantity` = 0 ⇒ 撳 Assign 會被 **OpCo budget 閘**擋住。

✅ **收貨條件**（逐個睇,唔好只睇「有 dialog 彈出」）:
- [ ] dialog 開到,**唔係一個乾巴巴嘅 toast**
- [ ] pre-flight 七道閘摺埋,擋住嗰道標到出嚟
- [ ] `failedAt` 指住 **budget** 嗰道
- [ ] 有 `whoFixes` 文案(邊個去修)
- [ ] **DB 零改動** —— 返去 Request detail,stage 冇變、timeline 冇新 event

🔴 **`AssignResultDialog` 開唔到就即刻停手,唔好落 Step 6** —— 呢個 dialog 嘅 payload 走 400 body → `ApiError.detail`,而**嗰條路 2026-08-10 先啱啱修好**(`apiPatch` 從來冇帶 `detail`,`d43b7a9`)。dialog 開唔到 = 修法喺 DEV 冇生效,先查嗰度。

---

## Step 6 — W45 F4-4b **成功路** + CH-023 G9（🔴 **會喺公司 tenant 真派一個 licence**）

> 🔴 **落呢步之前要諗清楚 target 同收拾方式。** 呢步唔可以「試下先」——
> 平台**冇 un-assign 功能**(offboarding 屬 H3 out-of-scope),派咗要去 Entra portal 手動收。
> CH-020 個先例:V5d 撳完之後 Chris 個帳號**至今仲掛住一個 Power BI Free**。

**前置**:
- SKU 建議 `POWERAUTOMATE_ATTENDED_RPA`(W43 查證,**要先喺 ledger 加 `allocated`**)
- ⚠️ **唔好用 `SPE_E5`** —— dev tenant 08-03 實測 consumed 4535 / prepaid 4502 = **超支 33**,`assign.service.ts` tenant seat 閘會擋死(呢個唔係 bug,係閘做緊嘢)
- 🔴 **sync gate**:target user 要 `azureSyncedAt` 非空,否則唔會 assign。DEV 個 `SyncSweepService` 每 10 分鐘掃一次 —— 撳之前開 Request detail 確認,唔好靠估

**撳 Assign。**

### ✅ 收貨條件 A —— W45 F4-4b（dialog）
- [ ] dialog 顯示 **十步**:七道閘全綠 + 三個副作用逐個
- [ ] `outcome` = 成功
- [ ] ⭐ **睇實 ticket 嗰格** —— 佢係 `skipped` 定有真 status,直接決定下面 B 睇到咩

### ✅ 收貨條件 B —— CH-023 G9（timeline）
- [ ] Request detail → **Operational history** 多咗一條 `NOTE`
- [ ] 內容形狀 = **`ServiceNow {status}: {detail}`**
- [ ] 🔴 **佢同 dialog 個 ticket step 逐字一樣** —— CH-023 明文由**同一個 step 推導**,唔另寫文案。**兩處對唔上就係 drift,即刻記低**
- [ ] **關窗、reload、再開一次** —— 條 NOTE 仲喺 ⇒ 呢個就係 CH-023 存在嘅全部理由(「嗰行字得五秒命」)

### ✅ 收貨條件 C —— 順手
- [ ] ledger `assignedQuantity` +1
- [ ] Delivery failures **零新行**
- [ ] Audit log 有對應 row

---

## 收尾（唔好省，呢部分先係「收得到 phase」嗰半）

1. **證據貼返各自 `progress.md`** —— W44 / W45 / CH-023 三份,**貼真 output / 截圖,唔好寫「pass」**(§5.7 H7)
2. **逐個 checklist 勾**:W44 `F6-5`/`F6-6`/`F9-8` · W45 `F4-4b` · CH-023 `F3-5`
3. **BACKLOG(R7)**:`ASSIGN-PROGRESS` 同 `CH-023` 兩行由 🟢「實作完成 · 淨低 live 驗」改 ✅ closed
4. 🔴 **Step 0 個結果一定要寫返落 `CLAUDE.md §9` + `09-dev-as-built.md`** —— 無論通定唔通。**呢個矛盾已經令兩個 session 用錯前提開工**,唔寫返實測結果就會有第三個
5. **Step 6 派咗嘅 licence** —— 記低邊個帳號、邊隻 SKU,同 CH-020 嗰個 Power BI Free 一齊收

---

## 一頁摘要（撳嘅時候睇呢個就夠）

| # | 做咩 | 收貨條件 | 副作用 |
|---|---|---|---|
| 0 | 打 `https://rapo-uop-web-dev.rci-t.com/` | login 頁 render | 冇 |
| 0b | *(只喺 0 失敗)* hosts 加 `10.160.71.70` | 同上 | 記得刪返 |
| 1 | `/api/docs/api` | Swagger UI | 冇 |
| 2 | break-glass 登入 | Admin badge | 冇 |
| 3 | SSO 登入 **+ break-glass 再登入** | 兩邊各成功一次 | 冇 |
| 4 | Graph test connection | `active` | 冇 |
| 5 | allocated=0 撳 Assign | dialog 開到 · 擋喺 budget · DB 零改動 | 🟢 冇 |
| 6 | 真 assign | dialog 十步 · timeline 留低 NOTE · reload 仲喺 | 🔴 **真派 licence** |
