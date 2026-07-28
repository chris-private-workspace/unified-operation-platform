---
phase: W39-n8n-license-provider
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: active         # active | closed
last_updated: 2026-07-28
---

# Phase W39 — Progress

---

## Day 0 — 2026-07-28:Kickoff(**plan = draft,🔴 未 approve**)

### 0. 掃號(PROCESS §2.1)

`git fetch --all --prune` 之後掃晒**所有** local + remote ref 嘅 `docs/01-planning/` tree:最大 = **W38** ⇒ **W39 可用**。

### 1. 實讀 workflow JSON —— 揪到四處同 ADR-0017 D2 轉述對唔上

`docs/06-reference/03-n8n-workflow/` 係 gitignore(SEC-001)但本機讀得到。三條 workflow 全部 `enabled`。

| # | ADR D2 講 | 真係 | 影響 |
|---|---|---|---|
| 1 | outcome `assigned` | 2003 出 **`success`** | 純 mapping,細事 |
| 2 | outcome 有 `no_seats` | 2003 **完全唔檢查座位** | **好事** —— 同 D0 一致(座位係平台決策)。但即係 `no_seats` **兩個 provider 都產生唔到**,要寫入 test 註釋免得下手以為漏咗 |
| 3 | 一種 response 形狀 | **兩種** —— `already_assigned`/`not_synced` 由 `Route Status` **直接 respond**,只有真 assign 完先行 `Build Response` | F1 要 handle 兩種形狀,唔可以當一種 |
| 4 | `error.details` 唔含 PII | 兩個 code node 都 `JSON.stringify(b.error \|\| b).substring(0,500)` —— **原封塞 Graph error body** | 🔴 **H4**,見 OQ-2 |

**#4 最嚴重**:Graph 404/400 body 慣常帶 UPN,而 W38 定嘅契約明文寫 `details` 唔含 PII。呢個同 **BUG-004 同源**(vendor 塞畀我哋嘅字串夾帶 PII),但今次係**新** code,可以喺寫落去之前就守住 —— 唔使等第二次先發現。

### 2. 🔴 誠實邊界:本 phase 完成 ≠ 可以真切換

n8n 側三個前置**全部未通**,而且全部唔喺本 repo 手上:secret 仍 `CHANGE_ME_SHARED_SECRET` · n8n UAT ↔ 平台環境未接通(`[N]`)· 平台未部署(`[P]`)。

⇒ 庚嘅驗收 = 「**code + test 齊,預設值零改變**」,**唔係**「跑得通」。已寫入 plan §1 + G8 明文「唔准當 pass」。

**呢個係本 phase 最大嘅 AP-2 風險**:全程冇真 n8n,好易寫出一套「睇落合理」但同真實回應對唔上嘅 mapping。緩解 = 所有 mapping 對住**實讀嘅 JSON**,唔靠 ADR 轉述(上表就係第一次應用)。

### 3. 五個 OQ(plan §8)

OQ-1 `already_assigned` 對 ledger 嘅影響(**W38 留低嗰個,而家避唔開**)· OQ-2 `details` PII 邊界 · OQ-3 `ritmId` 入唔入介面 · OQ-4 未接通時 probe 顯示咩 · OQ-5 做唔做 `listUsersBySku`。

**OQ-1 係最重要嗰個** —— 佢係第一個「一揀 n8n 就會行到、而 Graph 路徑從來冇行過」嘅分支。揀錯會令「切 provider」順帶夾帶一個 ledger 語意改動。

### Blockers

- 🔴 plan 未 approve + 五個 OQ 未拍板 → 依 R1,**一行 code 都唔寫**

**Commit**:`cc5cf66` — `chore(planning): kickoff W39 — N8nLicenseProvider(ADR-0017 庚)`

---

## Day 1 — 2026-07-28:五個 OQ 拍板,D0 Gate 解除

Chris 五個全跟建議,plan 內容零改動 ⇒ `status: draft → active`。

| OQ | 拍板 | 實作含意 |
|---|---|---|
| **1** | **A** — `already_assigned` 一視同仁照 +1 | 🔴 **要開一個 `assign.service` 分支** —— W38 對非 `assigned` 一律 fail-loud,而家正面處理佢。**呢個就係 W38 明文留低嘅嗰件事** |
| **2** | **A** — `details` 唔傳遞 | provider 只留 status + 平台自己寫嘅安全描述;vendor 細節留喺 n8n execution log |
| **3** | **B** — `ritmId` 唔入介面 | Graph 實作永遠用唔着;平台自己有 ADR-0009 audit |
| **4** | **A** — 未配置 = `inactive` | 唔會出現「紅色但其實只係未接線」嘅誤導狀態 |
| **5** | 維持唔加 `listUsersBySku` | 2002 有 mode 2 ≠ 平台需要佢 |

### OQ-1 揀 A 之後,有一樣嘢要特別小心

`already_assigned` 當 `assigned` 處理 ⇒ ledger 照 +1。但 `already_assigned` 嘅意思正正係「**tenant 側本來已經有呢個 seat**」,所以呢一 +1 **確實會**令平台數字比 tenant 真實多一個。

Chris 明確接受:**唔喺庚偷偷修一邊**。呢個重複計數風險 Graph 路徑一直存在(Graph 分唔到 replay,一律當新 assign),要修就另開 change **兩條路一齊修**。

⇒ 實作時**唔准**順手加「n8n 路徑先唔 +1」—— 咁就係喺切 provider 順帶夾帶一個 ledger 語意改動,正正係 D0 禁止嘅嘢。已寫入 F2 test 註釋鎖住。

**下一步**:F1 `N8nLicenseProvider`。

---
