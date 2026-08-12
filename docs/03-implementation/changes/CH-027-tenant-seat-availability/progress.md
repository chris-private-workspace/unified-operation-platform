# CH-027 — Progress

## Day 1 — 2026-08-12（實作 A–H）

**Commit**:`68297a8` `feat(license): CH-027 tenant 可用 seat 計埋寬限期 —— owned / gate 唔再只睇 enabled`（26 files, +1215/−171）

### 做咗

| 區 | 內容 |
|---|---|
| **A** | `SubscribedSku` 加三個 bucket;`getSubscribedSkus()` 全部 `?? 0` 兜底 |
| **B** | `TenantSkuSnapshot` 加四欄 + 手寫 migration `20260812160000_ch027_tenant_seat_buckets`（**只加欄**） |
| **C** | `catalog.service.syncFromTenant` 存齊 |
| **D** | seam ② 加 `assignableUnits`;graph = `enabled + warning`,n8n = `prepaidEnabled` |
| **E** | `owned = enabled + warning` + `ownedBreakdown`（DTO 宣告） |
| **F** | gate 改用 `assignableUnits` + grace-period `detail` |
| **G** | `noPrepaidSeats` 收窄;badge 由 `capabilityStatus` 讀 |
| **H** | Platform view 副行 + hover breakdown + KPI `Available seats` |

**數字**:api **995 → 1011 / 73 suites** · web **343 → 358** · api lint **0** · web lint 回到 **16 條 pre-existing** · tsc 兩邊 **0**。

### 🔴 值得帶走嘅三件事

**① Falsification ② 第一次冇紅 —— 而個原因唔係我懶,係我睇唔出。**
拆走 `capabilityStatus` 改由 `suspended > 0` 推,**27 條全綠**。我原本兩條 G2 assert 一正一反,睇落已經夾住;但**兩個 fixture 之下兩條規則永遠同時成立**（VIVA 兩個都真、預設 case 兩個都假）⇒ 分辨唔到。加咗一條**兩者衝突**嘅 case（`suspended:0, lockedOut:5, capabilityStatus:'Suspended'`）先真紅。

📌 同 CH-023 tautology、BUG-011 `toHaveProperty(key)` 同族,而且**今次唔係靠自己睇出嚟,係靠真跑 falsification 揭穿** —— 呢個就係點解 T4 唔可以省。

📌 順帶:嗰個「衝突形狀」唔係砌出嚟遷就 test。`capabilityStatus` 係 Microsoft 對**訂閱**嘅判斷,四個 bucket 係**會郁嘅數** —— 保留期一完 seat 就離開 `suspended`,而判斷仲喺度。**呢個正正就係 ADR-0033 D1 揀「存 status」唔揀「由數推」嘅理由**,而家有一條 test 守住佢。

**② BUG-011 個縫今次真係關住咗,而且係 type-level。**
DTO 一宣告 `ownedBreakdown`,`apps/web` tsc **即刻紅 5 個 fixture**。BUG-011 嗰次「加咗欄落 read-model 但出唔到 API 而三層 test 全綠」,今次同一個動作即刻有閘攔住 —— 唔使靠記性。

**③ `Test-Path` 級數嘅教訓,今次出喺 lint 計數。**
`LINT-web` 個數畀人手數咗四次（25 → 16 → 15 → 16),四次都係喺 lint 輸出上面數行。今次改動令佢升到 27,`--fix` 我自己兩個檔之後**準確回落 16**,eslint 自己印 `✖ 16 problems` ⇒ **一次前後對比 + 一個工具自報**。已入 BACKLOG:`allocation-reset.test.tsx` 11 · `allocation-reset.tsx` 4 · `sync-check.test.tsx` 1,CH-024 記嗰個 15 確認漏數一條。

### ⚠️ 偏離 spec（R3，已入 spec §8 + checklist）

1. **acceptance D2「n8n 既有 test 一條都唔使改」字面守唔到** —— `listTenantSkus` 個 `toEqual` **形狀** assert 要加 `assignableUnits`,因為契約真係多咗一個欄。**行為** assert 同 `license-ops.contract.spec.ts` 跨 provider 等價**一條唔改** ⇒ D2 意圖守住。
2. **F4 加咗一條反面 acceptance** —— 原文只講「靠 `warning` 撐起嗰陣要有 detail」,單獨嘅話 `graceSeats > 0` 就滿足到,而咁樣**每個 `SPE_E3` assign 都會被標成 grace**。反面 case（`enabled` 夠用 ⇒ `detail` 必須 `undefined`）先真正約束到條件。

## Day 1（續）— 2026-08-12 真環境驗證：**B-4 / V-5 / V-6 全部收咗**

Chris 同日批准停 `ai-doc-extraction-db` ⇒ 五項(CH-026 `A-2`/`D-9` + CH-027 `B-4`/`V-5`/`V-6`)**一氣呵成收晒**。

### B-4 + CH-026 A-2 — migration 對真 DB

`prisma migrate deploy` → `localhost:5433` db `platform`,**21/21 applied**(兩個手寫 SQL 一次過)。DB 側實測:101 個舊 snapshot 三個新 bucket **全 0**、`capabilityStatus` **全 `Enabled`**;101 個 `SkuCatalog` **全 `prepaid`** ⇒ **兩個 ADR 嘅「零 data migration」承諾都真係做到**。

### V-6 — 真 sync

`SPE_E3` `owned` **21 → 4498**(21 + 4477 grace),**逐字命中 spec 個預測**。`SPE_E5` 4502 → 4744 ⇒ **CH-020 2026-08-03 嗰個「超支 33」之謎正式解開兼修好**。gate 拒絕實測 **32 → 11**。全表見 `checklist.md`。

🔴 **兩個要記低嘅落差**:
1. **11 個嘅組成同 ADR 寫嘅唔同** —— ADR 寫「6 用晒 + 5 `Suspended`」,實測 **7 + 4**。總數啱、拆法差一個。**呢個差異本身就係證據**:probe 數字會郁,而 `capabilityStatus` 唔會 —— 正正就係 D1 揀存 status 嘅理由。
2. **`totalOwned` 仲係 4,270,779、`unlimitedSkus` = 0** —— 因為 **CH-026 `G-7` 未做**,一個 SKU 都未 curate 做 unlimited。⚠️ **唔好誤讀成 CH-026 冇生效** —— 機制 render 到(見下),差嘅係人手 curate 嗰步。

### V-5 + CH-026 D-9 — light + dark 真 render

六張截圖。`Available seats` KPI · `SPE_E3` 副行 `21 + 4477 grace`(全表 54 行有)· `VIVA` + `Teams_Premium` 出 `Subscription suspended` · hover `title` 實測 DOM attribute · SKU Catalog `SEATS` 欄 `Prepaid` / `UNLIMITED`。

📌 **驗嘅過程自己撞返兩個記錄在案嘅坑,而兩個都即刻捉到,因為今次有 capture**:
- **build-cache 假綠燈**(`Found 0 errors` + `MODULE_NOT_FOUND` 同時出現)—— 我一開始就用 `Start-Process -RedirectStandardOutput` 起 api,所以 **13 秒就睇到答案**。§9 記低嗰兩次各白等 180/270 秒,分別純粹係「有冇 capture stdout」。⇒ **`start-detached.ps1` 唔 capture api stdout 呢件事,值得當成一個要修嘅嘢,唔係一個要記住嘅嘢。**
- **`ai-doc-extraction-db` 搶 port** —— 今次 `docker stop` 之後**即刻**跑 `ensure-infra`,冇畀佢窗口。

📌 **兩句我自己講錯即時更正咗**:①第一張 catalog 截圖我叫咗 dark,實際 light(navigate 之後 theme reset)②我一度講 SKU Catalog pager「冇 `‹ ›`」—— 錯,佢有;舊款嘅係「13 頁全列」呢半。

### 🚧 淨低（唔喺本單）

**CH-026 `G-7`** —— 人手 curate 22 個 SKU 做 unlimited,**Chris 落 UI 做**,本來就唔喺 CH-026/027 範圍。做完之後 `Available seats` 個 KPI 先會由四百萬級變返有意義嘅數。
