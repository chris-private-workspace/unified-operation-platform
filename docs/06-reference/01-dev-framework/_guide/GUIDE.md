# AI-協作開發框架 — 總指引

> 一套為「人 + AI coding agent(Claude Code / Cursor / Codex 類)長期協作」而設計的開發架構同流程。
> 抽取自一個真實運行超過 100 個 sprint phase 的項目,去除業務內容,只留可複用嘅方法論外殼。

---

## 0. 呢套框架解決咩問題

AI coding agent 生產力好高,但有幾個結構性痛點,喺長期項目上會累積成災難:

| 痛點 | 冇框架時嘅後果 | 本框架嘅對策 |
|---|---|---|
| **AI 每個 session 失憶** | 每次重新解釋項目背景、慣例、決定,重複又唔一致 | `CLAUDE.md`(standing instructions)+ Memory 系統 + session-start protocol |
| **AI 跳入 implementation 冇 plan** | 工作零碎、冇 traceability、改到唔應該改嘅嘢 | 三軌工作流(Phase / Change / Bug)+ pre-implementation doc gate |
| **AI 擅自做架構決定** | Vendor 亂換、scope 蔓延、Tier 邊界破 | Hard Constraints(STOP-and-ask)+ ADR 流程 |
| **決定冇記錄,重複 relitigate** | 三個月後冇人記得點解噉揀 | ADR(Architecture Decision Record)+ Decision registers |
| **pending 工作散落各處** | 唔知有咩未做、下一步揀咩 | 中央 BACKLOG dashboard |
| **踩過嘅坑再踩** | 同一個環境/工具陷阱一錯再錯 | Memory(feedback / project 類)+ anti-pattern skill |

**核心理念**:把「一個資深工程師 onboard 新人時會講嘅所有嘢」——項目慣例、紅線、流程、踩過嘅坑——**固化成 AI 每次都會讀嘅結構化文件**,令 AI 由「聰明但失憶嘅實習生」變成「有項目記憶、守紀律嘅協作者」。

---

## 1. 設計哲學(4 條貫穿全套嘅原則)

### 1.1 Single Source of Truth(單一事實來源)
每一類資訊只有一個權威來源,其他地方只 **link** 唔 **複製**。例:pending 工作睇 `BACKLOG.md`、流程睇 `PROCESS.md`、架構決定睇 `adr/`。複製 = 必然 stale。

### 1.2 Index 層 vs Detail 層分離
高頻查閱嘅入口(`CLAUDE.md`、`BACKLOG.md`、`MEMORY.md`)保持精簡,只做 routing/index;細節落到專門文件。`CLAUDE.md` 唔重複任何 spec 內容,只講「幾時去讀邊份文件」。

### 1.3 Pre-Implementation Gate(先文件,後 code)
任何非 trivial 嘅工作,**開始寫 code 之前必須有對應嘅 approved 文件**(plan / spec / report)。冇文件 → STOP and ask。呢條係防止 AI「衝動實作」嘅最重要一道閘。

### 1.4 STOP-and-Ask on Hard Constraints(紅線即停)
架構級、vendor 級、scope 級嘅改動係「硬約束」,AI 遇到必須停低問人,唔可以自作主張。呢啲決定一旦要改,必須寫 ADR 留低記錄。

> 呢 4 條同一套通用嘅 coding mindset(想清先寫 / 最少 code / 精準改動 / 定義成功標準先 loop)並行,詳見 `skeleton/CLAUDE.md §1 Behavioral Baseline`。

---

## 2. 六大組件全景圖

```
                     ┌──────────────────────────────────────────┐
                     │          專案根目錄(repo root)          │
                     │                                          │
   [1] CLAUDE.md ────┤  AI standing instructions                │
                     │  (身分卡 / routing / hard constraints /   │
                     │   conventions / self-verification)        │
                     │                                          │
   [6] AI 協作輔助 ──┤  .claude/(commands / skills / hooks)     │
                     │  README.md / AGENTS.md(其他 agent)       │
                     └──────────────┬───────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
      [2] Memory 系統         [3] docs/ 分層         (原始碼 / 測試)
      (repo 外,per-project)   ├── 01-planning ◄── [4] 三軌工作流
      MEMORY.md 索引          │   ├── PROCESS.md        (Phase/Change/Bug)
      + {type}_{slug}.md      │   ├── BACKLOG.md   ◄── [6] 中央 dashboard
                              │   ├── *_REGISTER.md     (deferred/risk)
                              │   └── _templates/       (plan/spec/report)
                              ├── 02-architecture       (spec / catalog)
                              ├── 03-implementation     (CH-/BUG- 實例)
                              ├── … (04-11)
                              ├── 12-ai-assistant       (session-start)
                              └── adr/            ◄── [5] ADR 系統
                                  ├── README.md         (決定 index)
                                  └── NNNN-*.md
```

| # | 組件 | 檔案 / 位置 | 一句話作用 |
|---|---|---|---|
| 1 | **CLAUDE.md** | repo 根 | AI 每 session 必讀嘅 standing instructions |
| 2 | **Memory 系統** | `~/.claude/projects/<proj>/memory/` | 跨 session 持久記憶(踩過嘅坑 / 用戶偏好 / 項目狀態) |
| 3 | **docs/ 分層** | repo `docs/` | 13 層各司其職嘅文件架構 |
| 4 | **三軌工作流** | `docs/01-planning/PROCESS.md` | Phase / Change / Bug 三種任務嘅 lifecycle |
| 5 | **ADR 系統** | `docs/adr/` | 架構決定嘅不可變記錄 |
| 6 | **AI 協作輔助** | `BACKLOG.md` / registers / `.claude/` | dashboard、registers、slash commands、hooks、skills |

---

## 3. 組件一:CLAUDE.md — AI Standing Instructions

**係咩**:AI coding agent 每個 session 開始必讀嘅「項目憲法」。所有其他行為都服從佢。

**點解重要**:AI 冇長期記憶。`CLAUDE.md` 就係「每次都會重新載入嘅長期記憶」。寫得好 = AI 由 session 1 就守項目紀律;寫得差(或者太長塞太多細節)= AI 忽略或者失焦。

### 3.1 骨架結構(對應 `skeleton/CLAUDE.md`)

| 節 | 內容 | 設計要點 |
|---|---|---|
| **§0 Quick Identity Check** | 一個表:項目名 / 主 spec / 當前階段 / decision owner / 模式 | 30 秒讀完就知「我喺邊、聽邊個」 |
| **§1 Behavioral Baseline** | 通用 coding mindset(想清先寫 / 最少 code / 精準改動 / 目標驅動) | 普世適用,唔關項目內容;優先級僅次於 hard constraints |
| **§2 Document Routing** | 一個表:「當你要做 X → 必讀邊份文件」 | **CLAUDE.md 唔重複 spec,只做 routing**。呢個係 index 層嘅精髓 |
| **§3 Coding Conventions** | 語言 / 命名 / 測試 / linter 慣例 | 具體到可執行(唔係「寫好 code」噉空泛) |
| **§4 Git & Workflow** | branch 命名 / commit 格式 / PR 規則 / 絕不 touch 嘅檔案 | |
| **§5 Hard Constraints** | H1-Hn 紅線 + 每條嘅 STOP-and-ask trigger | **本框架最核心嘅一節**,見 §3.2 |
| **§6 ADR Format** | 架構決定點寫 | 指去組件五 |
| **§7-§9** | 外部參考規則 / open questions / sprint awareness | 按項目需要 |
| **§10 Phase Planning Workflow** | 指去 `PROCESS.md` + binding rules R1-Rn | 指去組件四 |
| **§11 Output Conventions** | 回覆語言 / 格式 / 幾時 surface 決定 | |
| **§12 Self-Verification** | task done 之前嘅 checklist | 見 §3.3 |
| **§13 When in Doubt** | 一個表:各種模糊情況嘅 default 行為 | 把「唔確定就問」變成可查嘅表 |
| **§14 Update This File** | 呢份文件點演化 | |
| **Appendix Quick Reference Card** | 一頁 print 出嚟貼 monitor 嘅精華卡 | |

### 3.2 Hard Constraints —— 整套框架嘅安全閥

Hard Constraint = 「AI violate 咗即係搞爛項目」嘅紅線。遇到必須 **第一句就 STOP and explain**,唔可以自作主張。

**通用 constraint menu**(揀啱你項目嘅,唔使七條都要):

| 代號 | 通用 constraint | 幾時觸發 STOP | 適用項目類型 |
|---|---|---|---|
| **架構變更** | 改 spec 核心 component / storage layout / 資料模型 | 任何郁到已 lock 嘅架構決定 | 所有 |
| **Vendor / 依賴鎖定** | 技術棧已 lock,加新 dependency 或換 vendor | 想 `pip install` / `npm i` 一個新 runtime dep | 所有 |
| **Scope / Tier 邊界** | 有明確 in-scope / out-of-scope,唔可以「順手做埋」 | 想加超出當前 tier 嘅 feature | 有分階段嘅項目 |
| **安全 / 隱私** | 唔 log secret / PII、唔 hardcode credential | 任何涉及敏感資料 | 所有(尤其企業) |
| **測試覆蓋** | 指定 module 寫 code 必須同步寫 test | 改到 critical path 冇 test | 有品質要求嘅項目 |
| **外部參考只讀** | 某啲 reference code 只可睇唔可 copy(license) | 想 copy-paste 第三方 code | 有 reference 依賴 |
| **設計還原度** | UI 必須 100% 還原 design mockup,唔可以「大概模仿」 | implementation 同 mockup 唔對齊 | 有高保真設計稿嘅前端 |

**設計要點**:
- 每條 constraint 要有**明確定義**(咩算 violate、咩唔算)+ **Required behavior**(STOP → explain → 等 approval → 寫 ADR)。
- 唔好貪多。3-5 條真正守得住嘅 constraint,勝過 10 條 AI 會忽略嘅。
- Constraint 可以隨項目成熟度升級(例:一開始係「建議」,反覆違反後升做 hard constraint)。

### 3.3 Self-Verification Checklist(§12)
每個 task done 之前 AI 自己走一次:對應邊個 spec section?有冇 violate hard constraint?每行改動 trace 得返 request?test 寫咗?commit message 啱格式?ADR 寫咗(若架構改動)?—— 把「驗收標準」變成 AI 可自查嘅 gate。

---

## 4. 組件二:Memory 系統 —— 跨 Session 持久記憶

**係咩**:一個 repo 外(per-project)嘅檔案式記憶庫,每個 memory 係一個檔,存一個「唔應該再解釋第二次」嘅事實。

**點解 repo 外**:memory 記嘅係「協作過程」嘅嘢(踩過嘅環境坑、用戶糾正過嘅做法、項目當前狀態),唔係 codebase 一部分,唔應該入 git。位置慣例:`~/.claude/projects/<project-slug>/memory/`。

### 4.1 結構
```
memory/
├── MEMORY.md              ← 索引:每個 memory 一行(標題 + 一句 hook)
├── {type}_{slug}.md       ← 一個檔一個事實
└── ...
```

每個 memory 檔有 frontmatter:
```markdown
---
name: <short-kebab-slug>
description: <一句摘要 — 用嚟判斷相關性>
metadata:
  type: user | feedback | project | reference | principle
---

<事實本體。feedback/project 類跟埋 **Why:** + **How to apply:** 兩行。>
<用 [[其他-memory-name]] link 相關記憶。>
```

### 4.2 五類 memory(type)

| type | 記咩 | 例 |
|---|---|---|
| **user** | 用戶係邊個(角色 / 專長 / 偏好) | 「用戶係技術 lead,偏好簡潔回覆」 |
| **feedback** | 用戶畀過嘅工作指引(糾正或確認),含 why | 「回覆要中文為主 — 因為…」 |
| **project** | 進行中嘅工作 / 目標 / 約束(code 同 git 睇唔到嘅) | 「X 功能 blocked 喺外部 credential」 |
| **reference** | 外部資源指針(URL / dashboard / ticket) | 「監控 dashboard 喺 <url>」 |
| **principle** | 項目確立嘅根本準則(北極星) | 「還原度優先於美觀」 |

### 4.3 紀律(避免 memory 腐化)
- **一個檔一個事實**,唔好塞。
- **存之前查重**:已有相近檔就更新,唔好開新;發現錯咗就刪。
- **唔好存 code / git 已記錄嘅嘢**(架構、過往修復、CLAUDE.md 內容)。要存就存「當中邊樣係非顯而易見」。
- **相對日期轉絕對**(「上星期」→ 實際日期)。
- 寫完 memory 檔,喺 `MEMORY.md` 加一行指針(`- [標題](file.md) — hook`)。

> `skeleton/MEMORY.seed.md` 有可直接用嘅索引種子 + 完整格式範例。

---

## 5. 組件三:docs/ 13 層分層架構

**係咩**:一套按「文件生命週期 + 讀者」分好嘅 `docs/` 資料夾結構。每層職責單一,唔溝亂。

| 層 | 名 | 作用 | 主要住客 |
|---|---|---|---|
| **01** | planning | 規劃中樞 | `PROCESS.md` / `BACKLOG.md` / registers / `_templates/` / phase folders |
| **02** | architecture | 架構真理 | 主 spec / component catalog / 架構分析 / audit |
| **03** | implementation | 改動 & 修復實例 | `changes/CH-NNN/` / `bugs/BUG-NNN/` / 實作 memo |
| **04** | review | 審查記錄 | code review / security review 產出 |
| **05** | usage | 內部使用文檔 | 開發者/操作者角度嘅 how-to |
| **06** | reference | 參考素材 | sample 檔 / playbook / 樣板工作流 |
| **07** | skills | 項目專屬 AI skill 說明 | anti-pattern checklist 等 |
| **08** | user-guide | 終端用戶手冊 | 操作 / 配置 / troubleshooting(對外) |
| **09** | analysis | 深度分析報告 | 一次性調查 / deep-research 產出 |
| **10** | development-log | 開發日誌 | daily / weekly log |
| **11** | env-resources-detail | 環境資源細節 | 雲端資源 / 憑證位置(唔含 secret) |
| **12** | ai-assistant | AI 協作素材 | `01-prompts/session-start.md` 等 |
| **adr** | — | 架構決定記錄 | `README.md` index + `NNNN-*.md` |

**設計要點**:
- 用 `NN-` 數字前綴 → 資料夾按重要性/生命週期排序,一眼睇到規劃(01)喺最前、AI 素材(12)喺後。
- 唔使一開始 13 層都填滿。空層留 `README.md` 講明「呢層放咩」就得,有需要先入住。
- **planning(01) 同 implementation(03) 係日常最高頻**;architecture(02)同 adr 係決定沉澱;其餘按需。

---

## 6. 組件四:三軌工作流(PROCESS.md)

**係咩**:把所有開發工作分成三種 task type,每種有唔同嘅 lifecycle 同 pre-doc gate。核心係 **AI 收到任務先分類,再開對應文件,先至寫 code**。

### 6.1 分類決策樹
```
incoming task
   ├─ 符合當前 phase plan 嘅 deliverable?         → Phase 工作流
   ├─ 改現有 feature 行為(非 bug)+ scope < 3 日? → Change 工作流
   ├─ 修錯咗 / 壞咗 / regressed 嘅行為?           → Bug-fix 工作流
   └─ trivial(typo / 單行 / <30 分鐘)?           → 直接 commit,免文件
```

### 6.2 三軌對照

| | **Phase / Sprint** | **Change** | **Bug-fix** |
|---|---|---|---|
| 用嚟做 | 多日新功能 / sprint | 改現有行為(<3 日) | 修不正確行為 |
| 資料夾 | `01-planning/W{NN}-{name}/` | `03-implementation/changes/CH-{NNN}-{name}/` | `03-implementation/bugs/BUG-{NNN}-{name}/` |
| Pre-doc(gate) | `plan.md` + `checklist.md` | `spec.md`(approved) | `report.md`(triaged) |
| 其他檔 | `progress.md` | `checklist.md` / `progress.md` | `checklist.md` / `progress.md` / `postmortem.md`(嚴重必寫) |
| ID | W{NN} 對應 sprint | CH-NNN 全項目遞增 | BUG-NNN 全項目遞增 |

### 6.3 Pre-Implementation Gate(最重要一條)
> **冇對應 approved 文件,唔可以開始 code。** AI 收到任務要:①分類 → ②向用戶提出「我判斷呢個係 X,建議走 X 工作流,即先準備 plan/spec/report,OK?」 → ③等用戶 confirm → ④開文件 → ⑤先寫 code。

呢個 gate 就係防止「AI 一句話就衝去改 20 個檔」嘅根本機制。

### 6.4 Binding Rules（R1-Rn，process-level 硬規則）
- **R1** — Pre-implementation doc 必須存在(冇 → STOP)
- **R2** — 每日 commit 對應 `progress.md` Day-N entry
- **R3** — Plan/spec deviation 必須 log 入 changelog,唔可以 silent drift
- **R4** — Open question resolved → 同步更新對應文件 + progress
- **R5** — 架構級決定 → 必寫 ADR
- **R6**(進階)— active-flip 前做 grep 驗證,連 plan 文字本身都要驗
- **R7** — pending 工作嘅識別/進度變動必須反映喺 `BACKLOG.md`

> 完整 lifecycle、anti-pattern、template 全部喺 `skeleton/docs/01-planning/PROCESS.md`。

---

## 7. 組件五:ADR 系統(架構決定記錄)

**係咩**:每個「架構級 / vendor 級 / 唔可逆」嘅決定,寫一份不可變記錄。答未來嘅「點解當初噉揀」。

**格式**(見 `skeleton/docs/adr/0000-TEMPLATE.md`):`Context`(咩觸發)→ `Decision`(做咩)→ `Alternatives Considered`(睇過咩、點解 reject)→ `Consequences`(正/負/中性)→ `References`。

**慣例**:
- 檔名 `NNNN-short-kebab-title.md`,NNNN 4 位遞增。
- `adr/README.md` 維護一個 index table(ADR / 標題 / 狀態 / 來源)。
- Status:`Proposed` → `Accepted` → `Superseded by ADR-MMMM`。
- **一旦 Accepted 就唔改內容**;要推翻就寫新 ADR supersede 舊嗰個。

**同 Hard Constraints 嘅關係**:Hard Constraint 觸發 STOP → 用戶 approve 改動 → **就係喺呢一刻寫 ADR**。ADR 係架構紅線嘅「解鎖記錄」。

---

## 8. 組件六:AI 協作輔助設施

### 8.1 BACKLOG.md — 中央 pending dashboard
所有 pending / next-candidate 工作嘅**單一入口**。AI 或用戶想知「而家有咩可以做」→ 第一站。
- **只做 index**:每行「任務 / 狀態 / 阻塞 / 來源 link」,細節唔複製。
- 狀態 lifecycle:`候選` → `已規劃` → `進行中` → `完成` / `defer` / `blocked`。
- 按「可開工性」分區(可立即開工 / 已設計暫緩 / blocked 外部 / 已實證 defer / 持續技術債 / out-of-scope)。
- 同步係 binding(對應 PROCESS R7)。

### 8.2 Decision Registers
- **DEFERRED_REGISTER.md** — 反覆/結構性「暫時唔做」嘅決定 + 恢復條件。防止同一個 defer 決定重複 relitigate。
- **RISK_REGISTER.md** — living 風險登記(風險 / 可能性 / 影響 / 緩解 / 狀態)。

### 8.3 Session-Start Protocol
`docs/12-ai-assistant/01-prompts/session-start.md` + `CLAUDE.md §10` 定義 AI 每 session 起手要做嘅固定步驟:讀 CLAUDE.md → 讀 active phase 三件套 → 睇 git 狀態 → 有疑問先問,先至回覆用戶第一句。確保每個 session 一致地 warm-up。

### 8.4 `.claude/` 本機工具(可選,錦上添花)
- **commands/** — slash command(例:`/restart` 一鍵重啟全棧、`/preflight` health check)。
- **skills/** — 項目專屬 checklist(例:commit 前掃一次反模式)。
- **hooks** — SessionStart 自動注入當前狀態摘要;UserPromptSubmit 注入紀律提醒。
- 呢層通常唔入 git(機器相關),但可以 documented 落 memory 等下個 session 知點用。

---

## 9. 兩個貫穿全套嘅隱形機制

### 9.1 決定嘅生命週期(一個決定點樣流過成套系統)
```
用戶提出 / AI 識別
   → (若架構級) Hard Constraint STOP-and-ask     [CLAUDE.md §5]
   → 用戶 approve
   → 寫 ADR 記錄                                   [adr/]
   → 更新受影響 spec / component catalog           [02-architecture]
   → BACKLOG 加/改對應項                            [BACKLOG.md]
   → 開 phase/change/bug 文件實作                   [PROCESS.md 三軌]
   → 非顯而易見嘅教訓 → 寫 memory                   [Memory 系統]
```

### 9.2 資訊嘅新鮮度(點防 stale)
- Index 層(CLAUDE / BACKLOG / MEMORY)只 link 唔複製 → 改一處就得。
- 每個 phase closeout 有 doc-sync 步驟 → 同步 volatile 座標。
- Registers 有明確 owner + 更新 trigger。
- 定期(季度)跑 drift check。

---

## 10. 點樣套用到新項目

見 `SETUP.md` 嘅 step-by-step。一句總結:**copy `skeleton/docs/` 做 `docs/` + copy `skeleton/CLAUDE.md` 做 `CLAUDE.md` 填身分卡 → 揀 3-5 條 hard constraint → 建 memory 索引 → 之後每個任務跑三軌工作流。**

**唔使一次過用晒**。最小可用子集:
1. `CLAUDE.md`(§0 身分卡 + §2 routing + §5 揀 3 條 constraint + §13 when in doubt)
2. `PROCESS.md` 三軌 + `_templates/`
3. `BACKLOG.md`

其餘(全 13 層 docs、registers、session-start、`.claude/` 工具)隨項目成長按需加。

---

## 11. 維護呢套框架本身
- `GUIDE.md` / `SETUP.md` / template 改動 → 當成 documentation change 處理。
- 你喺新項目用嘅過程中發現更好嘅 pattern → 反哺返呢套 framework。
- 每個組件都有自己嘅演化規則(例:PROCESS binding rule 改動要 explicit approve;routing entry 可自行加)。

---

**End of GUIDE.md**
