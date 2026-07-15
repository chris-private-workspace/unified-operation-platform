---
doc: W24 / ADR-0008 文檔 review 報告
generated: multi-subagent workflow — 5 finder lens (一致性 / code對齊 / 清晰度 / 完整性·PROCESS / hard-constraint) + 對抗性 verify (sonnet) + synthesize
stats: 31 agents · 0 error · 25 raised → 22 confirmed → 16 去重後（0 high · 7 medium · 9 low）
status: findings — 待逐條修正;修正動手前每個 line number 會 Read 確認（唔盲改）
date: 2026-07-15
---

# W24 / ADR-0008 文檔 Review — 綜合報告

## 1. Executive Summary

- **總 confirmed issue 數(去重後)**:16 條(原始 22 條 finding,其中 6 條為同一問題重報)。
- **按 effective_severity 分佈**:high 0 · **medium 7** · **low 9**。
- **整體文檔健康**:核心決策(ADR-0008)方向清晰、W24 規劃文件完整;問題**全部係文檔一致性 / 引用準確性層面,零 code / 架構 / 安全破壞**。主症結係 **ADR-0008 嘅 D0 doc-sync 做漏咗一批** —— 已 approve 嘅 scope 改動冇同步落 §F、schema header、roadmap 等地方,造成多處自相矛盾;另有數個 ADR 內文事實 / 引用錯誤。
- **最關鍵 Top 3**:
  1. **BACKLOG §F 自相矛盾**(medium)— 已納入 scope 嘅兩項仍列 out-of-scope,且抬頭寫「開之前必須 STOP + approval」,會令 agent 把**已批准嘅 W24 工作當成要重新 STOP**。
  2. **ADR-0008 誤引 ADR-0002 做 `assignLicense` 出處**(medium)— Accepted(immutable)ADR 內嘅事實 / 引用錯誤,ADR-0002 只講驗 incoming JWT,同 Graph assignLicense 完全無關。
  3. **ROADMAP Phase 丁「移 M365-only filter」描述唔存在嘅 code**(medium)— 四個被點名 service 根本冇 M365 filter,實際 scope gate 係 ADR-0004 curation-as-scope,會令 Phase 丁 實作者去搵幻影 code。

**橫向 root cause**:issue A / B / D / M / P(共 5 條)同源 —— ADR-0008 line 61 嘅「同步文件更新」清單 + W24 checklist D0 都冇涵蓋 §F / schema.prisma header / architecture.md header metadata / ADR-0004 註記。建議**一次過補齊**,唔好逐條散修再 drift。

---

## 2. 按文檔分組(組內 severity 由高至低)

### docs/01-planning/BACKLOG.md
- **【medium】§F 仍列「D365 Licenses」+「非 onboarding 的獨立 license request」為 out-of-scope**,同自身頭部(line 9)、Active W24 行(line 45)、ADR-0008 D1/D5、DESIGN §2、architecture §11 全部相反 → 位置 **line 126–127**;修正:移除「非 onboarding 的獨立 license request」,將「D365 Licenses」收窄為「D365 業務模組 / F&O 工作流」(對齊 architecture §11 license-vs-模組 區分),並加 ADR-0008 納入註。順帶更新「最後更新」日期。

### docs/adr/0008-request-creation-n8n-d365-scope.md ⚠️ Accepted(immutable)— 用勘誤註 / README index 處理,唔好直接改決策內容
- **【medium】誤引 ADR-0002 做 Graph `assignLicense` 出處** → **D5 line 47 + References line 83**;修正:兩處刪走「ADR-0002」(ADR-0002 只講後端 Entra JWT 驗證),assignLicense 正確出處係 **DESIGN §8 / `apps/api/src/integration/graph/graph.service.ts`**(已另行 cite,刪咗零資訊損失)。以 erratum 註記記正。
- **【low】Rollout Phase 甲 endpoint 寫 `POST /requests`,同 5 份 W24 文件嘅 `POST /requests/intake` 唔一致** → **line 56**;修正:以 **CONTRACT §6 為 endpoint SSOT**,喺 CONTRACT / ROADMAP 註明「ADR line 56 `/requests` = 簡寫,正式路徑 `/requests/intake`」。
- **【low】Context「`ServiceNowService` 只有 getRecord/query/updateRecord/addWorkNote」漏咗 `getRecordByNumber`(實際 5 個 method)** → **line 13**;修正:補回 `getRecordByNumber`,或將「只有 …」軟化為「有讀 / 更新方法(…),冇 create」。承載論點「冇 create」本身正確。

### docs/02-architecture/licenseops/DESIGN.md(決策 SSOT)
- **【medium】§11「🔮 Later」仍列「D365 license 管理」,同 §2(line 34)/ §9 #5(line 156)已納入 in-scope 自相矛盾** → **line 193**;修正:改寫為「D365 **業務應用模組**(F&O 工作流)」或移除,對齊 §2/§9 嘅 license-vs-模組 區分。

### docs/adr/0004-allocation-import-mechanism.md ⚠️ Accepted(immutable)
- **【low】ADR-0008 line 61 明列要為 ADR-0004 加「適用範圍註記(D365 納入)」,但 ADR-0004 本體 + README index 零指向,仍寫「D365 out-of-scope」** → Decision line 27 / Consequences line 45 / References line 53;修正:喺 **ADR README index ADR-0004 行(line 20)** 加「適用範圍隨 ADR-0008 擴至含 D365 SKU」,並將此項補入 W24 D0 checklist。

### docs/01-planning/W24-request-intake/ROADMAP.md
- **【medium】Phase 丁「移 M365-only filter(catalog sync / tenant-skus / ledger / reconcile)」描述唔存在嘅 code** — 四個 service 均無 M365/category filter,真正 scope gate 係 ADR-0004 curation-as-scope(`allocation-import.service.ts`) → **line 90**;修正:改寫為「擴 ADR-0004 curation set(curate D365 SKU businessAlias / displayName / category)」,刪去「移 filter」呢個唔存在嘅動作;ADR-0008 D5 line 48 同步收窄措辭。
- **【medium】引用「AGENDA 盲點 8」「盲點 6」,但 N8N-AGENDA 實際只用 A1–A4 / B1–B6,無「盲點 N」編號(dangling ref)** → **line 74 / line 78**;修正:改為 AGENDA 實際標號(如 A2 auto-assign / A1 origin),或喺 N8N-AGENDA 補一段編號「盲點」清單。
- **【low】`Request` origin/type 標記三份文件講法不一**(ROADMAP 講死 Phase 甲要做 / ADR D6 line 52「可能加」/ plan line 33、checklist line 24「若需要」),而其 anti-loop 用途 ROADMAP 自己歸類 Phase 乙(line 78) → **line 67**;修正:若 Phase 甲 全部單都係 onboarding origin,明確把 origin 標記推去 Phase 乙(移除 line 67 該項);否則統一改成「確定」並寫明甲階段點用。

### docs/01-planning/W24-request-intake/N8N-AGENDA.md
- **【medium】「Phase 1 team」同「n8n team」關係不明**(participants line 11 並列成兩方,CONTRACT 反覆寫「n8n / Phase 1 team」,但 DESIGN §4.1 line 66 定義 Phase 1 = n8n;且「Phase 1」同 ADR-0008「Phase 甲乙丙丁」撞名) → **line 11 + CONTRACT §5 line 83**;修正:首次出現時一句定義「Phase 1 = 既有 n8n onboarding 團隊 / 流程(≠ ADR-0008 Phase 甲乙丙丁)」;同一班人就統一叫「n8n onboarding team」,唔好並列。

### docs/01-planning/W24-request-intake/CONTRACT.md(draft-representative,D2 落 code 前 lock)
- **【medium】§4 DTO→schema 對映把 `Request.serviceNowNumber` 定為 REQ 層,但現有 user-facing intake + schema 一直存 RITM** — REQ↔RITM 語意反轉未指出,將令同一欄混存兩種 SN 編號無 discriminator → **§4 line 74(旁證 DTO line 54 例值 REQ0012345 vs schema.prisma line 194「e.g. RITM」、intake.dto.ts line 17「RITM」、servicenow.service.ts defaultTable=`sc_req_item`)**;修正:明寫「舊 `POST /fulfilment/requests` 寫 RITM,n8n intake 寫 REQ,靠 `Request` origin 標記區分」,同步修正 schema.prisma line 194 + intake.dto.ts line 17 嘅「RITM」註解。
- **【low】§3 講「帶咗 `azureSyncedAt` 即過 assign sync gate」,同 §5.4 / AGENDA A4 講「語意未確認、synced≠Graph 可見」矛盾,且漏咗 assign 仍需 `findUser(upn)` 命中呢重** → **§3 line 59**;修正:改為「平台傾向可作 sync gate 候選,但實際 assign 仍要 findUser(upn) 命中;azureSyncedAt 真義待 A4 確認」。(機制上 azureSyncedAt check 已實作,屬措辭澄清。)
- **【low】§2 整個 m2m 方案假設「n8n set header 極易 + 安全存 secret」為既定事實,但從未向 n8n team 求證,且 AGENDA 把 §2 auth 列「不變」** → **§2 line 26 + AGENDA 回寫表 line 88**;修正:AGENDA A 組加一條問 n8n「可否加固定 custom header + secret 點保管」,§2「極易」改「待確認」。(n8n HTTP node 加 header 屬基本能力,風險偏低。)

### docs/01-planning/W24-request-intake/plan.md
- **【low】「D1–D6」語意重疊**:ADR-0008 係 decision 編號、W24 plan/checklist 係 deliverable 編號,同一份 plan.md 內 D2/D4 各有兩個意思 → **spec_refs line 11 vs §3 Deliverables line 51–53**;修正:引用 ADR 決定一律寫全稱「ADR-0008 D2」,或 phase 交付改前綴(T0–T4 / W24-D0..D4),頂部加一句「本 phase Dn = 交付項 ≠ ADR-0008 Dn」。(CONTRACT / progress 實際已自發加 prefix,風險低。)

### docs/architecture.md
- **【low】header metadata stale**:§2/§11 內文已引 ADR-0008 改 scope,但檔頭仍「Last Updated: 2026-07-09 · ADRs: [ADR-0001]」,Decision Log 亦未補 → **line 7(+ Decision Log line 82–85)**;修正:Last Updated 改 2026-07-15,ADRs 清單 + Decision Log 補上 ADR-0008。

### apps/api/prisma/schema.prisma(CLAUDE.md 指定「domain model 真相」)
- **【low】檔頭 banner 仍寫「M365 only / Out of scope (by design): … D365」**,同 ADR-0008 相衝,且未列入 ADR-0008 同步清單 / D0 checklist → **line 7–11**;修正:趁 Phase 甲 D2(RequestLineItem SN 欄 additive migration)動 schema 時順帶更新 banner「D365 license 已由 ADR-0008 納入;獨立 request 建單納入」,並把 schema.prisma 納入 ADR-0008 scope-sync 覆蓋面。

---

## 3. 建議修正次序(ordered checklist)

> ⚠️ **前提**:ADR-0002 / 0004 / 0008 均 Accepted。依 CLAUDE.md §6 / ADR README 慣例,**唔好直接改 Accepted ADR 決策內文** —— 事實 / 引用錯誤用**勘誤註或 README index 註記**,endpoint / scope 細節以 CONTRACT / DESIGN 做 SSOT。

- [ ] **1. 一次過補齊 D0 scope-sync 缺口(root cause,5 條同源,batch 做防 re-drift)**
  - BACKLOG §F(line 126–127)移除「非 onboarding 獨立 request」+ 收窄「D365 Licenses」
  - DESIGN §11(line 193)「D365 license 管理」→「D365 業務應用模組」
  - architecture.md header(line 7)Last Updated + ADRs + Decision Log 補 ADR-0008
  - schema.prisma banner(line 7–11)標明 D365 / 獨立 request 已納入(可延到 Phase 甲 D2 動 schema 時)
  - ADR README index(line 20)為 ADR-0004 加「適用範圍隨 ADR-0008 擴至含 D365」
  - **同步把上述項補入 W24 checklist D0**,免下次再漏。
- [ ] **2. 修正 ROADMAP 兩個事實 / 引用錯誤(會誤導未起 phase 嘅實作者)**
  - Phase 丁「移 M365-only filter」→「擴 ADR-0004 curation set」(line 90)
  - 「盲點 8 / 盲點 6」→ AGENDA 實際標號(line 74 / 78)
- [ ] **3. ADR-0008 勘誤註**:assignLicense 出處刪 ADR-0002(D5 line 47 / References line 83)· endpoint `/requests` 註明 = `/requests/intake` 簡寫 · Context 補 `getRecordByNumber`。
- [ ] **4. D2 落 code 前 lock CONTRACT 三處**(影響 schema mapping,錯咗會入 code):REQ vs RITM discriminator(§4 line 74)· azureSyncedAt 措辭(§3 line 59)· §2 auth-header 求證項入 AGENDA。
- [ ] **5. 澄清 planning nits**(低風險,順手做):N8N-AGENDA 定義「Phase 1 = n8n team」(line 11)· plan.md D# 命名空間(line 11)· ROADMAP `Request` origin 標記歸邊個 phase(line 67)。
