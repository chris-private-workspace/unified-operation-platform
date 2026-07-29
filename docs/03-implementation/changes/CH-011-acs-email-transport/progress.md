---
change_id: CH-011
spec_ref: ./spec.md
status: in-progress      # blocked | ready | in-progress | done
last_updated: 2026-07-29
---

# CH-011 — Progress

> During-execution log。每個 commit 對應一個 Day-N entry(PROCESS R2)。

## Day 0 — 2026-07-29(開單,未開工)

### 做咗咩

**唔係實作,係開單 + 查證。** 本 change 而家 `blocked`,零行 code。

**查證(真跑,唔係推論)**:

| # | 查咩 | 結果 |
|---|---|---|
| 1 | 平台有冇發郵件能力 | **零** —— 全部 `package.json` 只有 `@azure/identity`(api)+ MSAL(web);`apps/api/src/` 全掃零發信 code |
| 2 | `.env` 入面嗰段 ACS 讀唔讀到 | **讀唔到** —— 第 34 行整行被 `#` comment;36/37 行係拆開嘅 `endpoint=` / `accesskey=` 片段,**冇任何 env var 名**,而且細楷(違反 §3.3 命名)。⚠️ 只查 key 名冇查值(H4) |
| 3 | AUTH-4c-C 卡咗幾耐、卡邊度 | **2026-07-13 起 blocked**,卡 transport(ADR-0006 §分階段:「SMTP / Graph `Mail.Send` 係另一未決 + IT-gated」) |
| 4 | 4c-C 要由零起幾多 | **唔使** —— `@Public()` decorator · `validatePassword()` · `USER_PASSWORD_CHANGE` audit action · `RefreshToken` opaque-token 先例 **全部已存在** |

**同 Chris 三項拍板**(AskUserQuestion,開 ADR 之前):

| # | 問題 | 決定 | 備註 |
|---|---|---|---|
| 1 | Workflow 分類 | **拆兩份** | AI 建議 Phase W41;Chris 揀拆兩份 ⇒ CH-011 = transport,4c-C 另開 |
| 2 | Scope 邊界 | **順便鋪通知底座** | ⚠️ **AI 喺選項描述入面明文 push back**(屬 over-engineering,§1.2:而家得一個 caller,第二個 caller 嘅需求仲未存在)。Chris 揀咗 ⇒ **即為決定,照做** |
| 3 | Test connection | **唔畀探** | 跟 `n8n-outbound` 先例 |

### 交付

- `docs/adr/0019-acs-email-notification-transport.md`(**Proposed**)
- `docs/03-implementation/changes/CH-011-acs-email-transport/{spec,checklist,progress}.md`(**proposed / blocked**)

### 🔴 開工前 blocking(Gate 0)

| # | 未解決 | 點解 blocking |
|---|---|---|
| **OQ-1** | **ACS sender address 有冇 provisioned?** | 冇 verified sender **一封都寄唔出**,A11 做唔到。**唯一一個平台側解決唔到嘅前置** |
| **OQ-2** | 「收件人解析」收窄成「caller 傳地址」—— approve 定推翻? | 決定底座大細 |
| **OQ-3** | 零 caller 嘅 live 證明用一次性 ops script —— 接受? | 唔接受即推翻「拆兩份」 |
| Gate | ADR-0019 `Proposed → Accepted` | H2 新 dep + H1 schema |
| Gate | spec `proposed → approved` | PROCESS R1.change |

### 判斷記錄(免得日後要重推一次)

**① 分類:AI 判 Phase,Chris 判 Change(拆兩份)。**
AI 理由 = 新 dep(H2)+ 新 schema(H1)+ 未認證 endpoint + 新前端頁 + audit 擴充,超出「改現有 feature 行為 / < 3 days」。
Chris 拆兩份之後,**CH-011 剩返嘅部分確實落返 Change 範圍**(冇 endpoint、冇前端、冇 `PasswordResetToken`)⇒ 分類成立。**4c-C 嗰半仍然係 Phase 體積**,開嗰陣要照 Phase workflow(plan + checklist + progress)。

**② 「拆兩份 + 鋪底座」合埋產生一個已知後果:CH-011 落地嗰刻零 production caller。**
呢個唔係疏忽,係拆法嘅必然結果。CH-010 啱啱先因為「冇 caller 到達得到、測唔到嘅 code」刪走 n8n 2004 client ⇒ 唔可以扮睇唔見。
**處理方式**:寫入 spec §1 開宗明義 + ADR-0019 Consequences(Negative)+ CH-011 R2。緩解**唔係技術手段**,係「4c-C 緊接住做」。

**③ 收窄咗一樣嘢,但冇靜靜收窄。**
「收件人解析」我收窄成「caller 明確傳地址」,因為推導所需嘅 policy(邊個 role 收邊類通知)**一條都未存在**,建出嚟係冇輸入嘅空殼。
**呢個收窄寫成 ADR-0019 OQ-2,交返畀 Chris approve 或推翻** —— 唔係我單方面決定咗當冇事發生。

### Next

Gate 0 五項全清 → checklist `blocked → ready` → 先開始 code。

---

## Day 1 — 2026-07-29(Gate 0 收窄至一格,仍然零行 code)

### 做咗咩

PR **#48** merged(`7ac40fd`,獨立驗證 —— `gh pr view` MERGED + `git ls-remote` 對得上,唔靠 push 命令自報)。Chris 答齊三條 OQ ⇒ **ADR-0019 `Proposed → Accepted`**。

| OQ | 答案 |
|---|---|
| **OQ-1** | **`UnifiedOperationsPortal@rci-t.com`** |
| **OQ-2** | **Approve 收窄** ⇒ ADR-0019 D3 成立,唔建收件人推導層 |
| **OQ-3** | **接受** 一次性 ops script ⇒「拆兩份」維持 |

### 🔴 一個要記住嘅發現:R1 唔係消失咗,係換咗面目

原本 R1 = 「sender address 未 provisioned ⇒ 一封都寄唔出」。地址一有,直覺會當佢消解 —— **但佢係 custom domain(`rci-t.com`)而唔係 Azure-managed(`*.azurecomm.net`)**,而兩者嘅失敗模式**唔同**:

| | Azure-managed | Custom domain |
|---|---|---|
| 依賴 | 開箱即用 | **多一層 DNS**(SPF / DKIM) |
| 壞咗點樣 | 配置錯 → 直接報錯 | **ACS 收貨但唔送達 —— API 照返 202** |

⇒ 新 R1 = **「靜默唔送達,而平台側睇落完全成功」**。而 **D5 刻意唔畀探**,即係呢個位**冇第二層守門**。

**所以 A11 收緊咗**:由「真寄一封」改成「**以收件人真係收到為準,唔係 API 返 202 就算**」。
呢個正正係 AP-1(假驗收)同 CH-008 A8(第一次係假驗)同一類陷阱 —— 202 係「ACS 收咗你張單」嘅事實,唔係「人收到封信」嘅事實。

### 代查嘅嘢(結果 + 佢證明唔到咩)

開 PR 前掃過全部 **8 個 subscription**(3 個 tenant),`CommunicationServices` + `EmailServices` **零命中**。
⚠️ **呢個證明唔到「唔存在」** —— 連接字串明明喺 `.env`,即係 resource 一定喺度。只收窄到「目前 `az` 身份睇唔到」(第四個 tenant,或者 RBAC 擋住 —— 嗰種情況 `az resource list` 返空白而唔報錯)。**最後係靠 Chris 直接畀答案,唔係靠我掃出嚟。**

### Gate 0 現況

| 項 | 狀態 |
|---|---|
| OQ-1 / OQ-2 / OQ-3 | ✅ 全答 |
| ADR-0019 Accepted | ✅ |
| **Chris approve spec** | ✅ **已 approve**(2026-07-29,spec 內容零改動) |

⇒ **Gate 0 五項全清**,`blocked → in-progress`。R1 pre-doc 要求已滿足,可以開工。

### Next

按 spec §2.1 D1→D6 落地:dep → `EmailService` + boundary → template 機制 → connector + additive migration → H4 三條邊界(全部要 test)→ 失敗佇列接線 → ops script live 驗(A11,**以真係收到為準**)。

---

## Day 2 — 2026-07-29(實作,A11 以外全部達標)

### 交付

| 層 | 檔 |
|---|---|
| Integration | `email/notification.service.ts`(abstract + 型別)· `email/templates.ts` · `email/acs-email.service.ts` · `email/email.boundary.spec.ts` · `email/acs-email.service.spec.ts` |
| Connector | `connectors.ts`(key / PROBEABLE / CONNECTOR_CONFIG / 新 `kind:'email'`)· `connector-config.service.ts`(email 驗證)· `integration-status.service.ts`(+`emailConfigured()`) |
| Schema | `20260729071105_acs_sender_address` —— **SQL 得一行** `ADD COLUMN "acsSenderAddress" TEXT` |
| Fulfilment | `notification-dispatch.service.ts` + spec · `outbound-failure-fields.ts`(新 kind + whitelist)· `outbound-retry.service.ts`(`repairNotification`) |
| Ops | `scripts/send-connectivity-check.ts` + `npm run email:check` |

**api 599 → 626 test / 58 suites** · lint 零 output · build OK。

### 三個「守門真係捉到嘢」嘅位

**① A4 唔使我證,佢自己紅畀我睇。** 加完 `email` connector、未補 leak fixture 就跑既有 test —— **2 failed**,逐個列出 `ACS_CONNECTION_STRING` / `ACS_SENDER_ADDRESS` / `email` 冇覆蓋到。W39(手抄 4 個 key → iterate `CONNECTOR_KEYS`)同 W40(`list()` 手寫陣列 → 對返 inventory)嗰兩次「唔好靠人手同步」嘅功夫,今日直接兌現。spec A4 特別寫住「**要實證唔可以假設**」,結果連實證都唔使我特登去砌。

**② boundary test 捉到自己第一版。** 我查 `AcsEmailService` 呢個 class 名,結果 `notification-dispatch.service.ts` 個**註解**提到佢(解釋 scrub 已經喺上游做咗)就被當成違規。W39 喺 license seam 撞過**一模一樣**嘅 false positive,結論亦一樣:**boundary 係「file import 咗乜」,唔係「file 講起過乜」** ⇒ 改查 import path。

**③ A12 fails-before:** 拆走 `scrubPii` 一行 → **2 failed / 7 passed**。而「成功路徑唔 log 收件人」嗰條**照綠** —— 呢個先係重點:佢本來就唔經 scrub,如果佢都紅,即係我條 test measure 緊第二樣嘢。

### 幾個實作判斷(值得記低,免得日後重推)

**① `params` 唔入失敗佇列 —— 呢個係安全決定唔係疏忽。** ADR-0019 D8 講明 4c-C 會經 `params` 傳單次 reset token。存低就等於把「送信失敗」升級成「憑證躺喺一張操作員睇得到嘅 queue row 度」。連帶後果:retry 只可以重寄**唔需要 params** 嘅 template ⇒ 加咗 `REPLAYABLE_TEMPLATES` **正面清單**(跟 W40 把 `KINDS_WITH_LINE_ITEMS` 由「除咗 X 之外」倒轉成明列嘅同一理由 —— 寫成排除式就會靜靜 opt-in 所有未來 template,而下一個 template 正正係唔可以 replay 嗰個)。

**② dispatcher 擺喺 `fulfilment` 唔擺喺 `integration`。** 失敗佇列喺 fulfilment;如果 email service 自己記錄失敗,就係 `integration → fulfilment` 循環。本 repo 早就答咗呢條:**integration 返 outcome,caller 記失敗**(CH-010 個 `direct-ticket.provider` 就係咁)。冇新發明。

**③ ops script 唔用 `NestFactory.createApplicationContext(AppModule)`。** 咁會連 `ScheduleModule` 一齊起,而 ADR-0015 個 sync sweep **會寫**(向真 Graph 開 sync gate)。一個「連線檢查」唔應該有能力做呢件事 ⇒ 三個依賴手工 wire,但用嘅係**真 class**,行嘅係 production 路徑。

**④ 計劃外加咗 `kind: 'email'` 欄位驗證。** D5 拆走咗 probe,所以寫入時驗證係操作員喺「真寄失敗」之前**唯一**嘅回饋。`text` 會照單全收。

### 兩個環境坑(唔係 code 問題,但食咗時間)

- **`prisma generate` EPERM** —— 唔係公司 DLP(memory 記錄嗰個),係**跑緊嘅 backend 鎖住 `query_engine-windows.dll.node`**。停 stack → generate 307ms 完成,零下載。
- kill-zombies dry-run 出 15 個,**逐行 trace 得返本項目**先執行;冇誤中其他項目。

### 🚧 剩返 A11

**等 Chris 落 `.env` 兩個 key**(CLAUDE.md §4.4 唔准 AI 掂 `.env*`;而且我全程只讀 key 名冇讀值,所以連個 accesskey 都唔喺我手上):

```
ACS_CONNECTION_STRING=endpoint=https://<resource>.communication.azure.com/;accesskey=<key>
ACS_SENDER_ADDRESS=UnifiedOperationsPortal@rci-t.com
```

然後 `npm run email:check -w @uop/api -- --to=<你個地址>`。
🔴 **判準係你真係收到封信,唔係 script 印咗 `sent`** —— custom domain(`rci-t.com`)嘅失敗模式就係 ACS 收貨但 DNS 側唔送達,而 API 照返 Succeeded(R1)。

---

## Day N — (待開工)
