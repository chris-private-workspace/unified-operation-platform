---
change_id: CH-025
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
---

# CH-025 — Progress

## Day 1 — 2026-08-12（spec approved → 實作 → H6 全部一日收）

### Done

Checklist **A-1..7 · B-1..3 · C-1..6 · V-1..6** 全部 tick。

**Code**
- `lib/requests.ts`:新 `COMPLETED_STEP` / `displayStepsFor` / `displayStepIndex`;`canAddLine` 加完成判斷;`activeLines` / `allLinesAssigned` 簽名放寬到 `Pick<…,'lineItems'>`(消走一個 `as` cast)
- `components/ui/stepper.tsx`:current 落喺**最後一個** step 時 render lucide `Check`
- `pages/request-detail.tsx`:改用 display steps;`Stepper current` 由 stage name 改傳 **index**
- `pages/catalog.tsx`:`Field` 加 optional `hint`;Category placeholder `e.g. Base, Add-on, Power Platform` → `e.g. Base` + hint
- `api/fulfilment/request.service.ts`:`addLineItem` 加完成 guard(**重算,唔讀 persisted `status`**)

**Test**:web `requests.gates.test.ts` 19 → **30**(+11);api `request.service.spec.ts` +3(新 `describe`)。既有 prisma mock 加 `requestLineItem.findMany` 預設 `[]`(令所有 CH-025 之前嘅 test 行為逐字不變)。

**數字**:api **979 → 982 / 73 suites** · web **326 → 337**(紅 6 條 = 原本嗰 6 條 pre-existing)· api lint 0 · 兩邊 tsc 0 · 本單掂到嘅 5 個 web 檔逐個 lint = 0。

### 🔴 spec 自己有兩條 acceptance 打對台（render 時先發現）

**A1**(assigned → 4 dots)同 **A3 原文**(未完成 → 「逐字不變 3 dots / `Step 2/3`」)**唔可能同時成立**。第 4 個 dot 要嘛由頭到尾都喺(未完成嗰陣分母就係 4),要嘛派完先突然出現 —— 後者係一條**會自己變長**嘅 timeline,讀落似 bug。

⇒ **揀咗「由頭到尾 4 個」**,`Step 2/4`。A3 改成守真正應該不變嗰啲(ring 位置 / 冇 tick / `Add line item` 仲喺),已入 spec §3 blockquote + §7 changelog,**同日向 Chris surface**。

📌 **形狀值得記**:呢個唔係「推論當事實」嗰族,係**兩條 acceptance 各自都合理,擺埋一齊先互斥**。寫 spec 嗰陣逐條讀都冇問題,要 render 出嚟先撞到。⇒ 涉及「加一個 step / 加一欄 / 加一個狀態」嘅 spec,要專門問一次:**未進入嗰個新狀態嘅嘢會唔會跟住變樣?**

### Decisions

- **display steps 同 stage machine 分家**(spec §1.2)—— `stepsFor` 餵 `nextStage`,加 `'Completed'` 落去會令已完成嘅 line 冒出一個送非法 enum 嘅 `Advance stage` 掣。呢個係整單嘢唯一一個「改顯示會整爛行為」嘅位,所以有專門一條 test 釘住
- **後端 guard 重算而唔讀 `request.status`** —— persisted 嗰個係 `recomputeRequestStatus` 維護嘅衍生值;gate 喺一個 cache 上就係兩者漂開嘅方法。用同一個 `aggregateRequestStatus`,結構上唔會唔一致
- **`Stepper current` 改傳 index** —— terminal marker 冇自己嘅 stage name,傳 stage 就對唔到位
- **放寬 `allLinesAssigned` 簽名而唔係 cast** —— 原本寫咗 `req as OnboardingRequest`,`lineItems` 本身係 optional ⇒ cast 純粹係遮住一個唔存在嘅問題

### B-3 查證結果（明文記低,唔係漏做）

CSV import / export 路 **冇同款逗號暗示**:`catalog-import.tsx:117` 只係列 Category 係可編輯欄之一,而 CSV 結構上一行一個值。⇒ **只改 dialog 一處。**

### 順帶見到（唔屬本單,冇改）

- **SKU Catalog 個 pager 仲係舊款**(13 頁全部列出)—— CH-024 只 wire 咗 Requests + License Assets(當時 Chris 只批呢兩個)。第三個 caller,值得一單過

### Verification

- **V-4 Falsification ×2,兩個都真跑真紅**:
  - 拆走後端 guard ⇒ `🔴 refuses, and writes NOTHING, once every line is assigned` **紅**
  - 把 `'Completed'` 塞返落 `SHORT_STEPS` ⇒ **3 條紅**,包括 `🔴 the stage machine is untouched: nothing follows ASSIGNED` ⇒ 證明嗰條 assert 真係守住 §1.2 個分家
- **V-6 light + dark 真 render**(四張截圖喺 scratchpad `ch025-screenshots/`):
  - 完成態:short `●─●─●─✓` **Step 4/4** · procurement **Step 7/7** · Line items header **冇 `Add line item` 掣**
  - 未完成態:**`Step 2/4`**、第 2 個 dot 帶 ring、**冇 tick**、`Add line item` **仲喺**
  - SKU Catalog dialog:`e.g. Base` + `One category per SKU — groups the Platform view`

### Blockers

- 無

### Effort

- Planned:2–3h;Actual:≈ 2.5h

### Commits

| Hash | Subject |
|---|---|
| _(下一個)_ | `feat(web,fulfilment): CH-025 A-C` |

---

## Closeout

### Acceptance verification

**spec §3 全部 ✅**,其中 **A3 按 §7 changelog 更正後**達成。零 partial、零 failed。

### Lessons

**work**
- 分家設計 + 一條專門 assert(`nextStage(ASSIGNED) === null`)—— falsification 一拆就三條紅,證明佢唔係裝飾
- 後端 guard 用重算唔用 persisted 值 —— 多一次 query 換走一整類 drift

**didn't**
- 🔴 **spec 兩條 acceptance 互斥而寫嗰陣冇察覺** —— 見上。呢個係本單最值得帶走嘅嘢

**carry-over**
- SKU Catalog pager(第三個 caller,未 wire)
- `LINT-web`(BACKLOG,今次冇再郁)

---

**End of CH-025 progress**
