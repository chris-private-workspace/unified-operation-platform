---
phase: W36-n8n-intake-adapter
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
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

## Retro(填於 phase 結束)

### What worked

### What didn't work / unexpected friction

### Surprises / discoveries

### Carry-overs to W37

### ADR triggers

### Phase Gate result
- G1 … G9

### Phase status
- Closeout commit:`<hash>`
- Frontmatter status flipped to `closed`
- BACKLOG synced(R7)
- Phase W37 kickoff trigger:己 —— `LicenseOperationsProvider` + `GraphLicenseProvider`(純重構)

---

**End of W36 progress**
