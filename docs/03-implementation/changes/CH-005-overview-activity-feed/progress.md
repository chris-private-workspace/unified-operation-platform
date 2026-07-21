---
change_id: CH-005
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
---

# CH-005 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — 2026-07-21

### Done

**I1 — `lib/activity.ts`(test 先行,實證 fails-before)**
- `activity.test.ts` 先寫 → 跑,紅(檔案未存在,transform error)→ 寫實作 → 10 test 綠
- `activitySummary` / `activityIcon` / `activityTone`;tone **delegate 去 `auditActionTone`**,唔另起色映射
- **查證驅動嘅兩個 edge case**(唔係估):
  - `auth.service.ts:294` 對唔存在嘅 email 寫 `targetId: 'unknown'`(刻意唔寫 email,令 PII 唔入 indexed 欄位)→ 無條件 `slice(-6)` 會顯示成 `nknown`,所以只截長度 > 12 嘅值
  - 同一路徑 `actorId: null` 但 `actorType` 留喺 `'user'` 預設 → 直接印 `user` 會讀落似人名 → 降級做 `Unknown user`

**I2 — `components/overview/activity-feed.tsx`**
- 跟 prototype 結構(24×24 chip + 描述 + ref + mono 時間);四態齊
- 空 feed 措辭已換走「once request event history is exposed by the API」(嗰句係 W12 寫低嘅,而家已經唔啱)

**I3 — `pages/overview.tsx`**
- `canSeeAdminNav(role)` gate;清走 orphan `Activity` import

**Verify(機械部分)**
- lint 綠 · build 綠(tsc --noEmit 過)· test **99 → 109**(+10,A10 要求 ≥103)
- **A4 零後端改動**:`git diff apps/api` = **0 行**
- **A5** 新檔案 grep 零 `#hex` / `rgb(` / `gradient`

### 計劃外改動(surgical 例外,值得記低)

`TONE_SOFT` 本來想由 `badge.tsx` export 畀 feed 嘅 icon chip 用(避免兩處配色真相),但 lint 即刻報 `react-refresh/only-export-components` warning —— **呢個 warning 係我引入嘅,lint 之前全綠**。所以改為抽 `lib/tones.ts`(型別 + 映射),`badge.tsx` 用 `export type { BadgeTone }` re-export → **既有 import 全部零改動**,warning 消失,亦真正做到單一配色真相。

Spec §2.2 原本淨係列咗三個新檔案,`lib/tones.ts` 係第四個 —— 但佢係實作手段唔係 scope 擴張(零新行為、零新 token),故唔開 §7 changelog,喺此記低。

### Decisions

**開工前兩個前置,Chris 2026-07-21 拍板:**

- **D1 = ADMIN-only,non-admin 隱藏整張 card**。零後端改動,`/admin/audit` 原封不動 —— ADR-0009 Decision 7 連帶義務 ① 唔可以為咗做 feed 而放寬。
- **D2 = 先做 `AuditLog` 版,措辭誠實反映內容**。

**D2 背後嘅查證(spec §1.1 詳述)**:prototype 示範嗰四條活動全部係 `RequestEvent` / `DriftAlert` 嘅嘢,`AuditLog` 記嘅係另一組(role 變更 / 登入 / catalog / import / drift **resolve**)。而 `RequestEvent` **只有 write、零 read surface**,index 亦係 `[requestId, createdAt]` 冇 global 時間軸 —— 貼 prototype 語意 = 新 endpoint + 新 index(schema change)= 一個細 phase,唔係一個 Change。

**衍生決定(AI 判斷,spec 已寫明 Chris 可推翻)**:
- non-admin 走「隱藏」而 `/audit` 頁走「restricted state」—— **刻意唔一致**:Overview 係日常主畫面(長期擺個「你冇權」= 噪音),`/audit` 係專程去嘅(需要解釋點解入唔到)。
- 顯示 **6** 條(prototype 示範 4 條,但嗰個 card 右邊有嘢頂住;Overview 呢張佔成行闊度)。無其他根據。

### Live 驗證(A1–A3、A6–A8)

**ADMIN**(dev user = chris.lai,audit 有 8 條真事件):
- 6 行真內容 · header link `View audit log` · chip **24×24 / radius 6px** · icon `stroke-width=2 fill=none` · 時間 `"Geist Mono"`
- light ↔ dark 四個值全 swap:cardBg `255,255,255`→`20,20,23` · chipBg `238,238,240`→`28,28,32` · chipFg `82,82,91`→`161,161,170` · time `154,154,164`→`108,108,118`

**OPCO_IT**(shell env `AUTH_DEV_USER_EMAIL=opco.it.rhk@rapo.com.hk` 重啟 backend,**唔改 `.env`**,驗完還原):
- 後端三重驗證:`/me` = OPCO_IT(RHK)· `/admin/audit` **403** · `/license/ledger` **200**(對照,證明身分有效而唔係全盤壞)
- 前端:`hasActivityCard: false`,而 Needs attention / Drift summary / On the roadmap 三張 card + 三個 KPI **全部照 render** —— 證明係 gate,唔係整頁爆

### ui-design 自檢(A11)—— DS-5 揪到真 violation

12 條之中 11 條 ✅ / 1 條 N/A(DS-12 logo),**DS-5 ❌**:`ref` 入面嘅 `targetId`(`xt579p`)係識別碼,但用緊 sans。`audit.tsx:210` 同 `overview.tsx:235` 既有 code 都係 mono —— 即係新畫面同專案慣例唔一致。

**即場修**:`ref` span 加 `font-mono text-[11.5px]`,live 重驗兩個 mono span(`AppUser · xt579p` / `4h`)都係 `"Geist Mono"`。

呢個係 skill 嘅實際價值 —— 純睇 code 好易走漏,因為 prototype 個 `ref`(`REQ-2041`)本身**冇** mono,係專案自己嘅 DS-5 規矩比 prototype 嚴。

### A12 驗證方式改動(誠實記低)

Spec A12 原本寫「空 feed → 誠實 EmptyState」屬 live 驗證。實際做唔到:trail 有 8 條真資料,而中途攔截 `/admin/audit` 回空之後,React Query **唔會**因為 `focus` / `visibilitychange` 事件重新 fetch,DOM 一直顯示原資料 —— 即係嗰次量度**證明唔到任何嘢**,唔可以當 pass。

**改為寫 `activity-feed.test.tsx`(5 條)**覆蓋 empty / rows / error 三個分支 + header link 有無。比 live hack 可靠,而且變成永久回歸保護。措辭部分另有機械證據:舊句子「once request event history is exposed by the API」全 codebase **0 處殘留**。

### Blockers
- 無

### Effort
- Planned:3–4h;Actual:~3.5h;Variance:0

### Commits
| Hash | Subject |
|---|---|
| `51c410e` | docs(changes): CH-005 kickoff — spec + checklist |
| `94a6e52` | feat(web): CH-005 — Overview activity feed 取代 placeholder EmptyState |
| _(closeout)_ | DS-5 mono 修正 + component test + 文件收尾 |

---

## Closeout

### Acceptance verification

**A1–A12 全部 ✅**,其中 A12 改用 component test(理由見 Day 1)。

三條自訂硬紅線全部守住:
1. **零後端改動** —— `git diff apps/api` = 0 行(機械證據,唔係聲稱)
2. **`/admin/audit` 冇放寬** —— OPCO_IT live 仍然 403
3. **措辭冇滑向營運口吻** —— wording guard test 鎖死,live DOM 讀到嘅係 `Signed in —` / `Password changed —`

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| 1 | 3–4 | ~3.5 | 0 |

### Lessons

**What worked**
- **開工前查證來源語意,而唔係照 BACKLOG 開工**。BACKLOG 寫「`GET /admin/audit` 可直接餵 activity feed」,睇落合理;但實際查 prototype 個 `ACT` 資料 + 後端寫入點先發現,prototype 示範嗰四條全部係 `RequestEvent`/`DriftAlert` 嘅嘢,同 `AuditLog` 唔同一回事。**如果照做落去,交出嚟嘅 feed 會靜靜地變咗另一樣嘢**。呢個發現直接令 Chris 多咗一個決定要拍板(D2)。
- **查後端 code 得出 edge case,而唔係估**:`targetId` 可以係字面 `'unknown'`、`actorType` 會留喺 `'user'` 預設 —— 兩個都係睇 `auth.service.ts` 睇返嚟,唔係靠估 schema。
- **wording guard test** 呢個手法第二次見效(W30 `lastSuccessText` 首用)。措辭類約束好易被後人「順手改靚啲」改走,寫成 test 就變咗硬約束。

**What didn't / unexpected friction**
- **DS-5 走漏**:純睇 code review 唔會揪到,因為 prototype 個 `ref` 本身冇 mono —— 係專案自己嘅 DS-5 比 prototype 嚴。**跑 skill 先揪到**。教訓:prototype 一致 ≠ design-system 一致,兩者都要對。
- **live 驗空狀態失敗**:React Query 唔會因為 `focus` 事件重新 fetch,攔截 response 之後 DOM 一直冇變。**當時個量度結果睇落「冇報錯」,好易誤當 pass** —— 實際上佢咩都證明唔到。轉寫 component test 係更好嘅結果。
- Chrome `Page.captureScreenshot` 三次 timeout,每次即刻重試就得。

**Carry-overs**
- 🟡 **`RequestEvent` 營運 feed** —— prototype 真正示範嘅嘢(assign / stage 推進)。要新 endpoint + 新 DTO + **global 時間 index**(`RequestEvent` 而家只有 `[requestId, createdAt]`)= schema change。已登入 BACKLOG 做獨立 candidate。今次個 UI 結構將來加多個來源可以直接沿用。
- 🟡 **non-admin 至今喺 Overview 底部乜都冇** —— 係 D1 嘅刻意結果,唔係 bug。如果日後想 non-admin 都有 feed,路線係上面嗰個 `RequestEvent` 來源(天然可 opco-scope),**唔係**放寬 `/admin/audit`。

---

**End of CH-005 progress**
