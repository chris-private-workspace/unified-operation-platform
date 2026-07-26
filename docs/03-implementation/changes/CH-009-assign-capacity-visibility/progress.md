---
change_id: CH-009
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | done
---

# CH-009 — Progress

> During-execution log + completion summary。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-26:Spec drafted(**proposed,未 approve**)

**Action**:CH-009 開單(PROCESS §3),源自 Chris 2026-07-26 提出嘅「問題 2」後半。

### 觸發本 change 嘅 grounding

Chris 講「冇任何先檢查 license 是否有足夠可用 / 可 assign 數量的流程存在」。逐條查 code 之後**修正咗一半前提**:

| 查證 | 結果 | 依據 |
|---|---|---|
| assign 有冇 seat 檢查 | **有** —— live Graph,`consumedUnits >= prepaidEnabled` → 400,喺 Graph assign **之前**、fail-closed | `assign.service.ts:127-132` |
| Assign 按鈕旁邊有冇容量數字 | **冇** —— 只 gate `isReady && synced` | `request-detail.tsx:466` |
| 平台有冇呢啲數據 | **有** —— `/license/tenant-skus` 三層,但只餵 Assets → Platform view | `queries.ts:97-115` · `platform-view.tsx:64` |
| OpCo 層有冇被檢查 | **完全冇** —— seat gate 只睇 tenant 總量 | 同上 |

⇒ 真缺口係**時機同可見度**,唔係「冇檢查」。呢個修正已回報 Chris,佢 approve 開 change。

### 兩個關鍵查證結果(直接定咗 spec 形狀)

1. **零 backend 改動做得到** —— 兩個數據源都已有 endpoint + hook,而且 **scope 天然對齊**:`GET /license/ledger` 本身 per-actor scoped(AUTH-3a),而 OPCO_IT 本來就只睇到自己 OpCo 嘅 request ⇒ 「呢張單嘅 OpCo × 呢個 SKU」嗰格,actor 一定攞得到。唔使新 endpoint、唔使額外 scope 邏輯。
2. 🔴 **`tenant-skus` 對 OPCO_IT 係 403** —— `license.controller.ts:143` **冇** role override,繼承 controller-level `@Roles(ADMIN, REGIONAL)`。所以必須 lazy fetch(`useTenantSkus(enabled)` + `canSeePlatform`,同 `assets.tsx` 同 pattern),而且 OPCO_IT **唔顯示嗰一層**——唔可以扮 0(0 會被讀成「冇位」,危險)。

### ⚠️ 同 CH-008 嘅真實交互(開工前必讀 spec §2.4)

CH-008 令 `GET /license/ledger` 預設排除 0/0 row,而本 change 靠同一 endpoint lookup ⇒ 0/0 格會搵唔到。
**結論:唔需要特別處理,但唔可以圖方便傳 `?includeEmpty=true`**(咁會令 CH-008 預設失效)。D5 規定「搵唔到 = `0 of 0 — no allocation set`」,而該格真實情況正正就係 allocated=0 ⇒ 結論相同。**A4 專門守呢點。**

> 三者一致:CH-008 隱藏 0/0 → CH-009 顯示「未設預算」→ ADR-0016 擋。同一狀態,三個層面講同一件事。

### 同 ADR-0016 嘅次序

本 change **唔依賴** ADR-0016 approve,而且建議**先做**:令 ADR-0016 上線時,操作員已經睇到嗰個數字,唔會突然被一個從來睇唔到嘅數字擋住。

### Blockers

- **spec 未 approve**(`proposed`)→ 依 R1.change,一行 code 都唔寫

**Commit**:`<hash>` — `docs(changes): CH-009 spec — assign 前可用量可見度`

---

## Completion summary(填於 done)

_(待實作)_
