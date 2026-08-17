# Unified Operation Platform — Session Start(AI 詳版 onboarding)

> **AI coding agent:CLAUDE.md §10.3 Session Start Protocol 第一步就係讀呢份。**
> 定位:**session 開頭深讀一次嘅完整 onboarding**(比 CLAUDE.md 憲法補充更多 volatile 座標 + 背景)。
> 對照 `SESSION_SUMMARY.md`(每 session hook 自動注入嘅 **slim 即時摘要**)—— 呢份詳,嗰份 slim。
> **On-demand 深讀**:用下面 TOC 跳去當前 session 相關嗰幾節。

## 目錄(TOC)
1. 你正在加入嘅項目 · 2. 最高指導原則 · 3. Component 清單 · 4. 權威排序 · 5. 必讀 / 按需讀文件 ·
6. Rolling Phase Planning 紀律 · 7. Task Type Classification · 8. 進度自查(git)· 9. Open Questions ·
10. 當前座標 · 11. 常駐 gates · 12. 行為規範 · 13. 今天嘅任務 · 附錄

---

## 1. 你正在加入嘅項目
- **Why**:IT operation / support 工作長期靠 Email + Excel + 多個 portal 手動接力,碎片化、易出錯、無 live state。本平台做「事情實際點被做完」嘅 System of Action,並作將來 n8n / AI 嘅受控基礎。
- **一句定位**:Unified Operation Platform — IT operation / support 的管理 + 操作平台(逐步引入 AI)。第一個模組 **LicenseOps**(M365 onboarding license 履行)。
- **本項目「唔係」咩**(防誤解):
  - **唔係 ticketing / ITSM**:intake / approval / SLA 屬 ServiceNow(System of Record),平台只**消費** request + 回寫。
  - **唔係財務系統**:成本 / 發票屬 DocuWare,平台只記 `quoteRef` / `poRef`,唔記錢。
  - **唔係 n8n workflow**:係 stateful、human-in-the-loop 嘅 admin portal;n8n 係其中一隻手。

## 2. 最高指導原則(Strict Mode)
- **原則 1**:架構決定 lock 咗唔可以單方面改 → 觸 hard constraint(**H1-H8**)即 **STOP + ask**(CLAUDE.md §5)。
- **原則 2**:**先文件後 code**(pre-doc gate,PROCESS R1);非 trivial 工作先分類 → 開 plan/spec/report → approve → 先寫 code。
- **原則 3**:**UI 一律 token-only 忠實還原 hifi 設計**(H6),唔 eyeball / hardcode,唔中途走偏。

## 3. Component 清單(模組地圖)
- **Monorepo**(ADR-0001):`apps/api`(NestJS 後端)+ `apps/web`(React 前端)。
- 後端模組:`integration`(Graph + ServiceNow)· `prisma`(`@Global`)· `license`(module C:catalog + 對帳 + ledger)· `fulfilment`(module D:request 生命週期)。**四個都已交付** —— 逐個模組嘅現況唔喺呢度寫,睇 `SESSION_SUMMARY.md`。
- 前端:`apps/web` —— 由 `design_handoff_licenseops/` 還原,設計系統 SSOT = `docs/02-architecture/design-system.md`。
- Domain model 真相:`prisma/schema.prisma`(**檔本身就係真相,唔喺呢度寫 model 數量**)。

## 4. 權威排序(衝突時邊個 wins)
```
1. Hard Constraints(CLAUDE.md §5 **H1-H8**)
2. 主 spec frozen(docs/architecture.md)+ module spec(licenseops/DESIGN.md)
3. ADR(Accepted —— **清單 SSOT = `docs/adr/README.md`,呢度刻意唔數**)
4. Approved phase plan / change spec / bug report
5. CLAUDE.md conventions
6. 設計系統(design-system.md)+ 視覺真相(design_handoff_licenseops/)
```

## 5. 必讀 / 按需讀文件
- **每 session 必讀**:CLAUDE.md · 本檔 · active phase 三件套。
- **按需深讀**:`docs/architecture.md`(平台架構)· `licenseops/DESIGN.md`(業務決策)· `design-system.md`(做 UI)· `BACKLOG.md`(揀任務)· `adr/`(問點解噉揀)· `05-usage/INTEGRATION_SETUP.md`(Graph / ServiceNow)。

## 6. Rolling Phase Planning 紀律 ⭐
- ✅ **正確**:每 phase kickoff 先建 folder;只保留 active + 下一個 draft;做完一個 phase(retro closeout)先開下一個。
- ❌ **禁止**:一次過預建多個未來 phase folder / retro 寫死具體未來 task / 跳 plan 直接 code。
- **為何**:JIT 規劃帶住上一 phase 教訓,避免猜錯未來(§1.2 simplicity)。

## 7. Task Type Classification
收到任務先分類(PROCESS.md §6),**propose → 等 confirm → 開 pre-doc → 先 code**:

| Signal | Type | Pre-doc |
|---|---|---|
| 符合 active phase deliverable | Phase | plan + checklist |
| 改現有行為(<3 日) | Change | spec(approved) |
| 修壞咗 / regressed 行為 | Bug-fix | report(triaged) |
| typo / 單行 / <30min | Trivial | 免 |

先查 **H1-H8**:撞紅線(尤其 **H3 scope** 新功能/新方向、**H6** UI 走偏、**H7** 腦補 tool 結果、**H8** 用 bash 讀檔/搜尋)→ 第一句 STOP。

## 8. 進度自查(git)
```
git status --short
git log --oneline -8
```
對照 active phase checklist 嘅 next unchecked item(hook 已自動注入 active phase + git)。

## 9. Open Questions snapshot
見 `licenseops/DESIGN.md §10`:成本可見度 · `isBaseLicense` 去留 · ServiceNow 實際 table/field · 對帳「對回」機制 · OpCo self-service 時機。Open 嗰啲用 spec default 繼續(CLAUDE.md §8)。

## 10. 當前座標 —— 🔴 **唔喺呢度寫**

> **2026-08-15 起,本節刻意唔再持有座標,只指路。**
> **點解**:呢節由 2026-07-09 起寫住「W01 backend-bootstrap 等 approve、`apps/web` planned、AUTH pending」,而嗰啲**最遲喺 2026-07-31 就已經全部交付**(`CLAUDE.md` §14 有記錄:嗰日實測發現 §9 仲寫住「`apps/web` = placeholder、auth guard 未做」,而前端同 AUTH 早就做齊)—— 即係話**呢節由嗰日起就已經係死嘅,之後兩個星期冇人回頭掃**,而本檔係 §10.3 **第一步必讀**:每個 session 都由一份死咗嘅前提開始。
> **點解唔改成「填返啱嘅座標」**:嗰個做法上一手已經試過,佢一樣會過期,只係下次過期得慢啲。W44 `F8-7` 個結論講得好白 —— **加一份副本就係加一個漂移點**;而 W44 closeout 同一日就撞到三份互相矛盾嘅副本。**唯一唔會過期嘅座標,就係唔喺呢度寫嘅座標。**

| 想知 | 睇邊度(SSOT) |
|---|---|
| 而家喺邊個 phase / CH / BUG,最近收咗乜 | **`SESSION_SUMMARY.md`**(SessionStart hook 每 session 自動注入)+ `CLAUDE.md` §0 |
| 有咩 pending / 下一個做乜 | **`docs/01-planning/BACKLOG.md`** |
| Active phase 嘅 scope / acceptance / 進度 | `docs/01-planning/W{NN}-*/` 三件套(**若零個 phase 未收,就係由 BACKLOG 揀**) |
| 架構決定 | `docs/adr/README.md` |
| Runtime 實況(本機坑 / DEV 跑緊邊個 tag / risk) | `CLAUDE.md` §9 · `docs/13-deployment/09-dev-as-built.md` · `RISK_REGISTER.md` |

🔴 **DEV 跑緊邊個版本,一律唔可以由文件推** —— 佢每次 merge 就過期。要驗 DEV 先確認佢個 tag(見 `CLAUDE.md` §9 `DEV-SYNC`)。

## 11. 常駐 gates / hard gates

> **同 §10 同一個理由,唔喺呢度維護狀態。** 原本呢度列住四個 **W01** gate 全部 `pending`,而佢哋喺 W01 收官嗰陣就已經過晒 —— 一個「永遠 pending」嘅 gate 表,比冇表更誤導。

- **每個 session 都成立嗰啲** = `CLAUDE.md` §5 **H1-H8**(hard constraints)+ §12 self-verification checklist。
- **Phase / change 專屬嘅 gate** = 對應 `plan.md` §3 Success Criteria 或者 `spec.md` §3 Acceptance,**跟住嗰單走,唔喺呢度鏡像一份**。

## 12. 行為規範 checklist(最易犯)
- **必做**:繁中回覆(§11)· pre-doc gate(R1)· 掂 **H1-H8** 第一句 STOP · SKU 用 `skuId` 唔靠名 · assign 前過 `azureSyncedAt` sync gate · UI 用 token 唔 eyeball(跑 `ui-design` skill)。
- **唔做**:未授權 destructive op · silent scope / plan drift(R3)· 過度 disclaimer · 一次過預建未來 phase。

## 13. 今天嘅任務(session 開頭填)
```
本 session 任務:{一句}
分類:{Phase / Change / Bug / Trivial}
對應文件:{plan / spec / report 路徑}
Next unchecked item:{}
```

---

## 附錄:本檔維護
- **幾時更新**:🔴 **唔應該再係「每個 phase closeout」** —— 2026-08-15 起本檔刻意唔持有 volatile 座標(§10 / §11 只指路)。要改嘅係:**加新 component** · **加 / 改 hard constraint** · **routing 目標搬屋**(某份 SSOT 改咗路徑 / 改咗名)· **最高指導原則變**。**座標類更新一律去 `SESSION_SUMMARY.md`,唔好返嚟呢度加。**
- **Update history**:

| Date | Change |
|---|---|
| 2026-08-15 | **§10 / §11 由「持有座標」改成「指路」** —— 兩節由 2026-07-09 起寫住 W01 座標(`apps/web` planned / AUTH pending / 四個 W01 gate 全 `pending`),而嗰啲一早交付咗;本檔係 §10.3 第一步必讀 ⇒ **每個 session 都由死咗嘅前提開始**。順帶修三處同源 stale:`H1-H6` → **`H1-H8`**(4 處)· §3 四個 `planned` · §4「現有 ADR-0001」→ 指去 `adr/README.md` |
| 2026-07-09 | Initial — 由 template 實例化(monorepo + H6 + W01 座標) |

**Companion**:`SESSION_SUMMARY.md`(slim hook 注入)· `compact-session.md`(session 結尾)。
