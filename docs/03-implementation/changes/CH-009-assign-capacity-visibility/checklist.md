---
change_id: CH-009
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: 2026-07-26
---

# CH-009 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> ✅ **Spec approved(Chris Lai,2026-07-26)—— 可以開工。**

## Implementation

### Helper(純函數,先寫先測)
- [ ] 新 `apps/web/src/lib/capacity.ts`:由 ledger list 砌 `(opcoId, skuCatalogId)` index + lookup(D4)
- [ ] lookup 缺 row → 回 **`{ allocated: 0, assigned: 0, present: false }`**(D5,唔回 null 令 caller 要處處判斷)
- [ ] `capacity.test.ts`:row 存在 / row 缺 / headroom 計算 / 已超支(assigned > allocated)四個分支

### Request detail 接線
- [ ] `request-detail.tsx`:引入 `useLedger`(既有),按 `req.opcoId` + `item.skuCatalogId` lookup
- [ ] **OpCo budget** 顯示:`assigned / allocated` + headroom,數字用 **mono**(DS-5)
- [ ] **Tenant seats** 顯示:`useTenantSkus(canSeePlatform)` —— **lazy,OPCO_IT 唔發 request**(D3 / R1)
- [ ] 缺 row → 文案 **`no allocation set`**(唔係淨個 `0`,R4)
- [ ] ⚠️ **確認冇傳 `?includeEmpty=true`**(§2.4 / R3)
- [ ] 只喺**可 assign** 嘅 line item 顯示(終態 ASSIGNED / CANCELLED 唔顯示,減噪音)

## Verification

- [ ] **A1** ADMIN:兩層都見(貼截圖 / DOM 證據)
- [ ] **A2** OPCO_IT 對照:只見 OpCo 層 + **Network 面板證冇發 `/license/tenant-skus`**
- [ ] **A3** 數字對得返 Assets → By OpCo 同一格
- [ ] **A4** 0/0 格 → `no allocation set`;**且確認 request detail 冇傳 `includeEmpty`**
- [ ] **A5** ≥3 個唔同 SKU 嘅單 → **只一次** ledger query(Network 面板數)
- [ ] **A6** assign 成功後數字即時 +1(唔靠 reload)
- [ ] **A7** web test 不降 + capacity helper 三分支覆蓋
- [ ] **A8** lint(web)零 output · `tsc --noEmit` 0 · `npm run build` OK
- [ ] **A9** 跑 `ui-design` skill;**light + dark 實看**;mono / 零新色 / 零新 primitive / Assign 仍唯一 primary
- [ ] 造 0/0 test 格用 **scratch DB**(唔污染 dev DB;見 memory `scratch-db-verification`);若用 dev DB PATCH 則**必須還原**並貼還原證據

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N entry(R2)
- [ ] Commit message 標 component tag(`feat(web):`,標 `(CH-009)`)
- [ ] **無 ADR**(零 backend、零 schema、零新 endpoint,唔觸發 H1)—— 若實作中發現要改 backend → **STOP**,回頭問 owner
- [ ] 若 CH-008 已 merge → 重跑 A4 確認交互(§2.4)
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
