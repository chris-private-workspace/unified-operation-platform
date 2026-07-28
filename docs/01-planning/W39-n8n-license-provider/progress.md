---
phase: W39-n8n-license-provider
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed         # active | closed
last_updated: 2026-07-28
---

# Phase W39 — Progress

---

## Day 0 — 2026-07-28:Kickoff(**plan = draft,🔴 未 approve**)

### 0. 掃號(PROCESS §2.1)

`git fetch --all --prune` 之後掃晒**所有** local + remote ref 嘅 `docs/01-planning/` tree:最大 = **W38** ⇒ **W39 可用**。

### 1. 實讀 workflow JSON —— 揪到四處同 ADR-0017 D2 轉述對唔上

`docs/06-reference/03-n8n-workflow/` 係 gitignore(SEC-001)但本機讀得到。三條 workflow 全部 `enabled`。

| # | ADR D2 講 | 真係 | 影響 |
|---|---|---|---|
| 1 | outcome `assigned` | 2003 出 **`success`** | 純 mapping,細事 |
| 2 | outcome 有 `no_seats` | 2003 **完全唔檢查座位** | **好事** —— 同 D0 一致(座位係平台決策)。但即係 `no_seats` **兩個 provider 都產生唔到**,要寫入 test 註釋免得下手以為漏咗 |
| 3 | 一種 response 形狀 | **兩種** —— `already_assigned`/`not_synced` 由 `Route Status` **直接 respond**,只有真 assign 完先行 `Build Response` | F1 要 handle 兩種形狀,唔可以當一種 |
| 4 | `error.details` 唔含 PII | 兩個 code node 都 `JSON.stringify(b.error \|\| b).substring(0,500)` —— **原封塞 Graph error body** | 🔴 **H4**,見 OQ-2 |

**#4 最嚴重**:Graph 404/400 body 慣常帶 UPN,而 W38 定嘅契約明文寫 `details` 唔含 PII。呢個同 **BUG-004 同源**(vendor 塞畀我哋嘅字串夾帶 PII),但今次係**新** code,可以喺寫落去之前就守住 —— 唔使等第二次先發現。

### 2. 🔴 誠實邊界:本 phase 完成 ≠ 可以真切換

n8n 側三個前置**全部未通**,而且全部唔喺本 repo 手上:secret 仍 `CHANGE_ME_SHARED_SECRET` · n8n UAT ↔ 平台環境未接通(`[N]`)· 平台未部署(`[P]`)。

⇒ 庚嘅驗收 = 「**code + test 齊,預設值零改變**」,**唔係**「跑得通」。已寫入 plan §1 + G8 明文「唔准當 pass」。

**呢個係本 phase 最大嘅 AP-2 風險**:全程冇真 n8n,好易寫出一套「睇落合理」但同真實回應對唔上嘅 mapping。緩解 = 所有 mapping 對住**實讀嘅 JSON**,唔靠 ADR 轉述(上表就係第一次應用)。

### 3. 五個 OQ(plan §8)

OQ-1 `already_assigned` 對 ledger 嘅影響(**W38 留低嗰個,而家避唔開**)· OQ-2 `details` PII 邊界 · OQ-3 `ritmId` 入唔入介面 · OQ-4 未接通時 probe 顯示咩 · OQ-5 做唔做 `listUsersBySku`。

**OQ-1 係最重要嗰個** —— 佢係第一個「一揀 n8n 就會行到、而 Graph 路徑從來冇行過」嘅分支。揀錯會令「切 provider」順帶夾帶一個 ledger 語意改動。

### Blockers

- 🔴 plan 未 approve + 五個 OQ 未拍板 → 依 R1,**一行 code 都唔寫**

**Commit**:`cc5cf66` — `chore(planning): kickoff W39 — N8nLicenseProvider(ADR-0017 庚)`

---

## Day 1 — 2026-07-28:五個 OQ 拍板,D0 Gate 解除

Chris 五個全跟建議,plan 內容零改動 ⇒ `status: draft → active`。

| OQ | 拍板 | 實作含意 |
|---|---|---|
| **1** | **A** — `already_assigned` 一視同仁照 +1 | 🔴 **要開一個 `assign.service` 分支** —— W38 對非 `assigned` 一律 fail-loud,而家正面處理佢。**呢個就係 W38 明文留低嘅嗰件事** |
| **2** | **A** — `details` 唔傳遞 | provider 只留 status + 平台自己寫嘅安全描述;vendor 細節留喺 n8n execution log |
| **3** | **B** — `ritmId` 唔入介面 | Graph 實作永遠用唔着;平台自己有 ADR-0009 audit |
| **4** | **A** — 未配置 = `inactive` | 唔會出現「紅色但其實只係未接線」嘅誤導狀態 |
| **5** | 維持唔加 `listUsersBySku` | 2002 有 mode 2 ≠ 平台需要佢 |

### OQ-1 揀 A 之後,有一樣嘢要特別小心

`already_assigned` 當 `assigned` 處理 ⇒ ledger 照 +1。但 `already_assigned` 嘅意思正正係「**tenant 側本來已經有呢個 seat**」,所以呢一 +1 **確實會**令平台數字比 tenant 真實多一個。

Chris 明確接受:**唔喺庚偷偷修一邊**。呢個重複計數風險 Graph 路徑一直存在(Graph 分唔到 replay,一律當新 assign),要修就另開 change **兩條路一齊修**。

⇒ 實作時**唔准**順手加「n8n 路徑先唔 +1」—— 咁就係喺切 provider 順帶夾帶一個 ledger 語意改動,正正係 D0 禁止嘅嘢。已寫入 F2 test 註釋鎖住。

**下一步**:F1 `N8nLicenseProvider`。

---

## Day 2 — 2026-07-28:F1 + F4 + F6 交付(**範圍經 Chris 縮減**)

### 🔴 H1 —— plan G3「零 schema」係錯假設,已 STOP + approve

落手寫 connector 註冊先發現:**`ConnectorConfig` 係具名 column model,唔係 key-value bag**(ADR-0013 OQ-4「一 row 一 connector」)⇒ 任何新 connector 嘅非機密欄位**必然**要 `ALTER TABLE`。

停手擺三個選項(加兩欄 / 全走 env `editable: []`[有 `n8n-inbound` 先例] / 只加選路一欄),Chris 揀**加兩欄** —— 因為 ADR-0017 **D1 明文要「逐接縫 3 個掣」**,走 env 就冇 UI 掣,而 UAT 改 env 仲要經 Azure。

Migration `20260728021452_w39_n8n_license_connector` 純 additive、兩個 nullable TEXT、applied、欄位實查存在(12 rows)。`prisma generate` 冇撞 proxy(engine 已 cache)。

**呢個教訓記入 ADR-0013 實作補註而唔止本檔** —— 下一個加 connector 嘅人會踩同一個坑。

### 三次「條 test 捉到我」

呢日最有價值嘅唔係寫咗幾多 code,係三次被自己嘅守門攔住。

**① `this.secret()` 喺 `try` 入面求值。** 原本寫喺 `fetch()` 個 args 裡面 ⇒ 「你冇設 `N8N_LICENSE_WEBHOOK_KEY`」呢個**配置錯誤**會被 catch 住包成「**n8n is unavailable**」。即係:運維會去查第三方死咗未,而真相係我哋自己漏設。已移出 `try`。

**② 我自己喺 probe 開咗個窿。** `execute()` 對「可探但冇具名分支」嘅 key **fall through 去打 ServiceNow**。我加咗 `PROBEABLE['n8n-license'] = null` 但未加分支 ⇒ 撳 n8n-license 個 Test connection **會探 ServiceNow 而標籤寫住 n8n** —— 一個**綠色剔畀一個從來冇被聯絡過嘅 connector**。

fails-before 更揭到:拆走分支之後,舊嗰條「never calls anything that writes」**照樣綠**,因為 fall-through 打嘅係 `snow.query`(**讀**唔係寫)。⇒ 舊 G2 **冚唔到呢個 bug**,新加嗰條「does NOT fall through」先至係真正守門。

**③ W38 條邊界 test 捉到我。** probe 必然要 import `N8nLicenseProvider`,而 W38 寫死 `not.toContain('license-ops')`。

**查清楚先改**:W38 嗰條規則嘅**理由**係「唔准**經 seam**(抽象)去探,否則會探到當前選中嗰個」。而我注入**具體類**,正正係為咗「Graph 仍然選中時,仍然探得到 n8n」⇒ **條 test 嘅實作寬過佢嘅意圖**。

所以**收緊**而唔係放寬:明文禁**抽象 import**(舊版嘅字串檢查從來冇真正 assert 過呢點)+ 禁 `assignLicense`/`findUser`。

改完仍然紅 —— 因為我喺 **comment** 寫咗 `LicenseOperationsProvider` 個名,而 `toContain` 唔分 code 同註釋。改成 match **import path**。

### 順手修一個同類毛病

G2「never calls anything that writes」原本**手抄** 4 個 connector key,而自稱「run every probe there is」⇒ 加新 key 就靜靜漏,呢個就係 ② 能夠發生嘅原因之一。改成 iterate `CONNECTOR_KEYS`。

**靠人手同步嘅守門 = 有窿嘅守門**(同 TD-1 同一種病)。

### 交付 + verify(全部實跑)

| 項 | 結果 |
|---|---|
| api test | **487 / 487**(46 suites)—— 467 基線 + n8n provider 16 + probe 4 |
| lint / tsc | **0 / 0** |
| schema diff | **只有嗰兩個 nullable 欄** + 一個 additive migration |
| 3 個 `package.json` | diff **= 0**(global `fetch`,零新 runtime dep) |
| 既有 spec | **零改動**(`integration-status` / `permissions` 等全部自動 derive 新 key) |

### 🚧 兩個明確缺口(Chris 決定縮減,**唔係做完**)

1. **F2 雙向 contract test** —— **ADR-0017 rollout 表列明嘅庚驗收標準**。現有覆蓋係**各自單邊**(W38 Graph 9 + W39 n8n 16,兩邊都逐個 outcome 測過,但冇一條拎同一 case 對照)。補嗰陣要寫成「**除咗 replay 之外**相等」,因為兩邊**已知有一處刻意分岔**(OQ-1)。
2. **F3 secret 硬紅線 test** —— 機制層面已守(schema 冇 secret 欄 · `secrets` 只列 envKey · resolver 只掂非機密欄),但**冇一條 test 為 `n8n-license` 專門 assert**。W30 對其餘 connector 有做 ⇒ **覆蓋缺口,唔係設計缺口**。

兩個都已寫入 ADR-0017 實作補註,**明標「未達成、唔係已完成」**。

### 🚧 phase 狀態:**唔 close**

主線(provider + 選路 + probe + doc)齊,但上面兩個 deliverable 未做 ⇒ `plan.status` 維持 `active`。要收就係一個**有已知缺口嘅收官**,由 Chris 決定。

---

## Day 3 — 2026-07-28:補 F2 + F3,收官(Chris 揀 A)

### F2 —— contract test 嘅真功夫唔喺 assert,喺 arrange

7 個 case **各寫兩次**:一次用 Graph 嘅語言(mock `GraphService`),一次用 n8n 嘅語言(mock `fetch` + workflow 回應形狀)。**令兩個 arrangement 真係代表同一件事,就係呢條 test 全部價值所在** —— mistranslation 只會匿喺嗰度。

兩樣**刻意唔 assert**,因為要求相同反而係錯:

1. **error message 唔要求相同。** vendor 掛咗嗰陣運維要知係**邊個**掛,所以「Microsoft Graph is unavailable」同「n8n is unavailable」兩句都啱而且**必須**唔同。contract 係**失敗類別**(兩邊都 503),唔係字眼。為此寫咗個 `observe()` 把結果歸約成「返咗咩」或者「拋咩類」,把 vendor-specific 嘅嘢**主動掉走**。
2. **replay 唔要求相同** —— 獨立一個 block 釘死 Graph `assigned` / n8n `already_assigned`。有人日後「統一」佢哋就會紅,逼佢返去睇 OQ-1 而唔係靜靜推翻。

**fails-before**:令 n8n 個 `not_synced` 返 non-null → 只有嗰條紅,其餘 9 條綠。揀呢個分岔嚟證,係因為佢**最痛** —— sync gate 個 400 唔再觸發,即係未 sync 嘅 user 會被當成已 sync。

➕ **刪走自己頭先寫嘅一條廢話 test**(`expect([...]).toHaveLength(2)`)。佢永遠綠、冇可能失敗,只係喺 test count 加一個數。**噪音唔係覆蓋。**

### F3 —— 揪到我自己 Day 2 判斷錯咗

Day 2 我喺 checklist 寫「`CONNECTOR_KEYS` 自動 derive,`integration-status.service.spec` 全綠零改動」。

**錯。** `list()` 其實係**手寫陣列**。條 test 叫 `reports all four connectors`,而佢**仍然綠** —— 正正因為 `n8n-license` **根本冇出現喺 `/admin/integrations`**。

> **「test 全綠」唔等於「嘢做咗」。** 我當時見到綠就推斷咗一個機制(derive),冇去讀 `list()`。

修:`list()` 補 row + `n8nLicenseSelected()`;條 test 改成由 `CONNECTOR_KEYS` derive。

**呢個係第四次撞同一種毛病**(probe G2 手抄 4 個 key / TD-1 audit options 手抄 / `list()` 手寫 / 條 test 手抄)。共通點:**靠人手同步嘅清單,就係一個等緊 stale 嘅清單**。

secret 硬紅線:`N8N_LICENSE_WEBHOOK_KEY` + base URL 餵入 G1 leak test。**fails-before** 把 `lastSuccessNote` 改成真係塞個 secret → leak test 真紅(連帶 note 條 test 都紅)→ 還原。

### ⚠️ 順帶揪到一個既有缺口,**冇順手修**

`n8nLicenseSelected()` 同既有 `n8nSelected()` 一樣**只讀 env**,而 runtime factory 係 **DB-then-env** ⇒ **經 UI 改咗 DB override,呢個面板仍然顯示 `inactive`** —— 面板話「未啟用」而平台其實已經行緊 n8n。

冇修,因為修佢要畀 `IntegrationStatusService` 攞 resolver,**同時**會改埋 `n8n-outbound` 個 state ⇒ 超出 W39 範圍(H3)。**一次過修兩行先係啱嘅做法**,而唔係喺庚順手改一行。→ **follow-up 候選**。

### Verify

| 項 | 結果 |
|---|---|
| api test | **499 / 499**(47 suites)—— Day 2 收 487,+ contract 10 + status 2 |
| lint / tsc | **0 / 0** |
| fails-before | **兩次**(contract 分岔 · secret 洩漏),兩次都精準紅 → 還原 `grep` = 0 |

---

## Retro

### 呢個 phase 最值得記嘅一件事

**六次被自己嘅守門攔住**,冇一次係「跑個 test 見綠就算」:

| | |
|---|---|
| ① | `secret()` 喺 `try` 內求值 ⇒ 配置錯誤扮成 vendor outage |
| ② | `PROBEABLE` 加咗但冇分支 ⇒ 撳 n8n 測試會探 ServiceNow |
| ③ | W38 boundary test 捉到 probe import ⇒ 收緊而唔係放寬 |
| ④ | 字串 test 撞到 comment ⇒ 改 match import path |
| ⑤ | `reports all four connectors` 仍然綠 ⇒ 揭穿新 connector 根本冇顯示 |
| ⑥ | 自己寫咗條永遠綠嘅廢話 test ⇒ 刪 |

②⑤ 兩次都係**同一個結構**:一個**手抄清單**假裝自己係完整清單。加咗新嘢,清單唔會自己知。兩次都改成由 inventory derive。

### 學到

**「查證」唔止係查 code,仲要查自己嘅推論。** Day 2 我見 `integration-status.service.spec` 全綠,就寫低「自動 derive」。個推論合理,但係**假**。真正該做嘅係讀 `list()` —— 兩分鐘嘅事。**綠色係一個關於 test 嘅事實,唔係一個關於 code 嘅事實。**

### anti-patterns 自檢

| AP | 判定 |
|---|---|
| **AP-1 假驗收** | ✅ 兩次 fails-before,每條硬紅線都證過會紅 |
| **AP-2 mock 當 real** | ⚠️ **本 phase 最大風險,已明標** —— 全程冇真 n8n。緩解 = 所有 mapping 對住**實讀 workflow JSON**;真切換**明文未驗**,寫入 ADR + BACKLOG + plan §1 |
| **AP-3 stale 數字** | ✅ 順手修咗兩個手抄清單;揪到 ADR D2 四處同 workflow 對唔上 |
| **AP-4 silent scope drift** | ✅ H1 STOP + approve + changelog;env-only 缺口**明標唔修**(H3) |
| **AP-5 over-engineering** | ✅ `listUsersBySku`/`checkSync`/`ritmId` 全部零 caller 唔加 |
| **AP-6 fallback 假象** | ✅ 掣嘅預設方向明文:非 `'n8n'` 一律落 Graph |
| **AP-7 stale process** | N/A(本 phase 無 live) |
| **AP-8 SKU 靠名** | ✅ 全程 `skuId` GUID |
| **AP-9 跳 sync gate** | ✅ `not_synced`→null 兩邊一致,contract test 專門守 |
| **AP-10 對帳撈錯數字** | ✅ `reconcile` 零改動,boundary test 仍鎖 |
| **AP-11 驗錯 checkout** | N/A |
| **AP-12 冇驗「唔應該發生」** | ✅ probe 三條負面斷言 · `no_seats` 兩邊都產生唔到 · secret 零洩漏 |

### 🚧 Carry-over

1. **真切換零 live 驗證** —— n8n secret 仍 `CHANGE_ME_SHARED_SECRET` · UAT 未接通 · 平台未部署。**唔可以當通過。**
2. **`integration-status` 只讀 env 唔讀 DB override** —— 影響 `n8n-outbound` + `n8n-license` 兩行,要一次過修。
3. `SESSION_SUMMARY` / runbook 08 切換前置 —— 待環境通咗先寫先有意義。

**Status**:✅ **closed**。**下一個 = 辛**(`TicketUpdateProvider`),號碼 **W40**。

---
