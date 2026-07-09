---
change_id: CH-000
title: "list API 加 ?status= filter 參數"
status: done            # ← 範例展示完整生命週期;真實開新 change 由 draft 開始
created: 2026-01-10
target_completion: 2026-01-11
affects_components: [C08]
spec_refs:
  - api-contract.md §list-endpoints
---

# CH-000 — list API 加 ?status= filter 參數

> ⚠️ **呢個係範例實例(EXAMPLE)**,用嚟示範 `_templates/change/` 模版點填出嚟長咩樣。
> 落新項目時可以刪走成個 `CH-000-example/` folder,或者留住做參考。真實 change 由 `CH-001` 開始。
>
> **Spec version**:1.0
> **Owner**:AI
> **Approved by**:Chris(2026-01-10)

## 1. Context (Why)
用戶要喺 `/items` list 頁面按狀態篩選(active / archived)。目前 endpoint 一次過回全部,前端要 client-side filter,大 list 時慢。呢個係改現有 endpoint 行為,scope 細(< 1 日),有明確 acceptance → Change workflow。

## 2. Scope (What)

### 2.1 Behavior Change
- **Before**:`GET /items` 永遠回全部 items。
- **After**:`GET /items?status=active` 只回對應狀態;無 `status` param 時行為不變(回全部,向後兼容)。

### 2.2 In Scope
- `GET /items` 加 optional query param `status: Literal["active", "archived"]`。
- Server-side filter。
- 無效 `status` 值回 422 + 錯誤訊息。

### 2.3 Out of Scope（explicit）
- 多狀態同時篩(`status=active,archived`)—— 未有需求。
- 其他 endpoint 嘅 filter —— 只改 `/items`。

## 3. Acceptance Criteria
- [x] `GET /items?status=active` 只回 active items
- [x] `GET /items`（無 param）行為不變,回全部
- [x] `GET /items?status=bogus` 回 422 + 清晰錯誤訊息
- [x] 驗證命令:`pytest tests/api/test_items_filter.py`

## 4. Risks
| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 無 param 行為改變 → 破現有 client | Low | High | 明確 test 守住「無 param = 回全部」 |

## 5. Effort Estimate
0.5 日。

## 6. Dependencies
無。`/items` endpoint 已存在(C08)。

## 7. Spec Changelog
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-01-10 | Initial draft | — | Chris |
| 2026-01-10 | draft → approved | 用戶 review scope + acceptance,批准 | Chris |

---

**Lifecycle reminder**:spec locked after status=approved。重大 deviation → §7 changelog。
