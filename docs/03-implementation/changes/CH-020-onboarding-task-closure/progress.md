# CH-020 Progress — Onboarding catalog task closure

> 對應 `spec.md`(approved)+ `checklist.md`。R2:每個 commit 對應返呢度一個 Day-N entry。

## Day 1 — 2026-08-03(實作)

**做咗**:G1-G4 gate → S1-S3 schema → I1-I7 intake 分流 → P1-P7 seam ④ → A1-A4 assign → T1-T15 test → V1-V4 + V6。**V5(live)未做。**

### Commit

| Hash | Subject | Checklist |
|---|---|---|
| (見下) | `feat(fulfilment): CH-020 onboarding catalog task closure` | S1-S3 / I1-I7 / P1-P7 / A1-A4 / T1-T15 / V1-V4 / V6 |

### 數字

| | 前 | 後 |
|---|---|---|
| `apps/api` test | 797(67 suites) | **837**(68 suites) |
| `npm run lint`(root) | exit 0 | exit 0 |
| tsc api / web | 0 / 0 | 0 / 0 |
| Migration | 17 | 18(`20260803060106_ch020_line_item_task_ref`) |

### 落 code 期間三個判斷(spec 冇寫死,記低點解)

**① Task ref 行 `IntakeService.intake(dto, taskRef?)` 第二個參數,唔加落 `N8nIntakeLineItemDto`。**
spec §2.3 只講「注入嗰條 line 寫入」冇講點入。加落 canonical line item DTO 係較短嘅路,但咁樣**任何** canonical caller 都可以送 task sys_id,而帶 task sys_id 嘅 line 會行 by-task close —— 嗰條路由構造上繞過 ADR-0018 D3 嘅「唯一 active task」保護。第二個參數令只有 flat 路(真係收到 1001 畀嘅 task)去到嗰度,爆炸半徑細一格,亦逐字守住 D2「canonical DTO 一個字唔改」。`intake.controller.spec.ts` 有一條 test 專門守呢樣。

**② Failure payload 加 `targetKind`(spec 冇提,係 D4 嘅必然後果)。**
`servicenow.ticket_update` 個 payload 一直只存 `snTarget` 一個 string。seam 收 union 之後,repair 冇咗 kind 就只能靠估;估錯就會 `request_item=<task sys_id>` 查詢,**永遠 0 row**,而且原因喺 queue row 上面睇唔出。所以 allowlist 加咗 `targetKind`。⚠️ 呢個係 widen 一個 privacy allowlist —— 值只有 `'ritm'|'task'`,非 PII 非 secret,已喺 `outbound-failure-fields.ts` 寫明。舊 row 冇呢個 key,讀成 `'ritm'`(佢哋本來就係)。

**③ `active` 檢查用 `snow.query('sys_id=…')` 而唔用 `snow.getRecord()`。**
`getRecord` 個 catch 吞晒 error 返 `null`(`servicenow.service.ts:117`),即係「SN 連唔到」同「task 唔存在」返同一個答案。seam ④ 嘅 error contract 明文要求 transport failure **throw**,所以行 `query`(佢會 throw)。順帶亦同 `pickTask` 用同一個 method。

### 順帶記低

- **`ticket-update.provider.ts` header 有句過時咗嘅話**:「The interface did not change: both methods still take the RITM sys_id」—— CH-020 令佢直接同事實相反,已改。呢種「CH-N 嘅註解被 CH-N+1 推翻」係 spec drift 嘅最早訊號。
- **Prettier 把 `TicketTarget` 個 union 摺埋一行**。原本寫成兩行對齊比較好讀,但 `--fix` 話事,冇對抗。
- `apps/web` **一個字冇改** —— 本 CH 純後端。`LINT-web` 嗰 25 個 prettier error 仍然喺度(root `lint` 只 gate api),同本 CH 無關。

### 🔴 V5 卡住嘅嘢(唔喺 code 側)

1. **OQ-3(R4,High/High)**:1001 個 HTTP node 用 credential「n8n Academy API Key」,workflow JSON 睇唔到佢送咩 header。若唔係 `X-Intake-Key`,成條鏈連 401 都過唔到。**要 Chris / Jerry 喺 n8n 側開個 credential 望一眼。**
2. **真 assign 會動真 tenant + 真 ticket**。REQ0044038(SPE_E5 / READY / SCTASK0071802 仍 active)係現成完整驗證單,但撳落去 = 真派一個 E5 + 真閂一張 SN task。**未經明確指示唔會撳。**

### 🚧 延後(唔屬本 CH scope,已喺 spec §2.7 列明)

- 🚧 **OQ-1** —— n8n `Resolve WDA Task` 個 query 冇 `^active=true` 兼 `limit=1`,會送已閂 task(REQ0044049 實例)。UOP 側 D5 擋住,**根源交返 n8n**,唔喺 UOP 補 n8n 個漏。
- 🚧 **2004 / `n8n-ticket` 解封** —— ADR-0018 嗰條鎖唔動;本 CH 只係令 `task` target 誠實回 error 而唔係扮支援。
