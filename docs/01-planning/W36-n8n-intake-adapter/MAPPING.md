---
phase: W36-n8n-intake-adapter
deliverable: F1
status: **confirmed**(2026-07-27,Chris Lai 逐條確認 18/18 = **G1 達標**;三個發現全部拍板,見 §0)
sources_verified: 2026-07-27
---

# F1 — n8n → 平台 識別值對照表

> ## ✅ 拍板結果(Chris Lai,2026-07-27)
> | # | 決定 |
> |---|---|
> | 發現 A | **維持新增 OpCo** `RAPO/IT (RDC2)` → mapping #6 指向**新 code**,唔係 `RAPO/IT`(F1b 照做) |
> | 發現 B | **(a) n8n 側改送 `jobFunction`** → 平台只認 §1 嗰 18 條精確 key,fail-closed(改動指示 → `N8N-WF1-CHANGES.md`) |
> | 發現 C | **WF1 payload 改用 validated 值**(username / email / sAMAccountName,`validated: true`) |
> | OQ-4 | SN `License` 值**暫時拎唔到** → 按 §2.3 規劃先行,唔 block F2 |
> | 18 條 | **全部確認**(G1 達標) |

> **用途**:adapter(F2)resolve 三個識別值嘅**依據**。
> **唔係 SSOT**:平台真相係 `Opco` / `SkuCatalog` 兩張表;本文係 **2026-07-27 實查 snapshot + 待確認決定**。落 UAT / prod 前重查。
> **證據來源**(全部實跑,非推測):`1002` node `1. Input Parser + Data Enrichment` 原文 · `apps/api/prisma/seed.ts` · dev DB `psql` 直查。

---

## 0. 🔴 三個發現 —— 改變 F1/F2 前提,需 Chris 拍板

### 發現 A — `RAPO IT (RDC2)` 喺 n8n 自己嘅資料入面已經係 `RAPO/IT`

OQ-2 拍板「平台新增一個 OpCo」時,手上只有「平台冇對應」呢個事實。而家讀咗 `deptMapping` 原文,證據指向相反方向:

| 欄位 | `RAPO IT` | `RAPO IT (RDC2)` | 同唔同? |
|---|---|---|---|
| `description`(**部門代碼**) | `RAPO/IT` | **`RAPO/IT`** | ✅ **一樣** |
| `adCompany` | RAPO | RAPO | 一樣 |
| `adDepartment` | Information Technology | Information Technology | 一樣 |
| `abwFolder` | RIT | RIT | 一樣 |
| `logonScript` | it.bat | it.bat | 一樣 |
| `upn` | rapo.com.hk | rapo.com.hk | 一樣 |
| `office` | 21/F, One Kowloon | 21/F, One Kowloon | 一樣 |
| `ou` | `OU=One Kowloon,OU=Users,OU=IT,OU=RAPO` | `OU=RDC2,OU=Users,OU=IT,OU=RAPO` | ❌ **只有呢個唔同** |

⇒ RDC2 **唔係一個獨立部門 / cost centre**,只係 `RAPO/IT` 底下一個 **OU 位置分支**(帳號放喺邊個 OU)。n8n 自己個部門代碼欄已經寫死係 `RAPO/IT`。

**影響**:若平台新增 `RAPO/IT (RDC2)` 做獨立 OpCo,ledger 會**分開計** —— 但 AD / n8n 側佢哋係同一個部門。license 數字會 split 落兩個 OpCo,同 FY26 license summary(平台 23 個 OpCo 嘅來源)嘅口徑對唔上。

**🔴 建議 revisit OQ-2 → 改為對 `RAPO/IT`**(即發現 A 之前嘅選項一)。呢個唔係我單方面改 —— 我照 plan 記低證據,決定權喺你。若堅持新增,F1b 照做,但要接受 ledger 口徑分裂。

> ### ✅ 拍板:**維持新增 OpCo**(Chris,2026-07-27)
> mapping #6 指向**新 code `RAPO/IT (RDC2)`**,唔係 `RAPO/IT`。F1b 照 plan 執行。
>
> **連帶後果(記低,唔係反對)**:
> - RDC2 嘅 license 會**獨立計數**,唔滾入 `RAPO/IT` —— 呢個係想要嘅粒度,但代表 `RAPO/IT` 嘅歷史數字(FY26 license summary 口徑)同將來嘅數**唔可直接比較**
> - AD 側兩者部門代碼仍然同樣係 `RAPO/IT`(n8n 唔會改),即**平台比 AD 分得更細**。呢個唔矛盾(平台 OpCo = 成本歸屬,AD description = 目錄屬性),但日後有人想對數就要知道呢件事
> - `RAPO/IT (RDC2)` 新 OpCo 初始 `allocatedQuantity` = 0 ⇒ **ADR-0016 預算 gate 上線後,呢個 OpCo 一 assign 就會被擋**。要喺 gate 上線前為佢設 allocation(或接受要 ADMIN override)

---

### 發現 B — 🔴 WF1 送畀平台嘅 `department` **唔係**呢 18 條 key

`1001` node `WF1 - Prepare UOP Intake` 原文:

```js
const u = aiBrain.derivedUserInfo || {};
...
request: { ..., department: u.department || '', ... }
```

即係 **AI Brain 由 email 自由文本抽出嚟嘅 `derivedUserInfo.department`**,唔係 1004 form dropdown 揀嘅 Job Function。

而 1001 自己喺 `prepare approval data` 明確區分咗兩者,仲寫低咗註解:

```js
const department  = brain?.derivedUserInfo?.department || '';   // AI 抽嘅
const jobFunction = validated.department || '';                 // 用戶在表單選的 Job Function
// action items 用 1004 form 的 Job Function（精確匹配 deptMapping key）
const actionDepartment = jobFunction || department;
```

⇒ **n8n 內部自己都知 AI 抽嗰個唔可靠,做 AD 動作時用 `jobFunction`;但送畀平台嗰個用咗 AI 抽嘅。**

n8n 側點處理呢種自由文本?`resolveOU()` **四層 fallback**:精確 → normalize(去括號、斜線轉空格)→ `aliasMap`(28 條,例 `RHK/Information Technology` → `RHK IT`、`RAPO/IT (Dewey Lou)` → `RAPO IT`)→ prefix → **`defaultOU`(= `RAPO/IT`)**。

**⚠️ 平台絕對唔可以照抄第 5 層**:n8n 搵唔到就 fallback 落 `RAPO/IT`,對佢嚟講只係「帳號放錯 OU」;對平台嚟講就係 **license 靜靜記錯 OpCo**,而 ledger / 預算 gate(ADR-0016)全部靠呢個數。ADR-0017 D0 + F2 fail-closed 要求:**搵唔到 = 拒單,唔准 fallback**。

**兩條路**:

| | 做法 | 評價 |
|---|---|---|
| **(a)** ★ 建議 | **n8n 側改 WF1**:`department: u.department` → 送 `jobFunction`(即 `validated.department`,form dropdown 精確值) | 一行改動,值已經喺同一個 workflow 上游;之後平台 mapping 表就係本文 §1 嗰 18 條,精確、可測 |
| (b) | 平台照收自由文本,複製 n8n 成套 normalize + 28 條 aliasMap(但**唔要** defaultOU) | 平台要維護 28 條 alias 嘅副本,同 n8n 各一份必然漂移;而且 AI 抽嘅值本質上係開放集合,永遠補唔完 |

⚠️ **1005 排程路徑要多一步**:`execution_context` 現時只存 `department`(AI 抽),**冇存 `jobFunction`**(`Check Activate Date` → `Prepare Schedule Record` 個 payload 冇呢欄)。行 (a) 嘅話 1005 側要一併補存。

---

### 發現 C — 🔴 WF1 payload 用嘅係**未驗證**資料,而已驗證資料喺同一個 workflow 上游

```js
targetUser: {
  raw: rc.targetUserRaw || '',
  firstName: u.firstName || '',        // AI 抽
  lastName: u.lastName || '',          // AI 抽
  username: u.candidateUsername || '', // AI 「候選」username
  email: u.derivedEmail || '',         // AI 推導 email
  validated: false                     // ← n8n 自己標明
}
```

`validated: false` 係 n8n 自己寫嘅。但 WF1 觸發時機係 **1007 執行完之後**(approval 過咗、AD 帳號已建),嗰陣 `prepare approval data` 已經有**技術員經 1004 form 確認過**嘅值:`username` / `sAMAccountName` / `derivedEmail`(由 validated username + jobFunction 推 domain)。

**點解要緊**:平台 `targetUpn` 來自 `targetUser.email`。assign 之前必須 `findUser(targetUpn)` 喺 Graph **真命中**(sync gate)。若 `targetUpn` 係 AI 猜嘅 email 而唔係真正建咗嗰個帳號 → **sync gate 永遠唔會過,單會一直卡住**,而且錯得好靜(唔會報錯,只會「等緊 sync」)。

**建議**:同 (a) 一齊改 —— WF1 payload 改用 `prepare approval data` 嘅 validated 值(`username` / `derivedEmail` / `sAMAccountName`),`validated` 標 `true`。

---

## 1. `department → opcoCode` 對照(18 條)

> ✅ **前提已確立**:拍板行 (a) —— n8n 送 **form Job Function 精確值**。所以本表 = adapter 嘅**完整** resolve 依據,**唔做任何 normalize / alias / fallback**(對唔上即 4xx)。
>
> 判定依據 = `deptMapping` 每個 entry 嘅 **`description`(AD 部門代碼)** + `adCompany`,唔係靠 key 個名估。

| # | n8n Job Function(key) | n8n `description` | adCompany | → 平台 `Opco.code` | 判定 |
|---|---|---|---|---|---|
| 1 | `People & Culture` | `People & Culture` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) — description 冇公司 prefix,靠 `adCompany=RHK` + `upn=ricoh.com.hk` 判斷 |
| 2 | `RAPO ASPC` | `RAPO/ASPC` | RAPO | **`RAPO/ASPC`** | ✅ 確定(description 同 code 完全一致) |
| 3 | `RAPO ASPC Warehouse` | `RAPO/ASPC` | RAPO | **`RAPO/ASPC`** | ✅ 確定(多對一,同 #2) |
| 4 | `RAPO FNA` | `RAPO/FNA` | RAPO | **`RAPO/FNA`** | ✅ 確定 |
| 5 | `RAPO IT` | `RAPO/IT` | RAPO | **`RAPO/IT`** | ✅ 確定 |
| 6 | `RAPO IT (RDC2)` | `RAPO/IT`(AD 側) | RAPO | **`RAPO/IT (RDC2)`** ← 新增 | ✅ 拍板(Chris 2026-07-27):維持新增 OpCo,平台比 AD 分得更細,見發現 A |
| 7 | `RAPO SCM` | `RAPO/SCM` | RAPO | **`RAPO/SCM`** | ✅ 確定 |
| 8 | `RHK CS (engineer)` | `RHK/CS` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27)(平台無 RHK 細分) |
| 9 | `RHK CS (ETC)` | `RHK/CS` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) |
| 10 | `RHK CS OK` | `RHK/CS` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) |
| 11 | `RHK CS QNE` | `RHK/CS/CCnE` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) |
| 12 | `RHK Digital Operations` | `Digital Operations` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27)(description 無 prefix) |
| 13 | `RHK FNL One Kowloon` | `RHK/FNA` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) |
| 14 | `RHK FNL(Logistic MTL)` | `RHK/CCO/LC` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) |
| 15 | `RHK IT` | `RHK/IT` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) |
| 16 | `RHK SG Salesman` | `RHK/SG` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) |
| 17 | `RHK Strategic Innovation` | `Strategic Innovation` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27)(description 無 prefix) |
| 18 | `RHK MD Office` | `RHK/MDO` | RHK | **`RHK`** | ✅ 確認(Chris 2026-07-27) |

### 關鍵觀察

- **RAPO 側對得好乾淨**:6 條 Job Function 嘅 `description` **逐隻字**等於平台 `Opco.code`(#2/#3/#4/#5/#7,加待拍板嘅 #6)。
- **RHK 側必然多對一**:n8n 有 8 個唔同 RHK 部門代碼(`RHK/CS`、`RHK/CS/CCnE`、`RHK/FNA`、`RHK/CCO/LC`、`RHK/IT`、`RHK/SG`、`RHK/MDO`,加兩個無 prefix),但平台**只有一個 `RHK`**(company-level,`costCenter = null`)。11 條 → 1 個。
  - ⚠️ **代表 RHK 嘅 ledger 冇部門細分能力**。若日後要分,係新增 OpCo 嘅 scope 決定,唔屬本 phase。
- ✅ **`People & Culture` → `RHK` 已確認**(Chris 2026-07-27)。留低原因供將來 review:AD 側 `adCompany = Ricoh Hong Kong Limited` + `upn = ricoh.com.hk`,但 `deptMapping` 註解歸類佢為「**RHK/RAPO 共用**」。⚠️ **殘留觀察**:若日後真係有 RAPO 員工行呢個 Job Function,佢哋嘅 license 會記落 `RHK`。呢個係已知並接受嘅取捨,唔係 bug —— 但若 `RHK` 嘅數突然多咗一批 RAPO 人,呢度就係第一個要查嘅地方。

### 反向落差(平台有、n8n 冇)

平台 **24 個** OpCo(23 active + F1b 新增 `RAPO/IT (RDC2)`),本 mapping 只用到 **6 個**(`RHK` / `RAPO/ASPC` / `RAPO/FNA` / `RAPO/IT` / `RAPO/SCM` / `RAPO/IT (RDC2)`)。其餘 18 個唔會經呢條 intake 入 —— 包括 **`RAPO/APTC`** 同 **`RAPO/IT (RBS)`**,兩者喺 n8n `deptMapping` 完全冇對應 Job Function。

呢個**唔係缺漏**:phase 1 onboarding 只服務 HK RAPO/RHK,其餘 OpCo 由其他途徑(平台開單 / allocation import)入數。記低係為咗防止將來有人見到「只覆蓋 5/23」以為漏做。

---

## 2. `licenseCode → skuId` 覆蓋率(dev catalog 實查,2026-07-27)

實查結果:

| 指標 | 值 |
|---|---|
| `SkuCatalog` 總行數 | **103** |
| `active = true` | **99** |
| active 且有 `businessAlias` | **8** |
| active 之中 alias 重覆(歧義) | **0** ✅ |

**8 個有 alias 嘅 SKU**(= 目前唯一 addressable by name 嘅集合):

| `businessAlias` | `skuPartNumber` | category |
|---|---|---|
| `E5` | `SPE_E5` | Base |
| `E3` | `SPE_E3` | Base |
| `F3 Frontline` | `DESKLESSPACK` | Base |
| `Copilot` | `Microsoft_365_Copilot` | Add-on |
| `Visio P2` | `VISIOCLIENT` | Add-on |
| `Teams Phone` | `MCOEV` | Voice |
| `PBI Pro` | `POWER_BI_PRO` | Power Platform |
| `PA Premium` | `POWERAUTOMATE_ATTENDED_RPA` | Power Platform |

### 對「E5 歧義」嘅修正

`N8N-INTAKE-HANDOFF` §0 講嘅兩個 E5 歧義,喺 **alias 層面而家唔存在**:`SPE_E5` 有 alias `E5`,而 `Microsoft_365_E5_(no_Teams)` **未 curate、冇 alias**,所以 `"E5"` 目前**唯一命中**。

⚠️ **但呢個唯一性係「碰啱」,唔係設計保證** —— 一旦有人 curate 咗 no-Teams 變體並且都叫 `E5`,即刻變歧義。所以 F2 嘅**唯一命中 + ≥2 候選 fail-closed** 規則照樣要做,唔可以因為「而家啱啱好唯一」就省。F3 個歧義 test 亦照寫(用 fixture 造兩行同 alias)。

### 🔴 OQ-4(新)—— SN `License` variable 實際值係咩?

WF1 個 `licenseCode` 來源:

```js
licenseCode: (it.variables && it.variables.License) || null
```

即 **ServiceNow catalog item 嘅 `License` variable**。我哋**唔知佢實際值長成點** —— 可能係 `"E5"`,亦可能係 `"Microsoft 365 E5"` / `"M365 E5 (Full)"` / 一個 sys_id。

**風險**:平台只有 8 個 alias,而且格式係短碼(`E5` / `PBI Pro` / `F3 Frontline`)。SN catalog variable 通常用完整 label。**兩邊格式對唔上 = 每張單都 400**。

⇒ 需要 **SN 側 `License` variable 嘅實際 choice list**,先決定 alias 要唔要補 / 補成點。

---

### 2.3 ✅ OQ-4 規劃(Chris:「暫時拎唔到,可以先規劃嗎」→ 可以,**唔 block F2**)

**核心安排**:唔等 SN 值,但**唔賭**佢係咩;把「值嘅來源」收窄成**一個函數**,將來換來源 = 改一個函數 + 佢嘅 test。

#### (1) F2 落嘅 resolve order(固定、可測、fail-closed)

```
resolveSkuByLicenseCode(code):
  1. trim + case-insensitive 比 SkuCatalog.businessAlias   (active only)
  2. trim + case-insensitive 比 SkuCatalog.skuPartNumber   (active only)
  3. 任何一步命中 ≥2 行  → ❌ ambiguous,fail-closed
  4. 兩步都 0 命中       → ❌ unmapped,fail-closed
```

**冇第 5 層**、冇模糊比對、冇「開頭包含」。理由同 §0 發現 B 一樣:寧可拒單,唔可以靜靜配錯 SKU —— 配錯 SKU = 派錯 license 落真人身上 + ledger 記錯數。

#### (2) 🔴 **絕對唔可以**「順手 curate SN label 落 `businessAlias`」

`businessAlias` **已經有 owner**:ADR-0004 allocation-import 靠佢對 Excel 欄名。佢係**單值**欄位。

若 SN 個 label(例 `Microsoft 365 E5 (Full)`)同 Excel 個名(`E5`)唔同,兩個系統就會搶同一格 —— 改咗嚟遷就 SN,allocation import 即刻對唔到嗰行、該 SKU 靜靜 skip 咗。**呢個係本 phase 最易踩、而且最靜嘅一個坑**,寫入本文件防止將來有人「見到有個 alias 欄就填」。

#### (3) 拎到 SN 值之後,三個選項(屆時先揀,唔喺而家決定)

| | 做法 | 評 |
|---|---|---|
| (i) | code 常數表 `SN_LICENSE_CODE → skuPartNumber`(同 department mapping 一致) | 零 schema;同 OQ-1 一致;改要 deploy |
| (ii) | `SkuCatalog` 加 nullable `serviceNowLicenseCode` 欄(additive) | 可 UI 改;**觸發 H1 schema → 需 ADR** |
| (iii) | 直接用 `businessAlias` | ❌ **唔建議** —— 撞 ADR-0004(見 (2)) |

#### (4) 順手令 adapter 自己變成攞答案嘅工具

fail-closed 嘅 4xx 錯誤訊息**必須回顯收到嘅 `licenseCode` 原值**(H4:licenseCode 唔屬 PII / secret,安全)。

咁第一次真對接送入嚟嗰刻,平台就會直接講:「收到 `licenseCode: "Microsoft 365 E5 (Full)"`,catalog 對唔到」。⇒ **OQ-4 嘅答案由第一張真單自己送上門**,唔使等 SN admin 出 choice list。呢個亦係 §4 建議嘅攞答案路徑。

#### (5) F2 唔會因為呢件事返工

resolve 邏輯全部收喺 `resolveSkuByLicenseCode()` 一個函數。將來揀 (i) 或 (ii),改嘅係嗰個函數內部 + 佢嘅 unit test;`intake-adapter.service` 其餘部分、DTO、controller、endpoint 合約**一律唔郁**。

---

## 3. `REQ number → sysId` 反查

WF1 送 `request.requestId` = `aiBrain.requestContext.requestId`。由 `N8N-INTAKE-HANDOFF` 個 fixture(`REQ0043858`)睇,格式係 **REQ number**,唔係 sysId。

adapter 走既有 `snow.getRecordByNumber(number, 'sc_request')`(ADR-0017 D4 / OQ-3 已拍板)。

⚠️ **未驗證**:本地同 UAT 嘅 ServiceNow 憑證係 placeholder(W33 D3),所以「反查真係攞到 sysId」呢件事**未有真 output 證明**。F4 若仍然不可達,照 plan R2 記做 carry-over,**唔准當 pass**。

---

## 4. ✅ 待確認清單 —— 全部已決(Chris Lai,2026-07-27)

| # | 項目 | 決定 | 落到邊 |
|---|---|---|---|
| 1 | 發現 A:RDC2 | **維持新增 OpCo** `RAPO/IT (RDC2)` | F1b · §1 #6 · 連帶後果見 §0 發現 A |
| 2 | 發現 B:department 來源 | **(a) n8n 送 `jobFunction`** | `N8N-WF1-CHANGES.md` §1/§2 · 平台只認 §1 18 條,零 fallback |
| 3 | 發現 C:validated 值 | **改用 validated**(username / email / sAMAccountName,`validated: true`) | `N8N-WF1-CHANGES.md` §1/§2 |
| 4 | OQ-4:SN `License` 值 | **暫時拎唔到 → 按 §2.3 規劃先行** | §2.3(resolve order · `businessAlias` 紅線 · 錯誤訊息回顯做發現機制) |
| 5 | 18 條 mapping | **全部確認 = G1 達標** | §1 |

### 仍然開住(但**唔 block** F2)

| # | 項目 | 點解唔 block |
|---|---|---|
| A | SN `License` 實際值 | §2.3 (4):第一張真單嘅 4xx 訊息會自己講出嚟;之後揀 (i)/(ii) 只改一個函數 |
| B | n8n 側 WF1 未改 | `N8N-WF1-CHANGES.md` §4:未改 → 平台拒單但講清收到咩;平台落 code 同 n8n 改動可**並行** |
| C | `RAPO/IT (RDC2)` allocation = 0 | ADR-0016 預算 gate **上線前**要處理,唔屬本 phase(見 §0 發現 A 連帶後果) |
| D | REQ number 反查未真驗 | SN 憑證係 placeholder(W33 D3);plan R2 已列,F4 若不可達則記「未驗證」carry-over |

---

**證據可重跑**:`deptMapping` 見 `1002` node `1. Input Parser + Data Enrichment`;OpCo 見 `apps/api/prisma/seed.ts:8-32`;catalog 數字見 dev DB `SkuCatalog` / `Opco`(2026-07-27 psql 直查)。
