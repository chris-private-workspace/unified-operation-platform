---
change_id: CH-010
title: "履行完成改為 close catalog task(sc_task),RITM 交返 SN workflow 推"
status: proposed          # draft | proposed | approved | active | done | cancelled
created: 2026-07-29
target_completion: TBD    # 🔴 blocked on ADR-0018 OQ-1 / OQ-2
affects_components:
  - apps/api/src/integration/ticket-update (seam ④ 兩個實作)
  - apps/api/src/integration/servicenow (query by RITM → task)
  - apps/api/src/fulfilment/assign.service.ts (只係 note 文案 / 失敗處理,唔改 gate)
  - apps/api/src/fulfilment/outbound-retry.service.ts (repair payload)
spec_refs:
  - ADR-0018(本 change 嘅決策來源,**Proposed**)
  - ADR-0017 D0(只換執行器唔換決策者)· D3(seam ④)· W40 辛(OQ-A / OQ-E / ticketHeldAt)
  - ADR-0011(outbound 失敗佇列 — fail-closed 走同一條路)
  - ADR-0008 D6(一個 line item 一張 RITM)
---

# CH-010 — 履行完成改為 close catalog task,RITM 交返 SN workflow 推

> **Spec version**:1.0(initial)
> **Owner**:AI(執行)· 決策 = Chris Lai
> **Status**:`proposed` —— 🔴 **兩重 gate,兩個都要過先可以開工**
> 1. **ADR-0018 由 Proposed → Accepted**(需 OQ-1 / OQ-2 有答案)
> 2. 本 spec 由 Chris approve(PROCESS R1.change)

## 1. Context (Why)

Chris 2026-07-29:「除咗 requested item 之外,其實係要更新 **catalog task** 嘅狀況,先至可以令 request item close / completed。」

查證(SN dev `ricohapdev` 真連,**只做 GET**)確認三件事:

| # | 事實 | 依據 |
|---|---|---|
| 1 | 平台 direct 路徑**只**寫 `sc_req_item` 嘅 `state`/`close_notes` | `direct-ticket.provider.ts:28-42` |
| 2 | n8n 2004 同 1007 **一樣**只寫 `sc_req_item`;全套 10 個 workflow **`sc_task` 零命中** | `Validate & Build Patch` · `Prepare SN Update` node |
| 3 | SN dev 真數據支持 Chris:`RITM0042590 state=1 stage=execution active=true`,底下 `SCTASK0064121 state=-5 active=true` | 2026-07-29 read-only 查證 |

🔴 **今日嘅失敗模式**:`ServiceNowService` 任何 2xx 就當成功 ⇒ 就算張單因為 task 未完而實際冇 close,平台一樣標記完成、唔入失敗佇列、冇任何 audit 講「其實冇 close 到」。**平台宣稱完成而 SN 側張飛仲開住,兩邊都唔會嘈。**

決策見 **ADR-0018**(方案 B:平台只 close 自己嗰張 task,RITM 交返 SN workflow 推)。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:`closeComplete(sysId)` / `markInProgress(sysId)` 收 **RITM sys_id**,PATCH `sc_req_item`。
- **After**:同樣收 RITM sys_id(**介面唔變**),但內部先由 RITM 反查出平台負責嗰張 `sc_task`,PATCH **該 task**。認唔出唯一一張 → **唔 PATCH 任何嘢**,入 `OutboundFailure`。

### 2.2 In Scope

**D1 — 介面形狀一個字唔改。** `TicketUpdateProvider` 仍然係兩個方法、收 RITM sys_id、返同一個 `TicketUpdateOutcome`。**只改實作寫邊張 record。** 咁樣 `assign.service` 嘅 trigger 邏輯(ADR-0017 W40 OQ-E)同 `ticketHeldAt` 守門完全唔使郁。

**D2 — 新增「RITM → 平台負責嘅 task」解析。** 落 `ServiceNowService`(vendor 層),因為佢係 query SN 嘅地方。
**規則(ADR-0018 D3 已定案)**:查該 RITM 底下 `active=true` 嘅 `sc_task` —— **剛好 1 張**先算命中。

**D3 — fail-closed。** **0 張 或 ≥2 張** → 唔 PATCH,回 `{status:'error'}` + 入失敗佇列。
⚠️ **絕不揀第一個** —— 同 ADR-0017 D4 對 SKU resolve 嘅態度一致。
⚠️ **`≥2` 嘅分支要寫要有 test**,即使 772 張 RITM 抽樣**零反例** —— 抽樣冇出現 ≠ 唔會發生,而嗰個 case 一旦發生,揀錯就係 close 咗人哋張單。

**D3b — state 值(ADR-0018 D3b)**:close 寫 `'3'`,hold 寫 `'2'`。constant 要**寫明出處係經驗值域**(`sys_choice` 即使 admin 帳號都 403),同 `RITM_STATE` 寫明出處係 2004 JSON 一樣。

**D4 — `TASK_TABLE = 'sc_task'` hard-code**,同 `RITM_TABLE` 一樣唔跟 `SERVICENOW_DEFAULT_TABLE`(理由相同:唔畀設定令兩條路分岔)。`RITM_TABLE` **保留**(work note 路徑仍然用)。

**D5 — 兩個實作都改。** direct 同 n8n 都要;n8n 側改 2004 **唔喺本 repo**,所以平台要加硬鎖:**2004 未同步之前,`ticketUpdateProvider = 'n8n'` 要 fail-loud**(見 §3 A7)。

**D6 — 零 schema。** 平台**唔記** task sys_id —— 每次由 RITM 反查。理由:記低就要處理「SN 側換咗 task」嘅同步問題,而反查冇呢個問題;而且 ADR-0018 已宣告零 schema。

### 2.3 Out of Scope（explicit)

- **唔掂 `sc_request`(REQ)** —— ADR-0017 W40 已拍板,其他 line 可能仲開住。
- **唔掂 1007 嘅 AD 類 task** —— RITM 分工邊界不變,只係多咗一層 task 要守同一條線。
- **唔做「close 完再查 RITM 有冇真係 close」嘅確認輪詢** —— ADR-0018 D7 明確唔做(SN 側 async,唔係即時可讀)。
- **唔改** work note 路徑(仍然直連 `ServiceNowService` 寫 RITM,ADR-0017 W40 OQ-A)。
- **唔改** ledger / `reconcile` / stage machine / 預算 gate / audit 權限矩陣。
- **唔改** `TicketUpdateProvider` 介面形狀同 outcome 詞彙。

## 3. Acceptance Criteria

- [ ] **A1** direct 路徑:給定一張有唯一 fulfilment task 嘅 RITM → PATCH 落 **`sc_task`**,**`sc_req_item` 一個 request 都冇發出**(mock 斷言表名,唔係斷言「有 call 過」)
- [ ] **A2** `markInProgress` 同樣落 task(D2)—— 兩個方法唔可以一個落 task 一個落 RITM
- [ ] **A3** **fail-closed 三態**:零命中 / 多過一個候選 → **完全冇 PATCH** + 回 `error` + 入 `OutboundFailure`;唯一命中 → 正常 PATCH
- [ ] **A4** `assign.service` 行為不變:trigger 條件(有 per-line RITM 先 close)、`ticketHeldAt` 守門、失敗唔可以令已成功嘅 assign 變失敗(ADR-0011 OD4)—— 既有 test **全部照樣綠**
- [ ] **A5** `outbound-retry` repair:重發走 **當時選中嗰個 provider**(ADR-0017 W40 OQ-D),而且重發之後仍然係打 task
- [ ] **A6** n8n 實作:2004 未支援 task 之前,`N8nTicketProvider` **fail-loud**(唔可以靜靜當成功,亦唔可以靜靜跌返 direct)
- [ ] **A7** boundary test:`ticket-update.boundary.spec.ts` 加一條鎖住「seam ④ 唔再直接寫 `sc_req_item`」
- [ ] **A8** contract test:兩個 provider 同一組 case 得出同一 outcome 詞彙(沿用 ADR-0017 庚/辛做法)
- [ ] **A9** test 不降 + 新增覆蓋:api ≥ **433**;新 test 至少含 A1 / A3 三態 / A5 / A6
- [ ] **A10** `npm run lint`(api)零 output · `npm run build` OK
- [ ] **A11** 🔴 **live 驗證(dev instance)**:真 close 一張 **測試用** RITM 底下嘅 task → 觀察 RITM 有冇自動推到 Closed Complete(= 實地驗證 ADR-0018 **OQ-1**)。⚠️ **必須用測試單,絕不掂真客戶單**;開工前要有 SN owner 指定嘅 fixture

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| ~~R1~~ | ~~OQ-1 答案係「RITM 唔會自動推」~~ | — | — | ✅ **已消解**(2026-07-29):Chris 拍板「UOP 只需處理 catalog task,RITM 交 SN workflow」⇒ 方案 B 成立 |
| ~~R2~~ | ~~帳號冇 `sc_task` 寫權~~ | — | — | ✅ **已消解**:有寫權(admin 帳號)。⚠️ 但揭出 **least-privilege 缺口** —— 轉 DEPLOY-harden,唔喺本 change 做 |
| R3 | task 識別規則太闊 → close 咗唔屬平台責任嗰張 | **Low**(772 張 RITM 零反例) | **High** | D3 fail-closed:**唯一 active 先做**,0 或 ≥2 都唔郁;**A3 要有 `≥2` 嘅 test**(抽樣冇出現 ≠ 唔會發生) |
| R4 | `sc_task.state` 值寫錯 | Low | Med | 值域由 800 筆真數據反推(`3` 佔 595 且全 inactive);⚠️ 仍係**推斷唔係 instance choice list 確認** —— constant 要寫明出處 |
| R5 | 平台改咗而 2004 冇改 ⇒ 兩條路做緊唔同嘅事(違反 D0) | Med | High | D5 + A6:n8n 路徑 fail-loud;ADR-0018 D6 要求同時更新 n8n sticky note |
| R6 | 反查多咗一個 SN round-trip,每次 close 慢咗 | High | Low | 接受 —— close 唔喺 assign 嘅同步 critical path(失敗會入佇列,ADR-0011 OD4) |

## 5. Effort Estimate

**~1.5 日**(平台側)—— 反查 + 兩個實作(0.5)· fail-closed + test(0.5)· boundary/contract test + live 驗(0.5)。
⚠️ **不含** n8n 2004 嘅改動同 SN 側權限開通,兩者都唔喺本 repo 手上。

## 6. Dependencies

- ✅ **ADR-0018 已 Accepted**(2026-07-29,OQ-1/OQ-2 已答)
- ✅ **OQ-3 / OQ-4 / OQ-5 已由 read-only 查證自解**(見 ADR-0018 D3 / D3b)
- ✅ ServiceNow 連線:2026-07-29 已打通(probe `ok: true`)
- 🔴 **仍然要:A11 嘅測試 RITM fixture**(SN owner 指定;絕不攞真客戶單試 close)
- n8n 側 2004 改動(**唔阻住平台開工**,但阻住切 `n8n-ticket` 掣)
- 🔴 **仍然要:Chris approve 本 spec**(PROCESS R1.change)—— 呢個係最後一重 gate

## 7. Spec Changelog（deviation log）

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-29 | Initial draft(**proposed**) | Chris 指出 catalog task 缺口;查證確認三邊實作都只寫 `sc_req_item`;Chris 揀方案 B 並要求開 ADR + CH | — |
| 2026-07-29 | **五條 OQ 全部解決**,D2/D3 由「待定」寫成具體規則;R1/R2 消解,R3/R4 降級 | **OQ-1/OQ-2** Chris 答(方案 B 成立 · 有寫權)。**OQ-3/4/5** read-only 查證自解:800 筆 `sc_task` 反推 state 值域(`3` 佔 595 全 inactive)· **772 張 RITM 零反例**支持「唯一 active」· `stage` 併入 OQ-1 答案。**spec scope 冇擴,只係把待定項填實** | AI(查證)+ Chris(OQ-1/2) |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
**Gate reminder**:status 由 AI 標 `proposed`,**用戶 review + approve 先可以 `approved` + 開始 code**(PROCESS R1.change)。本 change 額外有 ADR-0018 Accept 呢重 gate。
