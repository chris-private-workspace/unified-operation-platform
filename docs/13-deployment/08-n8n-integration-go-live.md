# 08 — n8n ↔ 平台整合上線 runbook(inbound intake)

> **用途**:把「W36 交付完 adapter」同「真係有單入到平台」之間**仲欠嘅嘢**寫成一份可執行清單。分**平台側 / n8n 側 / 憑證衛生**三部分。
> **點解要呢份**:W36 收官時,平台側 gate 9/9 全綠 —— 但**整條線仍然通唔到**,原因散喺三處(UAT placeholder 憑證、n8n 三個接線缺口、一個未 rotate 嘅帳號)。呢份文件就係把佢哋收埋一齊,避免「以為做完」。
> **相關**:ADR-0017(三接縫)· `W36-n8n-intake-adapter/N8N-WF1-CHANGES.md`(n8n 側精確改動)· `docs/05-usage/N8N-INTEGRATION-SETUP.md`(雙向對接)· `07-uat-as-built.md` · `BACKLOG` **SEC-001**
> **H4**:全文零 secret。所有 key / 密碼一律「喺邊度攞」,**唔寫值**。

---

## 0. 一頁總覽 —— 邊樣卡住邊樣

> **狀態 2026-07-27**:n8n 側三項(A/B/C)✅ **Chris 已做** · SEC-001 ✅ **已收**(§3)。
> 卡住嘅變成 **P(平台未部署)· N(兩個環境未接通)· E/F(UAT placeholder 憑證)**。

```
n8n onboarding 完成
   │
   ├─[A] Call node 有冇送 X-Intake-Key ?  ── 冇 → 401  ✅ 已做
   ├─[B] UOP_INTAKE_URL 指啱 route ?      ── 錯 → 400  ✅ 已做
   ├─[C] payload 個 department 係咪       ── 唔係 → 400 unknown department  ✅ 已做
   │     18 條 Job Function 之一 ?
   │
   ├─[N] n8n UAT ↔ 平台 Azure 環境接通未 ?  ── 未 → 打唔到,連 404 都冇  🔴 進行中
   ├─[P] 平台新 build 部署咗上 UAT 未 ?     ── 未 → 404(route 唔存在)   🔴 未做
   │
   ▼ 到得呢度先輪到平台 resolve(cheapest-first,前面唔過就唔會行落去)
   │
   ├─[D] department → Opco.code           ── 常數表,無外部依賴  ✅ 已通
   ├─[E] licenceCode → skuId GUID         ── 要 catalog 有真 SKU  🔴 UAT 未通(Graph = placeholder)
   └─[F] REQ number → sc_request sysId    ── 要真 ServiceNow      🔴 UAT 未通(SN = placeholder)
   │
   ▼
  201 Created
```

**⇒ A/B/C 係 n8n 側(§2)· N 係網絡 / 環境對接 · P 係部署(§1.0)· E/F 係平台憑證(§1.1)。**

> 分開做係有價值嘅:A/B/C 做咗之後,錯誤會由「永遠 401 咩都睇唔到」變成「400 而且講得出邊個值對唔到」—— 第一張真單就會自報 ServiceNow `License` variable 實際係咩值(**OQ-4** 靠呢個攞答案)。**但要 N 同 P 都通咗先見得到。**

---

## 1. 平台側前置(UAT)

### 1.0 🔴 **[P] merge 入 main ≠ 部署到 UAT**(最易誤判嘅一步)

W36 嘅 code 喺 **PR #33 已 merge 入 `main`**,但 **UAT 冇自動更新**:

```
.github/workflows/ci.yml  →  只有 lint / build / test
                             ci.yml 自己寫住「另可加獨立 deploy workflow」= 未建
```

UAT 而家仍然跑緊 **`uop-api:uat-0cf0cf3`**(W34 image,2026-07-23)—— 嗰個 build **根本冇 `/requests/intake/n8n` 呢條 route**。

⚠️ **誤判風險**:n8n 打過去收到嘅係 **404**,唔係 §4 表列嘅 400。**唔好當成 header / payload 出錯去 debug n8n** —— 係條 route 未存在。

**點分辨**:向該 route POST **唔帶 key**(`07-uat-as-built.md` 記錄嘅探測法,無 key 喺 guard 層直接彈返,零副作用):

| 回應 | 意思 |
|---|---|
| **404** | 未部署 |
| **401** | 已部署,route 在 |

**部署**(image-only,唔掂 secret / DB 密碼 —— `07-uat-as-built.md` §W34 re-deploy):

```bash
TAG=uat-$(git rev-parse --short main)
PYTHONIOENCODING=utf-8 az acr build --registry acruopuat --image uop-api:$TAG -f apps/api/Dockerfile .
PYTHONIOENCODING=utf-8 az containerapp update -g RG-RCITest-RAPO-N8N -n ca-uop-api \
  --image acruopuat.azurecr.io/uop-api:$TAG -o none
```

- ⚠️ `az acr build` 印 ✔ 會 charmap crash 出**假 exit 1** → 查 `az acr task list-runs` 真 status
- **web container 唔使重 build**(W36 零前端改動)
- 新 revision 起身會自動跑 self-migrate;W36 **零 schema 改動**,所以無 migration 要 apply

### 1.0b 🔴 **[N] n8n UAT ↔ 平台 Azure 環境未接通**

**進行中(Chris,2026-07-27)。** n8n 側 UAT 要一段時間先接得到本項目個 Azure 環境。

未接通之前,n8n 個 HTTP node **連 404 都收唔到**(打唔到出去 / 去唔到 ACA ingress)。⇒ **[N] 通咗先值得查 [P]**,否則分唔清「route 唔存在」定「根本去唔到」。

### 1.1 現況 —— 兩個 placeholder 卡住 E 同 F

`07-uat-as-built.md` §認證 記錄:**Graph / ServiceNow = placeholder(app boot OK;真整合未接)**。連帶後果:

| # | 缺 | 直接後果 | 解 |
|---|---|---|---|
| **E** | catalog 冇真 SKU(要真 Graph 行 `POST /license/catalog/sync`) | **任何** `licenseCode` 都 resolve 唔到 → **400** | `DEPLOY-harden` #2 換真 Graph 憑證 → 再跑 catalog sync |
| **F** | ServiceNow 不可達 | REQ number 反查失敗 → **503** | `DEPLOY-harden` #2 換真 SN 憑證 |

⚠️ **resolve 係 cheapest-first**(常數 → DB → 網絡),所以 UAT 而家實際會**先撞 E 回 400**,未行到 F。修好 E 之後先會見到 F 嘅 503。**唔好見到 400 就以為 SN 冇問題。**

> ⚠️ 上表引自 W33/W34 as-built 記錄。**上線當日請自己再 confirm 一次**(catalog 有冇行、SN 憑證換咗未),唔好靠本文 snapshot。

### 1.2 每個環境要補嘅 OpCo(W36 新增)

`RAPO/IT (RDC2)` 係 W36 新增嘅第 24 個 OpCo。**`seed.ts` 有,但已部署環境唔會自動有** —— 每個環境要各自補一次:

- 建議走 **`POST /admin/opcos`**(CH-004),唔使重跑全 seed
- 值:`code = RAPO/IT (RDC2)` · `company = RAPO` · `costCenter = IT (RDC2)`
- 冇補 → Job Function `RAPO IT (RDC2)` 一律 **400**(其餘 17 條唔受影響)

> 背景:AD 側呢個 OU 個 `description` 仍然係 `RAPO/IT`,**平台刻意切細過 AD**(OQ-2,Chris 2026-07-27)。連帶:`RAPO/IT` 嘅 FY26 數字前後**唔可以直接比較**。

### 1.3 ⚠️ 同 ADR-0016 預算 gate 嘅交互(未上線,但要記住)

新增嘅 `RAPO/IT (RDC2)` **`allocated = 0`**。ADR-0016 預算 gate 一旦上線,`assigned + 1 > allocated` 會擋 —— 即係**該 OpCo 一單都 assign 唔到**。

⇒ **ADR-0016 上線前要先為佢設 allocation**(`PATCH /license/ledger/:id`,ADR-0007)。呢個唔阻 intake 建單,只阻 assign。

### 1.4 `INTAKE_API_KEY`

- **兩條 route 共用同一個 key**(canonical `/requests/intake` + adapter `/requests/intake/n8n`,OQ-3)
- `IntakeKeyGuard` 用 `getOrThrow` ⇒ **未設 app 直情 boot 唔起**。UAT 而家 boot 得起 = 已經有值
- 值喺 UAT ACA container secret(`02-environment-reference.md` 列為 🔴 Key Vault 級)。交畀 n8n 要走 secure channel,**唔好貼 chat / 唔好寫落任何文件**

---

## 2. n8n 側改動(全部喺 n8n UI 做)—— ✅ **Chris 已完成 2026-07-27**

> **保留全文做記錄同對數用**:一旦 [N]/[P] 通咗而仍然收到 401 / `Unknown department`,返嚟逐項對返呢節,唔使重新推理。

> **精確 node-by-node 改動 = `docs/01-planning/W36-n8n-intake-adapter/N8N-WF1-CHANGES.md`。** 本節只講「做咩 + 點驗」,唔重複嗰份嘅逐欄表。
> 🔴 **兩批要同一次做齊** —— 只做接線唔改 payload,`department` 仍然係 AI 抽嘅自由文本,一樣 400。

### 2.1 接線三項(`N8N-WF1-CHANGES.md §2.5`)

#### (a) 🔴 加 `X-Intake-Key` —— 用 Header Auth credential,唔好用 raw header

實讀 `1001` / `1005` 兩個 `WF1 - Call UOP Intake` 個 `parameters`,**冇 `sendHeaders`、`credentials` 空** ⇒ 現狀一 enable 就**全部 401**。

**做法**(repo 內已有現成範式:`docs/05-usage/n8n-intake-test.workflow.json`):

1. n8n → **Credentials** → 睇下有冇既有嘅 **`UOP Intake Key (X-Intake-Key)`**(之前 import 過 intake test workflow 就會有)
   - 冇 → 新建 **Header Auth**:Name = `X-Intake-Key`,Value = 該環境嘅 `INTAKE_API_KEY`
2. 打開 `1001` 同 `1005` 個 `WF1 - Call UOP Intake`
3. **Authentication** = `Generic Credential Type` → **Header Auth** → 揀該 credential

> **點解唔用 "Send Headers" 打字入去**:噉樣 secret 會寫入 workflow JSON,一 export 就洩漏 —— 即係 §3 SEC-001 同一個病。credential store 唔會出現喺 export。

#### (b) `UOP_INTAKE_URL` 指去 adapter route

兩個 node 已經係 `={{ $env.UOP_INTAKE_URL }}` ⇒ **唔使郁 node,改 n8n 環境變數就得**。

UAT 值:

```
UOP_INTAKE_URL = https://ca-uop-web.lemonhill-2df17b88.eastasia.azurecontainerapps.io/api/requests/intake/n8n
```

兩個易錯位:

- **有 `/api` 前綴** —— 對外只有 web container 一個 hostname,佢 proxy `/api/*` 去 internal api(ADR-0012 單一 origin)。**直接打 api 內部 hostname 由外面去唔到。**
- 結尾係 **`/intake/n8n`**,唔係 `/intake`。打錯去 canonical route → 因為送緊名而唔係 GUID,**400**。

改完 **n8n 要 restart** 先讀到新 env。

#### (c) enable `1005` 個 `WF1 - Call UOP Intake`

`1005` = **排程路徑**(未到入職日),而排程係 onboarding 嘅**正常情況**。個 node 由 kickoff 至今一直 `disabled = true` ⇒ 唔 enable,排程單**永遠唔會入平台**。

✅ 安全:兩個 node 都設咗 `onError = continueRegularOutput` ⇒ **fire-and-forget**,平台回非 2xx 都唔會阻住 onboarding(合 W24 CONTRACT A3)。

### 2.2 Payload 兩項(`N8N-WF1-CHANGES.md §1` / `§2`)

| Workflow | 改咩 | 點解 |
|---|---|---|
| `1001` | `request.department` 由 `u.department`(AI 抽)→ **`p.jobFunction`**(1004 form 值);`targetUser` 四欄改讀 validated 版;`validated` → `true` | 平台**零 fallback 精確查** 18 條 Job Function。AI 自由文本(如 `RHK/Information Technology`)**必 400** |
| `1005` | `Check Activate Date` + `Prepare Schedule Record` 各加 `jobFunction` 落 `execution_context`;`WF1 - Prepare` 改讀 `ctx.jobFunction` | 排程路徑要拎到同一個值 |

> ✅ 好消息:所需值(`jobFunction` / `username` / `sAMAccountName` / `derivedEmail`)**喺 `prepare approval data` 已經現成**,唔使新增運算。
> 🔴 **唔好郁**:`_uopNeeded` gate · `licenseItems[]` 來源 · `idempotencyKey`。

### 2.3 ⚠️ `licenseCode` 可以係 `null`

兩個 prepare node 都係 `licenseCode: (it.variables && it.variables.License) || null`。ServiceNow catalog 個 `License` variable 攞唔到 → 送 `null` → 平台 **400,而且係成張單拒收,唔係跳過嗰個 line**。

刻意 fail-closed(唔知派緊咩 licence 就唔應該建單),但要知代價。訊息形如 `licenseItems.0.licenseCode must be a string` —— 講到邊個 index,講唔到邊個 RITM。

---

## 3. SEC-001 —— WinRM 服務帳號憑證衛生 ✅ **已收(2026-07-27)**

> 同 intake **無直接關係**,但屬同一批 n8n 交付揪出嚟嘅安全項。**已完成,呢節保留做記錄同教訓。** 狀態見 `BACKLOG` A 區 **SEC-001**。

### 3.1 原本嘅問題

`1002` 個 **disabled** node `Execute Command (Setup ABW Share Folder) (PRD)2` 內,Python `winrm.Session(auth=(...))` **硬寫咗 AD 服務帳號 + 明文密碼**。

### 3.2 四步全做齊

| 步 | 動作 | 狀態 |
|---|---|---|
| **①** | git history 查證 —— `git log --all` 該路徑**零 commit** ⇒ 唔使改寫歷史 | ✅ 平台側 |
| **②** | **scrub** 值成 placeholder(全目錄掃 52 處,**只有呢一處係真 secret**;精確 1 處命中、53 個 node 原封、JSON 仍 parse) | ✅ 平台側 |
| **③** | **gitignore** `docs/06-reference/03-n8n-workflow/`(`git add -A --dry-run` 實證:連 `git add .` 都拉唔到) | ✅ 平台側 |
| **④** | **rotate 密碼 + 拆走硬寫**(`auth=(...)` 改用 credential / `$env`) | ✅ **Chris,2026-07-27** |

🔴 **④ 兩件事必須一齊做,呢個係本次最重要嘅教訓**:1002 有 sticky note 明寫該 node 係 `STUBBED 2026-07-23`、**「To restore on PRD: enable that node」** —— 即係佢**會復活**。淨 rotate 唔拆硬寫,個 node 一復活再 export,**新密碼又會以明文出現喺 JSON**,兜返轉頭。拆咗之後,將來 rotate 只需改 credential,workflow export 永遠唔會帶住 secret。

### 3.3 仍然生效嘅約束

- `docs/06-reference/03-n8n-workflow/` **維持 gitignore**。要收返入 repo = **有意識決定**(刪 `.gitignore` 嗰段),因為仍帶內部 email / AI system prompt / 基建 hostname / n8n credential id。**真相 SSOT 係 n8n instance 本身**,唔入 repo 冇失去 source of truth。
- 連帶(**非 secret,唔急**):phase 2 四條 workflow 仍 `CHANGE_ME_SHARED_SECRET` placeholder;`2004` hardcode DEV host `ricohapdev.service-now.com`。

### 3.4 掃 secret 嘅教訓(下次照用)

我原本個掃描器靠「secret 應該長成點」嘅 pattern(`ConvertTo-SecureString` / `-AsPlainText`)—— **命唔中呢個密碼**,因為佢係 Python tuple 唔係 PowerShell。最後係靠 email pattern 間接指到嗰個 node,再用**遮罩輸出**(所有 >3 字元字串 literal 打格)睇結構先定位到。

⇒ **單靠值嘅 pattern 一定會漏,要有第二條路:睇結構。** 另外 scrub script 要**命中數目唔啱就拒寫**(本次設定「≠1 即 exit 2」)—— 靜靜部分 scrub 比唔 scrub 更差。

---

## 4. 驗收 —— 每個階段應該見到咩

**唔好一次過驗。** 逐級推進,每級有一個明確、可分辨嘅預期回應:

| 階段 | 做完 | 預期 | 見到唔同嘢即係 |
|---|---|---|---|
| **N** | n8n UAT ↔ Azure 接通(§1.0b)| 打得到,**收到 HTTP 回應**(任何 code 都算通) | timeout / DNS / connection refused = 仲未接通,**唔好去 debug payload** |
| **P** | 平台新 build 部署上 UAT(§1.0)| **401**(無 key 探測)/ n8n 帶 key → 400 | **404** = 未部署。呢個最易當成 n8n 出錯 |
| 1 | §2.1(a) key ✅ 已做 | **400**(講得出邊個值對唔到) | 401 = credential 冇 attach,或 key 值唔啱 |
| 2 | §2.1(b) URL + §2.2 payload ✅ 已做 | **400 licence code …**(卡喺 E) | `Unknown department '…'` = payload 改動未生效 |
| 3 | §1.1 換真 Graph + catalog sync | **503 ServiceNow is unavailable**(卡喺 F) | 仍然 400 licence = catalog 未 sync,或該 licence 名喺 catalog 無**唯一**命中 |
| 4 | §1.1 換真 SN | **201** ✅ | — |

> 🔴 **次序唔可以跳。** N 未通就查 P、P 未通就 debug payload —— 都係浪費時間查一個唔存在嘅問題。逐級確認,每級有可分辨嘅 signature(timeout / 404 / 401 / 400 / 503 / 201)。

### 平台側點確認真係入咗

```
GET /requests            → 見到新單,origin = onboarding-intake
GET /requests/{id}       → opco 啱 · line item 有嘢 · stage = REQUESTED · handledById = null
                           accountCreatedAt / azureSyncedAt = null（正常,見下）
```

重推同一張 → **仍然一張**(`serviceNowSysId` `@unique`,idempotent)。

> ✅ `accountCreatedAt` / `azureSyncedAt` **一定係 null**,呢個係**設計**唔係 bug:n8n 冇送,而由「n8n 幾時 POST」推導「AD 已 sync 落 Entra」= 靠估開 sync gate。平台照舊要喺 Graph `findUser(upn)` 真命中先 assign。

### ⚠️ 誠實邊界

W36 嘅 live 驗證行嘅係 **demo-harness mock ServiceNow**,payload 亦係照 n8n node 個 `jsCode` 重砌。**證到**:adapter → `IntakeService` → DB 成條路真係通、反查用啱 table(`sc_request`)同 REQ number、8 個 case 行為正確。**未證**:真 SN 回應欄名、真 n8n 打入嚟。

⇒ **上表階段 4 至今未有人行過。** 第一次行請當係真對接,唔好當回歸測試。

---

## 5. 檔案索引

| 關注 | 位置 |
|---|---|
| n8n 側逐 node 精確改動 | `docs/01-planning/W36-n8n-intake-adapter/N8N-WF1-CHANGES.md`(**§2.5** 接線 · §1/§2 payload · §2.6 `licenseCode` null) |
| Job Function ↔ OpCo 18 條對照 + 逐條理據 | `docs/01-planning/W36-n8n-intake-adapter/MAPPING.md` |
| 兩條 route 差異 / 點揀 | `docs/05-usage/N8N-INTEGRATION-SETUP.md` **§1.5** · `N8N-INTAKE-HANDOFF.md` **§8** |
| 平台側實作 | `apps/api/src/fulfilment/intake-adapter.service.ts` · `opco-department-map.ts` · `dto/n8n-native-intake.dto.ts` |
| 決策 | `docs/adr/0017-n8n-execution-seams-switchable-integration.md`(**D4**)· ADR-0008 · ADR-0012(單一 origin) |
| UAT 實際環境 | `07-uat-as-built.md` · `02-environment-reference.md` |
| 本地 smoke(唔使 n8n) | `apps/api/scripts/demo-harness/README.md` Scenario 3 · `npm run demo:mock-sn` |
| 追蹤狀態 | `BACKLOG.md` A 區 **SEC-001** · `N8N-SEAMS-戊` row · W36 `progress.md` retro C1-C6 |
