---
change_id: CH-005
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
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

### Blockers
- 無

### Effort
- Planned:3–4h;Actual:_(待填)_;Variance:_(待填)_

### Commits
| Hash | Subject |
|---|---|

---

## Closeout(填於 status=closed)

### Acceptance verification
_(待填)_

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Lessons
_(待填)_

---

**End of CH-005 progress**
