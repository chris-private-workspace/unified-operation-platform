---
phase: W38-license-ops-provider
name: "N8N-SEAMS 己 — LicenseOperationsProvider + GraphLicenseProvider(純重構)"
sprint_week: W38
start_date: 2026-07-27
end_date: 2026-07-29          # planned, may slip with changelog log
status: active                # draft | active | closed —— 2026-07-27 Chris approve + 三個 OQ 全跟建議拍板
spec_refs:
  - docs/adr/0017-n8n-execution-seams-switchable-integration.md §D0 · §D2 · rollout「己」
  - docs/adr/0015-sync-gate-scheduled-sweep.md(OQ-2 直接相關)
  - docs/adr/0016-opco-budget-assign-gate.md(assign 路徑現狀)
prior_phase: W36-n8n-intake-adapter
---

# Phase W38 — `LicenseOperationsProvider` + `GraphLicenseProvider`

> **Plan version**:1.0(initial)
> **Owner**:AI(Claude)
> **Approved by**:**Chris Lai(2026-07-27)** —— §8 三個 OQ **全部跟建議**:OQ-1 = 選項 A(provider 只收 assign)· OQ-2 = 選項 A(sync-sweep 永遠直接 Graph)· OQ-3 = 選項 B(唔加 `listUsersBySku`)

## 1. Scope

ADR-0017 三個可切換接縫嘅**第二個**(接縫 ②)。本 phase **只做抽象層**:把 assign 路徑對 `GraphService` 嘅直接依賴,換成 `LicenseOperationsProvider` 介面 + 唯一實作 `GraphLicenseProvider`,並把 Graph 嘅 throw/void 風格**正規化成 `AssignOutcome` 詞彙**。

**`N8nLicenseProvider` 唔喺本 phase**(= 庚)。本 phase 完結時系統行為**應該一個字都冇變**,只係多咗一個將來插得入第二個實作嘅位。

> **點解「純重構」值得獨立開一個 phase**:outcome 正規化係 ADR-0017 自己講嘅「最核心設計功夫」。Graph 係 `throw` / `void`,n8n 2003 係返 `already_assigned` / `not_synced` 呢啲**成功形狀嘅結果**。呢個 mapping 寫錯 = 切換 provider 時**靜默行為改變**。趁只有一個實作嘅時候把詞彙定死同鎖 test,比兩個實作一齊寫容易驗證得多。

## 2. Deliverables

### F1 — `LicenseOperationsProvider` 介面 + `AssignOutcome` 詞彙
- **Spec ref**:ADR-0017 §D2
- **落點**:`apps/api/src/integration/license-ops/`
- **Dependencies**:**OQ-1 / OQ-3 拍板**(介面到底有幾多個方法)
- **Acceptance criteria**:
  - `AssignOutcome` union 逐個 variant 有 test 覆蓋
  - `details` 欄**零 PII**(H4)—— 有 test 餵 UPN 落 Graph error 再 assert outcome 唔含該 UPN
  - 介面檔零 vendor import(唔 import `@microsoft/microsoft-graph-client`)

### F2 — `GraphLicenseProvider` 實作
- **Spec ref**:ADR-0017 §D2 表格「`GraphLicenseProvider`(預設)」欄
- **Acceptance criteria**:
  - 內部照舊經 `graphUnavailable()` wrap(BUG-002 嘅保護唔可以喺重構途中蒸發)
  - Graph 404 → `not_synced`;座位不足 → `no_seats`;其餘 throw → `error`
  - **既有 `graph.service.ts` 一行都唔改**(佢係 vendor SDK 邊界,H2/§3.1)

### F3 — `assign.service` 換依賴(**行為零改變**)
- **Acceptance criteria**:
  - `assign.service.spec.ts` **既有 assertion 一條都唔使改**(呢個就係「零行為改變」嘅硬證據)
  - `AssignService` 唔再 import `GraphService` / `GraphUser` / `graphUnavailable`
  - ADR-0016 預算 gate 位置不變(仍然喺 `graph` inventory read **之前**)
  - 🔴 **`assignLicense` 內部嗰次重複 `findUser` 保留**(見 §4 R2)

### F4 — 邊界鎖 test(負面斷言)
- **Acceptance criteria**:
  - assert `reconcile.service` **唔經** provider(仍然直接 `GraphService`)
  - assert `integration-probe` **唔經** provider
  - assert `sync-sweep` 按 OQ-2 拍板結果(預設:唔經 provider)
  - 每條 test 寫明**點解**呢個 consumer 唔可以走 provider,唔係淨係鎖現狀

### F5 — Doc-sync
- ADR-0017 加**實作補註**(唔改 Accepted 內容,鏡射 ADR-0009 Decision 5 做法):記低 OQ-1/2/3 嘅拍板 + 「D2 表當時未計 sync-sweep」
- `BACKLOG.md` N8N-SEAMS-己庚辛 row + `SESSION_SUMMARY.md`

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | 全部既有 test 綠 | api 433 → ≥433 | `npm test -w @uop/api` | Yes |
| G2 | **`assign.service.spec.ts` 既有 assertion 零改動** | diff = 0 | `git diff` 該檔只有新增 | Yes |
| G3 | 新 provider 逐 outcome 有 test | ~~5 個 variant 全覆蓋~~ → **實際產生得到嘅 variant 全覆蓋**(Graph = 只有 `assigned`,見 §7 D2) | test 檔逐條對 | Yes |
| G4 | **零 schema / 零新 dep** | diff = 0 | `schema.prisma` + 3 個 `package.json` | Yes |
| G5 | 邊界鎖 test 真捉得到 | fails-before 實證 | 故意令 reconcile 走 provider → test 紅 | Yes |
| G6 | H4:outcome 零 PII | 餵 UPN 唔洩漏 | 專門 test | Yes |
| G7 | lint / build 乾淨 | 0 warning | `npm run lint` + `tsc --noEmit` | Yes |
| G8 | live:assign 一次真跑,行為同重構前一致 | 同 stage / 同 ledger 增量 | dev DB 前後對照 | Yes |

## 4. Risks(Phase-Specific)

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| **R1** | 🔴 **「純重構」滑向「順手改行為」** —— 重構最典型嘅失敗 | High | High | G2 把「既有 spec 零改動」升做 phase gate。任何要改既有 assertion 嘅衝動 = 停手,寫入 changelog 等拍板 |
| **R2** | 🔴 **`graph.assignLicense()` 內部再 `findUser` 一次**(`graph.service.ts:146`),而 `assign.service.ts:131` 已經查過 —— 即每次 assign 打兩次 Graph。抽象化時**極易順手「優化」**掉 | High | Med | 明文列入 F3 acceptance:**保留**。要清呢個重複 = 另開 Change,唔喺本 phase |
| **R3** | `graphUnavailable()` 嘅 503 語意喺 outcome 正規化途中蒸發(BUG-002 迴歸) | Med | High | F2 acceptance 明列;既有 BUG-002 regression test 必須仍然綠 |
| **R4** | Provider 介面設計得太闊(順手把四個 consumer 全部收編)⇒ 庚落地時 reconcile / probe 靜靜走咗 n8n | Med | High | **OQ-1 先拍板**;F4 負面斷言鎖死 |
| **R5** | ADR-0017 D2 表寫嘅 `listUsersBySku()` 目前**零 caller**,照加 = 違反 §1.2 | Med | Low | **OQ-3 拍板**;預設唔加 |

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D0 | 2026-07-27 | kickoff + 三個 OQ 交 Chris | plan / checklist / progress |
| D1 | 2026-07-28 | F1 + F2(介面 + Graph 實作 + outcome test) | F1, F2 |
| D2 | 2026-07-29 | F3 + F4 + F5 + live 驗 + retro | F3, F4, F5 |

## 6. Dependencies on Prior Phase

Carry-over from `W36-n8n-intake-adapter/progress.md` retro:
- **戊已完成** ⇒ 己解封(ADR-0017 rollout 順序)
- ⚠️ 戊嘅 carry「真 SN 端到端未驗證」**唔阻本 phase** —— 己完全唔掂 ServiceNow
- ⚠️ 本 phase 亦**唔依賴** UAT 部署([P]/[N] 仍未通),純本地重構

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-27 | Initial plan | — | Chris Lai |
| 2026-07-27 | **D1 — error 契約偏離 ADR-0017 §D2 字面**:transport 失敗(網絡/auth/throttle)**照 throw 503**,唔 map 入 `AssignOutcome`;`error` variant 只留畀「provider 答咗,但答案係失敗語意」(例:2003 返 `{result:'failed'}`) | ADR §D2 寫「把 Graph 例外(現時經 `graphUnavailable()` wrap)map 入詞彙」,但 `graphUnavailable()` wrap 嘅係 **vendor 掛咗** —— 嗰個唔係呢次 assign 嘅**結果**,係**冇結果**,caller 應該重試而唔係詮釋。照字面做會逼 `assign.service` 人手複製一個逐字相同嘅 503 message,而任何一個字唔同就係行為改變 | **Chris Lai** |
| 2026-07-27 | **D2 — G3 由「5 個 variant 全覆蓋」改為「實際產生得到嘅 variant 全覆蓋」** | 寫實作先發現 plan 呢條**做唔到而且唔應該做到**:`GraphLicenseProvider` 只產生得到 `assigned`。`not_synced`/`no_seats` 由 caller 喺**入 provider 之前**攔截(移入嚟 = provider 變決策者,違反 D0);`already_assigned` **Graph 根本分唔到**(POST 冪等且唔報告);`error` 留畀庚。為咗夾夠 5 個而喺 Graph 側虛構 mapping = 憑空造行為 | AI(照 §1.2;**已 surface 畀 Chris**) |

---

## 8. 🔴 Open Questions(**全部要 Chris 拍板先開工**)

三個都係**查證 code 之後先浮出嚟**,ADR-0017 寫嗰陣冇呢啲資訊。

### OQ-1 — `getSubscribedSkus()` 有 **4 個** consumer,provider 收邊幾個?

實查(`grep` 全 `src/`,排除 spec):

| Consumer | 用途 | 走 provider 嘅後果 |
|---|---|---|
| `assign.service:191` | 座位檢查 | ✅ ADR D2 正是指呢個 |
| `reconcile.service:50` | **對帳基準** | 🔴 走 n8n = drift 真相source 變咗 n8n。`assign.service.ts:153` 個註釋明文寫住「`reconcile.service.ts` is untouched, **and must stay that way**」 |
| `catalog.service:48` | SKU 字典 sync | ⚠️ ADR-0017 冇講過要切 |
| `integration-probe:76` | W30 **Graph connector 探針** | 🔴 探針目的就係探 **Graph 本身**;走 provider 之後探到嘅係 n8n,ADR-0010 講明「重用既有唯讀方法」 |

**建議 = 選項 A:provider 只服務 assign 路徑,其餘三個明文不動 + F4 負面斷言鎖死。**
理由:D0「只換執行器唔換決策者」—— reconcile 係**決策者**(佢定義 drift),probe 係**觀察者**(佢要觀察嘅正是被換走嗰個執行器)。兩者都唔屬「執行」。

### OQ-2 — 🔴 `sync-sweep` 嘅 `findUser` 要唔要走 provider?(**我認為唔可以,但要你拍板**)

**時序問題**:ADR-0017 喺 **2026-07-26** Accepted,ADR-0015 sync-sweep 喺 **2026-07-27**(W37)先實作。所以 **D2 個表寫嗰陣,`sync-sweep.service.ts` 根本未存在** —— 佢個 `findUser` 唔喺 ADR-0017 考慮範圍內。

而 ADR-0015 嘅**整個重點**係:`azureSyncedAt` 由「**n8n 聲稱**」升級為「**平台證實**」。

```
sync-sweep.findUser 走 n8n 2005
        ↓
n8n 再一次話畀平台聽「呢個 user sync 咗」
        ↓
azureSyncedAt 退回「n8n 聲稱」 = 直接推翻 ADR-0015
```

**建議 = 選項 A:sync-sweep 永遠直接 `GraphService`,唔走 provider**,並喺 code comment + F4 test 寫明理由(唔止鎖現狀,要鎖**點解**)。

⚠️ 呢個唔係「ADR-0017 寫錯」—— 係兩份 ADR 相隔一日、後者實作先出現嘅**真空位**。所以 F5 要喺 ADR-0017 加實作補註,唔係改佢。

### OQ-3 — `listUsersBySku()`(D2 標「新增」)喺「己」加定唔加?

現狀:`GraphService` 得 4 個公開方法,**冇** `listUsersBySku`;全 repo **零 caller**。

- 加 → 違反 §1.2(冇人用嘅 feature)+ 「己 = 純重構零行為改變」自相矛盾(新寫 Graph `$filter` + 分頁 = 新能力)
- 唔加 → 庚要用 2002 mode 2 嗰陣,介面要補一個方法

**建議 = 選項 B:唔加。** 留到**真有 caller** 嗰陣先加(庚,或者將來邊個 feature 真係要「列出用緊某 SKU 嘅人」)。介面加方法係 additive,唔會令庚返工。

---

**Lifecycle reminder**:呢份 plan locked after status=active。重大 deviation 入 §7 changelog,小 detail 可 inline edit。
