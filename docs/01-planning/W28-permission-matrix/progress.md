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

### Actual vs Planned Effort
| Deliverable | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| F0 spike | 0.5 | ~0.5 | 0 |

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
