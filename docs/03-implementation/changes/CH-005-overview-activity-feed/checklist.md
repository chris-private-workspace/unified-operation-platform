---
change_id: CH-005
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: 2026-07-21
---

# CH-005 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## Implementation

### I1 — `lib/activity.ts` 純函數(先寫 test,措辭 guard 係硬紅線)

- [ ] `lib/activity.test.ts` 先行 —— 措辭 guard(A9)+ 14 action 覆蓋 + 未知 action fallback
- [ ] `activitySummary(entry)` → `{ text, ref }`;措辭忠於 audit 語意,**唔用營運口吻**
- [ ] `activityIcon(action)` → lucide icon;只用 stroke set
- [ ] tone **重用** `auditActionTone`(`lib/audit.ts:40`)—— 唔另起色映射(兩處真相 = drift 源頭)
- [ ] 未知 action → fallback raw 字串,唔 crash 唔亂猜(R5)

### I2 — `components/overview/activity-feed.tsx`

- [ ] 跟 prototype 結構:24×24 圓角 6 icon 方塊(soft 底 + solid 前景)+ 描述 12.5px + ref fg-subtle + 時間 11px **mono** nowrap
- [ ] 四態齊:loading / error / empty / 正常
- [ ] 空 feed → 誠實 EmptyState,**唔再提「once request event history is exposed」**(A12,嗰句已經唔啱)
- [ ] 上限 6 條
- [ ] header `View audit log →` HeaderLink → `/audit`(A2,既有 pattern)

### I3 — `pages/overview.tsx` gate

- [ ] `useCurrentUser().role` + `canSeeAdminNav(role)`;ADMIN 先 render,否則**整張 card 唔出**
- [ ] 清走自己造成嘅 orphan import(§1.3)—— `Activity`,`EmptyState` 視乎其他用途再定
- [ ] role `undefined`(/me 未載入)→ 當作冇權(fail-safe,跟 `roles.ts` 既定語意)

## Verification

- [ ] **A1** ADMIN live:feed ≤ 6 行,每行有描述 + 相對時間
- [ ] **A2** `View audit log →` 去到 `/audit`
- [ ] **A3** **OPCO_IT live DOM**:`hasActivityCard: false`,**同一 session** KPI / Needs attention 照 render(證明係 gate 唔係整頁爆)
- [ ] **A4** **零後端改動**:`git diff --stat apps/api` 空
- [ ] **A5** 新檔案 grep 零 `#hex` / `rgb(` / `gradient`
- [ ] **A6** 時間欄實測 `font-family` 含 `Geist Mono`
- [ ] **A7** light + dark 都驗;dark 用**無 transition 元素**量度(避 W30 隱藏-tab 假陰性坑)
- [ ] **A8** icon 全 lucide stroke;feed 零 primary
- [ ] **A9** 措辭 guard test 綠
- [ ] **A10** build · lint 綠;test **99 → ≥103**
- [ ] **A11** `ui-design` skill 12 條逐條記錄
- [ ] **A12** 空 feed EmptyState 措辭已更新

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N entry(R2)
- [ ] Commit message 標對應 component tag
- [ ] (if architectural)ADR written —— **預期 N/A**:零 schema / 零 dep / 零後端
- [ ] Open-question status sync(R4)—— D1 / D2 拍板已入 spec §1
- [ ] Pending changes synced to `BACKLOG.md`(R7)—— `FE-activity` → ✅ 完成;**`RequestEvent` 營運 feed 登做新 candidate**
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
