---
phase: W29-audit-log
name: "通用 AuditLog 落地 — 白名單 before/after + 13 個事件覆蓋 + Audit UI"
sprint_week: W29
start_date: 2026-07-20
end_date: 2026-07-22          # planned, may slip with changelog log
status: active                # draft | active | closed — Chris 2026-07-20 approve §9 三點後 flip
spec_refs:
  - docs/adr/0009-platform-audit-trail.md（全份 — Decision 3/4/5/6/7/8）
  - docs/02-architecture/audit-and-integration-observability.md §2.2（零留痕清單）· §5（model 設計）
prior_phase: W28-permission-matrix
---

# Phase W29 — 通用 AuditLog 落地

> **Plan version**:1.0(initial)
> **Owner**:AI(執行)/ Chris Lai(decision)
> **Approved by**:_(待 Chris approve — 見 §9 三個要拍板嘅點)_

## 1. Scope

ADR-0009 已 Accepted,本 phase 落實 rollout **item 3**:把 `docs/02-architecture/audit-and-integration-observability.md` §2.2 列出嘅**全部零留痕寫入操作**變成可稽核。

呢個係 Chris 四項 audit 需求入面**最後亦最大**嗰項(第 ④ 項「操作記錄」)。前三項現況:

| # | 需求 | 狀態 |
|---|---|---|
| ① | 用戶列表 | ✅ 早已有(`AppUser` + Users & roles UI) |
| ② | 角色列表 | ✅ `Role` enum 三值 |
| ③ | 權限可訪問功能列表 | ✅ **W28 完成**(`GET /admin/permissions` + 唯讀 UI + drift test) |
| ④ | **操作記錄** | ❌ **本 phase** |

**與 W28 嘅根本差異**:W28 係**零行為改動**(純 derive 現有 `@Roles`)。**本 phase 相反 —— 會 additive 改 schema、會 hook 入 6+ 個既有 write service、會改佢哋嘅 transaction 邊界。** 風險等級明顯高一級,所以 §4 風險同 §5 分階段都寫得比 W28 保守。

## 2. Deliverables

### F1 — Schema + 白名單基建

- **Spec ref**:ADR-0009 Decision 3(model)+ Decision 5(白名單)
- **內容**:
  - `AuditLog` model(**additive**,無改任何現有欄位 → 無 breaking migration)+ migration
  - `audit-fields.ts` —— **每個 `targetType` 一張明文白名單**,`pickAuditFields()` 純函數
  - `audit.service.ts` —— `log(tx, entry)`,**接受 Prisma transaction client**(Decision 8.1)
- **Acceptance criteria**:
  - migration apply 得,現有 223 test 不降
  - 白名單以外欄位**一律唔入** `before`/`after`
  - `passwordHash` / `tokenHash` 永久 blacklist,即使有人手誤把佢加入白名單都要被擋(雙重保險)
- **Effort estimate**:3h

### F2 — Hook 落 write path(13 個事件)

- **Spec ref**:ADR-0009 Decision 4
- **分三組落**(逐組 commit,唔一次過改晒 6 個 service):

| 組 | 事件 | 觸及 service |
|---|---|---|
| **F2a identity** | `user.create` · `user.update` · `user.role_change` · `user.deactivate` · `user.password_reset` | `user-admin.service.ts` |
| **F2b auth 事件** | `auth.login_success` · `auth.login_failed` · `auth.locked` | `auth.service.ts` |
| **F2c config + bulk** | `opco.create` · `opco.update` · `catalog.update` · `allocation.import` · `drift.resolve` | `opco.service.ts` · `catalog.service.ts` · `allocation-import.service.ts` · reconcile |

- **`user.role_change` 唔係獨立操作** —— 佢係 `user.update` 入面 role / opcoScopeId 有變嗰個情況。**分開一個 action 記**,因為權限變更係稽核最關心嘅事件,唔應該埋喺一般 update 裡面要人自己 diff 出嚟。
- **`allocation.import` 記 summary-level 一條**,唔係每行一條(import 本身已有 summary;逐行會淹沒 audit table)。
- **Acceptance criteria**:
  - 13 個事件各有 test 證實**真係寫低咗**(唔止「唔 crash」)
  - audit 寫入同主操作**同一 `$transaction`**(Decision 8.1)—— 有 test 證實主操作失敗時 audit 唔會留低
- **Effort estimate**:6h

### F3 — `GET /admin/audit`（查詢 + 分頁）

- **Spec ref**:ADR-0009 Decision 8.2(ADMIN-only)
- **內容**:篩選 `actorId` / `targetType` / `targetId` / `action` / 日期範圍;分頁;`@Roles(ADMIN)`
- **Acceptance criteria**:
  - 非 ADMIN → 403(**採 P-B 故 table 含 PII,呢條唔可以放寬** —— ADR Decision 7 連帶義務 ①)
  - 分頁有上限(單次 max 100),防止一次拉走成個 table
  - W28 嘅 `permissions.spec.ts` unguarded test 會自動覆蓋呢個新 endpoint(冇 `@Roles` 就會紅)
- **Effort estimate**:2.5h

### F4 — 前端 Audit UI（獨立 `/audit` 頁,Q2 拍板)

- **Spec ref**:`docs/02-architecture/design-system.md`(H6)
- **內容**:**獨立 route `/audit` + sidebar 項目**(Administration 區,同 admin nav 一致嘅 gating)—— 時間序表 + 篩選(actor / action / targetType / 日期)+ 分頁 + before→after 展開
- **Acceptance criteria**:
  - token-only · 唯讀故**零 primary action** · lucide-only · light + dark
  - 非 ADMIN:sidebar 項目 **proactive 隱藏**(沿用 `canSeeAdminNav` pattern,AUTH-3b)+ 直接開 URL 時 graceful restricted state(**後端 403 先係真權威**)
  - **更新 `design-system.md`** 記低呢個係 prototype 以外、owner-approved 嘅新畫面(§9.1)
- **Effort estimate**:4h(+0.5h SSOT 更新)
- **注意**:Overview 嘅 activity feed(BACKLOG `FE-activity`)**唔喺本 phase** —— 佢係另一個 candidate,本 phase 只解封佢。

### F5 — H4 / H5 test

- **🔴 H4 白名單 test(最重要)**:餵一個含 `passwordHash` / `tokenHash` 嘅完整 `AppUser` object 落 `pickAuditFields()`,assert 結果**唔含**任何 secret。呢條 test 係 PII 邊界嘅唯一自動化保證。
- **H5**:13 個事件寫入 test + transaction rollback test + 分頁 / 篩選 test
- **Effort estimate**:含喺 F1/F2/F3 內

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | Migration additive,零 breaking | 現有 test 不降 | `npx prisma migrate dev` + `npm test` | Yes |
| G2 | **`passwordHash` / `tokenHash` 永不入 audit** | 0 | 專門 H4 test + live DB 抽查 | **Yes(硬紅線)** |
| G3 | 13 個事件全部真係寫低 | 13/13 | 逐個 test + live 觸發後查 DB | Yes |
| G4 | audit 與主操作同一 transaction | 主操作失敗 → 無 audit 遺留 | rollback test | Yes |
| G5 | `GET /admin/audit` 非 ADMIN → 403 | 403 | live curl 扮 OPCO_IT(同 W28 三重驗證做法) | Yes |
| G6 | 前端 light + dark | 兩個 theme | browser DOM 驗 | Yes |
| G7 | build + lint + test 全綠 | api ≥223+ · web ≥85 | 三個 command | Yes |
| G8 | **零既有行為改動** | 既有 API 回應 / 權限 / 對帳邏輯不變 | 既有 test 全綠 + `git diff` 核 | Yes |

## 4. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | **`$transaction` 改造觸及多個既有 service,改壞現有行為** | **High** | **High** | 分三組(F2a/b/c)逐組 commit + 逐組跑全 test;既有 test 就係迴歸網。**任何一組令既有 test 紅 → 即停,唔繼續落下一組** |
| **R2** | **白名單漏咗 → PII / secret 寫入 audit(H4 災難)** | Med | **Critical** | G2 硬紅線;白名單 **allow-list 而非 deny-list**;另加永久 blacklist 做雙重保險;live DB 抽查 |
| R3 | audit 寫入失敗 block 業務操作(Decision 8.1 刻意取捨) | Med | Med | 呢個係**刻意**設計 —— 寧可整個操作失敗都好過「做咗但冇記錄」。但要確保 audit 寫入本身唔會因 payload 過大 / JSON 序列化問題而 throw → 白名單天然限制 payload 大小 |
| R4 | 13 個事件容易漏 | Med | Med | F5 逐個 test;checklist 逐個 tick |
| R5 | audit table 增長無上限(Decision 8.3 唔做 retention) | Low(短期) | Med(長期) | 已有三個 index;本 phase **唔做** retention(避免過早優化),但 closeout 要喺 BACKLOG 登記為將來 candidate |

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-07-20 | F1 schema + 白名單 + AuditService + **H4 test 先行** | F1, F5(部分) |
| D2 | 2026-07-21 | F2a → 跑全 test → F2b → 跑全 test → F2c → 跑全 test | F2 |
| D3 | 2026-07-22 | F3 endpoint + F4 前端 + live 驗 + closeout | F3, F4 |

## 6. Dependencies on Prior Phase

- **ADR-0009 Accepted**(OQ-1 記白名單 before/after · OQ-2 = P-B)→ 本 phase 全部設計依據。
- W28 carry-over:`REVIEWED_AUTHENTICATED` 白名單將來要加 = security decision(本 phase 新 endpoint 有 `@Roles(ADMIN)`,唔會觸及)。
- W28 嘅 unguarded test **會自動覆蓋本 phase 新增嘅 endpoint** —— 免費迴歸網。

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-20 | Initial plan,status=**draft**(未 active) | 待 Chris approve §9 三點 | — |
| 2026-07-20 | **§9 三點拍板 → status `draft` → `active`** | Q1 記 `metadata.emailAttempted` · **Q2 改為獨立 `/audit` 頁 + sidebar(偏離原建議)** · Q3 逐組 commit 做完三組先 review | Chris Lai |
| 2026-07-20 | **F4 scope 改**:Settings tab → 獨立 route + sidebar 項目;新增「更新 `design-system.md`」為 F4 交付物 | Q2 拍板連鎖後果;查證 prototype **無** audit 畫面,故屬 owner-approved 新畫面,按 H6 必須補 SSOT 否則將來 fidelity audit 會報成 drift | Chris Lai(方向)/ AI(H6 判斷) |

## 8. 對 ADR-0009 嘅一處收緊提案（要 Chris 知悉）

**ADR-0009 Decision 5 只講 `before`/`after` 要白名單,冇講 `metadata`。** 但 `metadata` 同樣係 `Json?` 欄 —— 如果唔管,佢就變成繞過白名單嘅**逃生門**(例:login 失敗想記低嘗試過嘅 email,順手掟成個 request body 入去)。

**提案:`metadata` 同樣受固定 key set 約束**,只允許 `reason` / `correlationId` / `source` / `emailAttempted` 幾個明確 key。

呢個係**收緊**唔係偏離(ADR 冇容許過 metadata 自由塞),所以我當佢係實作細節寫入 plan;但因涉 H4 邊界,**closeout 時建議喺 ADR-0009 補一句註**,令將來睇 ADR 嘅人唔會以為 metadata 冇管。

## 9. 拍板結果（Chris,2026-07-20)

| # | 問題 | 決定 |
|---|---|---|
| **Q1** | `auth.login_failed` 記唔記嘗試過嘅 email | ✅ **記入 `metadata.emailAttempted`** —— 偵測撞庫 / 鎖戶排查需要。**全 phase 唯一主動寫 PII 落 `metadata` 嘅 case**,owner 已明確知情 |
| **Q2** | Audit UI 位置 | ✅ **獨立 `/audit` 頁 + sidebar 項目**(**偏離我原建議嘅 Settings tab**)→ 連鎖後果見 §9.1 |
| **Q3** | F2 review 節奏 | ✅ **逐組 commit,做完三組先 review**;中途任何一組令既有 test 紅 → **即停報告**,唔繼續 |

### 9.1 Q2 嘅連鎖後果（拍板後查證補充)

Grep 過 `design_handoff_licenseops/prototype/`(`full-console.html` + `IT Ops Platform.dc.html`)—— **prototype 冇 audit / activity log 畫面,亦冇對應 sidebar 項目**。全份 handoff 得 `only auditor` 一個 role 描述字眼,唔係畫面。

所以獨立 `/audit` 頁 = **prototype 以外嘅新畫面 + 新導航項目**。按 H6 判斷:

- **唔屬 violation** —— owner 已明確 approve 方向;實作只會**組合既有 primitive**(sidebar item / Card / Badge / 既有表格 pattern),**唔加新 token、唔加新 accent、唔加新元件類型**。H6 明文允許「用既有 token 砌新畫面」。
- **但必須補 SSOT** —— F4 完成時要更新 `docs/02-architecture/design-system.md`,記低「`/audit` 係 prototype 以外、owner-approved 嘅新畫面 + 新 sidebar 項目」。**唔補嘅話,將來 fidelity audit 會把佢報成 drift**(同當年 Avatar gradient 一模一樣嘅情況)。

已加入 checklist F4。

---

**Lifecycle reminder**:呢份 plan **status=draft**,**未 approve 唔開工**(PROCESS R1)。approve 後 flip `active`,重大 deviation 入 §7 changelog。
