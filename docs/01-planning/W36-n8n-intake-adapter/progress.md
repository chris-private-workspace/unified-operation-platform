---
phase: W36-n8n-intake-adapter
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed         # in-progress | closed —— 2026-07-27 收官,見 Retro
---

# Phase W36 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-26: Kickoff

**Action**:Phase W36 kickoff(ADR-0017 rollout **戊** 階段)

- Templates copied from `_templates/phase/`
- `plan.md` filled,status = **`draft`**(⚠️ **未 flip active** —— OQ-1 / OQ-2 未拍板,見 plan §8)
- `checklist.md` derived from plan deliverables
- Carry-over from W35 retro:與本 phase 無直接依賴;沿用「scratch DB 真驗」做法

### Kickoff grounding(未落 code 前實查,結果直接改咗 plan)

寫 plan 之前查證 ADR-0017 D4 講嘅「`department → opcoCode` resolve」到底做唔做得到。**答案係:唔可以自動推導。**

| 來源 | 實查方法 | 結果 |
|---|---|---|
| n8n Job Function | 抽 `1002` node `1. Input Parser + Data Enrichment` 嘅 `deptMapping` key | **18 條** |
| 平台 OpCo | `grep "code:" apps/api/prisma/seed.ts` | **23 條** |

**18 條**:`People & Culture` / `RAPO ASPC` / `RAPO ASPC Warehouse` / `RAPO FNA` / `RAPO IT` / `RAPO IT (RDC2)` / `RAPO SCM` / `RHK CS (engineer)` / `RHK CS (ETC)` / `RHK CS OK` / `RHK CS QNE` / `RHK Digital Operations` / `RHK FNL One Kowloon` / `RHK FNL(Logistic MTL)` / `RHK IT` / `RHK SG Salesman` / `RHK Strategic Innovation` / `RHK MD Office`

**23 條**:`PFU-Asia` / `PFU-HK` / `RAP` / `RAPO/APTC` / `RAPO/ASPC` / `RAPO/FNA` / `RAPO/IT` / `RAPO/IT (RBS)` / `RAPO/SCM` / `RAPP` / `RBS` / `RCN` / `RHK` / `RKR` / `RMS` / `RNZ` / `RPH` / `RSP` / `RTH` / `RTMAP` / `RTMEAP` / `RTW` / `RVN`

**三個結構性落差**:
1. **格式唔同** —— `RAPO ASPC`(空格)vs `RAPO/ASPC`(斜線)
2. **多對一** —— 11 個 `RHK *` Job Function → 一個 `RHK`;`RAPO ASPC` + `RAPO ASPC Warehouse` → 一個 `RAPO/ASPC`
3. 🔴 **`RAPO IT (RDC2)` 平台冇對應** —— 平台得 `RAPO/IT (RBS)`,**係另一樣嘢**,唔可以當同一個

⇒ 直接後果:plan 加咗 **F1(mapping 表,pre-code gate)**、**R1**(RDC2 無對應)、**OQ-1**(表放邊)、**OQ-2**(RDC2 點算)。**唔准 AI 自己猜 RDC2 對邊個。**

### 未 flip `active` 嘅原因

R1 要求 multi-day implementation 前有 approved pre-doc。本 plan 有兩條 blocking OQ 要 Chris 答,答完先 flip `active` 並 lock。F1 可以喺 draft 狀態下先做草擬(純 doc,零 code),但 **F2 code 唔可以開始**。

### 已知外部條件(非本 phase 可解)

- ⚠️ **1005 排程路徑 `WF1 - Call UOP Intake` 仍 DISABLED**(R3)—— n8n 側由 Chris 開,平台側兩條路徑同一個 endpoint
- ⚠️ **SN 憑證係 placeholder**(W33 D3)⇒ REQ number 反查嘅真 live 驗證可能做唔到(R2),做唔到就明寫「未驗證」
- 🔴 **`docs/06-reference/03-n8n-workflow/` 仍 untracked 且未 gitignore,內含明文 WinRM 密碼**(ADR-0017 附錄 #1)—— 本 phase commit 前必須處理,否則會連密碼一齊入 history

**Commit**:_(待 commit)_ — `chore(planning): kickoff W36 n8n-intake-adapter`

### OQ 拍板(2026-07-27,Chris Lai)—— plan v1.1,`draft` → `active`

| OQ | 決定 | 影響 |
|---|---|---|
| **OQ-1** mapping 表放邊 | **code 常數表** | 零 schema、零新 ADR;否決 DB model[為 18 條幾乎唔改嘅對照觸發 H1,唔值]同 `ConnectorConfig`[設計係 per-connector 非機密**標量**欄,塞 map 屬扭曲用途] |
| **OQ-2** `RAPO IT (RDC2)` | **平台新增一個 OpCo** | 新增 **F1b**;R1 由「未解風險」轉「已解 + ops carry-over」 |
| OQ-3 intake key | 用建議值(同一個 `INTAKE_API_KEY`) | 低風險,唔 block F2 |

**F1b 點解要單獨拎出嚟**:OQ-2 唔止係填 mapping 表一格 —— 係**改 seed data**,而且 **UAT 已經 seed 咗 23 個 OpCo(W33)**,改 `seed.ts` 只幫到新環境,已部署環境要各自補 row(建議走 CH-004 `POST /admin/opcos`,唔使重跑全 seed)。呢個 ops 步驟藏喺 mapping 表入面就會漏。

順帶:`seed.ts:6` 註解寫「The **23** OpCo entities from the FY26 M365 license summary」—— 新行**唔係**嚟自 FY26 summary 而係 n8n `deptMapping`,provenance 要寫清,唔可以令將來讀嘅人以為 FY26 表有 24 行。

**仍未解**:**G1(Chris 確認 18/18 mapping)**。OQ 答咗「表放邊」同「RDC2 點算」,但 18 條逐條對照未確認 —— F2 個 `department` resolve 等呢張表。

---

## Day 1 — 2026-07-27

### Done

- **F1 交付 `MAPPING.md`** —— 三部分:§1 department 18 條對照 · §2 licenseCode 覆蓋率 · §3 REQ 反查
- 讀 `1002` node `1. Input Parser + Data Enrichment` **原文**(唔靠 regex 抽,regex 第一次抽空咗欄位 → 改為 dump 全段自己讀)
- dev DB `psql` 直查 `SkuCatalog` / `Opco` 真數(踩到 Git Bash `/tmp` 路徑轉換坑 → `MSYS_NO_PATHCONV=1`)

### 實查數字(真 output,非推測)

| 指標 | 值 |
|---|---|
| `SkuCatalog` 總行 / active | 103 / **99** |
| active 有 `businessAlias` | **8** |
| active alias 歧義 | **0** ✅ |
| `Opco` 總 / active | 24 / **23** |

### 🔴 三個發現 —— 改變 F1/F2 前提

**發現 A — `RAPO IT (RDC2)` 個 `description` 已經係 `RAPO/IT`**
逐欄對比 `RAPO IT` vs `RAPO IT (RDC2)`:`description` / `adCompany` / `adDepartment` / `abwFolder` / `logonScript` / `upn` / `office` **七項全部一樣**,唯一分別係 `ou`(`OU=RDC2` vs `OU=One Kowloon`)。⇒ RDC2 係 OU 位置分支,**唔係獨立部門代碼**。**OQ-2「平台新增 OpCo」嘅前提被推翻** —— 拍板嗰陣手上只有「平台冇對應」,未有呢個證據。建議 revisit;決定權喺 Chris。

**發現 B — WF1 送嘅 `department` 唔係嗰 18 條 key**
`WF1 - Prepare UOP Intake` 用 `aiBrain.derivedUserInfo.department`(AI 由 email 抽嘅自由文本),**唔係** 1004 form dropdown 揀嘅 Job Function(`validated.department`)。n8n 自己喺 `prepare approval data` 明確區分兩者,註解寫「action items 用 1004 form 的 Job Function(精確匹配 deptMapping key)」—— 即係 n8n 內部都知 AI 抽嗰個唔可靠,但送畀平台就用咗佢。
⚠️ n8n 側靠 `resolveOU()` 四層 fallback 兜底,**最後一層係 `defaultOU = RAPO/IT`**。平台**絕對唔可以照抄** —— 對 n8n 只係「帳號放錯 OU」,對平台就係 license 靜靜記錯 OpCo,而 ledger + ADR-0016 預算 gate 全部靠呢個數。

**發現 C — WF1 payload 用未驗證資料**
`targetUser.validated: false` 係 n8n 自己標嘅;`username` / `email` 都係 AI 猜嘅 candidate。但 WF1 觸發時機係 1007 執行完(AD 帳號已建),嗰陣 validated 值已經喺 `prepare approval data` 有齊。平台 `targetUpn` 來自呢個 AI 猜嘅 email ⇒ **sync gate 可能永遠唔會過,而且錯得好靜**(唔報錯,只係一直「等緊 sync」)。

### Decisions / Open-Questions Resolved

- 無新拍板。**新開 OQ-4**:SN `License` variable 實際 choice list(WF1 `licenseCode` 來源)—— 平台只有 8 個短碼 alias(`E5`/`PBI Pro`/`F3 Frontline`…),SN 通常用完整 label,**對唔上就每張單 400**
- 修正 `N8N-INTAKE-HANDOFF` §0 一個講法:兩個 E5 嘅歧義**喺 alias 層面而家唔存在**(no-Teams 變體未 curate、冇 alias)⇒ `"E5"` 目前唯一命中。但呢個係碰啱唔係設計保證,F2 唯一命中規則同 F3 歧義 test **照做**

### 五項拍板(Chris Lai,同日 2026-07-27)—— **F2 解封**

| # | 決定 | 後果 |
|---|---|---|
| A | **維持新增 OpCo** `RAPO/IT (RDC2)` | F1b 照做;mapping #6 指**新 code**。連帶記低三件:①平台比 AD 分得更細(AD 側兩者 description 都係 `RAPO/IT`)②`RAPO/IT` 歷史數字同將來唔可直接比 ③新 OpCo `allocated = 0` ⇒ **ADR-0016 預算 gate 上線前要為佢設 allocation,否則一 assign 就被擋** |
| B | **(a) n8n 送 `jobFunction`** | 平台只認 18 條精確 key,**零 normalize / 零 alias / 零 fallback**;n8n `defaultOU`(fallback 落 `RAPO/IT`)絕不照抄 |
| C | **payload 改用 validated 值** | `targetUpn` 直接對得返真 AD 帳號 ⇒ sync gate 唔會白等 |
| OQ-4 | **暫拎唔到 → 規劃先行** | 見下「OQ-4 規劃」 |
| 18 條 | **全部確認** | **G1 達標**;`MAPPING.md` status → `confirmed` |

### F1c 交付(新增 deliverable,plan v1.2)

實讀 `1001` node `prepare approval data` 個 return block,證實**要嘅值全部現成**:

```js
department: department,   // 保留 AI Brain 原始值用於顯示  ← WF1 而家送緊呢個
// User details (validated by 1004)
username, sAMAccountName, derivedEmail,   // ✅ validated 三寶
jobFunction: jobFunction,                 // ✅ 1004 form 精確值 ← 應該送呢個
```

⇒ n8n 改動比預期細好多:**唔使新增任何運算,只係改讀邊個 node**。寫成 `N8N-WF1-CHANGES.md`(1001 七個欄位 + 1005 三個 node,含 🔴 **enable 1005 個 `WF1 - Call UOP Intake`**)。

順帶發現:**1005 比 1001 更接近正確** —— 1005 個 `execution_context` 存嘅 `username`/`derivedEmail` 本來就係 validated(源頭同樣係 `prepare approval data`),只差 `jobFunction` 冇存同 `validated` 標錯 `false`。

### OQ-4 規劃(`MAPPING.md §2.3`)—— 唔等 SN 值,亦唔賭佢係咩

1. resolve order 固定:`businessAlias` → `skuPartNumber`,active-only、trim + case-insensitive、**唯一命中**;≥2 或 0 = fail-closed。冇模糊比對。
2. 🔴 **絕不** curate SN label 落 `businessAlias` —— 佢**已經有 owner**(ADR-0004 allocation-import 靠佢對 Excel 欄名)且係**單值**欄。改咗遷就 SN,import 會靜靜 skip 咗嗰行。**本 phase 最易踩、最靜嘅坑**,已寫入文件防止「見到有個 alias 欄就填」。
3. 4xx 訊息**回顯收到嘅 `licenseCode` 原值**(非 PII)⇒ **第一張真單自己交出 OQ-4 答案**,唔使等 SN admin 出 choice list。
4. 全部收喺 `resolveSkuByLicenseCode()` 一個函數 ⇒ 屆時揀 (i) 常數表 / (ii) 新 nullable 欄,改一個函數 + test,adapter 其餘唔郁。

### Blockers

無 —— **F2 解封**。仍開住但唔 block 嘅四項見 `MAPPING.md §4`「仍然開住」(SN 值 · n8n 未改 · RDC2 allocation · SN 反查未真驗)。

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 | 3.0 | 2.5 | −0.5(grounding 比預期順,但揪出三個發現令 scope 實質變大) |

### Commits
- _(待 commit)_

---

## Day 2 — 2026-07-27:F2 code 寫完,但 **build / test 喺本 worktree 驗唔到**(R1)

### Done

- commit `6bc32c8` —— ADR-0017 + W36 kickoff + F1(9 files;**`docs/06-reference/03-n8n-workflow/` 刻意冇 stage**,因為含明文 WinRM 密碼)
- F2 code:3 個新檔 + 2 個改動
  - `opco-department-map.ts` —— 18 條常數表(OQ-1)+ `opcoCodeForJobFunction()` 精確查,**零 fallback**
  - `dto/n8n-native-intake.dto.ts` —— n8n 原生信封,`event` 用 `@IsIn` 鎖死
  - `intake-adapter.service.ts` —— 三個 resolver + 攤平,cheapest-first(常數 → DB → SN)
  - `intake.controller.ts` —— 加 `POST /requests/intake/n8n`(**同一個 `IntakeKeyGuard`**,OQ-3)
  - `fulfilment.module.ts` —— 註冊 service
- 設計上兩個刻意決定(寫入 code comment):
  - **`accountCreatedAt` / `azureSyncedAt` 一律留 null** —— n8n 冇送,而由 `sentAt` 推導「已 sync」= 憑 n8n 貼文時間開 assign gate。留空即係要平台自己喺 Graph 見到個 user 先算,同 ADR-0015 方向一致
  - **`requesterEmail` 格式唔啱就丟棄** —— canonical DTO 宣告佢係 email,但我哋喺 code 砌 DTO 唔經 ValidationPipe,Outlook 嚟嘅怪值會照存。呢個係 optional metadata,唔值得為佢 fail 一單 onboarding

### 🔴 Blocker —— RISK **R1** 實錘,本 worktree 驗唔到 build / test

| 檢查 | 結果 | 證據 |
|---|---|---|
| **lint** | ✅ **exit 0**(全 repo clean) | 4 個 prettier error 全部喺我新檔 → `--fix` → 重跑 exit 0 |
| **build** | ❌ **exit 1,101 個 TS error** | **但 ANSI-stripped grep 證實我 5 個檔一個 error 都冇**(先前有 1 個 `TS7006 implicit any`,由 stub 類型引起,已加 annotation 修好:102 → 101) |
| **test** | ❌ 跑唔到 | `intake.service.spec.ts` → `TS2339: Property 'PrismaClientKnownRequestError' does not exist on type 'typeof Prisma'` |

**同一個 root cause**:呢個 worktree 嘅 Prisma client **從來冇 generate 過** —— `node_modules/.prisma/client/index.d.ts` 得 **3989 bytes**(stub;真嘅係幾百 KB),而且成個 `.prisma` 底下**冇任何 engine binary**。另一個 worktree(`deployment-prepare-...`)一樣。

`npx prisma generate` 失敗:

```
Error: request to https://binaries.prisma.sh/.../query_engine.dll.node.gz.sha256
failed, reason: self-signed certificate in certificate chain
```

加 `--no-engine` 一樣死(佢仍然要 `schema-engine.exe`)。即公司 proxy TLS 攔截,**RISK R1** 原文所述。

⚠️ **冇用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 繞過** —— 嗰個係關掉整個 process 嘅 TLS 驗證,屬安全決定,唔應該由 AI 靜靜做。

### 誠實結論(H7)

**F2 未算完成。** 可以講嘅只有:lint 綠、且喺可做到嘅靜態檢查範圍內我嘅 code 零 error。**未證明**佢 compile 得、未證明行為正確 —— 因為呢個環境根本 type-check 唔到。**F3 亦開唔到工**(test 跑唔起)。

### Blockers

🔴 **Prisma client 未 generate** → build / test 全線封。解封選項(要 Chris 決):
1. **轉流動網路**跑一次 `npx prisma generate`(R1 記錄嘅原有做法,cache 好之後就唔使再落)
2. `NODE_EXTRA_CA_CERTS` 指向公司 root CA(正解,但要由 Windows cert store 匯出)
3. 公司內部 `PRISMA_ENGINES_MIRROR`(如果有)

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1c | 1.5 | 1.0 | −0.5 |
| F2 | 6.0 | 3.5(code 完,驗證未做) | 驗證部分卡 R1,未計入 |

### Commits
- `6bc32c8` — `docs(integration): ADR-0017 n8n 執行接縫化 + W36 戊階段 kickoff & F1`
- F2 code **未 commit** —— 等 build 驗到先

---

## Day 2(續)— 2026-07-27:R1 解封 + F2 驗證 + F3 完成

### 🟢 RISK R1 精確診斷 —— 原來係**兩個獨立問題**,以前混為一談

| 層 | 診斷 | 解 |
|---|---|---|
| **TLS** | `SELF_SIGNED_CERT_IN_CHAIN` | ✅ **Node v22.21.0 `--use-system-ca`**(信 Windows 憑證存放區,公司 root CA 本來就喺入面)。實證:預設 `fetch` → cert error;加 flag → `OK 404` |
| **檔案傳輸** | TLS 通咗之後變 **503** | ❌ 公司 DLP 硬擋。抽 body 出嚟睇:「**File Transfer Blocked** … File name: `query_engine.dll.node.gz`」= **按檔名擋含 `.dll` 嘅下載** |

對照實證:同路徑 `.sha256`(細 text)→ **200**;`.gz` binary → **503 連續三次一致**(body 6816 bytes = 封鎖頁)。`--no-engine` 救唔到(6.19 一樣 fetch)。
⚠️ 全程**冇**用 `NODE_TLS_REJECT_UNAUTHORIZED=0`。

**Chris 轉 hotspot 跑一次**(`NODE_OPTIONS=--use-system-ca npx prisma generate`)→ 507ms 完成。驗:`index.d.ts` **3,989 → 1,088,929 bytes**,`query_engine-windows.dll.node` 在。已寫入 memory `project_prisma-generate-proxy-block`(含「點認呢個病」:stub client → ~101 個假 TS error,而 lint 唔受影響故仍係有效 gate)。

### F2 驗證(engine 到手後)

| 檢查 | 結果 |
|---|---|
| build | ✅ **exit 0 · 0 個 TS error**(之前 101 個全部係 stub 引起,證實無誤) |
| lint | ✅ exit 0 |

### W28 迴歸網再次當日見效

加 `POST /requests/intake/n8n` → `permissions.spec.ts` snapshot **即刻紅**。新增行 =

```
"POST /requests/intake/n8n → m2m []"
```

同既有 `POST /requests/intake → m2m []` 一致 ⇒ 證實 route **正確報成 m2m + `IntakeKeyGuard`**,唔係 `public`、唔係 `unguarded`。確認正確後先 `-u` 更新 snapshot。

### F3 交付 —— `intake-adapter.service.spec.ts`(17 個 test)

**設計決定:wire 真 `IntakeService`(唔 mock)** —— 咁「零寫入」呢個負面斷言先係貫穿成條路徑嘅真證據,而唔係「一個 mock 冇被叫」。

覆蓋:happy path · sync gate 留 null · alias→partNumber fallback · **歧義 fail-closed(紅線)** · 歧義訊息列出兩個候選 · 未知 licenceCode · **未知 Job Function 唔 fallback**(仲 assert 冇掂過 DB / SN,證 cheapest-first)· inactive OpCo(落差 #5)· REQ 查唔到 · **SN 死 → 503 而唔係 400** · H4 唔洩 UPN · 壞 requesterEmail 丟棄 · 冪等 · mapping 表 4 條(18 條齊 / 11 條 RHK 多對一 / RDC2 獨立 / ASPC 合併)

### 🔴 G3 fails-before 實證(唔係口講)

暫時把 `matches.length > 1` 改成 `> 99`(等於拆走歧義守衛)→ 跑紅線 test:

```
● REJECTS an ambiguous licence code and writes NOTHING
  expect(received).rejects.toThrow()
  Received promise resolved instead of rejected
  Resolved to value: {"id": "r1", "opcoId": "o-rhk", "serviceNowSysId": "req-sys-abc", ...}
```

守衛一爛,歧義 case **靜靜建咗一張完整 Request** —— 正正係個 test 要擋嘅失敗模式。確認後即時還原。

### 最終 gate

| # | Criterion | 結果 |
|---|---|---|
| G1 | mapping 18/18 確認 | ✅ |
| G2 | `IntakeService`/canonical DTO/`CONTRACT.md` 零改動 | ✅ 三個檔零 diff |
| G3 | 歧義 fail-closed | ✅ **含 fails-before 實證** |
| G4 | 每項 resolve fail-closed 且可診斷 | ✅ 4/4 |
| G5 | api test 不降 | ✅ **390 → 407**(42 suites 全綠) |
| G7 | 零 PII 零 secret | ✅ |
| G8 | lint 0 | ✅ |
| G6 / G9 | live 4 case · doc-sync | ⏳ **F4 未做** |

### Blockers

無。**F4 剩返**:live 端到端(⚠️ SN 憑證仍係 placeholder,plan R2 —— 反查嗰步大機會要記「未驗證」)+ doc-sync(handoff §0/§7 + INTEGRATION_SETUP)。

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F2(含驗證) | 6.0 | 5.0 | −1.0 |
| F3 | 5.0 | 3.0 | −2.0(真 IntakeService wiring 令 test 寫得快過預期) |
| R1 診斷 | 0(計劃外) | 1.5 | 換返一條永久可用嘅 `--use-system-ca` 解 + memory |

---

## Day 2(續 2)— 2026-07-27:F4 live 端到端 + doc-sync

### 環境:三重隔離,零污染

跑之前發現一件要緊事:**port 3100 跑緊嘅唔係呢個 worktree** —— 實查 `pid=77408` 個 command line 係
`C:\Users\CLai03\unified-operation-platform\apps\api\dist\main`(**另一個 checkout**)。所以個 adapter route 回 404 唔係 stale build,係根本冇我哋啲 code。**冇殺佢**,改為並行起一套:

| 項 | 做法 | 點解 |
|---|---|---|
| Port | **3200** | 唔搶另一棵樹嘅 3100 / 5173 |
| DB | **scratch `w36live`** = dev DB `pg_dump` + 跑 seed | 有真 catalog(103 SKU / 8 個 alias)同真 OpCo,但 **dev DB 全程零改動**;順帶令 RDC2 row 存在 |
| SN | **demo-harness mock**(`demo:mock-sn`) | 唔使真憑證 |
| `INTAKE_API_KEY` | 一個**測試值** | 自己起嘅 instance,根本唔需要真 secret(H4 更乾淨) |
| `.env` | **冇建** | 呢個 worktree 冇 `.env`;全部經 `Start-Process` shell env 傳(§4.4) |

收工:12 條進程按**父子樹**精準清(3200/8980 free、**3100 + 5173 完好**)、`DROP DATABASE w36live`。

### R3 計劃外改動 —— `scripts/demo-harness/mock-servicenow.js`

個 mock 個 GET 分支一律返 **object**,但真 Table API 嘅 query form(`?sysparm_query=number=…`)返 **array**,而 `getRecordByNumber()` 讀 `result[0]` ⇒ **任何 number 反查都會睇落似「搵唔到」**。呢個係 mock 對唔上真 API,唔係將就我。已修成:by-sys_id 返 object、query form 返 array,並定明 `^(REQ|RITM)\d+$` 命中、其餘唔命中,令「搵到」同「搵唔到」兩個結果都測得到而唔使改檔。

### Live 結果(全部真 output,見下)

| Case | 期望 | 實際 |
|---|---|---|
| 1 無 key | 401 | ✅ `401 Invalid or missing intake key` |
| 2 真 payload | 201 | ✅ `201` · `sys-REQ0043858` · opco **RHK** · skuId **`06ebc4ee-…`**(E5) |
| 3 重推 | 冪等 | ✅ **同一個 `id`**;POST 咗 4 次,DB 仍然 1 request / 1 line item |
| 4a 未知 Job Function | 4xx 講得出邊個值 | ✅ `400 Unknown department 'RHK/Information Technology'…` |
| 4b 未知 licence code | 同上 | ✅ `400 Licence code 'Copilot Studio Premium' does not match exactly one active SKU` |
| 4c REQ 不存在 | 同上 | ✅ `400 ServiceNow request 'NOTAREQNUMBER' was not found` |
| 5 `RAPO IT (RDC2)` | 201 落新 OpCo | ✅ 201 · opco **`RAPO/IT (RDC2)`** ⇒ F1b 個 seed row 真係 work |
| 6 `event` 錯值 | 400 | ✅ `event must be one of the following values: license_request_received` |

**DB 實查**:兩張建成嘅單 REQ number → sysId、Job Function → `Opco.code`、licence 名 → **skuId GUID** 全部對;`accountCreatedAt` / `azureSyncedAt` **確認 null**(sync gate 冇被靜靜開);`handledById` null(入 Regional queue);今日 **零** ledger row 被改。

**負面實證(最有價值嗰個)**:6 個被拒 case 喺 DB **零行**,而且**冚唔到 mock-SN log** —— 即係話壞 payload 根本冇打過網絡,**cheapest-first ordering 係真嘅**,唔係我口噏。

### R5 payload 對版 —— 實讀 n8n node,唔靠記憶

實讀 `1001` 同 `1005` 兩個 `WF1 - Prepare UOP Intake` 個 `jsCode`:

- **shape 完全一致** ✅ —— 同樣 key、同樣 nesting、同樣 `licenseItems` map。差別只喺**取值來源**(1001 由 `aiBrain`,1005 由 `execution_context`)。body 表達式亦各自啱(`$json._uopPayload` vs `$json`)。
- 逐欄對 DTO **無落差**;再用**逐字照抄**嘅 shape(含 `openedDate: ""` / `remarks: ""` / nested `variables`)live 打 → **201**。

### 🔴 F4 揪出兩個新嘢(payload 本身冇問題,問題喺接線)

**① `X-Intake-Key` 根本冇送 —— blocking。** 兩個 `WF1 - Call UOP Intake` 個 `parameters` 實際只有
`{method, url, sendBody, specifyBody, jsonBody, options:{}}`,**冇 `sendHeaders`**,`credentials: []`。
即係 n8n 一 enable，**每一 call 都會 401**,一張都入唔到。之前冇人發現,因為由頭到尾冇人真試過。已寫入 `N8N-WF1-CHANGES.md §2.5`。
順帶好消息:URL 係 `$env.UOP_INTAKE_URL` ⇒ **轉去 adapter route 淨係改 env,唔使郁 node**;`onError=continueRegularOutput` 兩邊都設咗 ⇒ fire-and-forget 已合 CONTRACT A3。

**② `licenseCode` 可以係 `null`**(`(it.variables && it.variables.License) || null`)⇒ 平台 400,而且係**成張單**拒收,唔係跳過嗰個 line。實測確認訊息係 `licenseItems.0.licenseCode must be a string`。刻意 fail-closed,但要知代價;呢個亦正正係 **OQ-4 嘅發現機制**。

### ⚠️ 誠實邊界(H7)—— 邊樣**未**驗證

**真 ServiceNow 端到端仍然未驗證。** SN 反查行嘅係 demo-harness mock。證到嘅係:adapter → `IntakeService` → DB 成條路真係通、反查用啱 table(`sc_request`,唔係 default `sc_req_item`)、用啱 REQ number。**未證**:真 SN 回應欄名、真 REQ 查唔查得到、真 `License` variable 係咩值。plan **R2** 仍然開住 → carry-over。

### Doc-sync(三處全做)

- `N8N-INTAKE-HANDOFF.md`:§0 落差 #1 由「blocking」改成「已解」+ **明寫 LOCKED 合約一個字都冇改**;§2 加 RDC2 註記;§7 表 #1/#5 改寫、#3/#4 補充、**新增 #6**(各環境要補 RDC2);**新 §8** 整節 adapter route(對照表 / payload / 三個 resolve / 兩個刻意唔推導 / 點揀);索引 →§9。
- `N8N-INTEGRATION-SETUP.md`:§0 總覽、**新 §1.5**(兩條 route 對照 + 點解開第二條而唔係放鬆第一條)、§1.4 + §5 deploy 前提(補 RDC2 / enable 1005 / header)、§6 索引。
- `N8N-WF1-CHANGES.md`:新 §2.5(三個 blocking wiring 缺口)+ §2.6(`licenseCode: null`)+ §3 驗收表補兩行。

### 迴歸

`npm test -w @uop/api` → **42 suites / 407 tests 全綠,exit 0**;`npm run lint` → exit 0。
(順帶查證:`intake-adapter.service.spec.ts` 喺全跑時顯示 125s 睇落好慢,單獨跑 verbose 後確認 **17 個 test 加埋只係 0.26s**,其餘係 ts-jest 編譯 overhead —— 唔係缺陷,冇改嘢。)

### Blockers

無平台側 blocker。**等 Chris**:n8n UI 三項(header / URL / enable 1005)。

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F4 | 4.0 | 3.5 | −0.5(mock SN 修正 + 隔離環境搭建屬計劃外,但換返「拒收 case 冇打網絡」呢個負面實證) |

### Commits
- _(待 commit)_

---

## Day 2(續 3)— 2026-07-27:SEC-001(phase 收官後嘅安全跟進)

### 事實查證先行 —— 兩個問題定咗成件事嘅性質

1. **`git log --all -- docs/06-reference/03-n8n-workflow` = 零 commit** ⇒ 從來冇入過 history,**唔使改寫歷史**。(對比:`docs/06-reference` 其他子目錄有 4 個 commit,所以**唔可以由「父目錄入過」推論**。)
2. **全目錄掃 10 個 JSON,52 處命中,只有一處係真 secret。** 掃描器刻意只報**位置 + 類型 + 長度,絕不回顯值**。其餘 51 處係:n8n credential **reference**(得 id + name)· 內部 email 地址 · 刻意嘅 `CHANGE_ME` placeholder · `nodeCredentialType`(誤報,值係 type 名 `serviceNowBasicApi`)。

真 secret 精確位置:`1002` → node `Execute Command (Setup ABW Share Folder) (PRD)2`(**disabled**)→ `parameters.command` 第 12 行 —— Python `winrm.Session(..., auth=('<25 字元帳號>', '<12 字元密碼>'), ...)`。

> **一個值得記低嘅教訓**:我原本個掃描器嘅 pattern(`ConvertTo-SecureString` / `-AsPlainText`)**冇**命中佢 —— 因為密碼係 Python tuple,唔係 PowerShell。最後係靠 `corp-account-upn` 間接指到嗰個 node,再用**遮罩輸出**(所有 >3 字元字串 literal 打格)睇結構先定位到。⇒ **單靠「secret 應該長成點」嘅 pattern 一定會漏**,要有第二條路(睇結構,唔係只睇值)。

### 做咗兩樣 + 明確唔做一樣

| | 動作 | 驗證 |
|---|---|---|
| ✅ **scrub** | `auth=(...)` 兩個值 → `<<SCRUBBED_WINRM_USER>>` / `<<SCRUBBED_WINRM_PASSWORD>>` | script **命中恰好 1 處先肯寫**(≠1 即 exit 2 拒寫 —— 靜靜部分 scrub 比唔 scrub 更差);寫完 re-read:**53 個 node 原封 · JSON 仍 parse**;獨立 Grep 全目錄 `winrm.Session` / `auth=(` **只此一處且已是 placeholder** |
| ✅ **gitignore** | `.gitignore` 加 `docs/06-reference/03-n8n-workflow/` | 🔴 **最強證據:`git add -A --dry-run` 而家只會 stage `.gitignore`** —— 連 `git add .` 都再拉唔到嗰個目錄 |
| ❌ **rotate** | **冇做,亦做唔到** | AD 服務帳號密碼要喺 AD / n8n credential store 改,平台側零途徑。**留返 Chris / IT**。⚠️ scrub 只清咗檔案,**清唔到「已洩漏」呢件事** |

### 點解係「scrub + gitignore」而唔係「scrub + commit 消毒版」

呢個決定**唔對稱**,所以行 fail-closed 嗰邊:

- gitignore 之後想收返入 repo → **刪一行**就得,可逆。
- 一旦 commit 咗 → 10 個 workflow 入面嘅內部 email、26KB AI system prompt、基建 hostname、n8n credential id **永遠喺 history**,要清就要改寫歷史。

而且該目錄嘅**真相 SSOT 係 n8n instance 本身**,repo 入面只係 read-only 參考副本 —— 唔入 repo 冇失去 source of truth。理由已寫入 `.gitignore` 註解,唔靠人記住。

---

## Retro — 2026-07-27

### What worked

- **ADR 事前寫,code 後落。** ADR-0017 喺任何 code 之前 Accepted,所以成個 phase 一次都唔使停低問「呢個算唔算架構改動」。三個接縫嘅劃分(邊個可切換、邊個必然唔可以)喺 F2 落 code 時直接變成檔案邊界。
- **「加一條 route」而唔係「放鬆合約」。** G2 全程零 diff:`IntakeService` / canonical DTO / `CONTRACT.md` 一個字都冇改。代價只係一個 adapter service,換返嚟係既有 caller 一個保證都冇失去。
- **fails-before 唔係儀式。** 把 `matches.length > 1` 改成 `> 99` 之後,個 test 唔止變紅,仲印出「靜靜建咗一張完整 Request」嘅 resolved value —— 即係話呢個 test 真係守緊嗰個失敗模式,唔係守緊一個 mock 有冇被叫。**關鍵設計:wire 真 `IntakeService`**,唔 mock。
- **cheapest-first 順序有可觀察嘅證據。** 6 個被拒 case 冚唔到 mock-SN log ⇒ 壞 payload 真係冇打過網絡。呢個係「順序寫啱咗」嘅**行為證據**,唔係讀 code 讀返嚟嘅。
- **實讀 n8n JSON,唔靠記憶。** F1 揪出三個發現、F4 再揪出兩個 —— 五個全部嚟自實讀 node 個 `jsCode` / `parameters`,冇一個係靠「我記得個 workflow 大概係咁」。

### What didn't work / unexpected friction

- **R1(Prisma engine)食咗成日。** 而且一開始診斷錯 —— 當咗係單一個 TLS 問題,實情係**兩層**(TLS + DLP 按檔名擋 `.dll`)。教訓:「同一個 command 失敗」唔代表「同一個原因」,要逐層剝。已寫入 memory,下次唔使再查。
- **101 個 TS error 全部係假嘅。** stub Prisma client 令 build 爆到似天塌,差啲去改自己啲 code 遷就。**識別法**:`node_modules/.prisma/client/index.d.ts` ~3989 bytes = stub(真嘅 ~1MB)。而 **lint 唔受影響,所以嗰陣仍然係有效 gate** —— 呢點救咗成個 F2。
- **AP-2 差啲寫落文檔。** doc-sync 初稿令 `N8N-INTEGRATION-SETUP` §0「成熟度 ✅」同 §1「production-ready」順理成章咁覆蓋埋 adapter route,但 adapter route 未經真 SN / 真 n8n。收 phase 跑 `anti-patterns` 先揪返出嚟。**skill 有用就係喺呢種地方** —— 自己寫嗰陣完全睇唔到。

### Surprises / discoveries

1. 🔴 **兩個 `WF1 - Call UOP Intake` 完全冇送 `X-Intake-Key`。** 無 `sendHeaders`、`credentials: []`。一 enable 就全部 401,一張都入唔到。呢個 node 存在咗好耐,冇人發現係因為由頭到尾冇人真試過。**最大單一發現。**
2. **port 3100 跑緊嘅係另一個 checkout**(`C:\Users\CLai03\unified-operation-platform`),唔係呢個 worktree。新 route 回 404 唔係 stale build —— 重啟幾多次都唔會有我啲 code。已加成 **AP-11**。
3. **`licenseCode` 可以係 `null`** → 成張單 400,唔係跳過嗰個 line。刻意 fail-closed,但代價要知。
4. **`UOP_INTAKE_URL` 係 `$env`** ⇒ 轉去 adapter route 淨係改 env,唔使郁 node。意外地平。
5. demo-harness 個 mock SN 嘅 GET query form **本來就同真 Table API 唔同**(返 object vs array),即係話呢條反查路徑以前根本冇人用 mock 驗過。

### Carry-overs

> 📗 **C1–C4 + C6 已收埋做一份可執行 runbook:`docs/13-deployment/08-n8n-integration-go-live.md`**(平台側前置 / n8n 三項接線 / SEC-001 rotate 三步 / 分階段驗收表 401→400→503→201)。下面留返索引。

| # | 項 | 誰 | 去邊 |
|---|---|---|---|
| C1 | 🔴 **真 SN 端到端未驗證**(R2,憑證 placeholder) | 平台 | `DEPLOY-harden` |
| C2 | ~~🔴 **n8n UI 三項**~~ → ✅ **Chris 已完成(2026-07-27)** | — | — |
| C3 | **各環境補 OpCo `RAPO/IT (RDC2)`**(本機 dev DB / UAT / prod 各一次,走 `POST /admin/opcos`) | 平台 ops | deploy checklist |
| C4 | `RAPO/IT (RDC2)` allocated = 0 → **ADR-0016 預算 gate 上線前要設 allocation**,否則該 OpCo 一單都落唔到 | 平台 | ADR-0016 實作 phase |
| C5 | **OQ-4**:SN `License` variable 實際值仍未知 —— 第一張真單嘅 4xx 會自報 | — | 屆時揀 (i) 常數表 /(ii) schema 加欄 |
| C6 | ~~🔴 `docs/06-reference/03-n8n-workflow/` 明文憑證~~ → ✅ **SEC-001 已收(2026-07-27)**:git history 查證 + scrub + gitignore(平台側)+ **rotate + 拆走硬寫**(Chris) | — | `BACKLOG` **SEC-001** ✅ |
| **C7** 🆕 | 🔴 **merge ≠ 部署** —— `ci.yml` 只有 lint/build/test,**冇 deploy workflow**。UAT 仍跑 `uat-0cf0cf3`(W34 image),冇 adapter route ⇒ n8n 打過去係 **404**,最易誤判成 n8n 出錯 | 平台 | runbook **§1.0** |
| **C8** 🆕 | 🔴 **n8n UAT ↔ 平台 Azure 環境未接通**(Chris 2026-07-27:需時)⇒ 未通之前連 404 都收唔到,**唔好跳級 debug** | Chris | runbook **§1.0b** |

### ADR triggers

**無新 ADR。** ADR-0017 喺 phase 開始前已 Accepted,整個 phase 冇踩出佢範圍:零 schema 改動(seed data ≠ schema)、零新 runtime dependency、零 scope 外功能。

### Phase Gate result

| # | Criterion | 結果 |
|---|---|---|
| G1 | mapping 18/18 Chris 確認 | ✅ |
| G2 | `IntakeService`/canonical DTO/`CONTRACT.md` 零改動 | ✅ 零 diff |
| G3 | 兩個「E5」歧義 fail-closed | ✅ **含 fails-before 實證** |
| G4 | 每項 resolve fail-closed 且可診斷 | ✅ 4/4,live 逐個 400 訊息貼咗真 output |
| G5 | api test 全綠且不降 | ✅ **390 → 407**(42 suites) |
| G6 | 端到端 4 case 有真 output | ✅ **做咗 8 個**。⚠️ **SN 係 mock**,誠實邊界已標(見 C1) |
| G7 | H4 零 PII 零 secret | ✅ test + live 訊息只回顯 licenseCode / JobFunction / REQ number |
| G8 | lint 0 | ✅ |
| G9 | doc-sync 3 處 | ✅ 3 處 + `N8N-WF1-CHANGES` §2.5/§2.6 |

**9/9 達標**(G6 附 mock 邊界說明)。

### SEC-001

收官後嘅安全跟進,獨立記喺上面 **Day 2(續 3)**。一句總結:**技術面已封**(從來冇入過 history + 已 scrub + 已 gitignore),**淨低 rotate 要 Chris / IT 做**。

### Phase status
- Commits:`6bc32c8`(ADR + F1)· `9b5b2b3`(F1b/F2/F3)· `3a04a53`(F4)· `68fc5dc`(收官)· SEC-001(本次)
- `plan.md` / `checklist.md` / `progress.md` frontmatter 已 flip `closed`
- BACKLOG synced(R7)
- Phase W37 kickoff trigger:**己 —— `LicenseOperationsProvider` + `GraphLicenseProvider`(純重構,零行為改變)**

---

**End of W36 progress**
