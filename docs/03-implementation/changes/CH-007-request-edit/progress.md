# CH-007 — Progress Log

> Change:Request 建單後可編輯(header inline edit + line item 加減)
> Spec:`spec.md`(v1.0,approved 2026-07-22)· Checklist:`checklist.md`

---

## Day 1 — 2026-07-22

### Kickoff

用戶要求:request 建單後可改 —— header 起碼可改(除同步鍵),line item 發送 SN 前可加減、發送後鎖。

**七項拍板**(D1–D7,見 spec §2)。核心三個問 Chris,全揀保守版:`targetUpn` sync-後鎖 · `opcoId` 鎖 · 加行只限 intake 單。

### 開工前查證(兩個關鍵)

**① 「已發送 ServiceNow」對兩種 origin 意思相反**(spec §1.1)。`platform-created` 建單一刻連每行 RITM 一齊上 SN → **冇「未發送前」窗口**;`onboarding-intake` 嘅行係平台自拆、從未上 SN。故鎖用**每行 `serviceNowSysId`** 做信號,精準區分。

**② detail 頁連「加」都冇。** `POST :id/line-items`(addLineItem)endpoint 存在但**前端零 caller**(grep 證);line item 目前只喺建單一刻決定。故本 Change = 三件全新:header inline edit + 接返 add + 全新 delete。

### Branch

由 `feat/ch-006-overview-operational-activity` 出,stack 喺 PR #17 之後(保持一致;CH-007 本身零 migration)。

---

_(實作進度陸續補)_
