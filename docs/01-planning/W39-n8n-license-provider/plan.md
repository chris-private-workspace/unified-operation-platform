---
phase: W39-n8n-license-provider
name: "N8N-SEAMS 庚 — N8nLicenseProvider + n8n-license connector + probe"
sprint_week: W39
start_date: 2026-07-28
end_date: 2026-07-30          # planned, may slip with changelog log
status: active                # draft | active | closed —— 2026-07-28 Chris approve + §8 五個 OQ 全跟建議拍板
spec_refs:
  - docs/adr/0017-n8n-execution-seams-switchable-integration.md §D0 · §D2 · §D5 · 實作補註 · rollout「庚」
  - docs/adr/0013-connector-config-ui-management.md(Model C · DB-then-env · secret 留 env)
  - docs/adr/0010-integration-observability.md(三態 · PROBEABLE · 唯讀探針)
prior_phase: W38-license-ops-provider
---

# Phase W39 — `N8nLicenseProvider`

> **Plan version**:1.0(initial)
> **Owner**:AI(Claude)
> **Approved by**:**Chris Lai(2026-07-28)** —— §8 五個 OQ **全部跟建議**:OQ-1 = A(一視同仁照 +1)· OQ-2 = A(`details` 唔傳遞)· OQ-3 = B(`ritmId` 唔入介面)· OQ-4 = A(`inactive` 唔係 `error`)· OQ-5 = 維持唔加

## 1. Scope

W38 起好咗 seam 同**唯一**實作(`GraphLicenseProvider`)。本 phase 加**第二個**實作,令接縫 ② 真正變成一個掣。

交付三樣:`N8nLicenseProvider`(打 2002/2003/2005)· `n8n-license` connector(ADR-0013 Model C 配置 + ADR-0010 三態)· **probe**(2002 mode 1 唯讀,ADR-0010 首次令 n8n license 路徑有嘢探得)。

> ### 🔴 誠實邊界 —— 本 phase 完成 ≠ 可以真切換
>
> n8n 側**三個前置全部未通**,而且全部唔喺本 repo 手上:
>
> | | 狀態 |
> |---|---|
> | 2002/2003/2005 個 `x-uop-secret` | 仍係 `CHANGE_ME_SHARED_SECRET` hardcoded(ADR-0017 附錄 #2) |
> | n8n UAT ↔ 平台 Azure 環境 | **未接通**(runbook 08 `[N]`,Chris 進行中) |
> | 平台未部署上 UAT | runbook 08 `[P]` |
>
> ⇒ 庚嘅驗收係「**code + test 齊,預設值零改變**」,**唔係**「跑得通」。真切換要等環境。呢點喺 §3 G-gate **明文寫死**,唔准喺 closeout 靜靜當通過。

## 2. 真合約(實讀 workflow JSON,唔靠 ADR 轉述)

三條 workflow 全部 `enabled`,webhook path 如下:

| WF | path | 用途 |
|---|---|---|
| 2002 | `POST /webhook/wf2-license-check` | mode 1 = SKU 座位;mode 2 = 某 SKU 嘅用戶 |
| 2003 | `POST /webhook/wf3-assign-license` | assign |
| 2005 | `POST /webhook/wf5-sync-check` | 查 user 存唔存在(單筆 / 批次 ≤50) |

全部 header `x-uop-secret`。

### 🔴 四處同 ADR-0017 D2 轉述對唔上(實讀先發現)

| # | ADR D2 講 | workflow 真係 |
|---|---|---|
| 1 | outcome `assigned` | 2003 `Build Response` 出 **`success`**,唔係 `assigned` |
| 2 | outcome 有 `no_seats` | 2003 **完全唔檢查座位** —— 好事,同 D0 一致(座位係平台決策),但即係 `no_seats` **永遠由平台產生**,兩個 provider 都唔會返 |
| 3 | 一種 response 形狀 | **兩種**:`already_assigned`/`not_synced` 由 `Route Status` switch **直接 respond**(`Evaluate User` 形狀),只有真 assign 完先行 `Build Response` |
| 4 | `error.details` 唔含 PII | 2003 兩個 node 都寫 `details: JSON.stringify(b.error \|\| b).substring(0,500)` —— **原封塞 Graph error body**,而 Graph 404/400 body 慣常帶 UPN ⇒ **同 BUG-004 同一類洩漏** |

⇒ **#4 係 H4 問題,唔係 mapping 問題**,見 OQ-2。

## 3. Deliverables

### F1 — `N8nLicenseProvider`
- **落點**:`apps/api/src/integration/license-ops/n8n-license.provider.ts`
- **Acceptance**:
  - `listTenantSkus()` → 2002 mode 1 → map 去 `TenantSkuSeats`(三個欄)
  - `findUser(upn)` → 2005 單筆 → `synced` → `DirectoryUser`(2005 真係返 `usageLocation` ✅)· `not_synced` → **null**(同 Graph 語意一致)
  - `assignLicense()` → 2003 → **兩種** response 形狀都要 handle
  - transport 失敗 **throw 503**(W38 拍板嘅 error 契約,兩個實作一致)
  - **`GraphLicenseProvider` / `license-ops.provider.ts` / `assign.service` 三個檔 diff = 0**

### F2 — outcome mapping + 雙向 H5 contract test
- **Acceptance**:
  - `success` → `assigned` · `already_assigned` → 見 **OQ-1** · `not_synced` → `not_synced` · `error` → `error`
  - **同一組 case 餵兩個 provider,assert 同一 outcome**(ADR-0017 講嘅 H5 主戰場)
  - 🔴 **`no_seats` 兩個 provider 都產生唔到** —— 明文寫入 test 註釋,免得下手以為漏咗

### F3 — `n8n-license` connector(ADR-0013 + ADR-0010)
- **Acceptance**:
  - 非機密欄(webhook base URL / 三條 path)落 `ConnectorConfig`;**`x-uop-secret` 只經 env**(ADR-0013 三重守 secret 邊界)
  - `GET /admin/integrations` 出三態;audit 白名單只收非機密欄
  - **餵假 secret assert 回應零洩漏**(鏡射 W30 G1 硬紅線)

### F4 — probe(2002 mode 1)
- **Acceptance**:
  - `PROBEABLE` 加 `n8n-license`,**只探 2002 mode 1**(唯讀)
  - 🔴 **2003 / 2005 永不探**:2003 會**真派 licence**;2005 雖然唯讀但無探測價值且要真 UPN
  - test assert 探針**從未**呼叫 2003 / 2005(負面斷言)

### F5 — 選路 wiring
- **Acceptance**:
  - `integration.module` 由 `useClass` 改 factory,讀配置選 `graph`(**預設**)/ `n8n`
  - **唔揀 = 零改變**:既有 467 test 一條都唔使改(鏡射 W38 G2)
  - `license-ops.boundary.spec.ts` 四條邊界**仍然綠**(seam 換實作唔等於邊界放寬)

### F6 — Doc-sync
- ADR-0017 實作補註加「庚」段(四處合約落差 + OQ 拍板)· `BACKLOG` · `SESSION_SUMMARY` · runbook 08(切換前置)

## 4. Success Criteria(Phase Gate)

| # | Criterion | Measure | Block? |
|---|---|---|---|
| G1 | 既有 test 全綠且**零改動** | 467 → ≥467,`git diff` 既有 spec 零刪除 | Yes |
| G2 | 雙 provider 同 case 同 outcome | F2 contract test | Yes |
| G3 | **零 schema**(connector 用既有 `ConnectorConfig`)/ **零新 runtime dep**(用 global `fetch`) | diff | Yes |
| G4 | secret 零洩漏 | 餵假 secret assert 回應 + audit 乾淨 | Yes |
| G5 | 探針**從未**掂 2003/2005 | 負面斷言 + fails-before | Yes |
| G6 | **預設仍係 graph** | 唔設配置起 app → 行為同 W38 一樣 | Yes |
| G7 | lint / tsc 0 | 實跑 | Yes |
| G8 | 🚧 **live 切換 = 明文唔做** | 見 §1 誠實邊界;closeout **必須**寫「未驗」 | **No**(唔准當 pass) |

## 5. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴 **`details` 帶 UPN 入 log / audit**(合約落差 #4)—— 同 BUG-004 同源但呢次係**新** code | High | High | OQ-2 拍板;預設立場 = provider **唔傳遞** n8n 個 `details`,只留 status + 自己嘅安全描述 |
| **R2** | `already_assigned` 令 ledger 重複 +1(或者反過來漏計) | Med | High | OQ-1 **必須拍板**,唔准喺實作靜靜揀 |
| **R3** | 為咗「睇落 work」而喺冇真 n8n 嘅情況下寫 optimistic mapping | Med | High | 全部 mapping 對住**實讀嘅 workflow JSON**,唔靠 ADR 轉述;G8 明文唔當 pass |
| **R4** | probe 喺 n8n 未通時長期紅,被當成平台壞咗 | Med | Low | OQ-4;三態 `inactive` 而唔係 `error` |
| **R5** | 換 factory 時整爛預設路徑 | Low | High | G6 + 既有 467 test 零改動 |

## 6. Dependencies on Prior Phase

W38 retro carry-over:
- 🔴 **replay 不對稱** → 本 phase **OQ-1**(W38 已喺三處寫死唔准靜靜落地)
- BUG-004 仍未修 —— **同 R1 同源**,但**唔喺本 phase 順手做**(H3)
- assign 成功路徑 live 未驗 —— 本 phase 亦驗唔到(n8n 未通)

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-28 | Initial plan | — | _(待 Chris)_ |

---

## 8. 🔴 Open Questions(**全部要拍板先開工**)

### OQ-1 — `already_assigned` 點影響 ledger?(W38 留低嗰個,而家避唔開)

Graph 分唔到 replay,n8n 分得到。所以呢個 outcome **只會喺 n8n 路徑出現** —— 即係一揀 n8n 就會行到一段 Graph 路徑從來冇行過嘅 code。

```
already_assigned = tenant 側「本來已經有呢個 seat」
   → ledger +1  ⇒ 平台數字會比 tenant 真實多一個(製造 drift)
   → ledger 唔 +1 ⇒ 兩條路徑對同一情境行為唔同(切 provider = 行為改變)
```

**建議 = 選項 A:一視同仁(照 +1,同 `assigned` 完全一樣處理)。**

理由:①**保持兩條路徑行為一致**係 D0 嘅核心;②重複計數風險**今日已經存在**(Graph 路徑一直係咁),唔應該喺庚**偷偷**修 —— 咁會令「切 provider」順帶夾帶一個 ledger 語意改動;③真要修就另開 change,**同時**處理 Graph 路徑,而唔係只修一邊。

⚠️ 選 A 嘅代價要記入 ADR 補註:n8n 路徑**明知**有更準嘅資訊但刻意唔用。

### OQ-2 — 🔴 2003 個 `details` 帶 vendor error body(可能有 UPN),點守 H4?

2003 兩個 code node 都係 `JSON.stringify(b.error || b).substring(0, 500)`。而 W38 定嘅契約寫明 `AssignOutcome.error.details` **唔含 PII**。

**建議 = 選項 A:provider 唔傳遞 n8n 個 `details`。** 只保留 `status`,`details` 由平台自己寫一句安全描述(例:`n8n license workflow reported a failure (see n8n execution log)`)。真 vendor 細節留喺 n8n 自己個 execution log —— 嗰邊本來就係 n8n owner 嘅範圍。

代價:排查時要開 n8n 睇。但呢個代價 **細過**把 UPN 寫入平台 log / audit(BUG-004 已經證明呢類洩漏好易發生而且好耐冇人察覺)。

### OQ-3 — `ritmId` 要唔要入 provider 介面?

2003 收 `ritmId` 做「UOP matching/audit」,但 W38 個 `assignLicense(upn, skuId, options)` 冇呢個參數。

**建議 = 選項 B:唔加。** 平台自己有完整 audit(ADR-0009),而 sticky 自己都寫「Logging = UOP's audit log (single platform, decided 22 Jul)」。加咗只係方便睇 n8n execution list,但會令介面帶一個 **Graph 實作永遠用唔着**嘅參數。

### OQ-4 — n8n 未接通,probe 應該顯示咩?

**建議 = 選項 A:`inactive`(未配置)而唔係 `error`。** 冇配置 webhook URL / secret ⇒ 三態顯示 `inactive`,同 W30 既有語意一致;配置咗但打唔通先叫 `error`。咁 UAT 部署初期唔會出現一個「紅色但其實只係未接線」嘅誤導狀態。

### OQ-5 — 本 phase 要唔要順手做 `listUsersBySku`(2002 mode 2)?

2002 mode 2 已經寫好而且 enabled。W38 OQ-3 拍板「零 caller 唔加」。

**建議 = 維持唔加。** 庚仍然冇 caller;有 mode 2 唔等於平台需要佢。加咗就要 Graph 側都實作(`$filter` + 分頁),即係為咗對稱而寫兩份冇人用嘅 code。

---

**Lifecycle reminder**:plan locked after status=active。重大 deviation 入 §7 changelog。
