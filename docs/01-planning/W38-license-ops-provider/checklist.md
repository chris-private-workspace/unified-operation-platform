---
phase: W38-license-ops-provider
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-27
---

# Phase W38 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## 🔴 D0 Gate —— 未拍板唔准開工(R1)

- [ ] **OQ-1 拍板**:provider 收邊幾個 `getSubscribedSkus` consumer(建議 = 只收 assign)
- [ ] **OQ-2 拍板**:`sync-sweep.findUser` 走唔走 provider(建議 = **唔走**,否則推翻 ADR-0015)
- [ ] **OQ-3 拍板**:`listUsersBySku()` 加唔加(建議 = 唔加,零 caller)
- [ ] Chris approve plan → `plan.md` frontmatter `status: draft → active`

> 以上四項未全部 ✅ 之前,**一行 code 都唔寫**。

## F1 — `LicenseOperationsProvider` 介面 + `AssignOutcome` 詞彙

- [ ] 建 `apps/api/src/integration/license-ops/` + `license-ops.provider.ts`(abstract class / interface token)
- [ ] 定義 `AssignOutcome` union 5 個 variant(`assigned` / `already_assigned` / `not_synced` / `no_seats` / `error`)
- [ ] 介面方法按 OQ-1/OQ-3 拍板結果收窄
- [ ] verify:介面檔**零 vendor import** —— `grep -c "microsoft-graph" license-ops.provider.ts` = 0

## F2 — `GraphLicenseProvider` 實作

- [ ] `graph-license.provider.ts` —— 注入既有 `GraphService`,**唔改 `graph.service.ts` 一行**
- [ ] Graph 404 → `not_synced`;座位不足 → `no_seats`;其餘 throw → 經 `graphUnavailable()` → `error`
- [ ] 逐 outcome 寫 test(5 個 variant 全覆蓋)
- [ ] **H4 test**:餵一個含 UPN 嘅 Graph error,assert outcome `details` **唔含該 UPN**
- [ ] verify:`git diff apps/api/src/integration/graph/graph.service.ts` = **空**

## F3 — `assign.service` 換依賴(行為零改變)

- [ ] `fulfilment.module` / `integration.module` wire provider(DI token + 預設 `GraphLicenseProvider`)
- [ ] `assign.service` 改用 provider;移除 `GraphService` / `GraphUser` / `graphUnavailable` import
- [ ] 🔴 **保留** `graph.assignLicense()` 內部嗰次重複 `findUser`(R2 —— 唔准順手優化)
- [ ] verify:ADR-0016 預算 gate 仍然喺 inventory read **之前**(逐行對 `assign.service.ts`)
- [ ] **G2 verify**:`assign.service.spec.ts` **既有 assertion 零改動**(`git diff` 只可以有新增行)

## F4 — 邊界鎖 test(負面斷言)

- [ ] test:`reconcile.service` 唔經 provider(仍直接 `GraphService`)+ 註明**點解**(對帳基準)
- [ ] test:`integration-probe` 唔經 provider + 註明**點解**(探針要探 Graph 本身)
- [ ] test:`sync-sweep` 按 OQ-2 結果 + 註明**點解**(ADR-0015「平台證實」)
- [ ] **G5 fails-before 實證**:故意令 reconcile 走 provider → 上面 test 真係變紅 → 還原

## F5 — Doc-sync

- [ ] ADR-0017 加**實作補註**(唔改 Accepted 內容):OQ-1/2/3 拍板 + 「D2 表當時未計 sync-sweep」
- [ ] `BACKLOG.md` N8N-SEAMS-己庚辛 row 更新(己 ✅ / 庚解封)
- [ ] `SESSION_SUMMARY.md` 座標更新

## Verify(closeout 前全跑)

- [ ] `npm test -w @uop/api` —— 全綠,≥433
- [ ] `npm run lint` 兩邊 0 warning + `tsc --noEmit`
- [ ] **G4**:`schema.prisma` + 3 個 `package.json` diff **全 0**
- [ ] **G8 live**:dev 真跑一次 assign,stage / ledger 增量同重構前一致(前後 DB 對照)
- [ ] `anti-patterns` skill 自檢(尤其 **AP-1 假驗收** / **AP-12 冇驗唔應該發生嘅嘢**)

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro(= **庚** `N8nLicenseProvider`)

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
