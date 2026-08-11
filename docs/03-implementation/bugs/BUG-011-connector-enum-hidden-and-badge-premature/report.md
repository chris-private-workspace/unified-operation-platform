---
bug_id: BUG-011
title: "Integrations panel 轉唔返 provider —— enum 合法值從未顯示,而 badge 喺重啟之前就已經講咗新值"
severity: Sev3          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: done            # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-08-10
reporter: "Chris Lai —— Azure DEV 實際操作:把 license assign 轉去 n8n 之後,以為轉唔返去"
affects_components: [integration/connector-config, integration/status, web/settings]
spec_refs:
  - docs/adr/0013-connector-config-ui-management.md C2(boot 讀一次)· D2/D5(secret 唔出 API)· D3(DB-then-env)
  - docs/adr/0017-n8n-execution-seams-switchable-integration.md D0(只換執行器)· D1(一個 seam 一個掣)
  - docs/03-implementation/bugs/BUG-005-connector-state-ignores-db-override/(🔴 同族先例,方向相反)
---

# BUG-011 — Integrations panel 嘅 provider 切換:值猜唔到,狀態又講得太早

> **Report version**:1.0(initial)—— 本文 **triage 後 locked**(PROCESS §4.3)。修法途中揭出嘅**第三個**缺口(controller 逐欄砌回應,`pendingRestart` 到唔到街)寫喺 `progress.md` / `postmortem.md §6`,冇改寫本文。
> **Triage approver**:**Chris Lai(2026-08-10)** —— DEV 實際操作後報告
> **Closed**:2026-08-11 —— live 驗 + light/dark 真 render 全部收

## 1. Symptom

Operator 喺 Settings → Integrations → `n8n (license operations)` → Configure,把 `Provider` 由 Graph 轉去 n8n。之後想轉返,**以為轉唔返去**。

🔴 **後端邏輯本身冇壞 —— 轉得返。** 壞嘅係兩件同「操作員知唔知」有關嘅事,而佢哋夾埋令「轉唔返」成為一個完全合理嘅結論。

## 2. Root Cause（兩個獨立缺陷）

### 缺陷 1 — enum 合法值從未離開過後端

`connectors.ts:217-235` 定義咗 `licenseOpsProvider` 係 `kind: 'enum'`,`enumValues: ['graph', 'n8n']`。呢兩樣資料**留喺後端**:

| 層 | 有冇 `kind` / `enumValues` |
|---|---|
| `CONNECTOR_CONFIG`(`connectors.ts`) | ✅ 兩樣都有 |
| `ConnectorConfigService.describe()` → `ResolvedField`(`connector-config.service.ts:22-27`) | ❌ 剝走 |
| 前端 `ConnectorField`(`api-types.ts:516-521`) | ❌ 冇 |
| `integrations-panel.tsx:235` | ❌ 純文字 `<Input>`,placeholder = `Set provider…` |

⇒ 操作員面對一個文字框,冇任何提示話畀佢知合法值係咩。

🔴 **而最自然嗰個猜法啱啱好係錯嘅**。同一個 panel 三個 seam,兩個用 `direct`,一個用 `graph`:

| Connector | Column | 合法值 |
|---|---|---|
| `n8n-outbound` | `requestSubmissionProvider` | `direct` \| `n8n` |
| **`n8n-license`** | **`licenseOpsProvider`** | **`graph`** \| `n8n` ← 唯一唔同 |
| `n8n-ticket` | `ticketUpdateProvider` | `direct` \| `n8n` |

想「轉返去直接 integration」而打 `direct`,會被 `connector-config.service.ts:229-235` 用 400 頂返。**呢個就係「轉唔返去」最可能嘅真因。**

⚠️ 三個 seam 共用同一條 `<Input>` render 路徑 ⇒ **缺陷 1 三個都中**,唔止 `n8n-license`。

### 缺陷 2 — Badge 講嘅係「配置」,但個字寫住「狀態」

`integration-status.service.ts:207` 個 `n8nLicenseSelected()` 用**同一個 resolver 即時讀 DB**:

```ts
const provider = await this.connectorConfig.resolve('n8n-license', 'licenseOpsProvider');
return provider === 'n8n';
```

而 runtime 個 factory(`integration.module.ts:33-43`)**只喺 boot resolve 一次**(ADR-0013 C2)。

⇒ 一 Save,badge 即刻翻轉,但 **runtime 仲行緊舊嗰個**,直到 API 重啟。

⚠️ **呢個唔係「完全冇提示」** —— `integrations-panel.tsx:271-273` 已經有一句 static 文字「Changes take effect after the API restarts.」。真正嘅問題係**兩個 UI 元素互相矛盾**:一句細字話「要重啟先生效」,同時一個 `active`/`inactive` badge 已經斬釘截鐵咁話咗新狀態。操作員自然信個 badge —— 佢睇落係「而家點」,而唔係「將來會點」。

🔴 **同 BUG-005 同源,方向啱啱相反**:

| | panel 讀邊度 | runtime 讀邊度 | 後果 |
|---|---|---|---|
| **BUG-005** | env | DB(自 W34) | 明明行緊 n8n,panel 話 `inactive` |
| **BUG-011** | **當下** DB | **boot 嗰陣**嘅 DB | 仲行緊舊嗰個,panel 話已經換咗 |

BUG-005 修法喺 `integration-status.service.ts:195-196` 留低一條規則:

> 「whatever decides the route at runtime is what this panel must ask. **Not a copy of the same logic — the same call.**」

規則**執行咗**(真係打同一個 call),但條規則本身唔完整 —— 佢冇講**幾時**問。同一個 call 喺 boot 同喺而家叫,答案可以唔同。

## 3. Reproduction Steps

**環境**:本機 stack 或 Azure DEV 都重現到(唔係 Azure 特有)。

1. ADMIN 登入 → Settings → Integrations
2. `n8n (license operations)` → **Configure** → `Provider` 打 `n8n` → Save
3. Badge 即刻變 `active` —— **但 runtime 仲行緊 Graph**(未重啟)⇒ **缺陷 2**
4. 重啟 API(runtime 而家真係行 n8n)
5. 想轉返:`Provider` 打 **`direct`** → Save → **400 `Provider must be one of: graph, n8n`** ⇒ **缺陷 1**
6. 文字框由頭到尾冇講過合法值係 `graph`

**已排除嘅假設**(唔使再查):`LICENSE_OPS_PROVIDER` 喺 `apps/api/.env` / `deploy/azure/aca-dev.json` / `deploy/azure/patch-deploy-dev.ps1` **三處都冇設** ⇒ 唔存在「env 蓋住 DB 令佢轉唔返」。清空欄位(= 清 DB override → fallback 空 → factory 攞到 `undefined` → fail-safe 落 Graph)呢條路一直通。

## 4. Impact

| | |
|---|---|
| **邊個受影響** | ADMIN(只有佢改得到 connector config) |
| **實際損害** | 一個掣管三個動作(`listTenantSkus` / `findUser` / `assignLicense`,ADR-0017 seam ②)。操作員相信自己轉唔返,或者相信已經轉咗但其實未生效 ⇒ **對「licence 而家由邊個派」有錯誤認知** |
| **有冇資料損壞** | ❌ 冇。fail-safe 方向(非精準 `'n8n'` → Graph)一直有效,亦有 test 守住 |
| **有冇 workaround** | ✅ 有兩條:打 `graph`,或者**清空個欄位**(清 DB override → fallback → Graph) |
| **潛伏幾耐** | 缺陷 1 由 **W34**(ADR-0013 panel 落地)起就存在;缺陷 2 由 **BUG-005 修好嗰刻**(W40 follow-up)起存在 |

## 5. Severity — Sev3

**唔係 Sev2**:功能冇壞,轉得返,冇資料損失,有 workaround。
**唔止 Sev4**:佢直接令操作員對 runtime 行為有錯誤認知,而受影響嘅係 licence 派發路徑本身。

🟡 **要寫 postmortem** —— PROCESS §4.4 Sev3 = 「Encouraged **if recurring**」,而本單同 **BUG-005 明確同族**(監控面同 runtime 講唔同嘢),係第二次。

## 6. Fix 方向（詳見 checklist）

- **缺陷 1** — `describe()` 個 `ResolvedField` 加返 `kind` + `enumValues`(**兩樣都係 code 入面嘅公開靜態常數,唔係機密** ⇒ 唔違反 ADR-0013 D2/D5);前端 `kind === 'enum'` 改 render **既有** `Select` primitive(`components/ui/select.tsx`,H6:唔引入新 pattern)。
- **缺陷 2** — 喺 boot 記低 factory **實際揀咗邊個**,status 回傳「當下配置」同「runtime 實際」嘅差異,panel 據此顯示 pending-restart。
  🔴 **明文唔做**:改成每次 call 都 resolve(= 取消 ADR-0013 C2 boot-once 語義)⇒ **H1,要 STOP + ADR**。本單唔行嗰條路。

## 7. Out of Scope

- ❌ **統一三個 seam 嘅 enum 值**(把 `graph` 改成 `direct`)—— breaking change,會令現有 DB 值同 env 值失效,要 Chris 拍板
- ❌ **加 `n8n-license` probe** —— `connectors.ts:52-62` 寫明點解唔可以
- ❌ 改 fail-safe 方向 / 改 seam 抽象 / 改 boot-once 語義
