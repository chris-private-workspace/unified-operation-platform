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

- [x] `integration.module` wire provider(`{ provide: LicenseOperationsProvider, useClass: GraphLicenseProvider }` + export)。**`fulfilment.module` 零改動** —— 佢 import `IntegrationModule`,新 export 自動到手
- [x] `assign.service` 改用 provider;移除 `GraphService` / `GraphUser` / `graphUnavailable` import
- [x] 非 `assigned` outcome **fail loud**(`ServiceUnavailableException`)而唔係靜靜當成功。今日 unreachable,但庚一落地就會行到 —— 喺度預先幫庚揀 replay/失敗點影響 stage machine 同 ledger,等於把真決策埋喺一個冇 test 到得到嘅分支
- [x] 🔴 **保留** `graph.assignLicense()` 內部嗰次重複 `findUser`(R2 —— `graph.service.ts` diff 係空,冇得順手優化)
- [x] verify:ADR-0016 預算 gate 仍然喺 inventory read **之前**(逐行對過 `assign.service.ts`)
- [x] **G2 verify** ✅✅ —— `git diff --numstat` = **`16  0`**(16 加 **0 刪**),即**一條既有 assertion 都冇郁**。做法:spec **唔 mock provider**,而係 wire **真嘅 `GraphLicenseProvider` 包住原本個 `GraphService` mock` —— 咁兩條 BUG-002 regression 先仲係餵 **raw vendor error** 去驗 503;mock 走個 provider 就會令 raw→503 嘅 wrap 跌出測試鏈,嗰兩條會靜靜降級成「503 會向上傳」,證明唔到嘢

## F4 — 邊界鎖 test(負面斷言)

- [x] `license-ops.boundary.spec.ts` —— **8 test**,靜態 source 檢查(鎖嘅係「呢個檔**完全冇**伸手去 seam」,import list 直接答得到,行為 mock 只答到佢行過嘅路徑)
- [x] test:`reconcile.service` 唔經 provider + **理由寫入 test 名**(對帳基準會變成「睇你 config 咗邊個 provider」)
- [x] test:`integration-probe` 唔經 provider + 理由(探針要探嘅**正是**被換走嗰個執行器,經 seam 就變成探 n8n 而標籤寫住 Graph)
- [x] test:`sync-sweep` 唔經 provider + 理由(ADR-0015「平台證實」)
- [x] ➕ 加埋 `catalog.service`(OQ-1 第四個 consumer)+ **正面斷言** `assign.service` 係**唯一**過 seam 嗰個(兼驗佢唔再自己掂 vendor,否則兩條路並存,庚只換到一半)
- [x] ➕ 每個 case 加**正面半邊**「still talks to GraphService directly」—— 淨係 assert「冇 import seam」嘅話,個檔被刪咗 / 唔再打 vendor 都會照綠
- [x] **G5 fails-before 實證** ✅ —— 喺 `reconcile.service.ts` 插一行 seam import → **`1 failed / 7 passed`**(啱啱好紅嗰條,其餘七條照綠)→ `git checkout --` 還原 → diff 空 + `grep -c license-ops` = **0**

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
