# ADR-0019: Email 通知傳輸採用 Azure Communication Services,並以此解封 AUTH-4c-C

**Date**: 2026-07-29
**Status**: Proposed
**Approver**: Chris Lai(待拍板 —— H2 新 dependency + H1 schema,見 §Open Questions)

## Context

### 觸發

Chris 2026-07-29:「開 CH-011 + ADR 做 ACS email,也一併處理 AUTH-4c-C。」

### 現狀查證(2026-07-29,唔係憑記憶)

| # | 事實 | 依據 |
|---|---|---|
| 1 | **平台零發郵件能力** | 全部 `package.json` 只有 `@azure/identity`(api)+ MSAL(web);**冇任何 mail SDK**。`apps/api/src/` 全掃零發信 code |
| 2 | ACS 連接字串**已經喺 `apps/api/.env`,但讀唔到** | 第 34 行整行被 `#` comment;第 36/37 行係拆開咗嘅 `endpoint=` / `accesskey=` 片段,**冇任何 env var 名**(而且細楷,違反 §3.3 命名) |
| 3 | `AUTH-4c-C` 由 **2026-07-13** 起 blocked,卡嘅正正係 transport | ADR-0006 §分階段:「email transport = SMTP / Graph `Mail.Send` 係另一未決 + **IT-gated** 決定」 |
| 4 | 自助改密碼所需嘅零件**大部分已存在** | `@Public()` decorator(`auth.controller.ts`)· `validatePassword()` policy(ADR-0006)· `USER_PASSWORD_CHANGE` audit action · `RefreshToken` 做 opaque-token 先例 |

🔴 **關鍵一點**:ADR-0006 當時只列咗兩條路 —— Graph `Mail.Send`(**要 IT 授 app permission**,同 AUTH-2b 一樣卡死)或 SMTP(新 dep + relay 主機)。**ACS 係第三條路,而佢唯一而且決定性嘅優點,就係唔使等 IT。** 本 ADR 全部價值都繫喺呢一點上。

### 觸發嘅 hard constraint(CLAUDE.md §5)

- **H2** — 新 runtime dependency **`@azure/communication-email`**(Azure 官方 SDK)。技術棧已 lock,加 dep 必須 approval + ADR。
- **H1** — `ConnectorConfig` 係**具名 column 唔係 key-value bag**(ADR-0013 補註,W39 實證)⇒ 加一個 connector **必然** `ALTER TABLE`。另 AUTH-4c-C 需要新 model `PasswordResetToken`。
- **H3** — 「發郵件」呢個能力好容易滑向「平台通知系統」。邊界必須明文寫死(見 D7)。
- **H4** — connection string 含 accesskey;收件人 email 係 PII。兩者都要守。

### Chris 2026-07-29 三項拍板(開 ADR 前)

| # | 問題 | 決定 |
|---|---|---|
| 1 | Workflow 分類 | **拆兩份** —— CH-011 只做 transport;AUTH-4c-C 另開 phase |
| 2 | Scope 邊界 | **順便鋪通知底座**(AI 曾 push back 屬 over-engineering,Chris 揀咗,即為決定) |
| 3 | Test connection | **唔畀探**,畫面寫明理由 |

---

## Decision

### D1 — Transport = ACS,**單一實作,唔起 switchable seam**

ADR-0017 嘅三個 seam 之所以存在,係因為**真係有兩個執行器**。而家得一個。喺得一個實作嘅時候起 seam,就係 W38(介面由 5 個方法收到 3 個)同 W40(`addWorkNote` 唔入介面)兩次刻意收窄所反對嘅嘢:**vendor 冇對應能力就唔好假裝有,caller 唔存在就唔好預先抽象**。

將來若真係要第二個 transport → 照 ADR-0017 D1 嘅 pattern 加掣,唔喺本 ADR 預先起。

### D2 — Vendor SDK 只准喺 `src/integration/email/`

CLAUDE.md §3.1:「Vendor SDK 只准喺 `src/integration/`;domain / orchestration 層唔可以直接 import」。Domain 層只見到 `NotificationService` 呢個介面,見唔到 `EmailClient`。

### D3 — 通知底座嘅具體形狀(Chris 拍板「順便鋪」)

底座 = **三樣嘢,唔多唔少**:

1. **`NotificationService.send(message)`** —— `message = { to, template, params }`。
2. **Template = typed code,唔係 DB row。** 一個 template 一個檔,各自出 subject + plain-text + HTML。
   - ❌ **唔做** template 編輯 UI、唔做 DB-stored template —— 嗰個係產品功能,唔係底座。
3. **失敗處理沿用 ADR-0011 `OutboundFailure`,唔新發明。** 跟 CH-010 同一態度(「沿用 ADR-0011,唔新發明」)。新增一個 `kind`,retry 走既有 `POST /admin/outbound-failures/:id/retry`。

⚠️ **「收件人解析」我收窄咗,呢個要你 approve 或者推翻(OQ-2)**:
底座只接受 **caller 明確傳入嘅地址**。我**冇**建一個由 role / OpCo / 訂閱偏好推導收件人嘅解析層 —— 因為推導所需嘅 policy(邊個 role 收邊類通知)**而家一條都唔存在**,建出嚟會係一個冇輸入嘅空殼。AUTH-4c-C 嘅收件人就係 `AppUser.email`,一個欄位,唔需要解析。
**我冇靜靜收窄 —— 我把收窄寫成一條要你拍板嘅決定。**

### D4 — 配置形狀

| 欄 | 類別 | 位置 |
|---|---|---|
| `ACS_CONNECTION_STRING` | **Secret** | **env-only**,永不入 DB / log / API 回應 |
| `ACS_SENDER_ADDRESS` | Non-secret | UI 改得(DB-then-env,ADR-0013 Model C) |

- 新 connector key **`email`**,label `Email (Azure Communication Services)`。
- 🔴 **H1**:因為 `ConnectorConfig` 係具名 column,加呢個 connector **必然**要 additive migration(一個 nullable 欄 `acsSenderAddress`)。呢個係 W39 已經寫入 ADR-0013 補註嘅已知代價,**今次係事前就知,唔係踩到先發現**。
- 🔴 **Optional,絕不 `getOrThrow`**。connector state 只會係 `active` / `inactive`,**永遠唔會係 `required`**。
  **理由**:email 係便利路徑,唔係平台命脈。用 `getOrThrow` 會令「一個可選功能配置錯」升級成「成個平台 boot 唔起」。冇配置 = 平台完全照舊運作,只係 forgot-password 唔開放。

### D5 — **唔畀探**(Chris 拍板)

`PROBEABLE.email = 'Sending a test email delivers a real message, so it is never called as a test'`,跟 `n8n-outbound`(「一撳就開一張真飛」)同一先例同同一寫法 —— 理由當成資料寫喺 `connectors.ts`,令 controller 冇得靜靜長出一個 probe。

**要誠實講嘅代價**:冇 probe ⇒ **配置啱唔啱,要到第一次真寄先知**。兩個緩解:
- CH-011 嘅 live 證明用一次性 ops script(跟 ADR-0014 F3 先例)。
- `lastSuccessAt` 由**真寄成功**derive,唔係由「有配置」derive —— 同 ADR-0010 D4「時間戳係佢最後一次真係 work,唔係最後一次被檢查」一致。

### D6 — H4 邊界(三條,全部要有 test)

1. **Connection string 永不離開 env** —— 唔入 DB、唔入 log、唔出 API。ADR-0013 D5 已有三重守 secret 嘅先例同 test,新 connector 直接落同一張網(leak test 已由 `CONNECTOR_CONFIG` derive,W40 改咗之後新 key 自動被覆蓋)。
2. **收件人地址係 PII,唔可以原封 log** —— 用既有 `scrubPii()`。
   🔴 **RISK R5 明文要求**:凡 assert「冇 PII」嘅 test **必須 spy logger**,唔可以只 assert exception message(BUG-004 就係咁匿咗 18 日)。
3. **ACS 回應 body 同樣 scrub 之後先 log**(BUG-007 先例 —— 外部系統回傳嘅字串唔可以當安全內容)。

### D7 — 明確唔做(H3 邊界)

- ❌ 唔做 template 編輯 UI / DB template
- ❌ 唔做業務通知(「licence 派好通知申請人」「drift 出現通知 admin」…)—— 要做**開新 ADR**
- ❌ 唔做 per-IP rate limit(需新 dep `@nestjs/throttler` = 再觸發 H2)
- ❌ 唔做收信 / 附件 / 排程發送
- ❌ 唔做第二個 transport、唔起 seam(D1)
- ❌ **CH-011 唔掂** AUTH-4c-C 嘅 endpoint / schema / 前端頁 —— 佢哋喺後續 phase(D8)

### D8 — AUTH-4c-C 嘅設計方向(本 ADR 一次過定,實作喺後續 phase)

拆兩份唔等於兩次拍板。以下而家定,免得 transport 做完先發現形狀唔夾:

| # | 決定 |
|---|---|
| 1 | **`PasswordResetToken` model,跟 `RefreshToken` 同一形狀** —— opaque token,**只存 SHA-256 hash**,`expiresAt`,`usedAt`,`onDelete: Cascade` |
| 2 | **TTL 30 分鐘 · 單次使用** |
| 3 | `POST /auth/forgot-password` + `POST /auth/reset-password`,兩個都 `@Public()` |
| 4 | 🔴 **枚舉抵抗**:無論 email 存唔存在、係咪 local user、有冇被停用,**一律 204**。運維可見度靠 audit,唔靠回應碼 |
| 5 | **只服務 `authProvider = 'local'`** —— SSO user 冇平台密碼可重設(照返 204,唔講原因) |
| 6 | 成功重設之後:**撤銷該 user 全部 `RefreshToken`**(ADR-0006 §7 rotation 精神 —— 重設密碼嘅人可能正正係因為懷疑被盜)+ 清 `lockedUntil` / `failedLoginCount`(唔清嘅話佢改完密碼仍然入唔到,操作上講唔通)+ **唔設** `mustChangePassword`(密碼係佢自己揀,唔係 admin 派) |
| 7 | 密碼規則**沿用既有 `validatePassword()`**,唔另寫一套 |
| 8 | Audit:新 action **`auth.password_reset_requested`**(濫用偵測用);真正改密碼**沿用既有 `user.password_change`**。⚠️ 新 action 要一併擴 ADR-0009 白名單,否則 `pickAuditMetadata` 會**靜靜丟棄**(W36 D6 踩過) |
| 9 | **速率 = per-account cooldown**(DB-based,零新 dep)。per-IP **明確唔做**(要新 dep) |

---

## Alternatives Considered

- **Option A — Graph `Mail.Send`**:rejected 因為**要 IT 授 app permission**,同 AUTH-2b 一模一樣嘅 blocker,而繞開嗰個 blocker 就係本 ADR 存在嘅唯一理由。
  ⚠️ **但要公道講**:佢技術上**唔使新 dep**(Graph vendor 早已 locked),所以純以架構整潔度計,佢其實**優於** ACS。佢輸嘅唔係設計,係**而家攞唔到授權**。若 IT 日後批咗,重新評估係合理嘅,屆時寫新 ADR supersede。
- **Option B — SMTP(nodemailer)**:rejected 因為一樣要新 dep,而且仲要 relay 主機 + 憑證 + 防火牆規則,運維面比 ACS 闊;ACS 一個 connection string 搞掂,而且同 Azure UAT(ADR-0012)同一個雲、同一個 subscription 計費。
- **Option C — 唔做 email,維持 admin-reset**:rejected,但要 acknowledge 佢一直係**合理**嘅 —— ADR-0006 明文寫「admin-reset 已 cover 忘密碼,故 email self-service **非必需**」。今次改變唔係因為 admin-reset 唔夠用,而係 **Chris 要求 + ACS 令成本大跌**。
- **Option D — 起 acs|graph|smtp switchable seam**:rejected 因為得一個執行器(D1)。
- **Chosen — ACS 單一 transport + 最小通知底座**:因為佢係**唯一一條而家行得通**嘅路,而且同已部署嘅 Azure UAT 同雲。

---

## Consequences

### Positive
- **解封 AUTH-4c-C** —— 由 2026-07-13 blocked 至今。
- **唔使等 IT** —— 同時卡住 AUTH-2b / DEPLOY-harden / 4c-C 嘅 app-reg 依賴,呢條線斷咗一條。
- 同 Azure UAT(ADR-0012)同雲同 subscription,運維面唔擴。
- 底座落地後,第二個 use case 嘅成本主要係一個 template。

### Negative
- **多一個 vendor 要維護、監察**,而且係**唔畀探**嗰種(D5)⇒ 配置錯要到真寄先知。
- `ConnectorConfig` **又一次 `ALTER TABLE`** —— ADR-0013 已知痛點,今次事前就知(D4)。
- 🔴 **CH-011 落地嗰刻零 production caller** —— 呢個係「拆兩份」嘅**必然後果**。CH-010 啱啱先因為「冇 caller 到達得到、測唔到嘅 code」刪走 n8n 2004 client;本 ADR 唔會扮呢個問題唔存在:**CH-011 嘅 live 證明靠一次性 ops script,真 caller 喺 4c-C 到**。若 4c-C 遲遲唔做,呢舊 code 就會變成同類債。
- 通知底座嘅價值**要到第二個 use case 先兌現**,而第二個 use case 而家唔存在(AI 已 push back,Chris 拍板照做)。

### Neutral
- **唔改任何既有行為。** 唔配置 ACS = 平台完全照舊(D4 optional)。
- 唔掂 ledger / reconcile / stage machine / 預算 gate / 對帳 —— 一個字都唔郁。

---

## Open Questions(要答先可以 `Proposed → Accepted`)

| # | 問題 | 點解 blocking |
|---|---|---|
| **OQ-1** 🔴 | **ACS resource 有冇 provisioned sender address?** Azure-managed domain(`DoNotReply@<guid>.azurecomm.net`)定 custom domain? | 冇 verified sender 就**一封都寄唔出**,live 驗證做唔到。呢個係唯一一個平台側解決唔到嘅前置 |
| **OQ-2** | 「收件人解析」收窄成「caller 傳地址」(D3)—— **approve 定推翻**? | 決定底座嘅大細。我建議收窄,理由 = 推導所需嘅 policy 一條都未存在 |
| **OQ-3** | CH-011 零 caller,live 證明用一次性 ops script(跟 ADR-0014 F3)—— 接受? | 唔接受嘅話就要合返一份做,即推翻「拆兩份」 |

---

## References

- **ADR-0006** §分階段 4c-C(本 ADR 解封嘅對象)· §7(refresh token rotation 精神)
- **ADR-0013** Model C + W39 補註(ConnectorConfig 具名 column ⇒ 加 connector 必然 ALTER TABLE)· D5(secret 三重守)
- **ADR-0011** outbound 失敗佇列(D3 沿用,唔新發明)
- **ADR-0010** D4(時間戳 = 最後一次真係 work)· D5(`PROBEABLE` 當資料)
- **ADR-0009** D4 audit 白名單(D8 #8 要擴)
- **ADR-0017** D1(一個 seam 一個掣 —— 本 ADR 刻意**唔**跟,理由見 D1)
- **ADR-0012** Azure UAT topology(同雲理由)
- **RISK R5**(外部字串入 log)· **BUG-004** / **BUG-007**(scrubPii 先例)
- **CH-011**(transport 實作)· AUTH-4c-C phase(待開)
- CLAUDE.md §5 **H1 / H2 / H3 / H4** · §3.1(vendor SDK 只准喺 integration)
