---
change_id: CH-011
spec_ref: ./spec.md
status: done             # blocked | ready | in-progress | done
last_updated: 2026-07-29
---

# CH-011 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。
> ✅ **收官(2026-07-29)** —— A1–A12 **12/12 全過**,零延後項。
> Gate 0 五項全清 → 實作 → A11 live 真寄且**收件人確認收到**。

## Gate 0 — 開工前必須有嘅答案(✅ 5/5 全過)

- [x] **OQ-1** 🔴 ACS sender address → ✅ **`UnifiedOperationsPortal@rci-t.com`**(Chris 2026-07-29)
      ⚠️ **custom domain**(`rci-t.com`)唔係 Azure-managed ⇒ 靠 DNS 側 SPF/DKIM。**因為 D5 唔畀探,寄唔寄得出要到 A11 第一次真寄先知**(揀「唔畀探」嗰陣已接受嘅代價)
      ⚠️ 連帶:custom domain 嘅失敗模式係「ACS 收貨但唔送達」,平台側**睇落完全成功** ⇒ **A11 必須以收件人真係收到為準**
- [x] **OQ-2** 收件人解析收窄成「caller 傳地址」→ ✅ **Approve**(Chris 2026-07-29)⇒ ADR-0019 **D3 成立**,唔建推導層
- [x] **OQ-3** 零 caller 嘅 live 證明用一次性 ops script → ✅ **接受**(Chris 2026-07-29)⇒「拆兩份」維持
- [x] **ADR-0019** `Proposed → Accepted`(2026-07-29;三條 OQ 全答 + 三項前置拍板)
- [x] **Chris approve 本 spec**(`proposed → approved`,2026-07-29,spec 內容零改動)

## Implementation

### Dependency + 邊界(D1 / D2)
- [x] `@azure/communication-email` **只**加入 `apps/api/package.json`(`^1.1.0`,+5 packages)
- [x] 確認 `apps/web` + root 兩個 `package.json` **diff = 0**(A1,`git diff --stat` 實證)
- [x] `AcsEmailService` 落 `apps/api/src/integration/email/`,vendor SDK 唔出呢個資料夾
- [x] Boundary test 靜態鎖住,**有正面半邊**(A2)
      ⚠️ 條 test **捉到自己第一版寫錯** —— 查 class 名令 `notification-dispatch` 個註解變咗違規;改查 **import path**(W39 喺 license seam 撞過同一個 false positive,同一個修法)

### 通知底座(D3)
- [x] `NotificationService.send({ to, template, params })` 介面(abstract class)
- [x] Template 機制 = typed code,出 subject + **text**(唔可選)+ html
- [x] 落 **`connectivity-check`** 一個 template;🔴 **零 password-reset template**(A8)
- [x] 失敗入 `OutboundFailure` —— **沿用 ADR-0011**,新 kind `notification.send`
- [x] retry 真係重寄(A7);➕ **`REPLAYABLE_TEMPLATES` 正面清單**擋住單次內容嘅 template
- [x] 🔴 **payload 刻意唔存 `params`** —— 4c-C 會經 params 傳單次 reset token,存低就把送信失敗升級成憑證洩漏

### Connector + config(D4)
- [x] `connectors.ts` 加 key `email` + label
- [x] `CONNECTOR_CONFIG.email`:`acsSenderAddress`(editable)+ `ACS_CONNECTION_STRING`(secret)
- [x] 🔴 **H1 additive migration** `20260729071105_acs_sender_address` —— SQL 得一行 `ADD COLUMN "acsSenderAddress" TEXT`
- [x] 🔴 **絕不 `getOrThrow`** —— state 永遠唔會係 `required`(A3)
- [x] `PROBEABLE.email` 寫理由字串(唔畀探,D5)
- [x] ➕ **計劃外**:`EditableField` 加 `kind: 'email'` + 寫入時格式驗證。**唔係裝飾** —— D5 拆走咗 probe,寫入驗證係操作員喺真寄失敗之前**唯一**嘅回饋

### H4 邊界(D6 —— 三條都要 test)
- [x] connection string 唔入 DB / log / API 回應(A4)
- [x] 收件人 email 唔原封 log,用 `scrubPii()`;**test spy logger**(A5)
- [x] ACS 回應 / error body scrub 之後先 log(A6)

## Verification

- [x] **A1** `git diff --stat` 實證:只有 `apps/api/package.json` +1 行;root + `apps/web` **diff 0**(lockfile 郁 = monorepo 單一 lockfile 嘅預期行為)
- [x] **A2** boundary test 正反兩邊都守到(4 條:SDK 只喺 email/ · transport 真係 import 佢 · 只有 module 名 concrete class · 真有 consumer 依賴 abstraction)
- [x] **A3** connector state 三態 + live 驗:`GET /admin/integrations` 真返 `state: "inactive"` · `probeable: false` + 理由 · secret `configured: false`
- [x] **A4** 🔴 **實證咗,唔係假設** —— 加 connector 之後未補 fixture 就跑,既有守門**即刻紅**:`- "ACS_CONNECTION_STRING"` / `- "ACS_SENDER_ADDRESS"` / `- "email"`(2 failed / 18 passed)→ 補完 20/20。W39+W40 把手抄清單改成由 inventory derive,今日兌現
- [x] **A5** 🔴 spy logger(唔係 assert exception):成功路徑唔 log 收件人 · vendor 引用返地址嗰陣 log 出 `[redacted-email]` · 兩條都有正面半邊防止「乜都冇 log」都算過
- [x] **A6** ACS error body 經 `scrubPii()` 先入 log **同** exception —— 兩個面都驗(BUG-004 就係一個乾淨一個漏)
- [x] **A7** 失敗入佇列(dispatcher 3 條)+ retry 真重寄(retry 4 條,含「still not configured 唔算修好」)
- [x] **A8** template 出 subject/text/html 三樣;**零 password-reset template**
- [x] **A9** 🔴 **live 實證**:`.env` 一個 `ACS_*` 都冇 → app 真 boot,`:3100/docs/api` · `:5173/` · `:5173/api/me` 三個 **200**,pid 39888/45596 係新嘅;626 test 全綠
- [x] **A10** api **599 → 626**(58 suites)· lint 零 output · build OK
- [x] **A11** 🔴 **live 真寄一封,而且真係收到** —— sender `UnifiedOperationsPortal@rci-t.com` → `chris.lai@rapo.com.hk`,ACS operation `1b693bde-2daf-4069-bdc8-2ce7b4033748`,stamp `2026-07-29T07:49:57.531Z`;**Chris 確認收到**(判準達成,唔係靠 script 印 `sent`)
      ⚠️ **第一次係失敗嘅**:`self-signed certificate in certificate chain` = 公司 proxy MITM(同 ServiceNow 當日一樣),`NODE_OPTIONS=--use-system-ca` 解決。**環境問題唔係 code 問題**,已寫入 script header
      ➕ **意外收穫**:嗰次失敗把 **A7 完整行咗一次真嘅** —— throw → dispatcher 唔 rethrow → 入 `OutboundFailure`,而 DB 真 row 嘅 `payload` **只有 `to` + `template`,冇 `params`**(安全決定喺真跑入面成立)
      ✅ 測試產物已清:`DELETE 1` → `notification.send` 剩 **0**、整個佇列 **0**(回到測試前 baseline)
- [x] **A12** fails-before 兩條硬紅線:**A4** 天然示範(見上)· **A5/A6** 拆走 `scrubPii` 一行 → **2 failed / 7 passed**,而成功路徑嗰條照綠(啱,佢唔經 scrub)→ 即時還原

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N entry(R2)
- [ ] Commit message 標 component tag(`feat(integration):`,標 CH-011)
- [ ] **ADR-0019 已 Accepted** 先開工;若實作中發現要改 ADR 已宣告嘅嘢 → **STOP**,回頭問 owner
- [ ] `BACKLOG.md` 同步(R7)
- [ ] `RISK_REGISTER.md` 檢視(R4 收件人 PII 屬既有 **R5** 範圍,唔開新條 —— 除非實作揭出新面向)
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`
- [ ] 🚧 **下游**:AUTH-4c-C phase(設計已定 ADR-0019 D8)—— **唔喺本 change**,但 R2 嘅緩解就係佢緊接住做

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
