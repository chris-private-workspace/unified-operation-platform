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

### ✅ 補驗:非 ADMIN → 403(Chris 指示 restart 後實試)

原本標 ⏳ 未驗。Chris 指示重啟後補驗,**三重證明**(唔止一個 status code):

| # | 動作 | 結果 |
|---|---|---|
| ① | `AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk` 重起 → `GET /me` | `role:"OPCO_IT"` · `opcoScope:{code:"RHK"}` —— **確認真係扮到**,唔係 env 冇生效 |
| ② | `GET /admin/permissions` | **403** |
| ③ | 同一 session `GET /license/ledger` | **200 且只見 RHK** —— **證明 403 係 role gate,唔係 session 壞咗** |
| ④ | 還原預設重起 | `/me` = ADMIN · `/admin/permissions` = **200** · 34 route / unguarded=0 / m2m=1 |

③ 係關鍵 —— 淨係見到 403 唔足以斷定原因;要有一個「同一身分下應該成功」嘅對照,先證明係 role gate 生效。

**額外收穫**:呢次 restart 把 process kill 咗重新 build,所以 200 係由 **working tree source clean rebuild** 得出,唔再係之前 hot-reload 嘅 stale process —— 比原先嗰次驗證更有力(呼應上面 branch 事故:當時 live 驗證雖然有效,但確實係靠 runtime 而非 source)。

前端 reload 後端到端仍然 work(34 row / 10 group / intake = Machine key)。
**未 touch `.env`**(§4.4)—— 用 shell env 覆蓋,process env 優先於 `.env`。

### 📌 CRLF —— 查根因後發現「債早已還清」

原判斷:383 個 `Delete ␍` 係 4 個 W23-A 舊檔嘅技術債。**Chris 指示順手清,一清就發現判斷唔準。**

- `.gitattributes`(W25 加)已有 `* text=auto eol=lf`,而 **gitattributes 優先於 `core.autocrlf=true`**。
- `git ls-files --eol` 證實三個抽查檔全部 **`i/lf w/lf`** —— index 同 working tree 都係 LF。
- `eslint --fix` 清完 → **`git diff` 空**。即係 repo 一直乾淨,**冇嘢可以 commit**。

**收尾一步**:`eslint --fix` 之後 `git status` 仍標 ` M`(即使 `update-index --refresh`),但 `git diff --stat` / `--numstat` **兩者皆空** —— 內容經 clean filter 後同 index 完全一致,只係 stat cache 對唔上。`git checkout --` 令 working tree 對齊 index 後:**status 完全 clean · `i/lf w/lf` · `npm run lint` exit 0**。

**最終結論:唔係技術債,係一次性 working-copy 殘留 —— checkout 一次就乾淨,而且唔會復發**(`.gitattributes eol=lf` 令每次 checkout 都寫 LF,已由呢次 checkout 實證)。**唔使入 BACKLOG,零 commit。** 全 repo lint exit 0;api 223 test 仍全綠。

> **判斷演變(誠實記錄)**:① 初判「W23-A 技術債」→ 按 §1.3 唔修 ② Chris 指示修 → 發現 `git diff` 空,改判「債早已還清」③ status 仍標 M → 再查 → checkout 實證 → 定案「一次性殘留,永不復發」。**初判錯咗**:我把「本地 lint 紅」等同「repo 有債」,冇先查 index 實際存咩。教訓:報 lint 問題之前,先分清「working copy 狀態」定「committed 內容」。

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
