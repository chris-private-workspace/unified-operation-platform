---
phase: W36-n8n-intake-adapter
name: "戊:n8n inbound intake adapter(場景一打通)"
sprint_week: W36
start_date: 2026-07-26
end_date: 2026-07-30          # planned, may slip with changelog log
status: closed                # draft | active | closed —— 2026-07-27 收官,見 §7 changelog v1.3
spec_refs:
  - ADR-0017 D4(inbound intake adapter · fail-closed · 唯一命中規則)· D0(只換執行器唔換決策者)
  - ADR-0008 D2/D4/D6(inbound 方向① · 本地 mirror · REQ/RITM 兩層)
  - W24-request-intake/CONTRACT.md(**LOCKED** canonical 合約 —— 本 phase 一個字都唔改)
  - docs/05-usage/N8N-INTAKE-HANDOFF.md §0(兩個「E5」歧義)· §7 落差 #1/#5
  - docs/06-reference/03-n8n-workflow/phase 1/1001(`WF1 - Prepare UOP Intake`)· 1005(排程鏡像,Call node DISABLED)· 1002(`deptMapping` 18 個 Job Function)
prior_phase: W35-data-initialisation
---

# Phase W36 — 戊:n8n inbound intake adapter

> **Plan version**:1.2(**active** — F1 三個發現拍板,新增 F1b + F1c;**F2 解封**)
> **Owner**:AI(執行)
> **Approved by**:**Chris Lai**(2026-07-27;同日拍板 **OQ-1 = code 常數表** · **OQ-2 = 平台新增一個 OpCo**)

## 1. Scope

ADR-0017 rollout 第一階段。**場景一(n8n onboarding → 平台)係唯一 blocker**:n8n 側 `WF1 - Prepare UOP Intake` 已經鋪好並且 retry 3×,但佢送嘅 payload 同平台 `POST /requests/intake` 嘅 LOCKED 合約**六項對唔上**,現狀一 push 必 400。

本 phase 交付一條 **adapter route**:`POST /requests/intake/n8n` 收 n8n 原生信封 → resolve 三個識別值 → 轉成 canonical DTO → 交**完全不變**嘅 `IntakeService`。canonical route 同 `CONTRACT.md` 一個字都唔改,adapter 係另一條 route,LOCKED 合約對其他 caller 嘅嚴格性完全保留(ADR-0017 D4)。

**唔做(明確 out-of-scope)**:
- 己/庚/辛 三個階段(`LicenseOperationsProvider` / `N8nLicenseProvider` / `TicketUpdateProvider`)—— 另行 kickoff
- 改 `IntakeService` 任何一行(adapter 之後就係既有路徑)
- 改 canonical `POST /requests/intake` 或 `CONTRACT.md`
- 修改 n8n 側任何 workflow(1005 個 DISABLED node 由 Chris 喺 n8n UI 開,唔屬 code 交付)
- auto-assign(W24 A2 = 人手 queue,不變)

## 2. Deliverables

### F1 — 對接落差 grounding + `department → opcoCode` mapping 表(**doc,pre-code gate**)

- **Spec ref**:ADR-0017 D4 · `N8N-INTAKE-HANDOFF.md` §7 · `1002` deptMapping
- **Dependencies**:🔴 **OQ-1(mapping 表放邊)必須先由 Chris 拍板** —— 見 §8
- **背景(本 phase kickoff grounding 實查,唔係推測)**:
  - n8n `1002` `deptMapping` **18 個 Job Function key**(亦即 1004 form dropdown 選項):`People & Culture` / `RAPO ASPC` / `RAPO ASPC Warehouse` / `RAPO FNA` / `RAPO IT` / `RAPO IT (RDC2)` / `RAPO SCM` / `RHK CS (engineer)` / `RHK CS (ETC)` / `RHK CS OK` / `RHK CS QNE` / `RHK Digital Operations` / `RHK FNL One Kowloon` / `RHK FNL(Logistic MTL)` / `RHK IT` / `RHK SG Salesman` / `RHK Strategic Innovation` / `RHK MD Office`
  - 平台 `seed.ts` **23 個 `Opco.code`**:`PFU-Asia` / `PFU-HK` / `RAP` / `RAPO/APTC` / `RAPO/ASPC` / `RAPO/FNA` / `RAPO/IT` / `RAPO/IT (RBS)` / `RAPO/SCM` / `RAPP` / `RBS` / `RCN` / `RHK` / `RKR` / `RMS` / `RNZ` / `RPH` / `RSP` / `RTH` / `RTMAP` / `RTMEAP` / `RTW` / `RVN`
  - 🔴 **三個結論**:①格式唔同(空格 vs 斜線:`RAPO ASPC` vs `RAPO/ASPC`)②**多對一**(11 個 `RHK *` Job Function → 一個 `RHK`;`RAPO ASPC` + `RAPO ASPC Warehouse` → 一個 `RAPO/ASPC`)③**`RAPO IT (RDC2)` 喺平台冇對應**(平台只有 `RAPO/IT (RBS)`,**係另一樣嘢**)
  - ⇒ **唔可以靠字串 normalize 自動推導**,必須有一張逐條確認嘅明確 mapping 表
- **內容**:
  - 18 條 Job Function → `Opco.code` 對照草擬,逐條標「確定 / 待確認」,交 Chris 逐條確認
  - `RAPO IT (RDC2)` 單獨標 🔴 open —— 由 Chris 答(對 `RAPO/IT`?定要新增 OpCo?定 n8n 側寫錯?)
  - 明確記低:平台 23 個 code 入面,n8n onboarding 只會產生約 6 個(其餘 17 個唔經呢條路入,係正常,唔係缺漏)
  - 表放邊(code 常數 / DB / `ConnectorConfig`)由 **OQ-1** 決定,F1 只出內容
- **Acceptance criteria**:
  - 18 條全部有明確去向,零「大概係」
  - `RAPO IT (RDC2)` 有 Chris 的明確答案(唔可以由 AI 自己猜)
  - 文件明寫「mapping 表唔係 SSOT snapshot」防 stale(仿 `N8N-INTAKE-HANDOFF` §1 做法)
- **Effort estimate**:3h
- **Owner**:AI 草擬 → **Chris 確認**

### F1b — 新增 OpCo `RAPO/IT (RDC2)`(code + 各環境 ops)

- **Spec ref**:OQ-2 拍板(Chris,2026-07-27)· `apps/api/prisma/seed.ts:8-32` · CH-004(`POST /admin/opcos`)
- **Dependencies**:F1 mapping 表(確認 code 命名)
- **點解單獨拎出嚟**:呢個唔係文件動作,係**改 seed data + 每個已部署環境要補 row**,影響面同 F1 唔同,唔可以藏喺 mapping 表入面。
- **內容**:
  - `seed.ts` `OPCOS` 加一行,跟足既有 `RAPO/IT (RBS)` 格式:`{ code: 'RAPO/IT (RDC2)', company: 'RAPO', costCenter: 'IT (RDC2)' }`
  - 更新 `seed.ts:6` 註解 —— 現寫「The **23** OpCo entities from the FY26 M365 license summary」,但新行**唔係**嚟自 FY26 summary,係嚟自 n8n `deptMapping`。要寫清 provenance,唔可以令將來讀嘅人以為 FY26 表有 24 行。
  - ⚠️ **已部署環境(UAT,W33 已 seed 23 個)**:`seed` 係 `upsert` on `code`(冪等,重跑安全),但 UAT 操作上建議用 CH-004 嘅 `POST /admin/opcos` 補一行,唔使重跑成個 seed
- **Acceptance criteria**:
  - `seed.ts` 加行後重跑 seed **冪等**(既有 23 行零改動,只多一行)—— scratch DB 實跑證
  - 註解 provenance 講得清邊行嚟自 FY26 summary、邊行嚟自 n8n deptMapping
  - **零 schema 改動**(純 data row;`Opco` model 一個字唔改)
  - 記低「UAT / prod 各自要補一次」做 ops carry-over,唔可以當 seed 改完就自動生效
- **Effort estimate**:1.5h
- **Owner**:AI(code)+ **Chris**(確認最終 code 字串 + 各環境補 row)

### F1c — n8n 側 WF1 改動指示(doc,交 Chris 執行)

- **Spec ref**:`MAPPING.md §0` 發現 B/C 拍板 · `1001` `prepare approval data` return block(實讀)
- **Dependencies**:發現 B/C 已拍板(2026-07-27)
- **內容**:`N8N-WF1-CHANGES.md` —— node 逐個、欄位逐條嘅 before/after
  - **1001**:`WF1 - Prepare UOP Intake` 加 `const p = $('prepare approval data').first().json;`,7 個欄位改讀 `p.*`(`jobFunction` / validated username / derivedEmail / sAMAccountName / `validated: true`)
  - **1005**:`Check Activate Date` + `Prepare Schedule Record` 各加一行存 `jobFunction`;`WF1 - Prepare UOP Intake` 改讀 `ctx.jobFunction`;🔴 **enable `WF1 - Call UOP Intake`**(仍 DISABLED = 排程路徑永遠唔 push)
  - 明確標出**唔好郁**嘅嘢:`_uopNeeded` gate 條件、`licenseItems[]` 來源、`idempotencyKey`
- **關鍵事實(令改動變細)**:`prepare approval data` 個 return **已經有** `jobFunction` 同 validated 三寶(`username` / `sAMAccountName` / `derivedEmail`,註解自寫「validated by 1004」)⇒ 唔使新增任何運算,只係改讀邊個 node
- **Acceptance criteria**:
  - 每個改動都指到具體 node 名 + 具體欄位,零「大概改下」
  - 有平台側驗收表(改好之後平台會見到咩)
  - 講明未改之前平台點反應(拒單 + 回顯實際值),令兩邊可並行
- **Effort estimate**:1.5h
- **Owner**:AI(寫)+ **Chris**(喺 n8n UI 執行)

### F2 — Adapter endpoint + resolver(code)

- **Spec ref**:ADR-0017 D4 · `intake.controller.ts` / `intake-key.guard.ts` / `intake.service.ts`(全部不改)
- **Dependencies**:F1 mapping 表確認 + OQ-1 拍板
- **內容**:
  - `dto/n8n-native-intake.dto.ts` —— n8n 原生信封(`{event, idempotencyKey, sentAt, request:{}, targetUser:{}, licenseItems:[]}`),class-validator 驗到底
  - `intake-adapter.service.ts` —— 三個 resolve + 攤平:
    | 落差 | 解法 |
    |---|---|
    | `licenseCode` → `skuId` GUID | **收喺 `resolveSkuByLicenseCode()` 一個函數**(`MAPPING.md §2.3`):`businessAlias` → `skuPartNumber`,active-only、trim + case-insensitive、**唯一命中**;≥2 候選或 0 命中 = fail-closed。🔴 **絕不** curate SN label 落 `businessAlias`(撞 ADR-0004 allocation-import,單值欄會搶)。4xx 訊息**要回顯收到嘅 licenseCode**(非 PII)—— 呢個就係攞 OQ-4 答案嘅機制 |
    | `request.department` → `opcoCode` | `MAPPING.md §1` **18 條精確 key**;**零 normalize / 零 alias / 零 fallback**(n8n 側 `defaultOU` fallback 絕不照抄);查唔到 = fail-closed |
    | `request.requestId`(REQ number)→ REQ sysId | 既有 `snow.getRecordByNumber(number, 'sc_request')`;查唔到 = fail-closed |
    | `targetUser.email` → `targetUpn` | 直接對應;空 = fail-closed |
    | 冇 `quantity` | 預設 1 |
    | 信封結構 | 攤平成 canonical DTO |
  - `POST /requests/intake/n8n` 掛喺既有 `IntakeController`,**同一個 `IntakeKeyGuard`**(唔另開 key)
  - 順帶收緊 `N8N-INTAKE-HANDOFF` §7 落差 #5:intake 唔檢查 OpCo `active` → adapter resolve 時要求 `active: true`
- **Acceptance criteria**:
  - `IntakeService` / canonical DTO / `CONTRACT.md` **git diff 零改動**
  - 每一項 resolve 失敗都回明確 4xx(講得出邊個值對唔到),**絕不**用估值建單
  - H4:log 唔出 `targetUpn` / email / secret;錯誤訊息唔回顯 payload 全文
  - 冪等不變:同一 REQ 重推 = 返既有 request(靠 `IntakeService` 既有邏輯,adapter 唔自己做)
- **Effort estimate**:6h
- **Owner**:AI

### F3 — H5 test(critical path)

- **Spec ref**:CLAUDE.md §5.5 H5 · §3.4(Graph / SN 一律 mock)
- **Dependencies**:F2
- **內容**:
  - **兩個「E5」歧義 test(硬紅線)**:catalog 有兩行 alias 都命中 → assert **拋錯 + 零 `request.create`**,唔可以揀第一個
  - 三個 resolve 各自 happy / fail-closed
  - OpCo `active: false` → 拒(落差 #5)
  - 冪等:同 REQ number 推兩次 → 一個 request
  - canonical route 迴歸:既有 intake test 全綠、零 assertion 要改
  - **fails-before 實證**:先寫 test 見紅,再寫實作
- **Acceptance criteria**:
  - `apps/api` test 全綠,數目由 **390** 起升(以 kickoff 日實跑為準,唔預填)
  - 歧義 test 有 fails-before 證據記入 `progress.md`
- **Effort estimate**:5h
- **Owner**:AI

### F4 — Live 端到端驗證 + doc-sync

- **Spec ref**:H7(結果類陳述必 trace 真 output)
- **Dependencies**:F2/F3
- **內容**:
  - 用 n8n **真實 payload**(由 `1001` `WF1 - Prepare UOP Intake` 個 return shape 抄出嚟)打本地 adapter,四個 case:401 無 key / 201 建成 / 201 冪等重推 / 4xx resolve 失敗
  - DB 實查建成嘅 `Request` + `RequestLineItem`(REQ sysId 反查對唔對、skuId 係咪 GUID、opcoId 對唔對)
  - doc-sync:`N8N-INTAKE-HANDOFF.md` §0 / §7 落差 #1(blocking → 由 adapter 解決)+ #5(已收緊)· `N8N-INTEGRATION-SETUP.md` 加 adapter route
- **Acceptance criteria**:
  - 四個 case 有真 curl output 貼入 `progress.md`(唔可以總結成「pass」)
  - DB 實查有真 row 輸出
  - ⚠️ ServiceNow 反查呢步需要**可達嘅 SN**;本地唔可達就明寫「未驗證」+ 記做 carry-over,**唔准當 pass**
- **Effort estimate**:4h
- **Owner**:AI

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | mapping 表 18 條全部 Chris 確認 | 18/18 | F1 文件 + Chris 覆 | **Yes** |
| G2 | `IntakeService` / canonical DTO / `CONTRACT.md` 零改動 | 0 diff | `git diff --stat` 該三個檔 | **Yes** |
| G3 | 兩個「E5」歧義 fail-closed | 拋錯 + 零 create | F3 硬紅線 test(fails-before) | **Yes** |
| G4 | 每項 resolve 失敗都 fail-closed 且訊息可診斷 | 4/4 | F3 test + F4 live | **Yes** |
| G5 | api test 全綠且不降 | ≥ kickoff 實跑值 | `npm test -w apps/api` | **Yes** |
| G6 | 端到端 4 case 有真 output | 4/4 | `progress.md` 貼真 curl | **Yes** |
| G7 | H4:回應 / log 零 PII 零 secret | 0 | 餵假 secret + assert 零洩漏(仿 W30 G1) | **Yes** |
| G8 | lint 0 warning | 0 | `npm run lint` | Yes |
| G9 | doc-sync 完成(handoff §0/§7 + INTEGRATION_SETUP) | 3 處 | diff | Yes |

## 4. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | ~~🔴 `RAPO IT (RDC2)` 平台冇對應~~ | — | — | ✅ **已解(OQ-2,2026-07-27)**:Chris 拍板**平台新增** `RAPO/IT (RDC2)` → **F1b**。殘留風險轉為「已部署環境要各自補 row」(見 F1b acceptance) |
| R2 | REQ number 反查依賴 **SN 可達**;本地 / UAT 現時 SN 憑證係 placeholder(W33 D3) | High | Med | F4 明寫「未驗證」唔當 pass;可考慮 mock SN 驗 adapter 邏輯,真 SN 留 `DEPLOY-harden`<br>→ **實際落地(2026-07-27)**:行咗 mock SN 路線。**證到** adapter→`IntakeService`→DB 通、反查用啱 `sc_request` + 用啱 REQ number;**未證** 真 SN 回應。🔴 **R2 仍然 active**,轉 carry-over |
| R3 | 🔴 **1005 排程路徑 `WF1 - Call UOP Intake` 仍 DISABLED** ⇒ 只驗即時路徑 = 半條路 | **已確認** | High | 驗收要涵蓋兩條;n8n 側開 node 由 Chris 做,平台側 adapter 對兩條路徑係同一個 endpoint(payload 由 `execution_context` 重建,shape 相同)—— 需喺 F4 對比兩個 payload shape 確認真係一樣<br>→ **F4 實讀兩個 node 確認 shape 完全一致** ✅(差別只喺取值來源)。node 仍 disabled,**轉 carry-over(Chris)** |
| R4 | licenseCode 對照除咗「E5」歧義,其他 code 亦可能歧義或缺 alias | Med | High | 唯一命中規則覆蓋所有 code,唔止 E5;F1 順帶列出 catalog 現有 alias 覆蓋率 |
| R5 | n8n 實際 payload 同我讀嘅 `WF1 - Prepare UOP Intake` return shape 有出入(workflow 可能已改) | Med | High | F4 用**當日** n8n 真 payload 對一次;唔一致即停,唔照自己讀嗰份寫死<br>→ ✅ **無出入**(2026-07-27 實讀兩個 node 逐欄對 DTO)。但**反而喺接線層揪出兩個新問題**:冇送 `X-Intake-Key`(blocking)· `licenseCode` 可為 `null` → 見 `N8N-WF1-CHANGES.md §2.5/§2.6` |
| R6 | adapter 令 intake 多咗一條路,將來兩條路行為漂移 | Low | Med | adapter **只做 resolve + 攤平**,零業務邏輯;所有建單行為留 `IntakeService` 一份 |

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables targeted |
|---|---|---|---|
| D0 | 2026-07-26 | Kickoff(本 folder)+ grounding 已做 | — |
| D1 | 2026-07-27 | F1 mapping 表草擬 → **交 Chris 確認 18/18**(G1)+ F1b seed row | F1, F1b |
| D2 | 2026-07-28 | F2 DTO + resolver + endpoint | F2 |
| D3 | 2026-07-29 | F3 test(fails-before 先行) | F3 |
| D4 | 2026-07-30 | F4 live + doc-sync + closeout | F4 |

## 6. Dependencies on Prior Phase

Carry-over from `W35-data-initialisation/progress.md` retro:
- **與本 phase 無直接依賴**(W35 係數據初始化,本 phase 係 intake 路徑)
- 但 **DD-3**(`POST /license/ledger` 建空 row 缺失)同本 phase 無關,唔喺此解
- W35 教訓沿用:**scratch DB 真驗**(`feedback_scratch-db-verification`)—— F4 建單驗證行同一套,唔碰 dev DB

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-26 | Initial plan(draft) | ADR-0017 Accepted → 戊階段 kickoff | 待 Chris |
| 2026-07-27 | **v1.1 · draft → active** | OQ-1 拍板 **code 常數表** · OQ-2 拍板 **平台新增 OpCo** → 新增 **F1b**(seed row + 各環境補);R1 由「未解風險」轉「已解 + ops carry-over」;D-day 表加 F1b | **Chris Lai** |
| 2026-07-27 | **v1.3 · active → closed** | Phase 收官:G1-G9 全部達標(G6 以 mock SN 達成,誠實邊界已標)。OQ-3 收貨;R2 / R3 轉 carry-over;R5 已驗且反揪出兩個接線問題。計劃外改動一項:`mock-servicenow.js` GET query form 修正(R3 已 log) | **Chris Lai** |
| 2026-07-27 | **v1.2 · 新增 F1c**(n8n 側改動指示) | F1 grounding 揪出**三個發現**(A RDC2 `description` 已係 `RAPO/IT` · B WF1 送 AI 抽自由文本非 form `jobFunction` · C payload 用未驗證資料 `validated:false`),Chris 五項全拍板 → 發現 B/C 需 **n8n 側改動**,故新增 F1c 交付精確改動指示;F2 `licenseCode` resolve 收窄成 `resolveSkuByLicenseCode()` 一個函數(OQ-4 未有答案亦唔返工);`department` resolve 明訂**零 fallback** | **Chris Lai** |

## 8. Open Questions(**blocking F2**)

| # | 問題 | 選項 | 狀態 |
|---|---|---|---|
| **OQ-1** | `department → opcoCode` mapping 表**放邊**? | (a) code 常數表 · (b) 新 DB model / `Opco` 加欄 · (c) `ConnectorConfig` JSON 欄 | ✅ **拍板 (a) code 常數表**(Chris,2026-07-27)—— **零 schema、零新 ADR**,改動進 git diff 睇得到、test 鎖得住;同 n8n 側 `deptMapping` 本身 hardcode 一致。否決 (b)[為 18 條幾乎唔改嘅對照觸發 H1 schema,唔值]· (c)[`ConnectorConfig` 設計係 per-connector 非機密**標量**欄,塞 map 屬扭曲用途,resolver + audit 白名單都要特例] |
| **OQ-2** | `RAPO IT (RDC2)` 對邊個 `Opco.code`? | 對 `RAPO/IT` · 平台新增 · n8n 側改 · fail-closed | ✅ **拍板:平台新增一個 OpCo**(Chris,2026-07-27)→ **F1b**;code 跟 `RAPO/IT (RBS)` 格式 = `RAPO/IT (RDC2)`(最終字串待 F1b 確認)。**零 schema**(純 data row) |
| OQ-3 | adapter 用同一個 `INTAKE_API_KEY`,定另開一條? | ★ 建議同一個(同一個 caller、同一個信任邊界,多開一條 key 只多一個要輪換嘅 secret) | ✅ **收貨:同一個 key**(2026-07-27 F4)—— 兩條 route 共用同一個 `IntakeKeyGuard`,live 驗過(無 key → 401、有 key → 201)。要另開一條的話係新決定,`.env` 多一個 var + guard 分流,唔影響已交付嘅嘢 |
| **OQ-4** | WF1 `licenseCode` 來源 = SN catalog `License` variable,實際值未知 | (i) code 常數表 · (ii) `SkuCatalog` 加 nullable 欄(H1) · (iii) 用 `businessAlias`(❌ 撞 ADR-0004) | 🟡 **值暫時拎唔到 → 按 `MAPPING.md §2.3` 規劃先行,唔 block F2**(Chris,2026-07-27)。resolve 收喺一個函數;4xx 回顯實際值 = 第一張真單自動交答案;屆時先揀 (i)/(ii) |

> **F1 階段全部 OQ 已處理**:OQ-1 ✅ · OQ-2 ✅ · OQ-3 用建議值 · OQ-4 🟡 已規劃。**F2 解封**(仍受 G1 以外零阻塞)。

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 7 節 changelog,小 detail 變動可直接 inline edit。
