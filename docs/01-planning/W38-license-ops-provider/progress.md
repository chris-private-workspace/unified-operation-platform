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

**Commit**:`chore(planning): kickoff W38 — LicenseOperationsProvider(己)`

---
