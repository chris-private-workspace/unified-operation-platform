---
phase: W24-request-intake
status: active
---

# W24 Phase 甲 — Progress

## Day 0（2026-07-15）— kickoff + D0 doc-sync
- **Kickoff**:ADR-0008 Proposed → **Accepted**(Chris);plan draft → **active**。Phase 甲 = 方向① inbound intake(n8n onboarding push → 平台建 mirror)。rollout 次序 Chris 確認:甲 inbound → 乙 outbound-direct → 丙 n8n-outbound → 丁 D365-scope。
- **D0 doc-sync ✅**(ADR-0008 Accepted 帶嚟嘅 scope 真相):
  - `DESIGN §2`:in scope 加獨立 request 建單 / M365+D365 / n8n 雙向;out scope D365 改為只排 D365-side provisioning;加 ADR-0008 更新註。
  - `DESIGN §9 #5`:「M365 only」→ M365+D365 + 獨立 request 建單。
  - `architecture.md §2`:LicenseOps 模組 in scope 更新;out scope D365 license 移除(業務模組仍 future)。
  - `architecture.md §11`:澄清 D365 license(ADR-0008 納入)vs D365 業務模組(future tier)。
  - `BACKLOG`:Active 表加 W24 行 + 頭部最後更新 + 路線更新(R7)。
  - `README`(adr):0008 index 行 Accepted。
  - memory:**✅** 新 `project_adr-0008-request-intake-d365` + MEMORY.md 索引。

**D0 doc-sync 全部完成。**

## Day 0(續)— D1 合約定義(代表性)
- **grounding**:讀現有 fulfilment module —— 發現 `POST /fulfilment/requests`(`IntakeRequestDto`)係 **user-facing**(role + `@CurrentUser` scope),欄位無 sync/line items;`Request` schema 早有 `accountCreatedAt`/`azureSyncedAt`(comment「Phase 1 (n8n) linkage」)。
- **結論**:n8n intake = **獨立新 endpoint**(m2m + 一次過帶完整清單 + 帶 sync gate),唔 fork 現有 user-facing intake。
- **D1 產出 → `CONTRACT.md`**:
  - **m2m auth 拍板**:static API key `X-Intake-Key`(env `INTAKE_API_KEY`,fail-closed 401,零新 dep;升級路徑 = service principal 換 guard)。
  - **代表性 DTO**:`N8nIntakeRequestDto`(targetUpn/opcoCode/SN REQ sysId+number/accountCreatedAt/azureSyncedAt/lineItems[skuId+qty+RITM])+ DTO→schema 對映表 + 為何新 endpoint。
  - **§5 六項待 n8n/Phase 1 team 確認**(SKU 識別 GUID/partNumber · opcoCode · REQ/RITM · sync 語意 · idempotency key · handledById)。
- ⚠️ 誠實:此為**代表性**合約,真實欄位待外部對齊先 lock;D2 可用代表性推進,但真對接卡喺 §5。

## Day 0(續)— D1 深化:對接盲點分析 + agenda
- 分析成套 flow,搵到 **CONTRACT §5(欄位層)之上**嘅流程/時序/可靠性盲點,整理成 **`N8N-AGENDA.md`**(開會即用):
  - **A 組 4 條流程決定(對接前必定)**:A1 intake 單一來源(n8n push vs poll 去重)· A2 誰觸發 assign(自動 vs 人手 queue)· A3 push 唔可 block 現有 onboarding(non-blocking / AD 後發)· A4 sync gate 時序真相(on-prem AD→Entra Connect 延遲,synced≠Graph 即見)。
  - **B 組 6 條 = CONTRACT §5 欄位**(SKU/OpCo 識別 · REQ/RITM · sync 語意 · idempotency · operator)。
  - 每條留「▢ 決定」+ ★ 平台傾向;附「開會後回寫去向」(CONTRACT / 若全自動 assign→ADR / DESIGN §7 / RISK)。
- ⚠️ **A2 若定「全自動 assign」= 新架構面**(auto-assign orchestration,H1)→ 可能觸 ADR-0008 補充 / 新 ADR。

## 下一步
- **對接 n8n team**(用 `N8N-AGENDA.md`)→ 填「▢ 決定」→ 回寫 CONTRACT/ADR/DESIGN。
- **D2**(A 組定咗 + 合約 lock 後):`n8n-intake.dto.ts` + `IntakeKeyGuard`(fail-closed)+ intake service(resolve opcoCode/skuId → 建 Request+lineItems mirror + set sync gate)+ **additive migration**(`RequestLineItem` 加 `serviceNowSysId/Number`,ADR-0008 D6)+ `POST /requests/intake`。**H5 test 同步**(D3)。

## Day 0(續 2)— W24 doc-review(multi-agent workflow)+ 修正
- 起 **5-lens multi-subagent workflow** 審視全部 W24/ADR-0008 文檔(31 agents · 對抗性 verify)→ **16 confirmed issue(0 high · 7 med · 9 low)**,全部文檔一致性/引用層面,**零 code/架構/安全破壞**。報告 → **`REVIEW.md`**。
- **REQ vs RITM reconcile 分析 + Chris 拍板 option (a)**:兩條 intake 一齊升 **two-level**(`Request`=REQ / `RequestLineItem`=RITM);現有 W03 + `assign.service` 回寫一直當 RITM,決定回寫改逐 line item(touch W04 → H5);seed 零 SN,零 migration。→ 回寫 `CONTRACT §4`。
- **修正 16 issue**(A 決定:Accepted ADR 用**勘誤註**,唔改決策內文):
  - **root cause scope-sync 缺口**(5 條同源 batch 補):BACKLOG §F · DESIGN §11 · architecture header/Decision Log · `schema.prisma` banner · ADR README(ADR-0004 註)。
  - **ROADMAP**:Phase 丁「移 M365 filter」→「擴 curation set」(幻影 code)· 盲點編號 dangling ref 改描述性。
  - **ADR-0008 Errata section**:誤引 ADR-0002(assignLicense 出處)· endpoint `/requests`=簡寫 · 漏 getRecordByNumber · D6 REQ/RITM clarify。
  - **CONTRACT**:§4 REQ/RITM two-level note · §3 azureSyncedAt 措辭(仍需 findUser)。
  - **nits**:AGENDA「Phase 1=n8n team」定義 · plan D# 命名空間。
- **Defer 到 D2**(屬 code 範圍):`intake.dto.ts` + `schema.prisma` line ~194 嘅「RITM」comment 隨 two-level schema 改;CONTRACT §2 auth-header 建議下次對接補問。

---

## Day 0(續 3)— n8n 對接完成(Chris = workflow 管理者本人)+ AGENDA lock
- **關鍵澄清**:一直講嘅「同 n8n team 對接」= Chris **本人就係** n8n onboarding workflow 管理者,而 workflow **已生產運行**。故 AGENDA 由「開會 blocker」→ Chris 即場自答 / 查證,**冇外部依賴**。
- **AGENDA 10 條全答**(見 `N8N-AGENDA.md` 頂決定總結表):A1 只 push · A2 人手 queue · A3 non-blocking · A4 on-prem 延遲 · B1 GUID · B2 code · B3 REQ+RITM 齊 · B6 unassigned;B4/B5 低風險推導(ISO 8601 / REQ sysId key)。
- **關鍵結果**:① **全部保守 → Phase 甲 零架構擴張**;② **A2 人手 queue → 唔觸 H1/ADR**(原唯一架構隱憂清除);③ **B3 令 two-level(option a)有 workflow 事實 backing**,唔再係「為將來預留」;④ **A4 on-prem 延遲**確立 assign 端要 retry。
- **回寫 lock**:`CONTRACT`(§5 待確認→已確認 · §3 comment 確認 · status→locked)· `DESIGN §7`(n8n intake 路徑 + sync 時序)· `RISK R3`(on-prem 延遲)· `checklist` D1 tick · AGENDA 決定總結表。
- **D2 unblocked**:合約 lock,可落 `n8n-intake.dto.ts` + `IntakeKeyGuard` + intake service + two-level additive migration + `POST /requests/intake` + H5 test。

---

## ⏸️ Session pause（2026-07-15 尾）— resume point
- **去到邊**:W24 Phase 甲 **D0 ✅ + D1(合約 + agenda + roadmap)✅ + doc-review + 16 修正 + **AGENDA lock**(Chris 自答 10 條)✅**。實作 code 未開始(D2 起)。REQ/RITM = two-level(option a,SSOT `CONTRACT §4`)。`ROADMAP.md` = ADR-0008 甲乙丙丁執行藍圖。
- **下一步(直接 D2)**:AGENDA 已 lock(Chris = workflow 管理者本人,10 條即場答齊,冇外部依賴)→ 唔使等,直接落 **D2**(合約已 lock;見上 Day 0 續 3)。
- **git 狀態**:doc commit **`41578ec`** 本地**未 push**;**今日全部改動未 commit**(REVIEW 16 修正 + AGENDA lock 回寫:AGENDA / CONTRACT / DESIGN / RISK / checklist / progress)。原「等傾完 n8n team」= Chris 本人已對接完 → **可 commit**(待 Chris 話)。
- **✅ A 組四條已定**(A2 = 人手 queue,唔觸 auto-assign → 唔觸 H1/ADR)→ D2 gate 清除,可落 code。
