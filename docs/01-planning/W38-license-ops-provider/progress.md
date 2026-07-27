---
phase: W38-license-ops-provider
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: active         # active | closed
last_updated: 2026-07-27
---

# Phase W38 — Progress

> Daily Day-N entries(每 commit 對應一個 entry,R2)+ 結尾 retro。

---

## Day 0 — 2026-07-27:Kickoff(**plan = draft,🔴 未 approve**)

**Action**:W38 kickoff(PROCESS §2.3)

### 0. 掃號(PROCESS §2.1 —— 呢條規則就係上次撞 W36 之後加嘅)

跑咗 `git fetch --all --prune`,再掃**所有** local + remote ref 嘅 `docs/01-planning/` tree(唔止 `main`):

```
W30 … W35 · W36-n8n-intake-adapter · W36-opco-budget-gate · W37-sync-sweep
```

最大 = **W37** ⇒ **W38 可用**。remote 得兩條 branch(`main` + `feat/ch-008-ledger-empty-rows`),冇平行 session 佔緊號。

### 1. 為何呢個 phase 值得獨立開

ADR-0017 自己講明 outcome 正規化係「本 ADR 最核心嘅設計功夫」。Graph 係 `throw` / `void`,n8n 2003 係返 `already_assigned` / `not_synced` 呢啲**成功形狀嘅結果**。mapping 寫錯 = 切 provider 時**靜默行為改變**,而且係最難察覺嗰種。趁得一個實作嘅時候定死詞彙 + 鎖 test,遠比兩個實作一齊寫易驗。

### 2. 查證 code 之後,ADR-0017 D2 個表**唔可以照抄**

三樣 ADR 寫嗰陣冇嘅資訊,全部 `grep` 實查得出:

| 發現 | 實據 |
|---|---|
| `getSubscribedSkus()` 有 **4 個** consumer,唔止 assign | `assign.service:191` · `reconcile.service:50` · `catalog.service:48` · `integration-probe:76` |
| `sync-sweep` 用 `findUser`,而佢 **ADR-0017 Accepted 之後一日先存在** | `sync-sweep.service:101`(W37 = 07-27;ADR-0017 = 07-26) |
| `listUsersBySku()` 全 repo **零 caller**,`GraphService` 得 4 個公開方法 | `graph.service.ts` 83/101/129/140 |

⇒ 三個 OQ(plan §8),**全部要 Chris 拍板先開工**。

### 3. 🔴 最重要嗰個:OQ-2(sync-sweep)

ADR-0015 嘅**整個重點**係 `azureSyncedAt` 由「n8n 聲稱」升級為「平台證實」。若果 `sync-sweep.findUser` 走 n8n 2005,就變成 n8n 再一次話畀平台聽「呢個 user sync 咗」= **直接推翻 ADR-0015**。

呢個唔係「ADR-0017 寫錯」—— 係兩份 ADR 相隔一日、後者實作先出現嘅**真空位**。所以處理方式係喺 ADR-0017 加**實作補註**(鏡射 ADR-0009 Decision 5 嘅做法),**唔係改 Accepted 內容**。

### 4. 順帶揪到一個重構陷阱(plan R2)

`graph.service.ts:146` —— `assignLicense()` **內部再 `findUser` 一次**,而 `assign.service.ts:131` 已經查過。即係每次 assign 打**兩次** Graph。

呢個係既有行為。抽象化嗰陣**極易順手「優化」**掉 —— 但咁就唔再係「純重構零行為改變」。已明文寫入 F3 acceptance:**保留**。要清呢個重複 = 另開 Change。

### 5. Artifacts

```
docs/01-planning/W38-license-ops-provider/
├── plan.md        (status: draft —— 等 approve)
├── checklist.md   (D0 Gate 四項未 tick,其下全部鎖住)
└── progress.md    (本檔)
```

### Blockers

- 🔴 **plan 未 approve**(`status: draft`)+ **三個 OQ 未拍板** → 依 R1,**一行 code 都唔寫**
- ⚠️ 本 phase **唔依賴** UAT 部署([P]/[N] 仍未通),亦**唔掂** ServiceNow ⇒ 戊嘅 carry-over 唔阻本 phase

**Commit**:`fe07eef` — `chore(planning): kickoff W38 — LicenseOperationsProvider(ADR-0017 己)`

---

## Day 1 — 2026-07-27:**三個 OQ 拍板**,D0 Gate 解除

**Chris 三個 OQ 全部跟建議**,plan 內容零改動 ⇒ `status: draft → active`,checklist 解鎖。

| OQ | 拍板 | 落到邊度 |
|---|---|---|
| **OQ-1** | **選項 A** —— provider **只收 assign 路徑** | `reconcile` / `catalog` / `integration-probe` 明文不動 + **F4 負面斷言鎖死** |
| **OQ-2** | **選項 A** —— `sync-sweep.findUser` **永遠直接 `GraphService`** | F4 test + code comment 要寫**點解**,唔止鎖現狀 |
| **OQ-3** | **選項 B** —— **唔加** `listUsersBySku()` | 介面收窄到真有 caller 嗰幾個 |

### 呢三個拍板合埋嘅意思:介面**細過** ADR-0017 D2 個表

D2 表列 5 個方法,拍板之後實際只需要 **3 個**:

| D2 方法 | 收唔收 | 理由 |
|---|---|---|
| `listTenantSkus()` | ✅ 收 | assign 座位檢查(`assign.service:191`) |
| `findUser(upn)` | ✅ 收 | assign 前置(`assign.service:131`)。⚠️ **`sync-sweep` 嗰個 `findUser` 唔經呢度**(OQ-2) |
| `assignLicense(...)` | ✅ 收 | 核心(`assign.service:208`) |
| `checkSync(upns[])` | ❌ 唔收 | 全 repo **零 caller**,同 OQ-3 一樣嘅理由(§1.2)—— 呢個係拍板之後推導出嚟嘅**第四個發現**,plan §8 冇明文提過,但適用同一條準則 |
| `listUsersBySku()` | ❌ 唔收 | OQ-3 |

> ⚠️ `checkSync()` 唔收係我按 OQ-3 同一準則推導,**唔係 Chris 明文拍板嘅第四個 OQ**。若果你想連 `checkSync` 一齊留位,講一聲我加返 —— 但佢而家真係一個 caller 都冇。

**下一步**:F1 介面 + `AssignOutcome` 詞彙。

---
