---
change_id: CH-005
spec_ref: ./spec.md
status: done            # in-progress | done
last_updated: 2026-07-21
---

# CH-005 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## Implementation

### I1 — `lib/activity.ts` 純函數(先寫 test,措辭 guard 係硬紅線)

- [x] `lib/activity.test.ts` 先行 —— **實證 fails-before**(檔案未存在 → transform error)
- [x] `activitySummary(entry)` → `{ text, ref }`;措辭忠於 audit 語意
- [x] `activityIcon(action)` → lucide stroke icon
- [x] tone **重用** `auditActionTone` —— 唔另起色映射
- [x] 未知 action → fallback raw 字串,唔 crash 唔亂猜(R5)

### I2 — `components/overview/activity-feed.tsx`

- [x] 跟 prototype 結構:24×24 chip(radius **6px = `--radius-sm`**)+ 描述 + ref + mono 時間
- [x] 四態齊:loading / error / empty / 正常
- [x] 空 feed 措辭已換走「once request event history is exposed by the API」—— **全 codebase 0 處殘留**
- [x] 上限 6 條
- [x] header `View audit log →` → `/audit`

### I3 — `pages/overview.tsx` gate

- [x] `canSeeAdminNav(role)` gate;非 ADMIN **整張 card 唔出**
- [x] 清走 orphan `Activity` import
- [x] role `undefined` → 當作冇權(`canSeeAdminNav` 既定 fail-safe 語意,`roles.test.ts` 已覆蓋)

## Verification

- [x] **A1** ADMIN live:**6 行**真內容,每行有描述 + 相對時間
- [x] **A2** `View audit log →` header link 存在(live DOM 讀到)
- [x] **A3** **OPCO_IT live DOM**:`hasActivityCard: false`;**同一 session** Needs attention / Drift summary / On the roadmap + 三個 KPI 照 render。後端同步三重驗證:`/me` = OPCO_IT(RHK)· `/admin/audit` **403** · `/license/ledger` **200**
- [x] **A4** **零後端改動**:`git diff apps/api` = **0 行**
- [x] **A5** 新檔案 grep 零 `#hex` / `rgb(` / `gradient`
- [x] **A6** 時間欄實測 `font-family` = `"Geist Mono"`
- [x] **A7** light + dark 實測四個值全 swap(cardBg 255→20 · chipBg 238→28 · chipFg 82→161 · time 154→108)
- [x] **A8** icon 實測 `stroke-width=2` / `fill=none`;feed 零 primary
- [x] **A9** 措辭 guard test 綠
- [x] **A10** build · lint 綠;test **99 → 114**(+15,要求 ≥103)
- [x] **A11** `ui-design` 12 條逐條記錄 —— **DS-5 揪到真 violation 並即場修**(見 progress)
- [x] **A12** 空 feed EmptyState 措辭已更新 —— ⚠️ **改用 component test 驗,唔係 live**(理由見 progress「A12 驗證方式改動」)

## Cross-Cutting

- [x] Each commit references `progress.md` Day-N entry(R2)
- [x] Commit message 標對應 component tag
- [x] (if architectural)ADR —— **N/A**:零 schema / 零 dep / 零後端 / 零新 token
- [x] Open-question status sync(R4)—— D1 / D2 拍板已入 spec §1 + progress
- [x] Pending changes synced to `BACKLOG.md`(R7)—— `FE-activity` → ✅ 完成;**`RequestEvent` 營運 feed 登做新 candidate**
- [x] `progress.md` closeout summary written
- [x] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
