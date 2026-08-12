---
change_id: CH-024
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: 2026-08-12
---

# CH-024 — Checklist

> 由 `spec.md §3` acceptance criteria 衍生。每 item ≤ 1-2h。
> 唔可以 tick 嘅 item 喺 `progress.md` Day-N 寫原因(唔可以刪)。

## A — Disable New request 入口

- [ ] **A-1** 新 `apps/web/src/lib/features.ts`:單一 flag(預設 off)+ comment 寫明**點解係暫時**同**點還原**
- [ ] **A-2** `requests.tsx`:flag off → 掣唔 render(**唔係 disabled 掣** —— 一個撳唔到嘅掣讀落係壞咗)
- [ ] **A-3** `router.tsx`:flag off → `/requests/new` 重定向返 `/requests`
- [ ] **A-4** test:flag 兩個方向各一條(A1 / A2)。🔴 off 條 test 要 assert 掣**唔存在**,唔係 assert disabled

## B — Pagination 共用元件

- [ ] **B-1** 新 `apps/web/src/components/ui/pagination.tsx` —— 重建 handoff `navigation/Pagination.jsx`(range summary + `‹` + 最多 5 個 window + `›`),token-only,**唔照抄佢個 inline-style 版**(§7)
- [ ] **B-2** 加 `«` `»` first/last(Chris 2026-08-12 批,owner-approved 擴充)
- [ ] **B-3** window 邏輯抽做 **pure function**(`lib/pagination.ts`)—— component test 驗唔到 229 頁嘅邊界,pure function 驗得到
- [ ] **B-4** unit test:pageCount 1 / 3 / 5 / 6 / 229;current 喺頭 / 中 / 尾;**window 永遠 ≤ 5 且必定含 current**
- [ ] **B-5** wire `by-opco-view.tsx`(🔴 保留既有 `setEditingId(null)` 副作用)
- [ ] **B-6** wire `requests.tsx`(🔴 只換 pager 個 `<div>`,filter / table / row 一行唔郁 —— R4)
- [ ] **B-7** 同步 `docs/02-architecture/design-system.md` navigation 段:記低 `«` `»` 係 owner-approved 擴充 + 日期(🔴 R2 —— 唔寫嘅話下個 session 會當佢係 drift)

## C — 兩張 ServiceNow 單分開 + 建單記錄入 timeline

### C-前端

- [ ] **C-1** `request-detail.tsx` 頭部:由「一個號出兩次」改成兩塊,各自標明邊個系統開(`Onboarding request` / `Licence request`)
- [ ] **C-2** line item 卡顯示自己個 RITM 號
- [ ] **C-3** 冇 RITM 嘅 line **完全唔顯示**嗰個標籤(唔出 `—` 扮有單 · C2)
- [ ] **C-4** UI test:兩個號同時可見 + 冇 RITM 嗰條唔出標籤

### C-後端

- [ ] **C-5** `intake-adapter.service.ts` `raiseLicenceRequest`:submit 成功 + line 寫低之後,寫一條 `RequestEvent`(`type: NOTE`,**message 含平台個父 REQ 號**)
- [ ] **C-6** 🔴 寫喺 `$transaction` **之外**、`try/catch` 包住 → non-fatal(C4)
- [ ] **C-7** 🔴 位置喺既有 `if (lines.some(l => l.serviceNowSysId)) return` **之後** ⇒ 重複 push 天然唔會重複寫(C5)
- [ ] **C-8** test ×3:成功寫一條 / `requestEvent.create` reject 唔影響 intake / 重複 push 唔多一條
- [ ] **C-9** H4 檢查:message **唔可以**含 target UPN(只可以有 REQ 號 · 同既有 log 一致)

## D — Sync 檢查點文案 + assign 完狀態

- [ ] **D-1** 文案 ×2:`Account created` → `AD account created`;`Known to ServiceNow` → `Synced to ServiceNow`(第二步唔郁)
- [ ] **D-2** sync row 狀態:全部 active line `ASSIGNED` → `License assigned`;判斷抽做 pure function 落 `lib/requests.ts`
- [ ] **D-3** 🔴 `deriveStatus` 個 `Ready to assign` **一個字唔郁**(§2.2)
- [ ] **D-4** unit test:全 assigned / 部分 assigned / 一個都冇 / 全 cancelled 四個 case(D2 + D3)
- [ ] **D-5** 修既有 test `request-detail.sn-gate.test.tsx:213`(`getAllByText` 期望 2 → 改完剩 1)+ `sync-check.test.tsx:212` —— 🔴 **改成反映新行為,唔可以放寬 assert**(R3)

## E — Badge 改名

- [ ] **E-1** `lib/ledger.ts:51` `Headroom` → `Available`
- [ ] **E-2** 修 `ledger.test.ts:90,114,121` 三條(R3);KPI card 個 `Headroom` **確認冇改到**

## Verification

- [ ] **V-1** `npm test -w @uop/api`(T2)
- [ ] **V-2** `npm test -w @uop/web`(T1)
- [ ] **V-3** root lint 0 warning + api tsc 0 error(T3)
- [ ] **V-4** 🔴 **Falsification(T4)**:拆走 D-2 個 line-item 判斷 ⇒ 對應 test 必須**真紅**。同樣拆走 C-7 個早退 ⇒ C5 條 test 必須真紅
- [ ] **V-5** 跑 `ui-design` skill 自檢(DS-1..12)
- [ ] **V-6** 🔴 **light + dark 兩邊真 render 睇過**(H6)—— Requests / License Assets / Request detail 三頁
- [ ] **V-7** 人手驗 B1/B2 邊界(第 1 頁 · 中間 · 最後一頁)

## Cross-Cutting

- [ ] Commit 對應 `progress.md` Day-N(R2)
- [ ] Commit message follow Conventional Commits + scope
- [ ] (N/A 若無架構決定)ADR —— 本單**預期零 ADR**:無 schema / 無契約 / 無 vendor 改動
- [ ] `BACKLOG.md` 同步(R7)—— 特別係 §2.2 兩個 out-of-scope(Platform `In M365` 欄 · outbound 路 event)
- [ ] `progress.md` closeout summary
- [ ] `progress.md` + 本檔 frontmatter status → `done`

---

**Lifecycle reminder**:新加 item 必須先入 spec + §7 changelog,再加落呢度。
