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
- **原則 1**:架構決定 lock 咗唔可以單方面改 → 觸 hard constraint(H1-H6)即 **STOP + ask**(CLAUDE.md §5)。
- **原則 2**:**先文件後 code**(pre-doc gate,PROCESS R1);非 trivial 工作先分類 → 開 plan/spec/report → approve → 先寫 code。
- **原則 3**:**UI 一律 token-only 忠實還原 hifi 設計**(H6),唔 eyeball / hardcode,唔中途走偏。

## 3. Component 清單(模組地圖)
- **Monorepo**(ADR-0001):`apps/api`(NestJS 後端)+ `apps/web`(React 前端)。
- 後端模組:`integration`(✅ built:Graph + ServiceNow)· `prisma`(`@Global`,planned)· `license`(module C:catalog + 對帳 + ledger,planned)· `fulfilment`(module D:request 生命週期,planned)。
- 前端:`apps/web`(planned)—— 由 `design_handoff_licenseops/` 還原,設計系統 SSOT = `docs/02-architecture/design-system.md`。
- Domain model 真相:`prisma/schema.prisma`(10 models)。

## 4. 權威排序(衝突時邊個 wins)
```
1. Hard Constraints(CLAUDE.md §5 H1-H6)
2. 主 spec frozen(docs/architecture.md)+ module spec(licenseops/DESIGN.md)
3. ADR(Accepted;現有 ADR-0001)
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

先查 H1-H6:撞紅線(尤其 **H3 scope** 新功能/新方向、**H6** UI 走偏)→ 第一句 STOP。

## 8. 進度自查(git)
```
git status --short
git log --oneline -8
```
對照 active phase checklist 嘅 next unchecked item(hook 已自動注入 active phase + git)。

## 9. Open Questions snapshot
見 `licenseops/DESIGN.md §10`:成本可見度 · `isBaseLicense` 去留 · ServiceNow 實際 table/field · 對帳「對回」機制 · OpCo self-service 時機。Open 嗰啲用 spec default 繼續(CLAUDE.md §8)。

## 10. 當前座標(volatile — 每 phase closeout doc-sync 更新)
- **最近 closed phase**:_(未有 —— W01 係第一個)_
- **進行中**:**W01 backend-bootstrap**(plan `draft`,**等 Chris approve flip active**)—— 建 monorepo + 令後端跑得起 + 遷入 `apps/api`。
- **剩餘 candidates**:module C / D、AUTH、前端 build phases(見 `BACKLOG.md`)。
- **已知 blocker / gate**:W01 approval gate 住全部後續;git 已連 GitHub private(`chris-private-workspace`)。

## 11. 常駐 gates / hard gates
| Gate | 狀態 |
|---|---|
| W01 G1 build passes | pending |
| W01 G2 app boots + `/docs/api` 200 | pending |
| W01 G3 migrate + seed(23 OpCos + admin) | pending |
| AUTH(Entra guard,真實曝露前必做) | pending |

## 12. 行為規範 checklist(最易犯)
- **必做**:繁中回覆(§11)· pre-doc gate(R1)· 掂 H1-H6 第一句 STOP · SKU 用 `skuId` 唔靠名 · assign 前過 `azureSyncedAt` sync gate · UI 用 token 唔 eyeball(跑 `ui-design` skill)。
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
- **幾時更新**:phase closeout doc-sync(§10 volatile 座標)· 加 component / open question resolved / ADR Accept / timeline 變。
- **Update history**:

| Date | Change |
|---|---|
| 2026-07-09 | Initial — 由 template 實例化(monorepo + H6 + W01 座標) |

**Companion**:`SESSION_SUMMARY.md`(slim hook 注入)· `compact-session.md`(session 結尾)。
