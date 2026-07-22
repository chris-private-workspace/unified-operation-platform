---
phase: W31-outbound-failure-recovery
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed         # in-progress | closed
---

# Phase W31 — Progress

> Day-N entries during execution + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — 2026-07-21

### Done

**F1** `OutboundFailure` model + migration + 白名單記錄服務(G1 十條 test)
**F2** 三處失敗接線(G3/G4/G7,新 8 條 test,既有 23 條照樣綠)
**F3** endpoint + kind 分流補救 + audit(G2 十三條 test)
**F4** `/outbound-failures` 畫面 + 措辭 guard(9 條)+ sidebar 逐 entry gate

api **286 → 324**(+38)· web **114 → 123**(+9)· lint / build 全綠。

### Live 驗證

**端到端(真流程)**:建真 request → SN 打唔通 → 503 → 失敗入表(`kind=request.submit` · **`externalRef: null`** · `lastError` 只有訊息文字零 URL)→ 撳 retry 仍敗 → **`attemptCount` 1→2 而 `status` 留 `open`**(I2)→ abandon → reopen → audit 兩條齊。

**mirror 補救(D3 最強證據)**:插一條 orphan 記錄 → 撳「Record locally」→ **本地 Request 建成(REQ0099 / orphan.test@…)· status `resolved` · audit「repaired request.mirror after 1 failed attempt(s)」**。關鍵係:**全程 ServiceNow 都係死嘅**(同一環境 submit 就係因為打唔通而失敗)—— 補救仍然成功,即證明佢真係純本地,冇掂過 SN。

**G5 權限**:OPCO_IT 四項 —— `/me` = OPCO_IT(RHK)· GET **403** · POST retry **403** · `/license/ledger` **200** 對照。

### Decisions

**Gate 通過**:ADR-0011 事前 Accepted(Chris Q1 = F1+F2+F3 · Q2 = ADMIN+REGIONAL),plan §6 三個實作級選擇(I1/I2/I3)照建議通過。

**本 phase 風險自覺**:唔同 W30(純新增讀取面),呢個係喺已經 work 緊嘅 outbound 路徑上動刀,而且掂 `assign.service`(H5 critical path)。「成功路徑零行為改動」寫咗做驗收項(G4),用既有 test + `git diff` 把關 —— 結果既有 23 條 test 全綠,零改動。

**實作期新增嘅小決定**(唔屬 deviation,ADR 冇規定):
- `writeMirror` 加**冪等 guard** —— `serviceNowSysId` 係 `@unique`,重複補救會撞 constraint error;偵測到已存在就當已修好,唔當失敗。
- mirror **冇** `externalRef` → **拒絕補救**。呢個 case ADR 冇明寫,但推論係硬嘅:亂寫 mirror = 憑空造一個 link,重新提交 = 整多張飛,兩條路都錯 → 唯一誠實選項係拒絕 + 叫人手對帳。
- sidebar Administration 區改為**逐 entry role predicate**。呢個畫面係 ADMIN+REGIONAL,但成個區本來 ADMIN gate;照塞 REGIONAL 冇入口,放寬成區又會令 REGIONAL 見到 Users & roles。

### Blockers
- 無

### Effort
- Planned:12h;Actual:~11h

### Commits
| Hash | Subject |
|---|---|
| `53b374b` | ADR-0011 Accepted + W31 plan |
| `c500ee9` | W31 kickoff(plan active + checklist + progress) |
| `c98f399` | F1 model + 白名單服務 |
| `100b6d2` | F2 三處接線 |
| `2d7aa79` | F3 endpoint + kind 分流 + audit |
| `44d5d48` | F4 前端 |

### Decisions

**Gate 通過**:ADR-0011 事前 Accepted(Chris Q1 = F1+F2+F3 · Q2 = ADMIN+REGIONAL),plan §6 三個實作級選擇(I1 F3 仍 swallow / I2 retry 失敗唔扮成功 / I3 abandoned 可 reopen)照建議通過。

**本 phase 風險自覺**:唔同 W30(純新增讀取面),呢個係喺已經 work 緊嘅 outbound 路徑上動刀,而且掂 `assign.service`(H5 critical path)。故「成功路徑零行為改動」寫咗做驗收項(G4),用既有 test + `git diff` 把關。

### Blockers
- 無

### Effort
- Planned:12h;Actual:_(待填)_

### Commits
| Hash | Subject |
|---|---|
| `53b374b` | docs(adr): ADR-0011 Accepted + W31 plan |

---

## Retro

### 交付 vs plan

四個 deliverable 全數落地,**零 plan deviation**(ADR-0011 D1–D9 全部照做,無需 changelog)。G1–G9 九條全 pass。

### What worked

**埋身前查證,而唔係照 ADR 字面做。** ADR-0010 D8 寫「持久化失敗嘅 outbound(payload + 錯誤 + 嘗試次數)」,睇落係一個完整規格。但讀實際 code 先發現有**三種**失敗,而佢哋需要嘅補救動作**互不相容** —— 照 D8 字面做會解咗最唔痛嗰個(F1:資料乾淨、用戶即刻見到),漏低最痛嗰兩個(F2 orphan、F3 靜默)。呢個發現直接令 Chris 多咗一個 scope 決定要拍板,亦改寫咗成個 model 設計(要有 `kind` + `externalRef`,唔係單純 payload)。

**D6 用型別杜絕,而唔係用註解提醒。** `record()` 唔收 tx handle —— 呢個唔係「記住唔好綁 transaction」,係「綁唔到」。同類手法喺 W29 已經見效(白名單一處做,call site 冇得繞)。

**兩條硬紅線都寫成「證明冇發生」嘅 test。** G2(mirror 補救 assert provider 從未被呼叫)同 G1(餵假 secret assert 唔出現)都係斷言**負面事實**。呢類 test 比斷言正面行為更難被無意中改壞。

**live 驗證揀咗一個會證偽嘅設定。** mirror 補救係喺 **ServiceNow 死緊嘅時候**驗 —— 如果佢偷偷有掂 SN,就一定會失敗。成功本身就係證據。呢個比「mock 咗 SN 然後 assert 冇 call」更強,因為連我寫錯 mock 都瞞唔過。

### What didn't / unexpected friction

**截圖揪到 DOM 驗證睇唔到嘅問題。** 「Submit to ServiceNow」個掣喺窄視窗被切出畫面外 —— 所有 DOM assertion 都綠(元素存在、文字啱、tone 啱),但實際操作員撳唔到。**教訓:DOM 驗證答「有冇 render 啱嘅嘢」,答唔到「用戶用唔用到」。** 兩者都要。

**Prisma generate 撞 EPERM,而且 kill 咗 backend 都唔夠。** 真兇係一個 `nest start --watch`(記憶入面提過嘅 watcher 重生坑)—— 佢會喺我 kill 咗 `dist/main` 之後即刻起返一個新嘅,鎖住 query engine dll。要追父進程鏈先搵到。同時見到兩個 `npm run start:dev`,其中一個**冇 workspace 標識**,唔確認就唔敢殺(機器上有其他專案跑緊)。

**測試 mirror 失敗要人手插資料。** F2 呢個 case 冇辦法由 UI 自然觸發(要 SN 成功但本地 DB 失敗)。插咗一條 probe row 驗完即清,audit 紀錄保留。

### Carry-overs

- 🟡 **`OutboundFailure` retention** —— 同 `audit-retention` 一樣未做。呢張表含 UPN,將來定 retention 政策要一併涵蓋。
- 🟡 **冇 `opcoId` 欄位**(ADR-0011 D1 刻意)。將來若要開放 OPCO_IT 見自己 OpCo 嘅失敗,要 join 或補欄位 —— 同 `AuditLog` 係同一類取捨,已寫入 ADR Consequences 免得將來當成疏忽。
- 🔴 **RISK R3 仍然 Open** —— ADR-0010 錯引用咗佢,本 phase 已校正:W31 解嘅係 outbound **提交**失敗,R3 係 **n8n sync 延遲致 assign fail**,兩件事。R3 要另外處理。
- ⚪ **自動 retry / BullMQ** —— ADR-0010 D8 + ADR-0011 D9 明確唔做,要另寫 ADR。而家「試咗幾多次」已經睇得見,呢個係啟用自動化之前應該有嘅前提。

### Phase N+1 trigger

rollout item 6 收官後,**六項 rollout 淨返 item 5(n8n 回程 webhook)** —— 卡 **OQ-D**(要 Chris 同 n8n owner 開合約會,外部)。

其餘候選:**FE-activity-ops**(RequestEvent 營運 feed,要新 index = H1)/ **AUTH-2b**(🔴 卡 IT app reg)/ **audit-retention** / **DEPLOY**。

---

**End of W31 progress**
