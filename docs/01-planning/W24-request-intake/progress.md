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

## 下一步
- **D2**(据 CONTRACT 落地):`n8n-intake.dto.ts` + `IntakeKeyGuard`(fail-closed)+ intake service(resolve opcoCode/skuId → 建 Request+lineItems mirror + set sync gate)+ **additive migration**(`RequestLineItem` 加 `serviceNowSysId/Number`,ADR-0008 D6)+ endpoint `POST /requests/intake`。**H5 test 同步**(D3)。
- 平行(可隨時):同 n8n / Phase 1 team 對 CONTRACT §5。
