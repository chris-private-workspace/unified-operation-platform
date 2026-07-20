---
phase: W28-permission-matrix
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: in-progress    # in-progress | closed
---

# Phase W28 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-20: Kickoff

**Action**:Phase W28 kickoff(rollout item 2)

- Templates copied from `_templates/phase/`
- `plan.md` filled,status=`active`
- `checklist.md` derived from plan deliverables(F0 spike + F1 backend + F2 frontend + F3 drift test + Verify)
- **前置背景**(唔係嚟自 W27 retro,而係 2026-07-20 audit 規劃):
  - Chris 提三問(n8n 接口 / integration UI / audit 需求)→ 查證 → pre-ADR 分析 `02-architecture/audit-and-integration-observability.md`
  - **ADR-0009 Accepted**(Chris 拍板 OQ-1 = 記白名單 before/after · OQ-2 = P-B)
  - Chris 批 6 項 rollout 順序;本 phase = **item 2**,經確認「開,唔使等 ADR」(item 2 唔受 OQ-1/OQ-2 影響,因 Decision 8.5 已定「唔起 permission table」)

**本 phase 定位**:**零行為改動** —— 唔加唔改任何現有權限,純粹令現有 `@Roles` 變成可查證(derived view + drift test)。

**已識別嘅兩個主要風險**(plan §4):
- **R1** `DiscoveryService` 可能攞唔到 path metadata → D1 先 spike,有 fallback
- **R4** 矩陣答「邊個 role 掂到邊個 endpoint」,**唔答**「掂到之後見到幾多 row」(OPCO_IT per-OpCo scope 係另一層)→ 頁面必須明文註記,否則稽核語境會撈亂

**Commit**:`<pending>` — `chore(planning): kickoff W28 permission-matrix`

---

## Day 1 — 2026-07-20

### Done

**F0 spike 完成 —— R1 解除,行 runtime derive,唔使 fallback。**

跑咗三個 sub-spike(臨時 `src/spike-discovery.spec.ts`,驗完即刪):

| Spike | 問題 | 結果 |
|---|---|---|
| **A** | `Reflect.getMetadata` 攞唔攞到 route path + HTTP method + `@Roles` + `@Public`? | ✅ **全部攞到** |
| **B** | test 內 `import AppModule` + `DiscoveryService` 列舉 controller? | ❌ **爆** —— `jwks-rsa` → `jose` 係 ESM,jest 唔 transform node_modules |
| **C** | 改用 glob `*.controller.ts` + `require` 逐個 load? | ✅ **9 個檔案 / 9 個 class,零 failure** |

**Spike A 實測輸出**(節錄 `LicenseController`,共 11 route):
- `classPath` = `license`,`rolesOnClass` = `[ADMIN, REGIONAL]`
- `listCatalog` → `GET catalog`,method-level `[ADMIN, REGIONAL, OPCO_IT]`
- `updateLedger` → `PATCH ledger/:id`,method-level `[ADMIN, REGIONAL, OPCO_IT]`
- `syncCatalog` / `updateCatalog` / `runReconcile` / `listTenantSkus` / `tenantSkuStats` → 無 override,繼承 class `[ADMIN, REGIONAL]`
- `IntakeController.push` → `POST intake`,`publicOnMethod = true`(`@Public()` 讀到,唔會誤判成「無 guard」)
- `MeController.me` → `GET /`,無 roles 無 public = `authenticated`

### Decisions / Open-Questions Resolved

**D1 — F1 同 F3 用唔同方式攞 controller list,但共用同一個 derive 純函數。**

Spike B 嘅失敗迫出一個更好嘅設計:

```
derivePermissions(controllers: Function[]) → PermissionEntry[]   ← 純函數,易 test
        ↑ F1 runtime:DiscoveryService.getControllers()
        ↑ F3 test:  glob *.controller.ts + require
```

**點解唔兩邊都用同一種**:production build 之後 `.controller.ts` 變 `.js`,runtime glob `.ts` 會搵唔到 → F1 **必須**用 DiscoveryService;而 jest 入面 AppModule 起唔到(spike B)→ F3 **必須**用 glob。

**額外好處**:兩條路殊途同歸 —— 如果 runtime 矩陣同 test 矩陣唔一致,本身就係一個 bug signal。

**D2 — F3 擴展既有 `auth/controllers-guarded.spec.ts`,唔另起爐灶。**
呢個 spec 已存在(手寫 assert 3 個 controller:License / Fulfilment / UserAdmin),但**冇 path/method、冇自動列舉** —— 新加 controller 唔會令佢紅。F3 會用 glob 覆蓋全部 9 個並保留佢既有 assert 意圖。

### 🔴 意外發現 —— 我 2026-07-20 手寫嘅權限矩陣有錯

`audit-and-integration-observability.md §2.3` 原本寫:

> `license.controller.ts:54,81,105,112,125` | **個別 GET** | + OPCO_IT

**錯**:嗰 5 個 method-level override 入面,`updateLedger` 係 **`PATCH ledger/:id`**,唔係 GET。OPCO_IT 可以**寫** ledger(ADR-0007 決定,service 層 `assertOpcoScope` 保護),唔止讀。

**呢個正正證明咗 F3 drift test 嘅價值** —— 人手抄 `@Roles` 一定會出錯,而錯咗嘅稽核文件比冇文件更危險(ADR-0009 Decision 8.5 原話)。已修正該表並標明完整矩陣由 F1 產出。

### Blockers
- 無。

### F1 + F3 完成

**F1 —— `GET /admin/permissions` live 200,34 route / 9 controller 全覆蓋。**

| Gate | 驗證 | 結果 |
|---|---|---|
| G1 | License 11 · Fulfilment 7 · UserAdmin 4 · Auth 3 · OpcoAdmin 3 · Me 2 · Opco/Outbound/Intake/Permissions 各 1 = **34** | ✅ 零遺漏 |
| G2 | `updateLedger` PATCH = +OPCO_IT · `updateCatalog` PATCH = 繼承 ADMIN/REGIONAL · `listTenantSkus` = OPCO_IT 排除 | ✅ |
| G3 | `/requests/intake` = **`m2m`** + `guards:["IntakeKeyGuard"]`(**唔係** public)· auth×3 = `public` · me×2 = `authenticated` | ✅ |

**結果本身係個好消息:全 34 條 route 零 `unguarded`** —— 冇任何 endpoint 漏咗保護。

**F3 —— 10 條 test,含兩條 fails-before 實證(G4)。**

| 實證 | 做法 | 結果 |
|---|---|---|
| 1 | `opco.controller.ts` 移走 `Role.OPCO_IT` | snapshot **紅**,diff:`GET /opcos → roles [ADMIN,REGIONAL,OPCO_IT]` → `[ADMIN,REGIONAL]` |
| 2 | `MeController` 加 `@Get('fails-before-probe')`(無 `@Roles`) | unguarded test **紅**,報 `GET /me/fails-before-probe (MeController.probe)` |

兩個都已還原,還原後 **api 213 → 223 test 全綠**(30 suites,1 snapshot)。

### 設計決定(實作期間)

- **`unguarded` 嘅定義**:全域 `JwtAuthGuard` + `RolesGuard` 之下,冇 `@Roles` ≠ 無保護 —— 佢係「任何**已登入**用戶可用」。所以真正嘅風險唔係「完全開放」,而係「應該限 role 但漏咗」。故 `unguarded` 定義為**冇 `@Roles` 且唔喺 `REVIEWED_AUTHENTICATED` 白名單**。白名單目前兩條(`GET /me` / `PATCH /me/password`),加一行 = security decision。
- **derive 邏輯逐步 mirror `RolesGuard`**(@Public 優先 → method roles → class roles)。若兩者唔一致,矩陣就會描述一啲冇人 enforce 嘅規則 —— 即係 ADR-0009 講嘅「講大話嘅稽核文件」。
- **`permissions.ts` 係純函數唔係 service** —— 因為要畀 runtime(DiscoveryService)同 test(glob)兩邊共用(D1)。

### Blockers
- 無。

### ⏳ 未驗項(H7 誠實標註)
- **非 ADMIN → 403 未 live 試** —— 要改 `AUTH_DEV_USER_EMAIL` + restart backend(屬用戶進程,唔擅自動)。class `@Roles(ADMIN)` 已由 unit test assert,`RolesGuard` 本身亦有 `roles.guard.spec.ts` 覆蓋,但**唔當已 live 驗**。

### 📌 順帶發現(唔屬本 phase,唔改)
`npm run lint` 有 **383 個 `Delete ␍`(CRLF)error**,全部散喺 4 個 W23-A 舊檔(`license/ledger-write.*` · `license/dto/ledger-write.dto.ts` · `license/license.module.ts`),同本 phase 改動無關。git 存 LF(`.gitattributes`)所以 CI 綠,屬本地 working-copy artifact(memory 早有記錄)。**按 §1.3 surgical 冇順手修**。本 phase 自己 5 個檔 lint exit 0。

### F2 完成 —— Settings › Permissions(第 6 tab)

`PermissionsPanel` 按 controller 分組(10 組 / 34 行)。**唯讀,零 primary action** —— `@Roles` 係唯一真相,呢頁冇嘢可以改。

**live browser 實測**(dev-bypass ADMIN):

| 驗證 | light | dark |
|---|---|---|
| 34 data row / 10 group / 6 個 tab | ✅ | ✅ |
| `POST /requests/intake` → 「Machine key」+ `IntakeKeyGuard`(**唔係** Public) | ✅ | ✅ |
| `GET /me` → 「Any signed-in」 | ✅ | — |
| R4 註記在頁 | ✅ | ✅ |
| 零 unguarded → 唔顯示 danger 句 | ✅ | — |
| theme token swap | `dark` class on root · page bg `rgb(8,8,10)` · badge `rgb(16,31,57)`/`rgb(95,155,255)` · path = **Geist Mono** | ✅ |

**ui-design 自檢**:DS-1 token-only ✅ · DS-2 唔 eyeball ✅ · DS-3 零 primary / 無新 accent ✅ · DS-4 light+dark ✅ · DS-5 path/method mono ✅ · DS-6 lucide stroke ✅ · DS-7 平面(1px border + surface tint)✅ · DS-8 狀態走 Badge semantic ✅ · DS-9 無新 motion ✅ · DS-10 短名詞 Sentence case ✅ · **DS-11 N/A**(prototype 無此畫面 —— 屬 H6 允許嘅「既有 primitive 砌新畫面」)· DS-12 N/A

### 🔴 事故 —— F2 期間一度落錯 branch(已完全恢復,零損失)

做 F2 途中,並行 session(Chris 另一個窗口寫規格書)`checkout` 咗新 branch `docs/system-spec-and-sow`,令我嘅 working tree 由 `docs/audit-integration-planning` 被切走。

**點樣察覺**:system-reminder 顯示 `auth.module.ts` / `adr/README.md` / `BACKLOG.md` 內容**冇咗當日改動**,但 `git status` 又報 clean —— 兩者矛盾。冇當佢係 stale 快照,而係實查 `git log` / `git branch -v`。

**實況**:HEAD 變成 `58417ff`(main 嘅 merge),之後 `ee3ce08`(並行 session)。我嘅 4 個 commit 完好保存喺 `docs/audit-integration-planning`(HEAD `a5126c7`),**一個都冇失**。F2 嘅未 commit 改動落咗喺錯 branch 嘅 working tree。

**處理**:`git checkout docs/audit-integration-planning` —— 4 個未 commit 檔案全部 carry over(兩 branch 只有 docs 分歧,web 無衝突),F1 source 復現(`auth.module.ts` 3 處 `PermissionsController`)。

**為何 F2 嘅 live 驗證仍然有效**:backend process 由 F1 commit 之後一直行緊(hot-reload 已載入 F1),所以 curl 200 同 browser 驗都係打真 F1 code —— 唔係因為 source 喺 working tree。

**教訓**:多 session 並行改同一 repo 時,**`git status` clean 唔代表喺預期 branch**。任何 system-reminder 同 git 狀態矛盾,一律當「真有事」去查,唔好當顯示問題。

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F0 spike | 0.5 | ~0.5 | 0 |
| F1 | 3 | ~1.5 | −1.5(spike 已掃清未知) |
| F3 | 1.5 | ~1 | −0.5 |
| F2 | 2.5 | ~1.5 | −1(既有 panel pattern 可沿用) |

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F1 | 3 | | |
| F2 | 2.5 | | |
| F3 | 1.5 | | |

### Commits
- _(待填)_

---

## Retro(填於 phase 結束)

### What worked
- _(待填)_

### What didn't work / unexpected friction
- _(待填)_

### Surprises / discoveries
- _(待填)_

### Carry-overs to W29
- _(待填)_

### ADR triggers
- 預期**無新 ADR** —— 純 derive,ADR-0009 Decision 8.5 已覆蓋
- 若 F0 spike 失敗改 fallback(手寫 const map)→ 屬 plan deviation,入 plan §7 changelog(R3),仍非 ADR 級

### Phase Gate result
- G1–G7:_(待填)_

### Phase status
- Closeout commit:_(待填)_
- Frontmatter status flipped to `closed`
- BACKLOG synced(R7)
- Phase W29 kickoff trigger:預期 = **AUDIT-3**(`AuditLog` 落地)

---

**End of W28 progress**
