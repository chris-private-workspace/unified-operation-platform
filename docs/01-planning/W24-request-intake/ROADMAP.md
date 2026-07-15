---
doc: ADR-0008 執行 roadmap（rollout 藍圖）
adr: ADR-0008 (Accepted 2026-07-15)
owner: Chris Lai
status: living（各 phase kickoff 參考 + 回填實際;決定變 → 更新此檔)
scope: 高層次藍圖（大概內容 / 目標 / 依賴 / 風險 / size）
---

# ADR-0008 執行 Roadmap — Request 建單 + n8n 雙向 + D365

> **定位(守 rolling JIT)**:本檔係 **ADR-0008 rollout 嘅高層次藍圖**,畀後續 phase 理解全局點開展。
> **唔係** detailed phase plan —— 每個 phase 嘅 `plan.md` / gates / deliverables 依然**各 phase kickoff 先 JIT 寫**(唔預建未來 folder)。決定改變 → 回來更新本檔。
> **來源**:ADR-0008(Accepted)· `CONTRACT.md`(D1 intake 合約)· `N8N-AGENDA.md`(對接盲點)· 2026-07-15 討論。

---

## 0. 前置狀態（2026-07-15）

- ADR-0008 **Accepted**(H1+H2+H3 解鎖)· W24 **D0 doc-sync ✅** · **D1 合約/agenda ✅**。
- ⏳ **待對接 n8n team**(填 `N8N-AGENDA.md` A 組 4 流程決定 + B 組 6 欄位)—— 呢個係 unlock 後續嘅閘。

## 1. n8n 對接完成,實際解鎖咩（唔係平均解鎖四 phase）

| Phase | 靠 n8n 對接? | 獨立前置 |
|---|---|---|
| **甲 inbound** | ✅ 直接解鎖(A 組 + B 欄位) | A2「誰 assign」決定重量 |
| **乙 outbound-direct** | ❌ 唔靠 | ServiceNow **create 欄位**(sc_request/sc_req_item 實際 variable / 必填) |
| **丙 n8n-outbound** | ✅ 靠(n8n webhook 合約) | 要 Phase 乙 抽象先起好 |
| **丁 D365 scope** | ❌ 完全唔靠 | 真 tenant `subscribedSkus` 有 D365 SKU + curation |

**重點**:對接完成主要**全開 Phase 甲**;乙/丁 有自己獨立依賴,可並行唔使等 n8n。

## 2. 最大分岔:A2「誰觸發 assign」— 決定成個 roadmap 形狀

```
A2 決定
├─ 選【人手 queue】→ Phase 甲 = M size,接返現有 module D 人手 assign,冇新架構
└─ 選【全自動】    → 多一個「auto-assign orchestration」重型 phase(BullMQ+retry+監控)
                     = L size,新架構面(H1),要補 ADR
```

**建議**:先做**人手 queue 版**(甲 M size,快見價值、風險低);全自動留後續獨立 phase(等 inbound 穩定 + A4 sync 時序摸清先自動化,唔好風險集中一步到位)。

## 3. 推薦執行序列（對接完成後）

```
【已完成】ADR-0008 ✅ · W24 D0 ✅ · D1 ✅
              │  ⟨n8n team 對接:填 AGENDA A+B⟩
   ┌──────────┴───────────────────────────┐
   ▼                                        ▼ (可並行,唔等 n8n)
Phase 甲 inbound (W24)                  Phase 丁 D365 scope
   │                                       (移 filter + 擴 curation)
   ▼
[分岔] A2 若全自動 → auto-assign phase(+ADR)
   ▼
Phase 乙 outbound-direct
   ▼
Phase 丙 n8n-outbound
```

實際序列 = **甲(視乎 A2)→ 乙 → 丙**,**丁 隨時並行插入**。

## 4. 各 Phase 卡

### 🟦 Phase 甲 — Inbound intake（W24 current · size M）
- **目標**:n8n onboarding push → 平台即時建 `Request` mirror,接返既有履行。**最核心痛點**。
- **內容**:`n8n-intake.dto.ts`(真欄位)· `IntakeKeyGuard`(m2m static key,fail-closed 401)· intake service(resolve opcoCode/skuId → 建 Request+lineItems + set sync gate)· additive migration(`RequestLineItem` 加 SN 欄位 + `Request` origin 標記)· `POST /requests/intake` · **A4 sync 時序處理**(AD→Entra 延遲 → assign 前 retry/等 findUser)· H5 test。
- **依賴**:AGENDA A1/A3/A4 + B 全部。
- **達成**:n8n push 即有單、過 sync gate、入 queue 待履行。

### 🟥 [條件] Auto-assign orchestration（只 A2=全自動先做 · size L · 觸 ADR）
- **目標**:push → 自動 findUser → assignLicense → 回寫 SN → 更新 ledger,全程 touchless。
- **內容**:BullMQ job pipeline · sync gate 等待/retry · 錯誤處理 + 監控 + 死信 · over-alloc 保護。
- **風險**:新架構面(H1,要 ADR);失敗集中;onboarding 自動洪流令 By-OpCo ledger 失真(對帳影響)。

### 🟩 Phase 乙 — Outbound direct（建單 · size M-L）
- **目標**:IT 喺平台開獨立 M365/D365 request → **direct** create `sc_request`+`sc_req_item` → 即時建 mirror。
- **內容**:`ServiceNowService.createRecord`(POST Table API)· `RequestSubmissionProvider` 抽象 + `DirectServiceNowProvider` · 建單 service · **新前端「開單」畫面**(H6,一個 primary)· inbound/outbound 防兜圈(origin 標記,避免平台建嘅單被 inbound 再抓)· H5 test。
- **依賴**:ServiceNow **create 欄位真相**(比讀嚴 —— catalog item variables / 必填欄,可能要再問 ServiceNow team)。
- **達成**:IT 唔使入 ServiceNow,平台一 click 開單。

### 🟪 Phase 丙 — n8n outbound（size S-M）
- **目標**:建單多一路徑 = call n8n workflow(n8n 既有 workflow 已識建 REQ+RITM)。
- **內容**:`N8nWorkflowProvider`(POST n8n webhook)· 平台→n8n webhook 合約 · config/per-type 選路(direct vs n8n)· fallback · H5 test(mock n8n)。
- **依賴**:Phase 乙 抽象已在 + n8n 端提供 webhook。
- **達成**:建單邏輯可 externalize,ops 改 workflow 唔使 redeploy 平台。

### 🟨 Phase 丁 — D365 scope（size M · 可並行插入）
- **目標**:D365 license 完整納入 catalog/ledger/對帳,同 M365 一視同仁。
- **內容**:**擴 ADR-0004 curation set**(curate D365 SKU 嘅 `businessAlias`/`displayName`/`category`)—— 真正 scope gate 係 **curation-as-scope**(`allocation-import.service`),catalog sync / tenant-skus / ledger / reconcile 四個 service 本身**冇 M365 filter**,唔存在「移 filter」呢個動作 · 對帳 drift 自然 cover D365 · **UI**(Assets/Catalog 顯示 D365)· H5 test。
- **依賴**:真 tenant `subscribedSkus` 有 D365 SKU + 一次性 curation(deploy-time ops)。
- **達成**:D365 seat 可見、可管、可對帳。

## 5. 跨 Phase 共通

- **前端線**(H6 token-only,light+dark):乙「開單」畫面 → Requests console 加 origin badge(onboarding vs 平台建)→ 丁 Assets/Catalog 顯示 D365。
- **Test**(H5):每 phase 掂 critical path(建 mirror / create SN / assign / 對帳)必同步 test;Graph/ServiceNow/n8n 一律 mock。
- **Deploy/secret**(H4):`INTAKE_API_KEY`(甲)· n8n webhook URL/auth(丙)· D365 curation(丁)— 全 env,唔 commit。

## 6. 對接完成後即刻可開

**Phase 甲 inbound 全開**(A 組定咗)+ **Phase 丁 D365 可並行起**(唔等 n8n)。乙要摸 ServiceNow create 欄位、丙等乙。

## 7. 參考

- `docs/adr/0008-request-creation-n8n-d365-scope.md`(D1–D6 + Rollout)
- `docs/01-planning/W24-request-intake/CONTRACT.md`(intake 合約 / m2m / 代表性 DTO)
- `docs/01-planning/W24-request-intake/N8N-AGENDA.md`(對接 A 組 4 決定 + B 組 6 欄位)
- `docs/02-architecture/licenseops/DESIGN.md` §1(定位)·§5(subscribedSkus)·§7(生命週期)·§8(integration)
