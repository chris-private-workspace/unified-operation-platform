---
change_id: CH-024
spec_ref: ./spec.md
status: done            # in-progress | done
last_updated: 2026-08-12
---

# CH-024 — Checklist

> 由 `spec.md §3` acceptance criteria 衍生。每 item ≤ 1-2h。
> 唔可以 tick 嘅 item 喺 `progress.md` Day-N 寫原因(唔可以刪)。

## A — Disable New request 入口

- [x] **A-1** 新 `apps/web/src/lib/features.ts`:單一 flag(預設 off)+ comment 寫明**點解係暫時**同**點還原**
- [x] **A-2** `requests.tsx`:flag off → 掣唔 render(**唔係 disabled 掣** —— 一個撳唔到嘅掣讀落係壞咗)
- [x] **A-3** `router.tsx`:flag off → `/requests/new` 重定向返 `/requests`
- [x] **A-4** test:flag 兩個方向各一條(A1 / A2)。🔴 off 條 test 要 assert 掣**唔存在**,唔係 assert disabled —— `requests.new-request-flag.test.tsx` 4 條(掣 ×2 + route ×2)

## B — Pagination 共用元件

- [x] **B-1** 新 `apps/web/src/components/ui/pagination.tsx` —— 重建 handoff `navigation/Pagination.jsx`(range summary + `‹` + 最多 5 個 window + `›`),token-only,**唔照抄佢個 inline-style 版**(§7)
- [x] **B-2** 加 `«` `»` first/last(Chris 2026-08-12 批,owner-approved 擴充)
- [x] **B-3** window 邏輯抽做 **pure function**(`lib/pagination.ts`)—— component test 驗唔到 229 頁嘅邊界,pure function 驗得到
- [x] **B-4** unit test:pageCount 1 / 3 / 5 / 6 / 229;current 喺頭 / 中 / 尾;**window 永遠 ≤ 5 且必定含 current**(最後嗰條係遍歷全部 229 頁,唔係揀點)
- [x] **B-5** wire `by-opco-view.tsx`(🔴 保留既有 `setEditingId(null)` 副作用)
- [x] **B-6** wire `requests.tsx`(🔴 只換 pager 個 `<div>`,filter / table / row 一行唔郁 —— R4)
- [x] **B-7** 同步 `docs/02-architecture/design-system.md` navigation 段:記低 `«` `»` 係 owner-approved 擴充 + 日期(🔴 R2 —— 唔寫嘅話下個 session 會當佢係 drift)

## C — 兩張 ServiceNow 單分開 + 建單記錄入 timeline

### C-前端

- [x] **C-1** `request-detail.tsx` 頭部:由「一個號出兩次」改成兩塊,各自標明邊個系統開(`Onboarding request` / `Licence request`)。順帶:meta row 嗰個 `Request` 由 `serviceNowNumber ?? #id` 改成**永遠**平台 ref `#id`,消滅第二次重複
- [x] **C-2** line item 卡顯示自己個 RITM 號
- [x] **C-3** 冇 RITM 嘅 line **完全唔顯示**嗰個標籤(唔出 `—` 扮有單 · C2)
- [x] **C-4** UI test:`request-detail.tickets.test.tsx` 5 條 + `licenceRequestNumbers` pure test 5 條

### C-後端

- [x] **C-5** `intake-adapter.service.ts` `raiseLicenceRequest`:submit 成功 + line 寫低之後,寫一條 `RequestEvent`(`type: NOTE`,**message 含平台個父 REQ 號**)
- [x] **C-6** 🔴 寫喺 `$transaction` **之外**、`try/catch` 包住 → non-fatal(C4)
- [x] **C-7** 🔴 位置喺既有 `if (lines.some(l => l.serviceNowSysId)) return` **之後** ⇒ 重複 push 天然唔會重複寫(C5)
- [x] **C-8** test ×**5**(多過 spec 講嘅 3):成功寫一條 / 唔含 UPN / `requestEvent.create` reject 唔影響 intake 且 RITM 照寫低 / 重複 push 唔多一條 / SN 拒絕時零 event
- [x] **C-9** H4 檢查:message **唔可以**含 target UPN(只可以有 REQ 號 · 同既有 log 一致)—— 有 test 釘住

## D — Sync 檢查點文案 + assign 完狀態

- [x] **D-1** 文案 ×2:`Account created` → `AD account created`;`Known to ServiceNow` → `Synced to ServiceNow`(第二步唔郁)
- [x] **D-2** sync row 狀態:全部 active line `ASSIGNED` → `License assigned`;判斷抽做 pure function 落 `lib/requests.ts`(`allLinesAssigned`)
- [x] **D-3** 🔴 `deriveStatus` 個 `Ready to assign` **一個字唔郁**(§2.2)—— 反而令 `deriveStatus` **改用同一個** `allLinesAssigned`,兩處由同一個判斷出發
- [x] **D-4** unit test **6 條**:全 assigned / 一 assigned 一 ready / 零 assigned / assigned+cancelled / 全 cancelled / 零 line
- [x] **D-5** 修既有 test —— 🔴 **實跑之後同 spec 原文唔同**:紅嘅係 `sn-gate.test.tsx:147,149`(文案),`:213` 同 `sync-check.test.tsx:212` **冇紅**(嗰個 fixture 係 `READY` line)。已更正 spec §4 R3 + §7 changelog

- [x] **D-6**(spec 外,同 D-2 同一改動)UI test ×2:全 assigned → 見 `License assigned` 兼 `Ready to assign` **消失**;一條未派 → 反過嚟。🔴 兩條 fixture 都**開晒兩道閘** —— 舊 code 就係只睇閘,關閘嘅 fixture 會連壞版本都綠

## E — Badge 改名

- [x] **E-1** `lib/ledger.ts:51` `Headroom` → `Available`
- [x] **E-2** 修 `ledger.test.ts` 三條(R3);KPI card 個 `Headroom` **確認冇改到**

## Verification

- [x] **V-1** `npm test -w @uop/api`(T2)—— **979 passed / 73 suites**(974 → +5)
- [x] **V-2** `npm test -w @uop/web`(T1)—— **326 passed**(293 → +33);紅 6 條 = **就係嗰 6 條 pre-existing**(`reset-password` 1 + `local-profile` 5),零新增
- [x] **V-3** root lint(= api)**exit 0** · web tsc **exit 0**。🔴 **順帶揭到**:root `npm run lint` **只跑 api**,web lint 從來未入過 gate ⇒ 佢有 **15 條 pre-existing prettier 錯**(`allocation-reset.tsx` / `allocation-reset.test.tsx` / `sync-check.test.tsx`)。**冇順手修**(§1.3),只修自己嗰 3 條,並逐檔 lint 過本單掂到嘅 15 個檔 = exit 0。已入 BACKLOG
- [x] **V-4** 🔴 **Falsification(T4)—— 兩個都真跑,兩個都真紅**:
  - 拆走 D-2 個 `allLinesAssigned` 分支 ⇒ `says License assigned once every line is assigned` **紅**(1 failed / 9 passed)
  - 拆走 C-7 個早退 ⇒ `n8n re-pushing does not add a second entry` **紅** ⇒ 嗰條 `not.toHaveBeenCalled()` **唔係 vacuous**(§9 記低嘅陷阱)
- [x] **V-5** 跑 `ui-design` skill 自檢(DS-1..12)—— 見 `progress.md` Day 1
- [x] **V-6** 🔴 **light + dark 兩邊真 render 睇過**(H6,2026-08-12,Chris 批咗 stop `ai-doc-extraction-db`)—— 六張截圖:Requests light+dark · License Assets light+dark · Request detail light+dark。**A-3 route redirect 亦 live 驗**(打 `/requests/new` → URL 真係變 `/requests`)
- [x] **V-7** 人手驗 B1/B2 邊界 —— 第 1 頁 `«` `‹` **disabled** + window `1-5`;最後一頁(7)window 移去 `3-7` + `›` `»` **disabled** + summary **`61–64 of 64`**(短尾頁計啱 = `pageRangeLabel` 用實際 rows 唔重算嘅理由)。active 掣 `font-family` 實測 = **`Geist Mono`**(DS-5)

> 🔴 **本機 ledger 係空,pager 驗唔到** —— Chris 截圖嗰 2283 行係另一個環境。造咗 fixture(64 ledger rows = 7 頁 · 一張帶兩個單號嘅 request · 一張全 `ASSIGNED` 嘅 request),**驗完全部清返**(`ledger_rows` 1 / `requests` 2 / leftover **0**,同造之前一樣)。SQL 三個檔留喺 scratchpad。

## Cross-Cutting

- [x] Commit 對應 `progress.md` Day-N(R2)
- [x] Commit message follow Conventional Commits + scope
- [x] ADR —— **零 ADR,如預期**:無 schema / 無 migration / 無契約 / 無 vendor 改動
- [x] `BACKLOG.md` 同步(R7)—— `CH-024` + `ASSETS-IN-M365` 入 A 區;`LINT-web` 更新(⚠️ **第一版開咗條重複 `TD-3`,自己捉返刪咗**)
- [x] `progress.md` closeout summary
- [x] `progress.md` + 本檔 frontmatter status → `done`

---

**Lifecycle reminder**:新加 item 必須先入 spec + §7 changelog,再加落呢度。
