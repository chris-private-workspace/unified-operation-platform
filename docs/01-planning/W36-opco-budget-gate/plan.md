---
phase: W36-opco-budget-gate
name: "OpCo 預算 assign 硬 gate + ADMIN 具名 override(ADR-0016 落地)"
sprint_week: W36
start_date: 2026-07-27
end_date: 2026-07-29          # planned, may slip with changelog log
status: draft                 # draft | active | closed —— 等 Chris approve + 答 OQ1
spec_refs:
  - ADR-0016(**Accepted 2026-07-26** — 本 phase 就係佢嘅落地;Decision D1-D7 = 實作規格)
  - DESIGN.md §5(ledger 兩層數字;line 100 已同步「純顯示 ❌ 已不成立」)
  - ADR-0007(`PATCH /license/ledger/:id` = override 之外嘅正路 + `LedgerAdjustment` audit)
  - ADR-0009(AuditLog 契約 · 白名單 before/after · actorType)
  - CH-009(**已完成** — 顯示嘅正是本 phase 將會擋嘅數字)
prior_phase: W35-data-initialisation
---

# Phase W36 — OpCo 預算 assign 硬 gate

> **Plan version**:1.0(**draft** — 等 approve;**OQ1 未答則 F3 scope 未定**)
> **Owner**:AI(執行)· 決策 = Chris Lai
> **Approved by**:_(approve 時填)_

## 1. Scope

**ADR-0016 已 Accepted**(2026-07-26),H1 已解鎖,本 phase 純落地。要做嘅係:喺 `assignLineItem` 加一個 OpCo 預算 gate(`assigned + 1 > allocated` → 拒絕),ADMIN 可帶**必填理由** override 並入 audit;`OPCO_IT` / `REGIONAL` 永遠冇 override。

**🔴 唔做(硬邊界,寫死喺此)**:
- **`reconcile.service.ts` 一個字都唔改** —— 本 phase 只改 `allocated` 嘅「純顯示」性質,**唔掂**「不參與 drift」。對帳方案甲原封(ADR-0016 Context 專門一節,AP-10)。
- **零 schema 改動** —— 唔加豁免欄、唔加 override 記錄表(用既有 `AuditLog` + `RequestEvent`)。若實作中發現要改 schema → **STOP**,回頭問 owner。
- **唔碰 tenant seat gate**(`assign.service.ts:127-132`)。
- **唔做**「預算唔夠自動轉 procurement path」(H3,ADR-0016 D7 明列)。
- **唔改 allocation import**(ADR-0004 invariant 原封)。

## 2. Grounding(2026-07-27 重量,ADR 明文要求)

```
total 148 | alloc_zero 0 | at_or_over 22 | strictly_over 20
```

同 ADR 起草時一致。**但逐行核對後有一個精確化**:

| | 數 |
|---|---|
| `assigned >= allocated` 嘅 row | **22** |
| 其中 SKU 本身 `active = false`(`VISIO_PLAN1` ×3 · `WIN_DEF_ATP` ×3) | **6** |
| ⇒ **實際會被凍結嘅 active 組合** | **16** |

理由:intake 拒 inactive SKU(`intake.service.ts:57-60`),所以 inactive SKU 唔會有新 line item 要 assign ⇒ 嗰 6 個組合永遠撞唔到本 gate。**ADR-0016 寫「22 行」係上界,真實影響面 16。**

Overage 分佈(active 組合):最大 8(`RTMAP/POWERAUTOMATE_ATTENDED_RPA` 36→44 · `RKR/STANDARDPACK` 89→97 · `PFU-HK/SPE_E3` 108→116 · `RCN/Microsoft_365_Copilot` 51→59),最小 0(`RKR/Microsoft_365_Copilot` 38/38 = 剛好用盡)。

## 3. Deliverables

### F1 — Backend gate(critical path)
- **Spec ref**:ADR-0016 **D1**(條件)· **D4**(status code)· **D5**(位置)
- **內容**:
  - `assign.service.ts` 喺 `usageLocation` gate **之後**、`getSubscribedSkus()`(Graph)**之前**加 OpCo 預算 gate —— 本地查詢平過 vendor call,撞預算就唔使打 Graph(D5)。
  - 條件 `assigned + 1 > allocated`。**ledger row 唔存在 = allocated 0 ⇒ 擋**(D1)。
  - `+1` 而唔係 `+ lineItem.quantity` —— 既有 assign 每次只 `increment: 1`(`assign.service.ts:165`),本 phase **唔改**呢個行為。
  - Message 帶實數且 actionable:`OpCo budget exceeded for <partNumber>: <n> assigned of <m> allocated. Raise the allocation or ask an admin to override.`
- **Acceptance criteria**:
  - 未超 → 照 assign(既有行為零改變)
  - `assigned + 1 > allocated` → **400**,且 **Graph `getSubscribedSkus` 一次都冇被 call**(證 D5 位置正確,唔止證 400)
  - ledger row 唔存在 → 一樣 400(唔可以當「冇限制」放行)
  - `assigned = allocated - 1`(最後一格)→ **放行**(off-by-one 守門)
- **Effort estimate**:2.5h

### F2 — ADMIN 具名 override + audit
- **Spec ref**:ADR-0016 **D3**(形狀 + 角色)· **D4**(403 例外)· **D6**(audit)· ADR-0009(契約)
- **內容**:
  - `AssignLineItemDto` 加 `budgetOverrideReason?: string`(既有 DTO,加一欄;`@MinLength` 守空白)。
  - **ADMIN 專有**:非 ADMIN 帶呢個欄 → **403**(唔可以靜靜忽略 —— 靜靜忽略會令 OPCO_IT 以為 override 成功)。
  - `OPCO_IT` / `REGIONAL` 撞預算 → **一律 400,冇 override 路徑**(D3)。
  - Override 成功 → `AuditLog`(`action = ASSIGN`,`actorType: 'user'`,`metadata: { budgetOverride: true, reason, allocated, assignedBefore }`)+ `RequestEvent(ASSIGN)` message 標明 override,令 request timeline 睇得出。
  - 被擋 → **唔寫 AuditLog**(冇狀態改變),只 `logger.warn`(**H4:唔 log UPN**)。
- **Acceptance criteria**:
  - ADMIN 帶合法理由 + 超預算 → assign 成功,`AuditLog` 一條含 `budgetOverride: true` + reason 原文 + `allocated`/`assignedBefore`
  - ADMIN 帶**空白 / 太短**理由 → 400(理由係 audit 價值所在,唔可以塞垃圾)
  - **OPCO_IT 帶 reason → 403**(對照 ADMIN 同一 payload 成功)
  - **REGIONAL 帶 reason → 403**(確認 D3 保守決定真係落實)
  - 被擋嘅 assign **零** `AuditLog` 新增(前後 count 對照)
  - H4:override log 唔含 UPN
- **Effort estimate**:2.5h

### F3 — 前端 override 入口【⚠️ **OQ1 未答,scope 未定**】
- **Spec ref**:ADR-0016 D3 · H6(design fidelity)· CH-009(同一個 line item 區域)
- **問題**:ADR-0016 **冇講前端**。若只做 F1+F2,ADMIN 嘅 override 只能經 curl / `/docs/api` ⇒ 實務上等於冇 override,而 ADR D3 反對「完全冇出口」嘅理由(逼人繞過平台直接用 Graph,反而失去帳)就會重現。
- **兩個選項(見 §5 OQ1)**:
  - **選項 A(建議)** —— 撞預算時 Assign 掣旁出現 ADMIN-only 嘅「Override」路徑:用**既有** `dialog.tsx` + `input.tsx`(W19 已建,零新 primitive)收理由,confirm 後帶 `budgetOverrideReason` 重試。
  - **選項 B** —— 本 phase 只做 backend;前端 override 留下一個 change。ADMIN 暫時經 `/docs/api`。
- **Acceptance criteria(選項 A)**:
  - 非 ADMIN **完全睇唔到** override 入口(proactive gate,同 AUTH-3b `canSeeAdminNav` 同一 pattern);後端 403 仍係真權威
  - Dialog 唔填理由 → 唔可以 submit(前端鏡像後端規則)
  - 撞預算 → 錯誤訊息**顯示實數**(同 CH-009 顯示嘅數字一致,唔可以一個講 36/43 另一個講其他)
  - H6:零新 primitive / 零新色 / **light + dark 都實看** / 一個 view 仍然一個 primary
- **Effort estimate**:選項 A ≈ 3.5h · 選項 B = 0h

### F4 — Test(H5 critical path)
- **Spec ref**:CLAUDE.md §5.5 H5(assign / ledger 更新 = critical path,**必須同步 test**)· §3.4(Graph 一律 mock)
- **內容**:`assign.service.spec.ts` 加 gate 分支(既有已有 5 個 gate 嘅 mock 骨架可沿用);override 路徑 + 角色矩陣 + audit 呼叫。
- **Acceptance criteria**:
  - api test **≥ 390**(現行基線)+ 新增覆蓋:未超放行 / 剛好用盡擋 / 最後一格放行 / row 缺擋 / ADMIN override 成功 / 非 ADMIN 帶 reason 403 / 空白 reason 400 / **撞預算時 Graph 零 call**
  - Graph + ServiceNow 全 mock,零真 tenant
  - `npm run lint`(api)零 output
- **Effort estimate**:2h

### F5 — 部署前置 + runbook
- **Spec ref**:ADR-0016 Negative consequences(「部署前必須重量目標環境並通知操作員」)
- **內容**:
  - 一條可重跑嘅 SQL(落 `docs/05-usage/`),列出目標環境所有 `assigned >= allocated` 組合 + overage + **SKU active 狀態**(因為 inactive 唔算真影響,見 §2)。
  - Runbook 段:上線前跑一次 → 把 active 清單交操作員 → 講明「呢啲組合下一次 assign 會被擋,出路 = ADMIN 加 allocated(`PATCH /license/ledger/:id`,ADR-0007)或具名 override」。
  - 🔴 **同時寫明 §5 OQ2 揭出嘅流程斷點**(procurement 完成後要人手加 allocated)。
- **Acceptance criteria**:
  - SQL 喺 dev 真跑一次,輸出同 §2 對得上(22 total / 16 active)
  - Runbook 明確講出「唔跑呢步就靜靜凍結 N 個組合」嘅後果
- **Effort estimate**:1.5h

## 4. Acceptance(phase 級)

- [ ] F1-F5 各自 acceptance 全過(F3 視 OQ1)
- [ ] api test ≥ 390 + 新分支;lint 零 output
- [ ] **live 對照**:ADMIN override 成功 / OPCO_IT 400 / REGIONAL 403(帶 reason)—— **用 scratch DB 或 dev DB 造一個「剛好用盡」嘅格並還原**,唔可以打真 Graph 完成 assign ⇒ assign 成功那半只可以靠 mock test,live 只驗 **gate 拒絕**路徑(拒絕發生喺 Graph call 之前,所以零 vendor 流量)
- [ ] `reconcile` 零改動(diff 為證)
- [ ] 部署 SQL 真跑過
- [ ] ADR-0016 冇任何 Decision 被靜靜偏離;有偏離 → plan changelog + 問 owner

## 5. Open Questions

| # | 問題 | 影響 | 建議 |
|---|---|---|---|
| **OQ1** | **F3 前端 override 入口做唔做?** | 唔做則 ADMIN 只能經 `/docs/api` override ⇒ ADR D3 反對嘅「冇出口 → 繞過平台」風險部分重現。做則 phase +3.5h | **選項 A(做)** —— override 係 ADR 明文設計嘅一半,冇 UI 等於半個 feature |
| **OQ2** | 🔴 **procurement 完成之後,邊個加 `allocated`?** | **本 phase grounding 揭出嘅流程斷點**:預算爆 → 行 procurement path 買 licence → stage 推到 READY → **assign 仍然撞同一個 gate**(因為 `allocated` 冇變)。即「買咗都 assign 唔到」,除非 ADMIN 手動 `PATCH ledger` 加 allocated | 本 phase **唔自動化**(會掂 ADR-0004 Excel-SSOT 張力),但**必須喺 F5 runbook + F3 錯誤訊息寫明出路**。若 owner 想自動化 → 新 ADR |
| OQ3 | REGIONAL 長遠要唔要 override? | ADR-0016 D3 已 Accepted = 冇。實務上 REGIONAL 係 platform-wide 角色,將來可能要 | 本 phase **照 ADR 做**(冇);要改 = 新 ADR,唔喺 phase 內偷偷放寬 |

## 6. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴 上線即刻凍結 **16 個** active 組合,操作員唔知情就撞牆 | **High**(必然) | High | F5 runbook 強制「上線前跑 SQL + 通知」;F1 錯誤訊息帶實數 + 明講出路;CH-009 已令數字**事前可見**(所以本 phase 排喺 CH-009 之後) |
| **R2** | 🔴 **買咗 licence 都 assign 唔到**(OQ2 流程斷點) | Med | High | F5 runbook + F3 訊息寫明「出路 = 加 allocated」;唔靜靜留一個 dead end |
| R3 | Race condition(兩個操作員同時派最後一格) | Low | Low | **ADR-0016 已明文接受唔解**,並寫明理由(Graph assign 喺 transaction 之前,rollback 會造成「licence 派咗但 ledger 冇 +1」更差)。本 phase **唔可以「順手修好」** |
| R4 | Override 被當成日常操作(繞過預算管理) | Med | Med | 必填理由 + 入 AuditLog + ADMIN-only;`/admin/audit` 可查(ADR-0009)。**唔加額外限流**(過早) |
| R5 | 誤把 `allocated` 拉入 drift 對帳 | Low | **High** | Acceptance 明列「`reconcile` 零改動(diff 為證)」;ADR-0016 Context 已寫死;AP-10 |
| R6 | Live 驗誘惑打真 Graph 完成一次 assign | Med | **High** | Acceptance 明文:live 只驗**拒絕**路徑(發生喺 Graph call 之前 ⇒ 零 vendor 流量);assign 成功那半靠 mock test |

## 7. Dependencies

- **ADR-0016 Accepted** ✅(2026-07-26)—— H1 已解鎖
- **CH-009 完成** ✅(PR #29,`base = main`,open)—— 本 phase branch off CH-009 branch,因為 F3(若做)改同一個 `request-detail.tsx`;**若 CH-009 先 merge 則 rebase 落 main**
- 無新 dependency(H2 不觸發)· 無 schema 改動(H1 不再觸發)

## 8. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-27 | Initial draft(**draft**) | ADR-0016 Accepted 後開 phase;grounding 重量確認 22 行並**精確化為 16 個 active**;揪出 OQ2 流程斷點 | — |

---

**Gate reminder**:status `draft` → **Chris approve + 答 OQ1 先可以 `active` 並開始 code**(PROCESS R1)。
