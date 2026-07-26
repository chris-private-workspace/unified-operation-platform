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
- [x] 新 `apps/web/src/lib/capacity.ts`:由 ledger list 砌 `(opcoId, skuCatalogId)` index + lookup(D4)
- [x] lookup 缺 row → 回 **`{ allocated: 0, assigned: 0, present: false }`**(D5,唔回 null 令 caller 要處處判斷)
- [x] `capacity.test.ts`:row 存在 / row 缺 / headroom 計算 / 已超支(assigned > allocated)四個分支 —— **實際 12 個 test**,另加 OpCo×SKU 交叉不洩漏、`exhausted` off-by-one 邊界、tenant `owned=null` ≠ exhausted
- [x] ➕ tenant helper(spec 冇明列但 D1 需要):`buildTenantIndex` / `tenantCapacity`,`owned=null` → `known:false`(**唔係 0**)

### Request detail 接線
- [x] `request-detail.tsx`:引入 `useLedger`(既有),按 `req.opcoId` + `item.skuCatalogId` lookup
- [x] **OpCo budget** 顯示:`assigned / allocated` + headroom,數字用 **mono**(DS-5)
- [x] **Tenant seats** 顯示:`useTenantSkus(canSeePlatform)` —— **lazy,OPCO_IT 唔發 request**(D3 / R1)
- [x] 缺 row → 文案 **`no allocation set`**(唔係淨個 `0`,R4)—— 實際 keyed on `allocated === 0`(缺 row 同 0 預算對操作員係同一件事)
- [x] ⚠️ **確認冇傳 `?includeEmpty=true`**(§2.4 / R3)—— 用未帶參數嘅既有 `useLedger()`
- [x] 只喺**可 assign** 嘅 line item 顯示(終態 ASSIGNED / CANCELLED 唔顯示,減噪音)
- [x] 🔴 **修 `hooks/mutations.ts`**:`useAssignLineItem` 加 `invalidateQueries(['license','ledger'])` —— spec A6 前提錯(原本冇 invalidate ledger),唔修則 assign 後容量數字 stale。見 spec §7 changelog
- [x] 色階鏡射既有 `by-opco-view.tsx:112`(`headroom < 0 ? text-danger : text-fg-muted`)—— 唔發明新色階;「冇位但未超」靠文案而唔靠色
- [x] tenant 層標明 **`last sync`** + `owned=null` → `unknown — no tenant snapshot`(查證 `tenant-owned.service.ts` 確認係 snapshot 唔係 live Graph)

## Verification

- [x] **A1** ADMIN:兩層都見 —— 單 `cmrdnmi7w…`(PFU-Asia)三個 line item 全部渲染;DOM + light/dark 截圖為證
- [x] **A2** OPCO_IT 對照:**Network 面板證冇發 `/license/tenant-skus`**(ADMIN 有 `#101 200`,OPCO_IT 該 request **完全唔存在**)+ DOM `hasTenantSeats: false` + 0 console error;run-as 已先驗 `/me` 真返 `OPCO_IT`/`RHK`(**唔係** ADMIN fallback)· ⚠️ **caveat**:dev DB 冇 RHK pending 單,所以呢個對照做喺**冇 line item** 嘅 RHK 單上 ⇒ 係「網絡層+文字層雙重證明唔出現」,**唔係**「有 line item 而只見 OpCo 層」嘅並排對照
- [x] **A3** 數字對得返 —— Power BI Pro `36/43 · 7 left` 對 DB `alloc 43 / assigned 36`;tenant 三個 SKU 全部對得返 `TenantSkuSnapshot`(0/263 → `0 free of 0` 證 floor 生效 · 761/**769** 超用 → `0 free of 761`)。⚠️ 對照嘅係 **DB 真值**而唔係 Assets 頁面(兩頁同一 endpoint,對 DB 更根本)
- [x] **A4** 冇 ledger row 嘅組合 → **`0/0 · no allocation set`**(Copilot + F3 兩個);**確認冇傳 `includeEmpty`**(network 只見 `/api/license/ledger` 無 query string)· ✅ **零 DB 改動達成** —— 用「ledger 148 行 vs 2369 個可能組合」自然缺 row,唔使造 0/0
- [x] **A5** 3 個唔同 SKU → **`/api/license/ledger` 只出現一次**(network #100),`tenant-skus` 一次 ⇒ 零 N+1
- [x] ➕ **終態唔顯示**(checklist 要求):同一張單第一個 `Office 365 F3` 係 `Assigned` ⇒ **完全冇容量行**,截圖為證
- [ ] **A6** assign 成功後數字即時 +1(唔靠 reload)—— ⚠️ **前提已修**(見 spec §7);**live 驗方式待 owner 決定**:真 assign 會打真 tenant Graph(§3.4 禁),而 `GraphService` 唔 env-mockable
- [x] **A7** web test 不降 + capacity helper 三分支覆蓋 —— **163 passed / 20 files**(基線 151 + 12 新)
- [x] **A8** lint(web)零 output · `tsc --noEmit` 0 · `npm run build` OK —— 改 `mutations.ts` 後**重跑過**(chunk hash 由 `index-CVE27SYE` → `index-DqNaGsZl`,證非 cache)
- [x] **A9** `ui-design` 逐條自檢(見 progress Day 3);**light + dark 都實看**(截圖 + `getComputedStyle` 證 token 隨 `.dark` swap:`rgb(157,157,167)` on `rgb(8,8,10)`);所有數字 `font-mono`(DOM class 為證)· 零新色 / 零新 primitive / 零新 icon · Assign 仍唯一 primary
- [x] ~~造 0/0 test 格用 scratch DB~~ —— **唔需要**:A4 改用「ledger 天然缺 row」嘅組合達成 ⇒ **dev DB 零改動、零 `LedgerAdjustment` 污染**,亦唔需要 scratch DB
- [x] 環境還原:run-as env 已清(`/me` 驗返 ADMIN)· 注入嘅 `uop.localProfile` 已 `removeItem` · theme 復原 light · repo root 嘅 `ch009-light.png` 已刪(`.playwright-mcp/` 本身已喺 `.gitignore:40`)

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
