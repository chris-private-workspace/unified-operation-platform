---
change_id: CH-030
title: "Request detail 四項修正(licence REQ 號碼 · stepper 步名 · sync 時間戳 · 右欄次序)"
status: proposed          # 等 Chris approve §3 acceptance + ADR-0035 Accepted 先開工
created: 2026-08-14
target_completion: TBD    # 估 0.5–1 日(見 §6)
affects_components: [apps/api/prisma, apps/api/fulfilment, apps/web]
spec_refs:
  - **ADR-0035**(決策 SSOT · Proposed —— 平台自己嘅 licence REQ 號碼落 `Request`)
  - ADR-0025 D2(平台經 Service Catalog 開 licence request)· OQ-2(兩張 SN 單唔可以混淆)
  - CH-024 C(header 分開兩張 SN 單 · timeline NOTE 係 REQ 唯一倖存地)
  - CH-025 A(display-only `Completed` 步)
  - ADR-0015 D3 / ADR-0025 D4(兩道 sync gate)
  - docs/02-architecture/design-system.md(H6 · DS-1/2/4/5)
---

# CH-030 — Request detail 四項修正

> **Spec version**:1.0(**proposed** 2026-08-14)
> **Owner**:Chris Lai · **Approved by**:_(待批)_
> **決策 SSOT**:**`ADR-0035`**(F1 嗰項;其餘三項純顯示,唔需要 ADR)
> **分類**:**Change**(四項都係改現有行為,冇新 feature;估 0.5–1 日)
> 🔴 **觸發 H1(F1 改 Prisma schema)+ H6(F2/F3/F4 前端)** —— 見 **§4**。

---

## 1. 點解要(四項,逐項寫證據)

Chris 2026-08-14 睇 request detail 頁面提出四點。查證之後,**四項嘅性質唔一樣**,唔可以當一堆 UI 微調處理:

| # | Chris 講嘅 | 查證結果 | 性質 |
|---|---|---|---|
| **F1** | 「licence request 顯示嘅係 RITM 號碼,唔係 Request 號碼」 | ✅ 屬實,但**唔係顯示 bug** —— 個 REQ 號碼**根本冇存落 DB** | **資料缺口**,改 schema ⇒ H1 |
| **F2** | 「step 4 應該顯示 completed 相關文字」 | ✅ 屬實,而且**四個點全部都冇文字** | 顯示 |
| **F3** | 「三個 sync 步驟顯示埋發生時間」 | ✅ 資料齊,但 **AD 嗰個時間多數係假嘅** | 顯示(有陷阱) |
| **F4** | 「Operational history 同 AI Assist 換位」 | ✅ 兩個 `<Card>` 對調 | 顯示 |

### 1.1 🔴 **F1 — 平台自己嘅 licence REQ 號碼,今日冇地方住**

**現況(由 code 讀返,唔係推論)**:

一張 onboarding 背後有**兩張唔同嘅 ServiceNow 單**(ADR-0025 OQ-2,`schema.prisma` 逐字警告「mixing them up is the easiest mistake to make here」):

| 單 | 邊個開 | 存喺邊 |
|---|---|---|
| **Onboarding REQ** | n8n(intake 源頭) | `Request.serviceNowNumber` — **`@unique`,idempotency key** |
| **Licence REQ** | **本平台**(ADR-0025 D2 catalog `order_now`) | 🔴 **冇地方存** |
| **Licence RITM ×N** | 同上(catalog workflow 造) | `RequestLineItem.serviceNowNumber` |

`order_now` **確實返咗** REQ number(`servicenow.service.ts:242` → `CatalogOrderResult.requestNumber`),而 `direct-servicenow.provider.ts:180` 把佢放喺 `SubmittedRequest.serviceNowNumber` 交返出嚟 —— 但 `intake-adapter.service.ts:331-341` 只把**每條 RITM** 寫落 line item,**個 REQ 直接跌咗落地**。

`schema.prisma:313` 講明點解:

> The platform's own REQ deliberately has nowhere on `Request` to live: giving it one would mean **two candidate idempotency keys** for the same row.

**唯一倖存地** = CH-024 C 加嘅 timeline NOTE(`intake-adapter.service.ts:414`):

```
Licence request REQ0044083 raised in ServiceNow by the platform (RITM0047389)
```

`recordLicenceRequestEvent` 個 comment 自己都寫住:

> 🔴 This is the ONLY place the platform's own parent REQ number survives. … before this change it existed in one log line and nowhere else.

⇒ **後果**:header 個 section label 叫 **`Licence request`**,但打出嚟嘅係 `licenceRequestNumbers()` 由 line item 撈返嘅 **RITM**。label 同內容講緊兩樣嘢,而**唯一嘅修法係先有地方存個 REQ**。

🔴 **所以本項唔可以當前端修** —— 要改就係**推翻 `schema.prisma` 一個明文決定**,見 §4 + **ADR-0035**。

### 1.2 F2 — Stepper 四個點全部冇文字,唔止第四個

`stepper.tsx` 由頭到尾**冇 render 任何 label**,步名只放喺 `title=`(hover tooltip)。畫面上淨低:

- 左:4 個(短路)或 6 個(procurement)圓點,終點係 ✓
- 右:`Step 4/4`(mono)
- 再右:Badge `Assigned`

CH-025 A 加咗第四點 + 終點 ✓,**但冇加字** —— 所以「已完成」呢件事今日靠**一個 tick icon** 同 Badge 講,而 `Completed` 呢個 label 只喺 tooltip。

### 1.3 🔴 F3 — 三個時間戳資料齊,但 `accountCreatedAt` 多數唔係真嘅建帳戶時間

三個都喺 API payload(`api-types.ts:848-855`),前端 `SyncStep` 淨係冇顯示。**但直接印會講大話**:

| 欄 | 邊度嚟 | 可信? |
|---|---|---|
| `accountCreatedAt` | n8n **唔會送**(`intake-adapter.service.ts:98` 刻意唔由 `sentAt` 推導)⇒ 開 gate 嗰陣 `?? now` 填(`open-sync-gate.ts:64`) | 🔴 **多數 = 開 gate 嗰刻** |
| `azureSyncedAt` | 平台自己喺 Graph 見到個 user 嗰刻 | ✅ 平台自己觀察 |
| `serviceNowUserSyncedAt` | 平台自己喺 SN 見到 sys_user 嗰刻 | ✅ 平台自己觀察 |

`open-sync-gate.ts:61-63` 個 comment 已經講咗個 `??` 存在嘅理由:

> if the account creation time is already known, this must not overwrite it with "whenever we happened to notice" — that would destroy the one figure showing how long Entra Connect actually took.

⇒ 但**今日冇任何一條路會事先填佢**(n8n 兩條 intake 路都明文唔填),所以實際上 `accountCreatedAt === azureSyncedAt` 幾乎必然成立。**兩個步驟印住同一秒**,讀嘅人會以為「開帳戶同 sync 同一秒完成」—— 而咁樣講嘅係我哋,唔係資料。

**Chris 2026-08-14 決定**:**AD 嗰步唔顯示時間**,另外兩步顯示。

### 1.4 F4 — 右欄次序

`request-detail.tsx:942-995`:`AI Assist`(Preview,`EmptyState`「Coming soon」)喺上,`Operational history`(真資料)喺下。一個未有嘢嘅 placeholder 佔住右欄第一眼位置。

---

## 2. 做咩(scope)

### 2.1 In scope

| # | 改動 | 檔 |
|---|---|---|
| **F1-a** | `Request` 加 `serviceNowLicenceReqNumber String?` —— **非 `@unique`**,**唔參與任何 upsert / where** | `apps/api/prisma/schema.prisma` + migration |
| **F1-b** | intake-adapter raise licence request 成功之後,連同 RITM 一齊寫入 | `intake-adapter.service.ts` |
| **F1-c** | 出 API + 前端 header:`Licence request` 顯示 **REQ**,RITM 移去講明係 items | `request.service.ts` / `api-types.ts` / `request-detail.tsx` |
| **F2** | `Step 4/4` → `Step 4/4 · Completed`(當前步名) | `request-detail.tsx` |
| **F3** | `SyncStep` 收 optional `at`;Azure / ServiceNow 兩步顯示,**AD 嗰步唔顯示** | `request-detail.tsx` |
| **F4** | `Operational history` 同 `AI Assist` 兩個 `<Card>` 對調 | `request-detail.tsx` |

### 2.2 🚧 Out of scope(明文排除,唔係漏)

- **backfill 舊 request 個 REQ 號碼** —— 見 §5 **OD-1**(建議唔做,待 Chris 決定)
- **`serviceNowLicenceReqSysId`** —— 冇 caller 需要(唔會 PATCH 平台自己個 REQ;CH-023 close 嘅係 RITM)。`§1.2 Simplicity First`
- **`stepper.tsx` 本身** —— 唔喺元件度加 label(procurement 路 6 點橫向空間唔夠,見 §5 D2)
- **`accountCreatedAt` 個資料質素** —— 要 n8n 真送先修得到,屬 `N8N-SEAMS`
- **`AI Assist` 嘅內容** —— 只搬位,唔掂功能

---

## 3. Acceptance(逐條可驗)

### F1 — licence REQ 號碼

- [ ] **A1** `schema.prisma` 有 `serviceNowLicenceReqNumber String?`,**冇 `@unique`**,comment 講明佢同 `serviceNowNumber` 嘅分別
- [ ] **A2** migration 生成 + 對本機 DB 真跑過(`prisma migrate` 輸出貼喺 progress)
- [ ] **A3** intake-adapter test:raise 成功 ⇒ `Request.serviceNowLicenceReqNumber` = provider 返嘅 REQ;raise 失敗 ⇒ 維持 null
- [ ] **A4** **falsification**:拆走 F1-b 個寫入 ⇒ A3 條 test 真紅
- [ ] **A5** API 出到欄(controller / DTO 層有 test 釘住 —— 🔴 BUG-011 教訓:read-model 加欄唔等於出到 API)
- [ ] **A6** 前端 header:有 REQ 時 `Licence request` 顯示 **REQ**;RITM 喺同一格另一行標明係 items
- [ ] **A7** 🔴 **舊資料(冇 REQ 得 RITM)唔可以變空白** —— 回退到今日行為(顯示 RITM),有 test

### F2 — stepper 步名

- [ ] **B1** `Step 4/4 · Completed`(短路 ASSIGNED)· `Step 2/4 · READY`(短路 READY)· procurement 路同樣行得通
- [ ] **B2** falsification:還原做 `Step {n}/{total}` ⇒ 條 test 真紅

### F3 — sync 時間戳

- [ ] **C1** `Synced to Azure AD` / `Synced to ServiceNow` 顯示時間(`formatDateTime`,mono — DS-5)
- [ ] **C2** 🔴 `AD account created` **冇時間**(§1.3),有 test 釘住「唔顯示」呢件事
- [ ] **C3** gate 未開(`null`)⇒ 唔印任何時間、唔印 `—`

### F4 — 右欄次序

- [ ] **D1** `Operational history` 喺 `AI Assist` **之上**,有 test 釘住次序(唔係淨係睇圖)

### 全域

- [ ] **E1** api test 全綠 · web test 新增項全綠(pre-existing 6 條紅唔計)
- [ ] **E2** tsc 兩邊 0 · api lint 0 · web lint 唔增加
- [ ] **E3** **H6 真 render**:light + dark 兩個都行過(`ui-design` skill 逐條答)
- [ ] **E4** ADR-0035 由 Proposed → **Accepted**(F1 開工前置)

---

## 4. 🔴 Hard constraint 觸發

| # | 條 | 觸發乜 | 處理 |
|---|---|---|---|
| **H1** | 架構 | **F1 改 Prisma schema**,而且**推翻 `schema.prisma:313` 一個明文決定** | **ADR-0035**(Proposed)。🔴 開工前要 Chris 批 |
| **H5** | Test | F1 掂到 intake outbound 路 —— **唔屬** critical path 定義(assign / ledger / 對帳 / stage / sync gate),但既有 `intake-adapter.service.spec.ts` 要跟住更新 | A3 + A4 |
| **H6** | Design | F2/F3/F4 全部前端 | E3 + `ui-design` skill |

**H1 論據(要 Chris 判)**:`schema.prisma` 反對嘅係「第二個 **candidate idempotency key**」。一個**明確非 unique、唔參與任何 upsert / where 子句**嘅欄產生唔到呢個問題 —— 原本嗰個理由**唔覆蓋**呢個做法。但「原本理由唔覆蓋」係本 spec 嘅判斷,唔等於可以自行推翻,所以照走 ADR。

---

## 5. 決策 / Open decisions

### D1 — 只加 `number`,唔加 `sysId`
`Request.serviceNowSysId` 存源 REQ 個 sysId 係因為 intake 要 PATCH 佢。平台自己個 licence REQ **冇任何 caller 要 PATCH**(CH-023 close 嘅係 RITM),⇒ 加 sysId 純粹係「將來可能有用」= §1.2 禁嘅嘢。要用嗰日由 number 查得返。

### D2 — 步名放喺計數旁,唔放喺 `stepper.tsx`
Chris 2026-08-14 揀。procurement 路 6 個點,每點寫 label 會逼到換行或縮字,而 line item row 已經有 SKU 名 / budget / seats 三行。放喺 `Step n/m` 旁 = 一個字都唔使縮,四條路都行得通。

### D3 — `Licence request` label 之後點寫
有 REQ:`Licence request REQ0044083` + 下一行 `items RITM0047389`。冇 REQ(舊資料):維持今日行為,只印 RITM。**唔印 `—`** —— 跟 `ServiceNowTickets` 既有規矩(空 section 略過,因為「REQ —」讀落係「張單唔見咗」,係一個更大聲嘅 claim)。

### 🚧 OD-1 — 舊 request 要唔要 backfill?(**未決,建議唔做**)
現存 request 冇存過個 REQ,加咗欄都係 null。號碼**攞得返** —— 喺 timeline NOTE 度 regex parse。

**建議唔做**,理由:為咗幾張測試單,引入一個 **parse 英文 message 嘅一次性 script**,而嗰句文案本身冇 test 釘住格式(改文案就靜靜壞)。A7 已經保證舊資料唔會變空白。

**若 Chris 要做** ⇒ 加一條 acceptance + 一個 `scripts/` 一次性 script(唔入 migration),兩個環境各跑一次(同 CH-026 `G-7` 一樣,DB 資料唔跟部署走)。

---

## 6. 估時

| 項 | 估 |
|---|---|
| F1(schema + migration + 寫入 + API + 前端 + test) | 0.5 日 |
| F2 + F3 + F4 + test | 0.25 日 |
| H6 render(light + dark)+ doc sync | 0.25 日 |
| **合計** | **~1 日** |

⚠️ **本機 render 要 5433** —— 停 `ai-doc-extraction-db` 要 Chris 批,而佢會自己返嚟搶 port(CLAUDE.md §9)⇒ render 驗證要一氣呵成。
