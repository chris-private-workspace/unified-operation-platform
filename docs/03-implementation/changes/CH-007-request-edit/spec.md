---
change_id: CH-007
title: "Request 建單後可編輯 — header inline edit + line item 加減(發送前)"
status: active          # draft | proposed | approved | active | done | cancelled
created: 2026-07-22
target_completion: 2026-07-23
affects_components: [apps/api, apps/web]
spec_refs:
  - prisma/schema.prisma Request / RequestLineItem（欄位已存在,零 schema change）
  - ADR-0008 D6（two-level REQ/RITM linkage — 每行 serviceNowSysId = 已發送信號）
  - AUTH-3a opco-scope（既有 assertOpcoScope,沿用）
  - W23-B Assets inline edit（Row edit mode 前端 pattern,沿用）
---

# CH-007 — Request 建單後可編輯

> **Spec version**:1.0(initial)
> **Owner**:AI(草擬)· Chris(決策)
> **Approved by**:Chris Lai(2026-07-22,「approve 可以開工」)

## 1. Context (Why)

Request 一旦建立(n8n 帶入 = **被建立**,或平台 outbound = **主動建立**),**完全唔可以改**:

- Header(`targetUpn` / `targetDisplayName` / `requesterEmail` / `rawRequestText` …)冇任何 `PATCH` endpoint。
- Line item:`POST :id/line-items`(addLineItem)endpoint **存在但前端零 caller**;無 `DELETE`。即 detail 頁連加減都做唔到,只能喺建單一刻決定。

Chris 要求:**header 起碼可改(除同步鍵)**;line item **發送 SN 前**可加減、**發送後**鎖死(「先這樣比較安全」)。

### 1.1 關鍵不對稱 —— 「已發送 ServiceNow」對兩種 origin 意思相反(查證 2026-07-22)

| | `onboarding-intake`(被建立) | `platform-created`(主動建立) |
|---|---|---|
| SN 關係 | 平台**鏡像**已存在 SN 單 | 平台**先建** SN 單(REQ + 每行 RITM)再落本地 |
| line item 來源 | 操作員喺平台自拆 `rawRequestText` | 建單一刻連 RITM 一齊寫落 |
| 每行 `serviceNowSysId`(RITM) | **null**(從未 push 上 SN) | **有值**(一出世就喺 SN) |
| 「未發送」窗口 | line 從未單獨發送 → 平台-only | **冇** —— 一建立就全部喺 SN |

**含意**:`platform-created` 無「未發送前」窗口;之後加行 = 本地-only、SN 冇 → 正正係要避開嘅 drift。故最安全嘅鎖 = 用**每行 `serviceNowSysId`** 做信號,佢精準區分兩者。

## 2. Decisions

| # | 決定 | 由 |
|---|---|---|
| **D1** header 可改欄位 | ✅ `targetDisplayName` / `requesterEmail` / `rawRequestText`(顯示/聯絡/拆解,低風險) | AI 預設 |
| **D2** `targetUpn` | **sync 前可改、sync 後鎖**(`azureSyncedAt == null` 先准)—— sync 後 UPN 係 assign 嘅 load-bearing 鍵 | Chris |
| **D3** `opcoId` | 🔒 **鎖** —— 改 = 跨 scope 邊界 + 重歸屬 ledger,唔為此開口 | Chris |
| **D4** 同步鍵 | 🔒 **永遠鎖**:`serviceNowNumber` / `serviceNowSysId` / `serviceNowStatus` / `origin` | Chris(明示 Request No.)+ 延伸 |
| **D5** line item **刪** | 只准 `serviceNowSysId == null` **且** `stage == REQUESTED` 嘅行 → 保證唔掂 ledger | AI 預設(安全) |
| **D6** line item **加** | 只准 `origin != 'platform-created'`(即 intake 單);platform-created 已全喺 SN,加 = drift | Chris |
| **D7** `handledById`(改 handler) | ❌ 本 Change 不做(獨立營運關注) | AI 預設 out-of-scope |

## 3. Scope (What)

### 3.1 後端(`apps/api`)—— 零 schema change

1. **`PATCH /fulfilment/requests/:id`**(新)—— `request.service.updateHeader(id, dto, actor)`:
   - `assertOpcoScope`(AUTH-3a,同其他 write 面一致)。
   - DTO 只收 D1 四個欄位 + `targetUpn`;全部 optional,`whitelist` pipe 擋其餘。
   - `targetUpn` 出現時:若 `azureSyncedAt != null` → **403/409**(sync 後鎖,D2)。
   - **明確唔收** `serviceNowNumber`/`serviceNowSysId`/`serviceNowStatus`/`origin`/`opcoId`(DTO 根本無呢啲欄位 → 傳咗都被 `whitelist` 剝掉,唔會靜靜寫入)。
   - 寫一條 `RequestEvent`(`NOTE`),message 只列**改咗邊啲欄位名**,**唔含值**(H4 — `targetUpn` 係 PII)。
2. **`DELETE /fulfilment/requests/:id/line-items/:lineItemId`**(新)—— `request.service.removeLineItem(...)`:
   - `assertOpcoScope`。
   - Guard:`serviceNowSysId != null` **或** `stage != REQUESTED` → **409 Conflict**(已鎖,D5)。錯誤訊息講明點解鎖。
   - 刪 + 寫 `RequestEvent`(`NOTE`,「Line item removed: {skuPartNumber}」)+ `recomputeRequestStatus`。
3. **`addLineItem` 加 origin gate**(改)—— `origin == 'platform-created'` → **409**(D6)。
4. **Tests**(H5 — 鎖邏輯係安全關鍵):
   - `targetUpn` sync 後拒改 / sync 前准改
   - DTO whitelist 剝走同步鍵(傳 `serviceNowNumber` 唔會被寫)
   - 刪:REQUESTED+無RITM 准 / 有RITM 拒 / 非REQUESTED 拒
   - 加:platform-created 拒 / intake 准
   - opco-scope fail-closed（OPCO_IT 改/刪別家 → 403）

### 3.2 前端(`apps/web`)

5. **Header inline edit**(`request-detail.tsx`)—— 沿用 W23-B「Row edit mode」pattern:
   - Header card 加「Edit」入口 → 進入 edit mode,顯示 D1 欄位輸入 + `targetUpn`(**sync 後 disabled + hint**)。
   - 同步鍵區(ServiceNow REQ)**永遠唯讀**,視覺上明確 non-editable。
   - Save / Cancel;save 走新 `useUpdateRequest` hook,invalidate detail query。
6. **Line item 加減**(`request-detail.tsx`):
   - **Add**:card header 加「Add line item」控制(SKU picker + qty)—— **只喺 `origin != 'platform-created'` 顯示**。
   - **Remove**:每行 trash icon —— **只喺該行 `serviceNowSysId == null && stage == 'REQUESTED'` 顯示**;鎖住嘅行唔顯示(唔係 disable,直接唔出 —— 避免暗示「解到鎖」)。
7. **hooks**:`useUpdateRequest(id)` / `useAddLineItem(id)` / `useRemoveLineItem(id)`;`api-types.ts` 加對應 body 型別。
8. **Tests**:
   - lock gating 純函數(`canEditUpn(req)` / `canRemoveLine(item)` / `canAddLine(req)`)抽 `lib/requests.ts` + unit test —— **UI 顯唔顯示由呢啲函數話事**,鎖規則有回歸保護。

### 3.3 Out of Scope（explicit)

- ❌ 改 `opcoId` / `serviceNowNumber` / `origin`(D3/D4)。
- ❌ sync 後改 `targetUpn`(D2)。
- ❌ 改 handler `handledById`(D7)—— 另開 candidate。
- ❌ **把新加 / 改動 push 返上 ServiceNow** —— 平台唔 own SN 單內容;本 Change 純本地。呢個係「加只限 intake、header 同步鍵鎖死」嘅根本原因。
- ❌ 改**已鎖** line item 嘅 quantity / stage / SKU(鎖 = 唔郁)。
- ❌ 改 `REQUESTED` 無RITM 行嘅 **quantity**(用戶講「加減 item」非改數量;留 candidate,避免擴 scope)。
- ❌ 掂 assign / ledger / 對帳任何寫入路徑 —— 本 Change 純 header + REQUESTED-line 加減,**唔郁 critical path**。

## 4. Acceptance Criteria

- [ ] **C1** `PATCH :id` 改 `targetDisplayName`/`requesterEmail`/`rawRequestText` → detail 反映;寫 RequestEvent(message 無 PII 值)
- [ ] **C2** `targetUpn`:`azureSyncedAt == null` 准改;**sync 後改 → 409**(test + live)
- [ ] **C3** **同步鍵防漏**:body 夾帶 `serviceNowNumber`/`serviceNowSysId`/`opcoId`/`origin` → 一個都唔會被寫入(whitelist 剝走;test assert 原值不變)
- [ ] **C4** `DELETE` line:REQUESTED+無RITM **准**;有RITM **409**;非REQUESTED **409**(三條 test)
- [ ] **C5** 刪後 `recomputeRequestStatus` 有跑 + 寫 RequestEvent
- [ ] **C6** `addLineItem`:`platform-created` **409**;intake **准**(test)
- [ ] **C7** **opco-scope fail-closed**:OPCO_IT 對別家 OpCo 嘅 request 改 header / 刪行 / 加行 → **403**(service test)
- [ ] **C8** **刪唔掂 ledger**:刪 REQUESTED 行,ledger `allocatedQuantity`/`assignedQuantity` 零變(test —— 因 REQUESTED 未 allocate;明證非 critical path)
- [ ] **C9** 前端鎖 gating 抽純函數 + unit test:`canEditUpn`/`canRemoveLine`/`canAddLine`
- [ ] **C10** live UI:intake 單見 Add + 可刪 REQUESTED 行;platform-created 單**唔見** Add、有RITM 行**唔見** trash;同步鍵區唯讀
- [ ] **C11** H6:token-only、lucide stroke、一 view 一 primary、light+dark;跑 `ui-design` 12 條
- [ ] **C12** api test **333 → ≥345** · web test **123 → ≥130** · 兩邊 lint / build 綠

**Verification**:`npm run -w apps/api test|lint|build` · `npm run -w apps/web test|lint|build` · live ADMIN + OPCO_IT 對照 + intake vs platform-created 對照

## 5. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 同步鍵經 body 夾帶偷偷改到 → 之後 SN 同步斷 | Med | **High** | DTO **根本無**呢啲欄位 + `whitelist` pipe;C3 test 明證 |
| R2 | sync 後改 `targetUpn` → assign findUser 搵唔到 | Med | **High** | D2 backend 409 gate(唔靠前端 disable);C2 test |
| R3 | 刪咗有 real-world 進度嘅行(採購/指派中) | Low | **High** | D5 只准 REQUESTED+無RITM;C4 三態 test |
| R4 | 平台自建單加本地-only 行 → SN drift | Med | Med | D6 origin gate 409;C6 test;前端唔顯示 Add |
| R5 | 前端 disable 但 backend 冇 gate(假安全) | Low | **High** | 每個鎖 backend 為準(gate + test);前端只係 UX |
| R6 | 順手擴到 quantity edit / handler 改 | Med | Low | §3.3 明列 out;`git diff` 逐行 review |

## 6. Dependencies

- ✅ `assertOpcoScope` / `scopeWhere`(AUTH-3a)· `recomputeRequestStatus`(StageService)· W23-B inline edit pattern · `useUpdateLedger`/`useUpdateCatalog`(PATCH hook 參考)
- ✅ 欄位全部已存在 → 零 schema change / 零 migration / 零新 dep
- ✅ D1–D7 已拍板(2026-07-22)
- ❌ 無外部阻塞(唔碰 SN / Graph / n8n write)

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-22 | Initial draft | 用戶要求 request 建單後可編輯;D1–D7 已拍板 | Chris Lai |
| 2026-07-22 | Approved → active | Chris「approve 可以開工」 | Chris Lai |

---

**Gate reminder**:status = `proposed`,**用戶 approve 先可 `approved` + 開始 code**(PROCESS R1.change)。
