# CH-022 — Requester sys_id 由 REQ 個 `opened_by` 攞(ADR-0030 落地)

- **Status**:`approved`(2026-08-10 — Chris)
- **ADR**:**ADR-0030**(**Accepted** 2026-08-10 ⇒ H1 gate 已過)
- **Owner**:Chris Lai
- **BACKLOG**:`INTAKE-REQUESTER`

## 1. 問題

端到端第 2 步(UOP 收到 n8n onboarding 之後喺 SN 建 O365 單)**由 W43 交付到今日,喺真流量下一次都冇成功過**。

2026-08-07 三次 n8n intake(`REQ0043934` / `REQ0044049` / `REQ0044057`)全部掛喺同一句:

```
WARN [IntakeAdapterService] Could not raise the ServiceNow licence request for <cuid>:
     The requester was not found in ServiceNow, so the request cannot be raised
```

**根因(ADR-0030 Context 有完整推導)**:n8n `1001…json:1486` 把 `requesterEmail` map 做**觸發 onboarding 嗰封 Outlook email 嘅寄件人**,而 ADR-0025 D1 消費佢嗰陣當咗係「ServiceNow 用戶」。兩個 domain 冇任何保證對得上。

## 2. Scope

### In

1. `resolveReqSysId` 除咗 `sys_id`,順手 return `opened_by` 個 sys_id
2. submit payload 加 optional `requesterSysId`;`DirectServiceNowProvider` 有就直接用,冇就行返 email 反查(**outbound 路**)
3. `RequestSubmissionProvider` interface + `N8nWorkflowProvider` 跟住改
4. test:H5 critical path 覆蓋(見 §4)

### Out(明確唔做)

- ❌ **唔改 n8n** — ADR-0030 A1 已否決。修好之後 n8n 送咩都唔再阻塞
- ❌ **唔寫 migration / backfill** — ADR-0030 **D4**:08-07 三張靠 Delivery failures `REQUEST_SUBMIT` retry 補
- ❌ **唔解 outbound 路個同款失敗點** — IT 自己開單冇 REQ 可攞,依然靠 email 反查(ADR-0030 D3 明文限定範圍)
- ❌ **唔掂 `target_user` 語意** — 佢仍然係 placeholder(ADR-0026 已定死),真 target 睇 `target_users_email`

## 3. 設計

### 3.1 `resolveReqSysId` 改返兩個值

`intake-adapter.service.ts:545-565`。今日淨係攞 `record.sys_id`,而 `getRecordByNumber`(`servicenow.service.ts:172-183`)**冇落 `sysparm_fields`** ⇒ 成個 REQ record 一直喺手。

⚠️ **`opened_by` 係 reference 欄** — 唔加 `sysparm_display_value` 嘅時候,ServiceNow 返嘅係 `{ link, value }`,**sys_id 喺 `.value`**,唔係直接一個 string。呢個係最易寫錯嘅一格。

🔴 **`opened_by` 空要 fail-loud** — 同 `resolveReqSysId` 搵唔到 record 一樣行 `BadRequestException`,**唔准**靜靜跌返去 email 反查。理由見 ADR-0030 D3(已知 0% 嘅路留低,下手會當佢係 repair 機制)。

### 3.2 payload 加 optional `requesterSysId`

`DirectServiceNowProvider.submit`(`direct-servicenow.provider.ts:70`):

```
requesterSysId 有  → 直接用(intake 路)
requesterSysId 冇  → resolveRequester(payload.requesterEmail)(outbound 路,行為一個字唔變)
```

`buildVariables`(`:200-209`)個 `requester_name` / `target_user` 兩個欄照舊食同一個 sys_id。

### 3.3 `N8nWorkflowProvider`

同一個 interface,要跟住加欄。佢今日 fail-loud(`n8n-license` 掣鎖死 `direct`,CH-010 遺留),所以**唔需要真行為**,但**唔可以令 type 對唔上**。

## 4. Acceptance(H5 — critical path)

| # | 準則 | 點驗 |
|---|---|---|
| A1 | intake 路用 `opened_by`,**完全冇 call** `findUserSysIdByEmail` | unit:assert 個 mock **零次** call |
| A2 | `opened_by` 係 `{link,value}` 時攞到 `.value` | unit |
| A3 | `opened_by` 空 / 缺 → **fail-loud**,唔跌返 email 反查 | unit:assert throw **兼且** email 反查零次 call |
| A4 | outbound 路(冇 `requesterSysId`)行為**一個字唔變** | 既有 `direct-servicenow.provider.spec.ts:291` / `:301` 兩條**繼續綠**,並改註釋講明佢哋而家守緊 outbound |
| A5 | `requesterEmail` 送乜都唔阻塞 intake(包括 undefined / Outlook sender / SN 冇嘅地址) | unit:三種輸入都建到單 |
| A6 | api test 全綠 · root lint exit 0 · tsc 兩邊 0 | 本地跑(本地 stack 已起) |
| A7 | **live**:DEV 收一次真 n8n intake → SN 出到一張 O365 RITM | 🔴 **本機做唔到**(ACA internal,DNS 唔解析)⇒ 要喺公司網,或者用 Delivery failures retry 一張既有嘅 |

🔴 **A7 唔可以當「A1-A6 綠就等於通」** — W43 `target_user` 回填就係全綠然後一打真 SN 撞 403(ADR-0026)。呢個 CH 未經 A7 **唔算完成**。

## 5. Effort

0.5–1 日(改動細,但 H5 test + 既有 test 語意調整佔一半)。

## 6. Dependencies

- 🔴 **ADR-0030 要 Accepted**(H1 gate)
- ✅ 唔需要新 SN 權限(`sc_request` read 一直行緊,F7-6 證過)
- ✅ 唔需要 n8n 側任何改動
- ⚠️ A7 要 DEV 環境 + 公司網

## 7. 已知代價(ADR-0030 Consequences 摘要)

- ⚠️ **`target_user` 對 n8n 建嘅單會變成 `n8napiservice1`**(實測 `REQ0044049`/`REQ0044057` 個 `opened_by` 就係佢)。語意企得住,但 **SN owner 要知道呢個係設計唔係 bug**
- ⚠️ outbound 路個失敗點仍然存在,只係唔再影響 onboarding 主線

## 8. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-08-10 | Initial draft | `INTAKE-REQUESTER` 診斷收晒,根因確認為接縫語意錯配;ADR-0030 提出修法 | Chris |
| 2026-08-10 | approved + 實作完成(A1–A6) | ADR-0030 Accepted ⇒ H1 gate 過 | Chris |

### 實作實績(2026-08-10)

- **`N8nWorkflowProvider` 唔使改** — ADR-0030 Consequences 預咗要跟改,實際上 `requesterSysId` 係 **optional** 欄,structural typing 下唔會 break。ADR 嗰句係保守估計,記低以免下手以為漏咗。
- **api test 900 → 905**(69 suites 全綠)· root lint **exit 0** · `tsc --noEmit` **exit 0**
- ⚠️ **途中撞到一條假綠**:A3 嗰條 test(`opened_by` 缺 → 唔准 submit)第一版**冇 mock line items**,而 `raiseLicenceRequest` 喺冇 line 嗰陣本來就 early-return ⇒ `submit` 冇被 call 係「因為錯嘅理由」而通過。已補 `findMany` mock,個 assert 先真係守到 D3。**同 W44 Day 6 嗰句同源:斷言通過唔等於斷言有意義。**
### 部署(2026-08-10,DEV 部署 #3)

只 rebuild **api**(改動全部喺 `apps/api`),web 維持 `dev-3971ad3`。

| 步驟 | 證據 |
|---|---|
| build `dev-31d5970` | `exit 0`(Dockerfile 有 BUG-008 `test -f dist/main.js` gate ⇒ artifact 確認存在) |
| push | `digest: sha256:e8e0c48f…` |
| PATCH | api + web 兩個 `exit 0` |
| revision | `--0000005` `RunningAtMaxScale`,image `dev-31d5970` |
| **DB 通** | `19 migrations found` · `No pending migrations to apply.` · **`Seeded 24 OpCos + admin + RHK OPCO_IT user.`** |
| **app 起** | **`Nest application successfully started`** · 零 ERROR |

🔴 **冇用 revision 狀態落結論** —— entrypoint 令 migrate/seed 失敗 NON-FATAL,`RunningAtMaxScale` 證明唔到 DB。真證據係 `Seeded 24 OpCos`。

### A7 狀態

🔴 **仍然未做 ⇒ 本 CH 未算完成**。code 已經喺 DEV 跑緊,兩條路都做得:
1. 公司網撳 **Delivery failures** 個 `REQUEST_SUBMIT` retry(08-07 三行應該仲喺;`REQUEST_SUBMIT` 語意 = 外面乜都冇改過,repair 就係重新 submit)
2. 或者觸發一次真 n8n onboarding

🟢 **驗證唔使截圖** —— 撳完之後由本機直接查 `sc_req_item`(今日證過打得通 `ricohapdev`),見到一張新 O365 RITM(`cat_item = efe38ade…`)就等於 A7 過。

---

**Lifecycle reminder**:spec locked after status=approved。重大 deviation → §8 changelog。
