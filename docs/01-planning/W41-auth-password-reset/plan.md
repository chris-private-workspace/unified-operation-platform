---
phase: W41-auth-password-reset
name: "AUTH-4c-C — email 自助重設密碼(ADR-0019 D8 落地)"
sprint_week: W41
start_date: 2026-07-29
end_date:
status: active                # draft | active | closed
spec_refs:
  - docs/adr/0019-acs-email-notification-transport.md **D8**(九條決定,本 phase 逐條落地)· D3(caller 傳地址)· D7(邊界)
  - docs/adr/0006-local-password-authentication.md(4c 系列;§7 refresh rotation 精神)
  - docs/adr/0009-audit-trail.md D4(新 action 要擴白名單,否則 `pickAuditMetadata` 靜靜丟棄)
  - docs/adr/0013-connector-config-ui-management.md(非機密落 env/DB 嘅分界)
  - docs/02-architecture/design-system.md(H6 — 兩個新畫面)
prior_phase: W40-ticket-update-provider
---

# Phase W41 — AUTH-4c-C 自助重設密碼

> **Plan version**:1.1(OQ 全部已答,轉 active)
> **Owner**:AI(Claude)
> **Approved by**:**Chris Lai(2026-07-29)** —— §8 **四條 OQ 全部跟建議**:OQ-1 新 env + 未設照 204 · OQ-2 fire-and-forget · OQ-3 5 分鐘 · OQ-4 fragment。**H1 已由 ADR-0019 D8 #1 授權**(additive `PasswordResetToken` model),唔另開 ADR。

## 1. Scope

本地帳號忘記密碼 → 自己收 email → 用單次連結重設。ADR-0019 **D8 已經一次過定死九條**,本 phase 係執行,唔係重新設計。

做完 = **CH-011 個通知底座第一次有真 production caller**,ADR-0019 Consequences 記低嘅「零 caller = 測唔到嘅 code」呢筆債同時清咗。

### 唔做(H3 邊界)

- ❌ SSO 帳號重設(佢哋冇平台密碼 —— D8 #5)
- ❌ per-IP rate limit(要新 dep `@nestjs/throttler` = H2,D7 明文排除)
- ❌ 業務通知 / template 編輯 UI / 第二個 transport(D7)
- ❌ 唔郁 admin-reset(`POST /admin/users/:id/reset-password` 一個字都唔改)—— 兩條路並存

## 2. 設計(D8 九條 → 具體形狀)

### 2.1 Schema(H1:additive,已由 ADR-0019 D8 #1 授權,唔另開 ADR)

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  user      AppUser   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique   // SHA-256 of the opaque token — raw never stored (H4)
  expiresAt DateTime
  usedAt    DateTime?           // single use
  createdAt DateTime  @default(now())
  @@index([userId])
}
```

`AppUser` 加一條 relation field。形狀**刻意同 `RefreshToken` 一模一樣**,連 `randomBytes(32).toString('hex')` + `createHash('sha256')` 都沿用 `refresh-token.service.ts` 嘅寫法 —— 唔另發明。

### 2.2 兩個 endpoint(都 `@Public()`)

| Route | Body | 回應 |
|---|---|---|
| `POST /auth/forgot-password` | `{ email }` | **一律 204** |
| `POST /auth/reset-password` | `{ token, newPassword }` | 204 / 400 |

🔴 **`forgot-password` 一律 204** —— email 唔存在、係 SSO、被停用、撞 cooldown,全部同一個回應(D8 #4)。運維可見度靠 audit,唔靠回應碼。

`reset-password` **可以**返 400:去到呢一步嘅人已經攞住一個 token,唔再係枚舉場景,而「你條連結過咗期」對用戶有用。但錯誤訊息**唔分**「唔存在 / 過期 / 用過」—— 一律同一句。

### 2.3 成功重設之後(D8 #6,一個 transaction)

1. 寫新 `passwordHash`(argon2)+ `passwordChangedAt`
2. 標記該 token `usedAt`
3. **撤銷該 user 全部 `RefreshToken`** —— 會嚟重設密碼嘅人,可能正正係懷疑被盜
4. 清 `lockedUntil` + `failedLoginCount` —— 唔清嘅話佢改完仍然入唔到,操作上講唔通
5. **唔設** `mustChangePassword` —— 密碼係佢自己揀嘅,唔係 admin 派

### 2.4 Audit(D8 #8)

- 新 action `auth.password_reset_requested`(濫用偵測用)—— ⚠️ **必須一併擴 ADR-0009 白名單**,W36 D6 踩過:唔擴就 `pickAuditMetadata` 靜靜丟棄
- 真正改密碼**沿用既有 `user.password_change`**,`actorId === targetId`(同 self-service 改密碼同一形狀)

### 2.5 Template

`templates.ts` 加 `password-reset`,`TemplateKey` union 加一個值。
🔴 **唔加入 `REPLAYABLE_TEMPLATES`** —— CH-011 已經預先寫低理由:內容依賴一個**唔會被持久化**嘅單次 token,replay 出去只會係一條壞連結。

### 2.6 前端(H6)

| 路由 | 內容 |
|---|---|
| `/forgot-password` | 一個 email 欄 + 一個 primary action;成功後顯示中性訊息(唔透露帳號存唔存在) |
| `/reset-password` | 新密碼 + 確認 + 一個 primary action;沿用既有 password policy 提示元件 |

Login 頁加一條 `Forgot password?` link。三處都 token-only、light + dark、commit 前跑 `ui-design` skill。

## 3. Deliverables

| # | 交付 | 層 |
|---|---|---|
| F1 | `PasswordResetToken` model + additive migration | prisma |
| F2 | `password-reset.service.ts`(issue / consume / cooldown) | api/auth |
| F3 | 兩個 endpoint + DTO + 枚舉抵抗 | api/auth |
| F4 | `password-reset` template(**唔入 replayable**) | api/integration/email |
| F5 | 新 audit action + ADR-0009 白名單擴充 | api/audit |
| F6 | `/forgot-password` + `/reset-password` 兩頁 + Login link | web |
| F7 | test(見 §4) | 兩邊 |
| F8 | UAT 端到端真寄一封 + 真重設 | live |

## 4. Acceptance(G1–G9)

| # | 準則 | 點驗 |
|---|---|---|
| G1 | 枚舉抵抗 | 唔存在 email / SSO user / 停用 user → **204 且冇 send 呼叫**(spy 斷言,唔係淨睇 status) |
| G2 | Token 單次 | 同一 token 用兩次 → 第二次拒;`usedAt` 已寫 |
| G3 | Token 過期 | `expiresAt` 過咗 → 拒(TTL 30 分鐘,D8 #2) |
| G4 | 只存 hash | DB 抽查:`tokenHash` 係 64 hex,raw token **搵唔到** |
| G5 | 重設副作用 | 成功後該 user 全部 `RefreshToken` `revokedAt` 非 null;`lockedUntil`/`failedLoginCount` 已清;`mustChangePassword` **仍然 false** |
| G6 | 密碼規則沿用 | 弱密碼 → 400,訊息由既有 `validatePassword()` 出(唔另寫一套) |
| G7 | Replay 邊界 | boundary test:`REPLAYABLE_TEMPLATES` **唔包** `password-reset` |
| G8 | Audit | `auth.password_reset_requested` 落 DB **且 metadata 冇被白名單丟走**(fails-before:唔擴白名單→紅) |
| G9 | H4 | 全程冇 log token / 密碼 / hash;收件人只入失敗佇列,唔入 log(沿用 CH-011 契約) |

⚠️ **G1 同 G8 都要 fails-before 實證** —— 呢兩條係「壞咗都會靜靜過」嘅類型。

## 5. 🔴 誠實邊界

- **UAT email 真送達** 已經由 CH-011 A11 證實過一次(真收到)。但 ADR-0019 OQ-1 記低:custom domain `rci-t.com` 靠 DNS 側 SPF/DKIM,失敗模式係「ACS 收貨但唔送達,而平台側睇落完全成功」。⇒ **F8 必須以收件人真係收到為準**,唔可以以 API 202 為準。
- **本 phase 完成 ≠ 生產可用** —— 仲要 `APP_BASE_URL` 落 UAT(見 OQ-1)。

## 6. Risks

| # | 風險 | 處理 |
|---|---|---|
| R1 | 重設連結被轉發 / 留喺 log | token 單次 + 30 分鐘 TTL;連結位置見 **OQ-4** |
| R2 | 郵件送唔到 = 用戶卡死 | admin-reset 一直存在,係 fallback(本 phase 唔郁佢) |
| R3 | 枚舉靠時序差 | 見 **OQ-2** |
| R4 | cooldown 太鬆 → 郵件轟炸 | per-account cooldown(D8 #9),時長見 **OQ-3** |

## 7. 分工順序

F1 → F2 → F3/F4/F5 → F7(後端 test)→ F6 → F7(前端 test)→ F8。
後端全綠先郁前端 —— 兩個新畫面唔應該對住未定形狀嘅 API 砌。

## 8. Open Questions —— ✅ 四條全部已答(Chris,2026-07-29,**全部跟建議**)

| # | 問題 | 決定 |
|---|---|---|
| **OQ-1** | 重設連結個 base URL 由邊度嚟?平台目前**冇**任何 `APP_BASE_URL` 概念 | ✅ **新 env + 未設照 204**。`APP_BASE_URL` 用 `config.get`(**唔用 `getOrThrow`**)—— 否則未設就 boot 唔起,違反 ADR-0019 D4「email 係 optional,唔可以令平台起唔到身」。⚠️ 而且 UAT 而家就係未設,`getOrThrow` 會即刻 crash loop(BUG-008 啱啱先因為同類原因死過一次)。未設 → 照返 204 + audit 記低 + 入失敗佇列 |
| **OQ-2** | `forgot-password` 要唔要 await 寄郵件?await = 存在同唔存在有**明顯時間差**,枚舉抵抗被時序繞過 | ✅ **唔 await(fire-and-forget)**。`NotificationDispatchService` 契約明文保證永不 throw(已讀 code 確認)⇒ 冇 unhandled rejection 風險;同時消除時序差 |
| **OQ-3** | per-account cooldown 幾長? | ✅ **5 分鐘**。配合 30 分鐘 TTL = 一個 TTL 內最多 6 封 |
| **OQ-4** | token 放 URL **query** 定 **fragment**? | ✅ **fragment `#token=`**。fragment 唔會送去 server ⇒ 唔入 nginx access log、唔出現喺 Referer。我哋個 web 層本身就係 nginx(ADR-0012),所以呢條洩漏路徑係實在而唔係理論 |

## 9. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-29 | Initial draft | ADR-0019 D8 解封;UAT ACS 已配置且 `active` | — |
| 2026-07-30 | **OQ-1 收窄**:`APP_BASE_URL` 未設時**唔入失敗佇列**,只 `logger.error` | 實作時發現 `OutboundFailure.kind` 只有 `'request.submit' \| 'request.mirror' \| 'servicenow.worknote'`(schema L408)—— 個佇列由設計上就唔收 email 類失敗,而 `FulfilmentModule` 亦冇 export `OutboundFailureService`。要「入佇列」就要擴 schema + 開新 kind,屬架構級改動(H1),而佢只服務一個「配置錯咗才走到」嘅分支 ⇒ 唔值 | Claude(待 Chris 覆核) |
| 2026-07-30 | **OQ-1 已知限制(唔改 code,只記錄)**:未設 `APP_BASE_URL` 時,audit 會寫一行 **`reason: 'issued'`** 而郵件其實一封都冇寄 | controller 係喺 `issue()` **之後**才檢查 baseUrl,所以 token 已建、audit 已寫。即係「為咩我個用戶收唔到信」呢個問題,audit 答唔到 —— 佢會答 `issued`,唯一線索係 api log 嗰句 `logger.error`。**有一個 3 行移位嘅修法**(檢查移到 `issue()` 前 → 唔建 token、唔寫 audit、唔燒 cooldown 窗口),但佢會令未設時完全冇 audit 記錄,**直接偏離 OQ-1 字面嘅「audit 記低」** ⇒ 按 §13「Spec wins,除非 explicitly raise + get approval」,此處只 raise + 記錄,唔單方面改。UAT 已於 2026-07-30 設好 `APP_BASE_URL`,實務上唔會走到呢個分支 | Claude(**待 Chris 裁決:修 or 接受**) |
| 2026-07-30 | ✅ **裁決 = 修。`APP_BASE_URL` 檢查移到 `issue()` 之前** ⇒ 未設時唔建 token、唔寫 audit、唔燒 cooldown,只留一行 `logger.error` | **Chris 拍板要修**(上一行嗰個 raise)。⇒ 本行**正式收窄 OQ-1**:原文「未設 → 照返 204 + **audit 記低** + 入失敗佇列」改為「未設 → 照返 204 + **只 log,唔寫 audit**」。理由:一行寫住 `reason:'issued'` 而信一封都冇寄嘅 audit,比冇 audit **更差** —— 佢會用「我哋寄咗」去答「為咩我個用戶收唔到信」,而 ADR-0009 令 audit trail 成為營運唯一應該信嘅地方。**配置錯屬 ops(log / 監控),唔屬業務 audit trail**;統一 204 不變(唔可以因為配置錯而變成一個枚舉訊號)。同步改:`.env.example` 原本寫「token 照發」已唔成立,改咗 · test 由 `'does not send…'` 改名 `'issues nothing at all…'` 並加 `expect(issue).not.toHaveBeenCalled()`。🔴 **fails-before 實證**:暫時把順序改返舊嘅 → **只有嗰一條紅**(`Received number of calls: 1 → "ops@example.com"`)、其餘 12 條照綠 ⇒ assertion 精準接住順序 regression 而唔誤傷。api 651 test 全綠 · lint `exit=0` | Chris |
