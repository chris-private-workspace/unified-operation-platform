---
phase: W28-permission-matrix
name: "權限矩陣 — 由 @Roles runtime derive + 唯讀 UI + drift 防護"
sprint_week: W28
start_date: 2026-07-20
end_date: 2026-07-20          # planned, may slip with changelog log
status: active                # draft | active | closed
spec_refs:
  - docs/adr/0009-platform-audit-trail.md Decision 8.5（權限矩陣 code-derive,唔起 permission table）
  - docs/02-architecture/audit-and-integration-observability.md §2.3（現況:冇任何地方記錄 role 做到咩）
prior_phase: W27-d365-scope
---

# Phase W28 — 權限矩陣

> **Plan version**:1.0(initial)
> **Owner**:AI(執行)/ Chris Lai(decision)
> **Approved by**:Chris Lai(2026-07-20 — 批 rollout item 2「開,唔使等 ADR」)

## 1. Scope

Chris 提出嘅 audit 四項需求入面,第 ③ 項「**權限可訪問同執行嘅功能 / 頁面列表**」目前**完全冇** —— 冇 DB 表、冇文件、冇 UI。要答稽核員「ADMIN 同 OPCO_IT 分別做到咩」,唯一方法係開 9 個 controller 逐個數 `@Roles` decorator。

本 phase 交付一個**由 code 自動 derive** 嘅權限矩陣:後端 runtime 掃 Nest metadata 產生 role × endpoint 對照,前端 Settings 加唯讀矩陣頁,再加 drift 防護 test。

**點解唔起 permission table**(ADR-0009 Decision 8.5):兩處真相必然 drift —— DB 表寫住「可以」但 `@Roles` 唔畀,就會出現一張**講大話嘅稽核文件**,比冇文件更危險。`@Roles` decorator 本身已經係 enforcement point,矩陣必須係佢嘅 **derived view**,唔可以係第二份手寫真相。

本 phase **零行為改動** —— 唔加、唔改、唔郁任何現有權限。純粹令現有權限**變成可查證**。

## 2. Deliverables

### F1 — 後端 `GET /admin/permissions`(runtime derive)

- **Spec ref**:ADR-0009 Decision 8.5
- **Dependencies**:無(`@nestjs/core` `DiscoveryService` 係現有 dep,**唔觸發 H2**)
- **做法**:用 Nest `DiscoveryService` + `MetadataScanner` 掃所有 controller handler,對每個 route 讀出:HTTP method · path · handler 名 · `@Roles` metadata(method-level 優先,fallback class-level)· 有冇 `@Public()` · 額外 guard(如 `IntakeKeyGuard`)。
- **🔴 關鍵正確性要求**:特殊 case **必須明確標示,唔可以靜靜當成 public**:
  - `@Public()` + `IntakeKeyGuard`(`/requests/intake`)→ 標 `m2m`,**唔可以**顯示成「任何人可訪問」
  - `auth` controller(login/refresh/logout)→ 標 `public`
  - `me` controller → 標 `authenticated`(任何已登入 role)
  - **冇任何 `@Roles` 又唔係上述任何一種** → 標 **`⚠️ UNGUARDED`**(呢個係 feature,唔係 bug —— 要主動曝露)
- **Acceptance criteria**:
  - 回傳矩陣涵蓋**全部 9 個 controller** 嘅所有 route,一條都唔漏
  - method-level `@Roles` 正確覆蓋 class-level(`license.controller.ts` 有 6 處 method-level override,係最好嘅測試對象)
  - `/requests/intake` 標 `m2m` 而非 public
  - endpoint 自身 `@Roles(ADMIN)` —— 權限清單只畀 ADMIN 睇
- **Effort estimate**:3h
- **Owner**:AI

### F2 — 前端 Settings › Permissions 唯讀矩陣頁

- **Spec ref**:`docs/02-architecture/design-system.md`(H6)
- **Dependencies**:F1
- **做法**:Settings 加第 6 個 tab(`ShieldCheck` lucide icon),表格顯示 role × endpoint;`⚠️ UNGUARDED` 用 danger tone Badge;`m2m` 用 info tone。按 controller 分組。
- **Acceptance criteria**:
  - 三個 role 各自可訪問嘅 endpoint 一目了然
  - token-only(H6)· **一個 view 一個 primary action**(本頁唯讀 → **零** primary)· lucide stroke-only · light + dark 都驗
  - 非 ADMIN 開呢個 tab → graceful restricted state(沿用 `users-panel` / Platform mode 既有 pattern,唔白畫面)
- **Effort estimate**:2.5h
- **Owner**:AI

### F3 — Drift 防護 test(H5)

- **Spec ref**:ADR-0009 Decision 8.5(「derived + test 鎖死 = 單一真相 + 可稽核」)
- **做法**:
  1. **Snapshot test** —— 把當前矩陣鎖成 expected fixture。有人改 `@Roles` 但冇意識到影響 → test 紅,強制佢承認呢個係權限變更。
  2. **Unguarded 偵測 test** —— 除已知白名單(`auth` public / `me` authenticated / `intake` m2m)外,**任何** route 冇 `@Roles` → test **fail**。呢條防「新加 controller 忘記加 guard」。
- **Acceptance criteria**:
  - 兩條 test 都要 **fails-before 實證**(故意改一個 `@Roles` / 加一個無 guard route → 睇住佢紅,再還原)
  - `apps/api` 既有 test 不降(213 → 213+)
- **Effort estimate**:1.5h
- **Owner**:AI

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | `GET /admin/permissions` 涵蓋全部 controller route | 9 controller 全覆蓋,零遺漏 | live curl 對 `@Roles` grep 逐條核 | Yes |
| G2 | method-level override 正確 | `license.controller.ts` 6 處 override 全對 | curl 檢視 | Yes |
| G3 | 特殊 case 標示正確 | intake=`m2m` · auth=`public` · me=`authenticated` | curl 檢視 | Yes |
| G4 | Drift + unguarded test 綠且 **fails-before 實證** | 2 條 test | `npm test` + 故意破壞驗紅 | Yes |
| G5 | 前端矩陣頁 light + dark 都正確 | 兩個 theme | browser DOM 驗 | Yes |
| G6 | api / web build + lint + test 全綠 | api ≥213 · web ≥85 | `npm run build && npm test && npm run lint` | Yes |
| G7 | 零行為改動 | 冇任何現有 `@Roles` 被改 | `git diff` 逐行核 | Yes |

## 4. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `DiscoveryService` 攞唔到 path metadata(依賴 Nest 內部 metadata key) | **Med** | Med | **D1 先做 30 分鐘 spike**;唔得就 fallback「手寫 const map + drift test 鎖死」(較弱但仍單一真相可驗) |
| R2 | 矩陣暴露完整 endpoint 清單 = 資訊洩漏 | Low | Med | endpoint 自身 `@Roles(ADMIN)`;前端 tab 對非 ADMIN restricted |
| R3 | **特殊 case 標錯 → 稽核文件講大話**(例:intake 顯示成 public) | Med | **High** | G3 專驗;`m2m` / `public` / `authenticated` / `UNGUARDED` 四種標示各有 test |
| R4 | 矩陣睇落齊全,但實際 scope 限制(OPCO_IT per-OpCo)睇唔出 | **High** | Med | 頁面明文加註:**role 只係第一層;OPCO_IT 另有 per-OpCo row-level scope(AUTH-3a `opco-scope.ts`),矩陣唔表達呢層**。唔可以令人以為 OPCO_IT 見到全部 OpCo 資料 |

> **R4 係最容易出事嘅一條** —— 矩陣答「邊個 role 掂到邊個 endpoint」,唔答「掂到之後見到幾多 row」。呢兩件事喺稽核語境好易撈亂。

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables targeted |
|---|---|---|---|
| D1 | 2026-07-20 | DiscoveryService spike(R1)→ F1 endpoint → F3 test → F2 前端 → verify | F1, F2, F3 |

## 6. Dependencies on Prior Phase

Carry-over 唔係嚟自 W27 retro,而係嚟自 **2026-07-20 audit 規劃**:
- ADR-0009 Accepted(Decision 8.5 定咗「唔起 permission table」)→ 本 phase 落實。
- 本 phase **唔** block 於 ADR-0009 其餘決定(AuditLog schema / PII 策略)—— 純 derive,零 schema 改。
- 完成後 **AUDIT-3**(`AuditLog` 落地)為下一個候選。

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-20 | Initial plan,status=active | Chris 批 rollout item 2「開,唔使等 ADR 拍板」 | Chris Lai |

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入第 7 節 changelog,小 detail 變動可直接 inline edit。
