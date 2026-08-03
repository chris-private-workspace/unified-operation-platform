---
change_id: CH-020
title: "Onboarding catalog task closure — UOP 存 n8n 畀嘅 task sys_id,assign 後直接 close"
status: approved        # draft | proposed | approved | active | done | cancelled
created: 2026-08-03
target_completion: 2026-08-06
affects_components: [apps/api, prisma]
spec_refs:
  - ADR-0024(本 CH 嘅決策 SSOT — **Accepted** 2026-08-03)
  - ADR-0018(close catalog task · 唯一 active task 保護)
  - ADR-0017 D4(seam ④ · 另開路而唔改 canonical 嘅 pattern)
  - ADR-0020(onboarding default SKU 注入)
---

# CH-020 — Onboarding catalog task closure

> **Spec version**:1.0(initial)
> **Owner**:Chris(提出)/ AI(起草)
> **Approved by**:**Chris Lai**(2026-08-03)

## 1. Context (Why)

見 **ADR-0024**。一句:n8n 1001 建完 AD 戶會把 Windows Domain Account 嗰張 **catalog task 嘅 sys_id** 送畀 UOP,等 UOP 派完 default E5 之後 close 佢做完結記錄 —— 但今日 UOP **收唔到**(payload 形狀對唔上,400)、**存唔到**(冇欄)、**用唔到**(收到都會當佢係 RITM 去反查,永遠 0 row)。

三個洞全部實測確認,唔係推測(ADR-0024 Context)。

## 2. Scope (What)

### 2.1 Behavior Change

- **Before**:1001 打 `/requests/intake` → 400;就算入到,assign 之後 SN 一個字唔變。
- **After**:1001 **零改動**打同一條 URL → UOP 收貨、存低 task sys_id;assign 完 licence 之後,UOP 直接 close 嗰張 catalog task(閂之前先驗佢仲 active)。

### 2.2 Schema（ADR-0024 D1）

`RequestLineItem` 加兩個 nullable 欄 + 一次 additive migration:

```prisma
serviceNowTaskSysId  String?
serviceNowTaskNumber String?
```

零 backfill(既有 row 全部 null → 行返舊路徑)。

### 2.3 Intake:route 共用,contract 唔放寬（D2 / D3)

`intake.controller.ts` 個 `POST /requests/intake` 改成先睇 body 有冇 `mode`:

| body | 綁 | 行為 |
|---|---|---|
| 冇 `mode` | `N8nIntakeRequestDto`(**今日隻,一個字唔改**) | 完全同今日一樣 |
| `mode === 1` | 新 `N8nFlatIntakeDto` | 新 flat 路 |
| `mode` 係其他值 | — | **400 fail-closed**,唔估 |

> ⚠️ 實作要點:NestJS 一個 handler 綁一個 DTO,所以要喺 controller 收 raw body 再手動分流 + `validate()`,唔可以靠兩個 `@Body()`。**分流後 canonical 那支必須行返同一個 `ValidationPipe` 設定**(`whitelist: true, transform: true`),否則 canonical caller 嘅保證就唔係「一個字唔改」。

**`N8nFlatIntakeDto`**(對住 1001 實際送嘅欄):

```ts
mode: 1                       // @IsIn([1])
targetUpn: string             // required
targetDisplayName?: string
opcoCode: string              // required（n8n 自己 resolve 好）
requesterEmail?: string
requestId: string             // required — REQ NUMBER
serviceNowTaskSysId?: string
serviceNowTaskNumber?: string
source?: string               // 收,唔存(OQ-2)
```

**Flat 路點行**(重用既有 adapter 能力,D3):
1. `resolveReqSysId(requestId)` → REQ sysId(= 既有 `@unique` idempotency key,**唔換 key**)
2. 冇 licence line ⇒ `applyDefaultSku()` 注入(ADR-0020,原封不動)
3. 注入嗰條 line 寫入 `serviceNowTaskSysId` / `serviceNowTaskNumber`
4. 其餘交返 `IntakeService`

### 2.4 Seam ④ 契約（D4)

`TicketUpdateProvider` 嘅 target 由 `sysId: string` 改為:

```ts
type TicketTarget =
  | { kind: 'ritm'; sysId: string }
  | { kind: 'task'; sysId: string };
```

- `DirectTicketProvider`:`ritm` = 今日 `pickTask` 邏輯**一個字唔改**;`task` = 新路(§2.5)
- `N8nTicketProvider`:`ritm` 今日行為;`task` 回 `{status:'error'}` 講明 2004 未支援(**唔 throw**)

### 2.5 🔴 Close by task:先驗 active（D5)

```
GET sc_task sys_id=<taskSysId>
  ├ 搵唔到       → error「task 不存在」          → 唔 patch
  ├ active=false → error「task 已閂,唔重開」     → 唔 patch
  └ active=true  → assigned_to 空就補 → PATCH state=3 + close_notes
```

**點解一定要**:`kind:'task'` 由構造上繞過咗 ADR-0018 D3 嗰個「唯一 active task」保護。而呢個唔係假想 —— **REQ0044049 就係活例**:SCTASK0071807 喺導入之後被人閂咗(state 3,assigned 畀真人),冇呢道閘平台就會去 re-close 一張人哋做完嘅 AD task,而且顯示成功。

### 2.6 Assign 優先次序（D6)

```
1. item.serviceNowTaskSysId → close BY TASK（新）
2. item.serviceNowSysId     → RITM → pickTask（今日,不改）
3. request.serviceNowSysId  → parent REQ work note（今日,不改）
```

失敗仍然 non-fatal(ADR-0011 OD4),落 Delivery failures。

### 2.7 Out of Scope（explicit）

- ❌ **唔改 n8n**(Chris 拍板零改動)。OQ-1(n8n 攞 task 冇 `active` filter)交返 n8n 側,UOP 只喺 D5 擋住。
- ❌ **唔碰 2004 / `n8n-ticket` provider 嘅解鎖** —— ADR-0018 嗰條鎖不動。
- ❌ **唔改既有兩條 close 路徑**(RITM / work note)—— 實測 work,冇理由動。
- ❌ **唔改 ADR-0020 注入邏輯本身** —— 只係注入嗰條 line 多帶一個 task id。
- ❌ **唔存 `mode` / `source`**(OQ-2)。
- ❌ **唔掂 ledger / reconcile / drift**。

## 3. Acceptance Criteria

**Intake**
- [ ] 冇 `mode` 嘅 canonical payload → 行為**同今日逐字一樣**(既有 intake test 全綠,零改動)
- [ ] 1001 真實 flat payload(§2.3 形狀)→ 200,建到 request
- [ ] `mode` 係 `2` / `"1"` / 其他 → **400**,零寫入
- [ ] flat 路用 REQ number 反查到 sysId;**同一個 REQ 再 POST 一次 → 唔會建第二張**(idempotency 仍係 `serviceNowSysId`)
- [ ] flat 冇 licence line → ADR-0020 注入 default SKU,**而嗰條 line 帶住 `serviceNowTaskSysId`**
- [ ] `mode` / `source` 冇被存落 DB

**Close**
- [ ] line 有 `serviceNowTaskSysId` → assign 後 **PATCH 嗰張 task**(`state=3` + close_notes),唔行 `pickTask`
- [ ] task `active=false` → **唔 patch**,落 Delivery failures,message 講到明「已閂」
- [ ] task 搵唔到 → 同上,唔 patch
- [ ] task `assigned_to` 空 → 補 integration account;**已有 assignee → 唔覆蓋**
- [ ] line 只有 RITM sysId(冇 task)→ **行返今日 `pickTask` 路徑,行為不變**
- [ ] 兩者皆無 → 行返 parent REQ work note,行為不變
- [ ] SN 寫入失敗 → assign **仍然成功**(licence + ledger 已動),只落 Delivery failures

**Gate**
- [ ] `apps/api npm test` 全綠(現行 797);**seam ④ 兩個 provider 嘅既有 test 全部跟住新 signature 而斷言不變**
- [ ] `npm run lint`(repo root)exit 0
- [ ] Migration 可 apply 可 rollback;既有 row 全部 null
- [ ] **Live**:用一張真 SN request 行完整鏈 —— intake → assign → 睇住嗰張 SCTASK 由 active 變 state 3

## 4. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 分流搞錯,canonical caller 行為變咗 | Med | **High** | §2.3 明文:canonical 支必須行返同一個 ValidationPipe 設定;acceptance 第一條就守呢樣 |
| R2 | 閂錯人哋張 task | Med | **High** | §2.5 active 閘 —— 呢個 risk 正正係佢存在嘅原因 |
| R3 | Seam signature 改動波及既有 close 路徑 | Med | **High** | `kind:'ritm'` 分支逐字保留;既有 provider test 斷言不變,只改 call shape |
| R4 | n8n credential 唔係送 `X-Intake-Key` ⇒ 401,成條鏈都通唔到 | ~~High~~ | **High** | ✅ **已解**(Chris 2026-08-03 確認 n8n 側已經送緊)。⚠️ 平台側驗證唔到 —— intake 突然全 401 嘅話呢度係第一個要查嘅位 |
| R5 | 1001 送過嚟嘅 task 一開始就係閂咗嘅(n8n query 冇 active filter) | **High** | Med | D5 擋住 + 落 Delivery failures 令佢可見;根源交返 n8n(OQ-1) |

## 5. Effort Estimate

**~2.5 日**(schema + migration ~0.2 · intake 分流 + flat DTO + adapter ~0.8 · seam signature + 兩個 provider ~0.6 · assign 分支 ~0.3 · test ~0.4 · live 驗 ~0.2)。

## 6. Dependencies

- **ADR-0024 要先 Accepted**(H1 gate)。
- **OQ-3(n8n credential 送咩 header)喺 live 驗證之前要有答案** —— 唔影響落 code,但影響「打通」驗得成唔成。
- 零新 runtime dependency。

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-03 | Initial draft(proposed) | Chris 澄清 n8n 送 task sys_id 嘅設計,要求先打通 UOP 直連 | — |
| 2026-08-03 | 兩項拍板:**n8n 零改動(UOP route 共用)** · **close 前必驗 `active=true`** | 起草前提問,即場定案 | Chris |
| 2026-08-03 | **R4 / OQ-3 收** —— n8n 側已經送緊 `X-Intake-Key` | Chris 收官後確認 | Chris |
| 2026-08-03 | **V5d 用 `[UOP TEST]` REQ0044068 + `POWER_BI_STANDARD` 代替 REQ0044038 + `SPE_E5`** —— dev tenant E5 **consumed 4535 / prepaid 4502 = 超支 33**,`assign.service.ts:211` 個 tenant seat gate 喺 close 路之前,所以 E5 一個都派唔到、行唔到落去驗證對象。close 路 SKU-agnostic,換 SKU 唔影響驗嘅嘢;而且新 fixture **完全冇 RITM**,反而係更強嘅證據(舊 code 會跌落 parent REQ work note) | Chris 已 approve「真撳」,代換屬同目標低成本替代 | AI(已報告) |

---

**Lifecycle reminder**:spec **locked**(status=approved 2026-08-03)。重大 deviation → §7 changelog。
**Gate reminder**:✅ H1 gate 已過 —— spec `approved` + **ADR-0024 `Accepted`**(兩者皆 Chris Lai / 2026-08-03),可開工。
