---
phase: W38-license-ops-provider
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-27
---

# Phase W38 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## ✅ D0 Gate —— 已解除(2026-07-27,Chris Lai)

- [x] **OQ-1 拍板** = **選項 A**:provider **只收 assign 路徑**;`reconcile` / `catalog` / `integration-probe` 明文不動
- [x] **OQ-2 拍板** = **選項 A**:`sync-sweep.findUser` **永遠直接 `GraphService`**,唔走 provider(否則推翻 ADR-0015「平台證實」)
- [x] **OQ-3 拍板** = **選項 B**:**唔加** `listUsersBySku()`(零 caller;介面加方法係 additive,唔會令庚返工)
- [x] Chris approve plan → `plan.md` frontmatter `status: draft → active`

## F1 — `LicenseOperationsProvider` 介面 + `AssignOutcome` 詞彙

- [x] 建 `apps/api/src/integration/license-ops/` + `license-ops.provider.ts`(abstract class 做 DI token —— 免除 magic string)
- [x] 定義 `AssignOutcome` union 5 個 variant(`assigned` / `already_assigned` / `not_synced` / `no_seats` / `error`)
- [x] 介面方法按 OQ-1/OQ-3 拍板結果收窄 → **3 個**(`listTenantSkus` / `findUser` / `assignLicense`)
- [x] 加 vendor-neutral type `TenantSkuSeats` / `DirectoryUser`(**刻意窄過** Graph 型別:唔逼 n8n 實作虛構 `capabilityStatus`/`appliesTo`;`displayName`/`accountEnabled` 係冇人讀嘅 PII,唔過 seam)
- [x] **error 契約**(Chris 2026-07-27 拍板,plan §7 changelog):transport 失敗 **throw**,唔入 outcome
- [x] verify:介面檔**零 vendor import** —— 實跑 `grep -c` = **0**

## F2 — `GraphLicenseProvider` 實作

- [x] `graph-license.provider.ts` —— 注入既有 `GraphService`,**唔改 `graph.service.ts` 一行**
- [x] `action` 字串**逐字照抄** `assign.service`(佢哋會出現喺 503 message,純重構唔可以郁一個字)
- [x] ~~逐 outcome 寫 test(5 個 variant 全覆蓋)~~ → 🚧 **改為:GraphLicenseProvider 實際產生得到嘅 variant 全覆蓋**。**Graph 只產生 `assigned`**,唔係遺漏(見 progress Day 2 / plan §7 changelog):`not_synced`+`no_seats` 由 caller 喺入 provider **之前**攔截(移入嚟 = provider 變決策者,違反 D0)· `already_assigned` **Graph 根本分唔到**(POST 冪等且唔報告)· `error` 留畀庚
- [x] **H4 test**:餵含 UPN 嘅 vendor error,assert 503 **message** 唔含該 UPN(9 test 全綠)
- [x] 🔴 **test 意外揪到既有缺陷**:`graphUnavailable()` 把 vendor error 原封 `logger.error`,而 Graph 404 body 帶 UPN ⇒ **UPN 真係入咗 log**。非 W38 引入、影響**全部**直接 Graph caller;修佢 = 改 log 行為 = 唔屬純重構 ⇒ 登 BUG 候選,**test 描述已收窄到只宣稱 message 乾淨**
- [x] verify:`git diff apps/api/src/integration/graph/` = **空**(實跑)

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
