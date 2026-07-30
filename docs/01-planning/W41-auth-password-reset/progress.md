---
phase: W41-auth-password-reset
plan_ref: ./plan.md
checklist_ref: ./checklist.md
last_updated: 2026-07-30
---

# W41 — Progress

## Day 1 — 2026-07-29 · kickoff

**背景**:AUTH-4c-C 由 2026-07-13(ADR-0006)起 deferred,阻塞係「平台冇發郵件能力」。
CH-011 / ADR-0019 落咗 ACS transport,而同日 UAT 亦已把 Graph / ServiceNow / ACS
三個整合由 placeholder 換成真憑證(email connector `active`)⇒ 前置全清。

**分類判斷**:AUTH-4c-A = W20、4c-B = W21,都係 phase;本項有 schema + 前後端 + 多日,
⇒ 同樣做 **phase(W41)**,唔做 change。**H1 唔另開 ADR** —— `PasswordResetToken`
已由 ADR-0019 **D8 #1** 授權。

**Grounding**(落 plan 前實讀,唔靠記憶):

| 讀咗 | 攞到嘅嘢 |
|---|---|
| `ADR-0019` D7 / D8 | 九條設計決定 + 明確 out-of-scope |
| `refresh-token.service.ts` | token 形狀 SSOT — `randomBytes(32).hex` + `createHash('sha256')`,只存 hash |
| `schema.prisma` `RefreshToken` / `AppUser` | 照抄形狀;`AppUser` 已有 `lockedUntil` / `failedLoginCount` / `mustChangePassword` |
| `auth.service.ts` `changePassword` | 既有改密碼路徑 + audit 形狀(`actorId === targetId`) |
| `notification-dispatch.service.ts` | 契約:**永不 throw** ⇒ fire-and-forget 安全(OQ-2 嘅依據) |
| `templates.ts` | CH-011 已預留接口,並**明文寫低** password-reset 唔可以入 `REPLAYABLE_TEMPLATES` |
| `auth.controller.ts` / `router.tsx` | 現有 route 形狀 |

**四條 OQ 全部由 Chris 拍板,全部跟建議**(plan §8):新 env + 未設照 204 ·
fire-and-forget · 5 分鐘 cooldown · fragment token。

其中 OQ-1 特別值得記:選 `config.get` 而唔係 `getOrThrow`,除咗 ADR-0019 D4 之外,
仲有一個當日嘅實證理由 —— **UAT 而家就係未設 `APP_BASE_URL`**,`getOrThrow` 會即刻
crash loop,而 BUG-008 啱啱先因為同類原因(容器起唔到身)死過一次。

**下一步**:F1 schema + additive migration。

## Day 2 — 2026-07-30 · F1–F7 落地(跨 7/29 夜)+ F8a/F8b live

**交付**:schema + additive migration(只 `CREATE TABLE` + 2 index + 1 cascade FK,零
`ALTER TABLE` 掂既有表)· `password-reset.service.ts`(+17 test)· 兩個 `@Public` 204 endpoint ·
`password-reset` template(**冇**入 `REPLAYABLE_TEMPLATES`)· 新 audit action · 前端兩頁 + Login link。
**api 626 → 651 test / 59 suites · web 188 → 196 test / 24 files · 兩邊 lint `exit=0` · `vite build` ✓**

**F8a — UAT 環境**:設 `APP_BASE_URL` 指向 **web 嘅 public FQDN**(api 係 `.internal.` ingress,
而條連結係畀人喺瀏覽器開)。設之前先驗過個 URL 真 200 —— 唔可以送一條死 URL 落郵件。
🔴 設前設後各 dump 一次 `env[].{name,secretRef}` 逐行對比:**18 → 19,7 個 secretRef 一個唔少** ——
`--set-env-vars` 有弄壞 secretref 綁定嘅已知風險,而嗰啲 secret 值係 Chris 親手設、我聲明過唔經手,
所以必須對比而唔係信 exit code。新 revision `--0000009` 唔信 `runningState` flag(BUG-008 教訓),
改用真 probe:`POST /api/auth/login` → **401 真 JSON**。

**F8b — 本機真跑**:四種情況全部 `204 | bodyLen=0`(枚舉抵抗喺真 HTTP 成立,唔止喺 mock),
但真 DB **只多 1 行 token** ⇒ SSO / 唔存在 / cooldown 三種係真零寫入。`hash_len = 64`(raw token
唔喺 DB)· `ttl_remaining = 00:27:54` ⇒ TTL 30 分鐘真值。audit 三種 reason 分明,而
**`metadata ? 'emailAttempted'` 返 `t`** —— 呢個正係 checklist 標「G8 fails-before 必須實證」嗰條,
而家係真 `AuditLog` 行出嘅。順帶:**api 起得起就證明咗 `AuthModule → FulfilmentModule` 嘅 DI graph
真 work**(循環依賴會令 Nest 啟動直接死),而 test 用 mock 係證唔到嘅。

**兩件事誠實記低**:

1. **light + dark 真 render 仍未勾** —— `list_connected_browsers` 回 `[]`(同 4 日前 W35 G3
   一樣)· Playwright MCP 唔喺本 session · repo 冇 playwright dep ⇒ **已交 Chris 目視**。
   我只做到靜態證明(`index.css:4` 直接 `@import` handoff,而我用到嘅 token 喺 light/dark
   兩邊都有真值 ⇒ 排除「token 唔存在 → 透明繼承」),但佢證唔到對比度同 layout,所以項目唔勾。
2. 🔴 **F8 途中發現**:`APP_BASE_URL` 未設時,audit 會寫一行 **`reason: 'issued'`** 而郵件一封
   都冇寄(controller 喺 `issue()` **之後**才檢查 baseUrl)。即係「為咩我個用戶收唔到信」呢個問題,
   audit 答唔到 —— 佢會答 `issued`。一行會講大話嘅 audit 同 ADR-0009 個精神衝突,而我**刻意冇
   單方面修**:個 3 行移位修法會令未設時完全冇 audit,直接偏離 OQ-1 字面嘅「audit 記低」(Chris
   親自批准)⇒ 按 §13 只 raise + 入 plan §9 changelog,**待 Chris 裁決**。

**下一步**:commit + PR → build + deploy UAT → F8c 端到端真寄真收(**以真係收到為準**)。
