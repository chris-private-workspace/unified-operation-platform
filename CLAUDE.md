# CLAUDE.md — Unified Operation Platform Standing Instructions

> **AI coding agent:呢份文件係你嘅 standing instructions。每個 session 開始必須先讀,然後先做任何嘢。**
> **本 instruction 採用 Strict Mode**:架構決定一旦 lock 就唔可以單方面改,凡涉及 architectural change 必須 STOP and confirm。

---

## 0. Quick Identity Check(每 session 開始 30 秒讀)

| 項目 | Value |
|---|---|
| Project | **Unified Operation Platform** — IT operation / support 的管理 + 操作平台(逐步引入 AI 功能) |
| Primary Spec(platform) | `docs/architecture.md`(平台級,draft) |
| Module 1 Spec | `docs/02-architecture/licenseops/DESIGN.md`(**LicenseOps** = M365 license 履行,決策 SSOT) |
| Phase | **W44(Azure DEV 部署,卡 B8/B9)+ W45(assign 過程可見性,ADR-0029 —— 實作收晒,淨低 live 驗卡同一個 B8)兩個同時未收**(2026-08-10);pending 真相 SSOT = `BACKLOG.md`,呢格只寫最近一個座標 |
| Strict Mode | **ON** — see §5 Hard Constraints |
| Behavioral Baseline | **§1** — universal coding mindset,適用於所有 code change |
| Decision Owner(architecture) | **Chris Lai** |
| Decision Owner(scope / business) | **Chris Lai** |

---

## 1. Behavioral Baseline(Karpathy Guidelines - universal coding mindset)

> 適用於**所有** code change / review / refactor,與 §2 以下 project rule 並行,優先級僅次於 §5 Hard Constraints。
> Trivial task 可用 judgment,non-trivial task 必須跟。

### 1.1 Think Before Coding — 想清先寫
- 把 assumption 明確講出嚟;唔肯定就問,唔好估。
- 有多種詮釋 → 全部 present,唔好默默揀一個。
- 有更簡單做法 → 講出嚟,有需要 push back。
- 唔清楚就 STOP,講明邊度唔清楚,然後問。

### 1.2 Simplicity First — 最少 code 解決問題
- 唔加未要求嘅 feature / abstraction / 「flexibility」。
- 唔處理冇可能發生嘅 error scenario。
- 自我檢查:「senior engineer 會唔會話呢段 over-engineered?」答 yes 就簡化。

### 1.3 Surgical Changes — 精準改動,只清自己嘅 mess
- 唔「順手」改 adjacent code / comment / formatting。
- 唔 refactor 冇 break 嘅嘢;match existing style。
- 見到無關 dead code → mention,但唔好刪。
- 你嘅改動製造嘅 orphan(unused import / var)→ 要刪。
- 驗證標準:**每一行改動都 trace 得返用戶嘅 request**。

### 1.4 Goal-Driven Execution — 定義成功標準,loop 到 verify 為止
- 把 task 轉做 verifiable goal(「加 validation」→「寫 test for invalid input,make them pass」)。
- Multi-step task 先講 plan:`1. [step] → verify: [check]`。
- Strong success criteria 等你可以獨立 loop,唔使用戶不斷 clarify。

---

## 2. Document Routing(when to read what)

> **呢份 CLAUDE.md 唔重複任何 spec 內容。** 要做嘢就跟以下 routing 去搵 source of truth。

| 情況 | 必讀文件 |
|---|---|
| 想知有咩 pending / 揀下一個 task | `docs/01-planning/BACKLOG.md` |
| 平台級架構 / 定位 / 四層地基 / locked stack | `docs/architecture.md` |
| LicenseOps 業務決策(定位 / scope / 對帳 / domain model / request 生命週期) | `docs/02-architecture/licenseops/DESIGN.md`(**決策 SSOT**) |
| Domain model 真相(Prisma schema) | `prisma/schema.prisma` |
| Multi-day phase / sprint work | `docs/01-planning/PROCESS.md §2` + active phase folder |
| Change to existing feature(<3 日) | `docs/01-planning/PROCESS.md §3` + new `docs/03-implementation/changes/CH-{NNN}-{kebab}/` |
| Bug-fix | `docs/01-planning/PROCESS.md §4` + new `docs/03-implementation/bugs/BUG-{NNN}-{kebab}/` |
| 改架構 / 違反 §5 設計 | **STOP** — 先確認(H1)+ 寫 ADR `docs/adr/` |
| 加 vendor / dependency / 換 component | **STOP** — 先確認(H2)+ 寫 ADR |
| 寫 / 改 backend feature(Graph / ServiceNow 整合) | `docs/05-usage/INTEGRATION_SETUP.md` + `src/integration/` |
| 寫 / 改 frontend / UI(LicenseOps) | `docs/02-architecture/design-system.md`(**設計系統 SSOT** + anti-drift)→ 視覺真相 `design_handoff_licenseops/` → commit 前跑 `ui-design` skill(見 §5 H6、§7) |
| 寫 / 改 API endpoint | OpenAPI(`apps/api` 的 `main.ts` DocumentBuilder;runtime UI `/docs/api`) |
| 寫 eval / test | `docs/01-planning/PROCESS.md` + §3.4(H5 覆蓋規則) |
| Risk-related decision | `docs/01-planning/RISK_REGISTER.md` |
| 反覆「暫時唔做」嘅決定 | `docs/01-planning/DEFERRED_REGISTER.md` |

**Default**:唔確定 task 屬邊個 doc 範圍 → **ask before guessing**。

---

## 3. Coding Conventions

### 3.1 Backend(NestJS / TypeScript)
- **Runtime**:Node 20+(ServiceNow client 用 global `fetch`)。TypeScript strict。
- **結構**:modular monolith;每個 feature = 一個 Nest module(`*.module.ts` / `*.service.ts` / `*.controller.ts` / `dto/`)。Module 邊界對齊四層地基(見 `docs/architecture.md`)。
- **DI**:constructor injection;唔用 service locator。Config 一律經 `ConfigService.getOrThrow(...)`,唔直接讀 `process.env`。
- **Data layer**:Prisma;`prisma/schema.prisma` = domain model 真相。DB 改動一律經 migration(唔手改 DB)。
- **Vendor SDK 只准喺 `src/integration/`**;domain / orchestration 層唔可以直接 import Graph / ServiceNow SDK。
- **DTO validation**:class-validator + global `ValidationPipe({ whitelist: true, transform: true })`(已喺 `main.ts`)。
- **Logging**:Nest `Logger`,唔用 `console.log`;**絕不** log secret / PII(見 §5 H4)。

### 3.2 Frontend(React + Vite + TypeScript + Tailwind + shadcn/ui)— 落 `apps/web`(ADR-0001)
- **設計系統契約**:`docs/02-architecture/design-system.md` = SSOT;`design_handoff_licenseops/` = 視覺真相。**唔可以 eyeball / hardcode 色值** —— 一律用 token(見 §5 H6)。
- **Token**:原封引入 `design_handoff_licenseops/design-system/tokens/*.css`,Tailwind theme 只**引用 CSS var**(`accent:'var(--accent)'` …),唔複製 hex。`darkMode:'class'`(`.dark` 掛 root)。
- **元件**:shadcn/ui 做底,re-skin 成 handoff token;handoff 個 19 個 `.jsx` reference 當 **spec**(唔照抄 inline-style 版),重建到視覺 1:1。
- **State**:server state = TanStack Query(對 NestJS OpenAPI);UI state = Zustand(theme / role / sidebar / filters …)。Routing:每畫面一 route。
- **Icon**:`lucide-react`(stroke-only);**Fonts**:Geist + Geist Mono;**數字 / 識別碼一律 mono**。一個 view **一個** primary action(Ricoh red `#E60027`)。

### 3.3 共通 Naming
- Classes `PascalCase`;vars / methods `camelCase`;檔名 kebab(Nest 慣例 `*.service.ts`)。
- Env vars `SCREAMING_SNAKE_CASE`。Prisma model `PascalCase` / field `camelCase`。
- SKU 一律以 `skuId`(GUID)為主鍵,唔靠名(見 module spec §5)。
- **Comments**:解釋 **why**,唔係 **what**。
- **TODO format**:`// TODO(<owner>): <description>`。
- **絕不 commit**:secret / API key / PII / `.env` 內容。

### 3.4 測試(H5)
- 框架:Jest(Nest 預設),unit + e2e。Graph / ServiceNow **一律 mock**,唔打真 tenant。
- 掂到 critical path(assign / ledger 更新 / 對帳)嘅 code 必須同步寫 test(見 §5 H5)。

---

## 4. Git & Workflow Conventions

> Repo 已連 GitHub remote:`origin` = `https://github.com/chris-private-workspace/unified-operation-platform.git`(**PRIVATE**;branch `main`)。守 §5 H4:即使 private 都唔好 commit 真實 secret / credential。

### 4.1 Branch naming
```
main                          ← protected,永遠 deployable
feat/<area>-<short-desc>      fix/<area>-<short-desc>
chore/<short-desc>            docs/<short-desc>
adr/<adr-number>-<short>
```

### 4.2 Commit message(Conventional Commits)
`<type>(<scope>): <description>` — types:`feat` / `fix` / `chore` / `docs` / `refactor` / `test` / `perf` / `style`。
Scope:模組名(`integration` / `license` / `fulfilment` / `prisma` / `claude-md` …)。

### 4.3 PR Rules
- One feature per PR。PR description:link spec section / list test scenario /(前端)screenshots。
- Pre-merge:tests pass / coverage 不降 / no linter warning / ADR updated(若架構改動)。

### 4.4 絕不 touch
- `.git/`、`.env*`、任何含 credential 嘅檔。
- `design_handoff_licenseops/`(read-only 設計參考 — 只可 read / recreate,唔可以 port runtime,見 §7)。
- 主 spec / module spec 嘅 content-locked section(只有 owner approve 後先 increment version)。

---

## 5. Hard Constraints(Strict Mode)

> 呢啲 constraint **violate 即係 broken project**。遇到以下情況**必須 STOP and ask**(第一句就講)。

### 5.1 H1 — Architectural Change Constraint

**定義**:任何符合其一 —— 改平台四層地基 / module 邊界;改 vendor / service;改 storage layout / 資料模型 / Prisma schema;動到 module spec 已 lock 嘅決策(對帳方案甲、`skuId` 主鍵、ledger 兩層數字 `allocatedQuantity`/`assignedQuantity`、stage 掛 line item、`azureSyncedAt` sync gate)。

**Required behavior**:①**STOP** 寫 code → ②chat 講明:想做咩架構改動 / 點解現 spec 唔啱 / proposed 替代 → ③等「approved + write ADR」→ ④寫 ADR 入 `docs/adr/`。

**唔屬架構改動(可自行做)**:bug fix / 內部 refactor 冇改 interface / 加 internal helper / 加 test / 加 logging。

### 5.2 H2 — Vendor / Dependency Constraint

**定義**:技術棧已 lock(下表)。加新 runtime dependency 或換 vendor = 觸發。

| Layer | Locked |
|---|---|
| 後端 | NestJS(modular monolith)· TypeScript · Node 20+ |
| DB | PostgreSQL + Prisma |
| 背景工作 | Redis + BullMQ · 排程 `@nestjs/schedule` |
| 對外 API | REST + OpenAPI(NestJS Swagger) |
| Auth | Entra ID SSO + app roles(未建) |
| 前端 | React + Vite + TypeScript + Tailwind + shadcn/ui(落 `apps/web`,ADR-0001) |
| Monorepo | `apps/api`(NestJS)+ `apps/web`(React)（ADR-0001) |
| 部署 | Docker Compose(app + postgres + redis) |
| Integration vendors | Microsoft Graph、ServiceNow Table API、(future)n8n |

**唯一合法路徑**:STOP → 解釋點解現 stack 唔夠 → 等 approval → 寫 ADR。
**例外(可自行加)**:pure utility lib / type stub / dev dependency(test / linter / formatter)。

### 5.3 H3 — Scope / Tier Constraint

**定義**:有明確 in / out-of-scope,唔可以「順手做埋」。兩個層面:
- **平台層**:LicenseOps = **模組一**。其他 IT ops 模組(offboarding / cost insights / D365 / 其他 support 工作流)**未 approve 前唔起**。
- **LicenseOps 模組**(module spec §1-2 刻意排除):ticket 申請表單 / 審批鏈 / SLA 管理 / service catalog / 把 CMDB 當 source of truth / 成本發票金額(→ DocuWare,只記 `quoteRef`/`poRef`)/ offboarding·license 回收 / D365 / 非 onboarding 的獨立 license request。

**Required behavior**:想加超出當前 scope / tier 嘅 feature → **STOP**,講清楚屬邊個未來 tier,等 approval。模糊 → default out-of-scope,ask。

### 5.4 H4 — Security / Privacy Constraint

- **絕不 log / commit**:Entra `GRAPH_CLIENT_SECRET`、ServiceNow 帳密、`DATABASE_URL`、任何 connection string / token。
- **絕不 hard-code**:tenant id / client id / secret / instance URL —— 一律 from env(`ConfigService`)。
- **PII 謹慎**:user UPN / email / displayName 唔好 log 落 plaintext file;debug log 用完即清。
- 掂到敏感資料嘅改動 = 高度小心,唔確定就 STOP。

### 5.5 H5 — Test Coverage Constraint

**定義**:critical path module 寫 code 必須同步寫 test。Critical path = license `assignLicense`、ledger `assignedQuantity` 更新、SKU 總量層對帳 / drift 偵測、request stage 推進 / sync gate。
**Required behavior**:改到上述 path 冇對應 test → task 未完;Graph / ServiceNow 一律 mock(§3.4)。

### 5.6 H6 — Design Fidelity Constraint(前端專用)

**定義**:LicenseOps 前端(`apps/web`)必須忠實還原 `design_handoff_licenseops/` 嘅 hifi 設計。以下屬 violate:
- **hardcode 色 / 字 / 間距 / 半徑 / 陰影值**(唔用 `design-system/tokens/*` 嘅 CSS var / Tailwind token)。
- **eyeball** token(憑感覺調數值,唔查 `tokens/*.css` 實際值)。
- 引入 handoff 以外嘅 **accent 色 / gradient / 陰影美學 / icon set**(accent 只有 Ricoh red;icon 只有 lucide stroke;唯一 gradient = login)。
- 一個 view **多過一個** primary action。
- 只做 light 或只做 dark(兩個都要）。

**Required behavior**:UI 改動 commit / 驗收前跑 `.claude/skills/ui-design` 自檢;要偏離設計(加新元件 / 新 pattern / 改 token)→ **STOP**,先同 owner 確認,必要時更新 `docs/02-architecture/design-system.md`(+ 若屬架構級 → ADR)。
**唔屬 violate**:用既有 token 砌新畫面 / 組合既有 primitive / 加 handoff 已定義嘅 state。

### 5.7 H7 — Tool Result Integrity(工具結果誠信)

**定義**:任何涉及「tool 執行 / 結果 / 驗證狀態」嘅陳述。呢條係為咗杜絕 AI agent
**腦補(fabricate)tool 結果** —— send 完 tool 冇等真 result,就自己續寫一個扮成回傳嘅
output(見 `docs/03-implementation/incidents/INC-001`)。bypass permissions mode 冇咗
「逐個 tool 彈確認」呢個天然 checkpoint,更加容易觸發,所以本條規矩寫成**可觀察行為**,
唔靠抽象自律。

**Required behavior(可觀察,唔係抽象戒條):**
1. **絕不生成任何扮 tool 輸出嘅文字。** tool result 只可以係系統真正返嘅 block。
2. **send tool 即收口**:一個 message 內一旦有 tool call,之後唔可以再有任何文字 —— 到此
   為止,等真 result 返先繼續。
3. **結果類陳述必 trace**:講「pass / clean / done / 200 / rendered / 綠」之前,對上必須
   有一個真 tool_result 支持;trace 唔到 → 一律寫「未驗證」。
4. **高危節點主動停(補 bypass mode 冇 permission checkpoint)**:凡「宣稱完成 / 跑
   verify(test·build·lint·render)/ 過 gate」,一個 command 一個 turn;output 淨係可以貼
   真嘅,唔可以總結成 pass;可驗證嘅優先畀用戶跑。
5. **紅旗自檢**:若發現自己「已經知道」一個仲未有 tool_result 嘅結果 —— 嗰種確定感就係
   警號,即停,真跑。

**違反 = 破壞信任,比任何功能 bug 更嚴重(見 `docs/03-implementation/incidents/INC-001`)。**

### 5.8 H8 — Tool Usage Discipline(工具使用強制紀律 · 🔴 零容忍・無例外)

> **來源** merge 事件——大量用 bash `echo`/`cat`/`grep` 拼裝命令 + `{ }` group 重定向,造成嚴重輸出污染(檔案內容重複、亂碼、語意注入),險些 commit 進損壞內容。本條同 §5.7 **H7 同源(訊息 / 工具結構紀律)**,優先級等同。

**絕對禁止(無任何例外,違反即停手改正):**

1. ❌ 用 bash/shell 跑 `cat` / `head` / `tail` / `grep` / `find` / `sed` / `awk` 讀檔或搜尋 → **一律改用 Read / Grep / Glob 工具**
2. ❌ 用 `echo` 拼裝輸出、`{ }` group 重定向、多命令混合重定向 → **只用單一命令直接重定向** `cmd > file`,再用 **Read 工具**讀
3. ❌ 靠 bash 即時 stdout 判斷結果 → **寫檔後用 Read 工具讀**

**bash/shell 唯一正當用途**:執行**無專用工具替代**的操作(git、npm、其他 CLI),輸出到檔案時**只用單一命令直接重定向、絕不混 echo**。此為正當用途,非漏洞——禁嘅是「有替代卻用 bash」,唔係「用 bash」本身。

**這不是「避免」,是「禁止」。** 本區優先級等同 §5.7 H7(訊息 / 工具結構紀律同源)。

---

## 6. Architecture Decision Record (ADR) Format

違反 §5 嘅改動,approval 後必須寫 ADR。Format 見 `docs/adr/0000-TEMPLATE.md`:`Context → Decision → Alternatives Considered → Consequences → References`。
- 檔位 `docs/adr/NNNN-short-title.md`(NNNN 4-digit),index 喺 `docs/adr/README.md`。
- Status:`Proposed → Accepted → Superseded by ADR-MMMM`。Accepted 唔改內容,要推翻寫新 ADR。

---

## 7. External References — 設計 handoff(read-only)

`design_handoff_licenseops/` 係 LicenseOps 嘅 **hifi 設計參考**(HTML prototype + framework-agnostic design system),= 前端**視覺真相**;可操作契約 + anti-drift 喺 `docs/02-architecture/design-system.md`(SSOT)。
- **只讀 / recreate,唔可以 port 佢個 `.dc.html` runtime,唔可以照 copy prototype code。**
- Token(色 / 字 / 間距)真相喺 `design-system/tokens/*` —— **唔可以 eyeball**,用實際 `--token`(見 §5 **H6**)。
- 建前端前先讀 `docs/02-architecture/design-system.md`,再 `design-system/readme.md` + `styles.css` + tokens。

---

## 8. Open Questions(影響 default behavior)

見 module spec(`docs/02-architecture/licenseops/DESIGN.md §10`)嘅 open items:成本可見度、`isBaseLicense` 去留、ServiceNow 實際 table/field、對帳「對回」機制、OpCo self-service 開放時機。
- Open → 用 spec default 繼續,commit 標「depends on OQ default」。Blocked → STOP 對應 work item,ask。

---

## 9. Sprint / Phase Awareness + 當前 build state

Rolling / JIT — 每 phase kickoff 先喺 `docs/01-planning/W{NN}-{name}/` 建 folder,見 `BACKLOG.md`。唔清楚而家喺邊個 phase → **ask user**。

**當前狀態(2026-08-10)**:

> ⚠️ 呢段**只寫粗略座標**。真相 SSOT 係 `BACKLOG.md`(工作狀態)+ `docs/adr/README.md`(架構決定)+ memory `MEMORY.md`(runtime 實況)。**唔好喺呢度累積歷史** —— 佢一過時就會令成個 session 用錯前提開始(2026-07-31 實犯:本段一直寫住「`apps/web` = placeholder、auth 未做」,而嗰陣前端同 AUTH 早就做齊)。

- 🔴 **「Azure UAT」係誤名(2026-08-04 Chris 更正)** —— W32/W33 部署嗰個**唔係企業 UAT,只係一個自建測試 Azure 環境**:自建 RG / ACR / ACA env(**冇 VNet 整合**)+ PG public,住喺 Azure 公網,**同企業網絡零連繫** ⇒ **同 n8n 兩個方向都接唔通**(inbound 冇企業 domain 入口;outbound 打唔入內網)。**呢個就係 W36–W42 一路 carry 嗰句「n8n 側零 live 驗證」嘅根本原因 —— 唔係漏做,係環境上做唔到。** 檔名 / ADR 標題**刻意保留**(改名會令 git history 永久對唔上,W36 判斷),靠 `ADR-0012` + `07-uat-as-built.md` 頂部 blockquote 更正。⚠️ **W43 亦未部署上去**。
- **真正接得通企業網絡嘅環境 = `RG-RAPO-UOP-DEV`**(infra team 2026-08-04 交付 · 企業共用 ACA env `acaen-rapo-dev` + hub VNet PE + custom domain `rapo-uop-web-dev.rci-t.com`)—— **W44 進行中,仍未部署**。**ADR-0027 Accepted**(Chris 揀 **Option A**:api ingress 收返 internal,對外只剩 web 一個 hostname;cookie / CORS / 前端**一個字唔變**)。`aca-dev.json` + gitignored params + `what-if` baseline **全部備好並驗過**(validate `Succeeded`;what-if 證零 Delete、9 個無關資源 Ignore、custom domain 保留)。
- 🟢 **B1(image build)2026-08-05 已解封** —— 靠**換一台唔喺公司網嘅 build host**(出口 IP `52.187.129.166`,Azure 段;之前四條解法全部 assume 咗「build 一定要喺公司網嗰台機做」)。兩個 image 已 build + **真 push 上 `acrrci3ailanding1`**(api `sha256:5a8d48cd…` / web `sha256:1d543670…`;之前四輪只證到 `login`)。⚠️ **唔係長期方案** —— 佢繞開公司 proxy;**解法 ①(SP 攞 registry `read`+`scheduleRun/action`)仍然最乾淨,infra 唔應該撤走**。🔴 `AcrPush` **唔包** `scheduleRun/action`。
- 🟢 **2026-08-06 已部署上 DEV**(部署 #1)—— 但**唔可以講「部署成功」**,見下面 B7。
  - **B4**:`az deployment group create` 撞 **`LinkedAuthorizationFailed`**(SP 冇 `managedEnvironments/join/action` 喺共用 env `acaen-rapo-dev`,佢住喺**另一個 RG** `RG-RAPO-ContainerAPP-DEV`;SP 實測**只有** `[Contributor] RG-RAPO-UOP-DEV`)。
  - 🟢 **繞過方法 = `az rest --method patch`,body 唔含 `environmentId`** ⇒ 唔觸發 linked auth。🔴 **`az containerapp update`/`registry set` 一樣 403** —— CLI 做 read-modify-write,連 `environmentId` 一齊送返去。**要用 raw ARM PATCH**,腳本 `deploy/azure/patch-deploy-dev.ps1`(dry-run 先印 masked body)。
  - 🟢 **PATCH 比 ARM full PUT 更安全**:唔 unset 冇送嘅 property ⇒ infra 配嘅 `customDomains`+SNI / `workloadProfileName` 結構上掂唔到(實測全部完好)。`aca-dev.json` 保留做宣告式真相,infra 一畀 `join/action` 就用得返。
  - **實測結果**:api revision `--0000002` `Healthy`/`RunningAtMaxScale` · web `--0000001` `Healthy`/`Running` · 🟢 **ACA 由 VNet 內 pull 到 `acrrci3ailanding1`**。
- 🟢🟢 **B7 已解封(infra 2026-08-06 畀咗 `managedEnvironments/read` + enable log)⇒ 三個未知數全部收齊**,container log 原文:`19 migrations found` → `The following migration(s) have been applied:` · `Seeded 24 OpCos + admin + RHK OPCO_IT user.` · `Nest application successfully started`,**零 `WARN: … failed`**。⇒ **B3(ACA 連 private endpoint PG)✅ · PG v18 migration(G8)✅ · seed ✅**。
- ⚠️ **`apps/api/docker-entrypoint.sh` 令 migrate/seed 失敗 NON-FATAL ⇒ revision `Healthy` 本身證明唔到 DB 通** —— 呢個陷阱以後仍然成立,驗證一定要睇 log 或 HTTP。
- 🟢 **B9(SSO)—— 2026-08-07 改咗設計解封,code 齊,但仍未 live 驗過**。而家行緊 **break-glass 本地登入**(`admin@uop.local`)。
  - **點解改設計**:infra 交嘅 app registration `08fa14bf-…`(tenant `d1ea071a-…`,**公司 M365 tenant**)只配咗 client-credentials,ADR-0003(MSAL SPA)要嘅三樣缺晒;而**三輪往返都攞唔到 Application ID URI**。查證揭到重點:**佢哋配嘅嘢本身就係另一條路嘅完整形狀**(client secret ✅ + redirect URI ✅ + confidential client ✅)。**Chris 2026-08-07 拍板** ⇒ **ADR-0028 Accepted**(server-side authorization code exchange,**supersedes ADR-0003**;ADR-0002 唔推翻)。
  - **而家係點行**:前端只把用戶送去 Entra + 交返個 `code`;**API 用 client secret 喺 server 側換 token** → 驗 `id_token` → upsert `AppUser` → 發**平台自己**嘅 httpOnly cookie ⇒ **SSO 同 break-glass 由呢一點開始完全一樣**(`auth.service.grantSession`)。scope 只用 `openid profile email` ⇒ **唔再需要 Application ID URI / 自訂 scope**。
  - 🔴 **配置由 build-time 變 runtime**:`VITE_ENTRA_*` **已全部消失**(vite 會烘死落 bundle)。而家四個 `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` / `ENTRA_REDIRECT_URI` 由 **API env** 讀 ⇒ **改 Entra 配置唔使重 build web image**(見 `apps/api/.env.example` 認證段)。
  - ⚠️ **兩個「紅得靜」陷阱已處理,但要記住形狀**:①guard 同 `refreshSession` 原本硬性 `authProvider:'local'` —— 唔拆嘅話 SSO 登入**睇落成功**然後每個 request 401,而錯誤指向 token 唔指向 provider 過濾(同 v1-issuer 嗰個一模一樣嘅失敗形狀)②state cookie 喺 callback **驗證之前**就清,免得失敗後 reload replay 一個用過嘅 code。
  - 🔴 **仍未做**:F9-7(PATCH 四個 env 上 DEV)+ **F9-8(驗 SSO 通 + break-glass 仍然通,兩邊都要)**。⇒ **未有任何一次真人 SSO 登入嘅證據。**
  - 🟢 可回退:`login.tsx` 本地表單永遠喺;SSO 未配置 → `GET /auth/sso/status` 返 `{enabled:false}`,個掣自動暗住。🟢 順帶:Graph app `27d329e5-…` 權限齊(`LicenseAssignment.ReadWrite.All` 等)⇒ F3-7 冇障礙。🔴 client secret **expiry 2028-07-28**(RISK R8)。
- ⚠️ **呢台機嘅 az session 唔穩定**(一日內撞過 **4 個唔同 SP**:`d2f094a3` / `a19dfe76` / `2ae44f00` / ACR 嗰個 `4a6e1474`)⇒ 錯身份會畀出**誤導性 error**。**做 az 操作一律用獨立 `AZURE_CONFIG_DIR` 登入 SP**(憑證喺 `apps/api/.env` 尾段),亦唔會踩到 operator session。
- 🔴 **B8(新)= 企業 DNS 冇我哋條記錄**。2026-08-06 由**公司網絡**實測:`rapo-n8n-uat.rci-t.com` → `10.160.71.243` ✅ 但 `rapo-uop-web-dev.rci-t.com` → **Non-existent domain** ⇒ **infra 漏咗建**,custom domain **喺企業網都訪問唔到**。⚠️ 之前嗰個「ACA 綁 custom domain 要 hostname 驗證 ⇒ DNS 應該配好咗」嘅推論**已被推翻**。
- 🔴 **B8 範圍更正(2026-08-10)——「B8 唔 block 驗證」呢句係錯,而且一直被當成事實用咗四日。** 原文寫住「由公司網絡打 ACA 預設 FQDN(internal env 喺 hub VNet private DNS **一定**有記錄)⇒ F6-4/5/6 即刻收得」。嗰個「**一定**」係**推論唔係實測**;2026-08-10 Chris 實測 **ACA 預設 FQDN 一樣訪問唔到**。查證(`az containerapp show` / `az resource show`):web ingress `external: true` **但** env `vnetConfiguration.internal = true` 而 `staticIp = **10.160.71.70**`(**私有 IP**)⇒ 個 FQDN 要靠 private DNS zone `nicesea-c3849dba.eastasia.azurecontainerapps.io` → `10.160.71.70` 先解析到,而嗰個 zone 冇 link 到企業網。⇒ **B8 唔係「custom domain 冇記錄」,係「private DNS 完全冇配」,兩個 hostname 都打唔到。**
  - 🔴 **後果**:F6-4/5/6、F9-8(真人 SSO)、**CH-022 A7** 一直寫住「隨時做得 / 即刻收得」—— 實際上**冇路**。凡見到「打 ACA FQDN 就驗到」嘅計劃,一律當未解封。
  - 💡 **繞路(未驗證,但有同網段實測支持)= hosts 檔**:`staticIp` 係 `10.160.71.70`,而上面 B8 自己記低咗公司網打 `rapo-n8n-uat.rci-t.com` → `10.160.71.243` **係通嘅** ⇒ 同一段,缺嘅淨係 DNS 一行。喺公司網嗰部機加 `10.160.71.70  rapo-uop-web-dev.rci-t.com`。**用 custom domain 唔好用 ACA FQDN** —— infra 綁咗 SNI cert 喺 custom domain,而且 `ENTRA_REDIRECT_URI` 就係佢 ⇒ 連 SSO 都用得返。
  - 📌 **方法論(第三次同一族)**:呢句同 W44 Day 3(`az acr list` vs `show`)、Day 7(`docker login` vs `push`)同源 —— **由一個相關但唔對位嘅觀察,推去一個更強嘅結論**。分別係前兩次自己撞返出嚟,呢次要用戶問「根本不能夠訪問,你不知道的嗎?」先揭穿。**推論寫入 §9 嗰刻就會變成下個 session 嘅事實**,所以 §9 入面凡係推論必須標明。
- 🔴 **仍要一次直接驗證先收尾**(row count / admin 帳號 / API 200):**最快 = 上面條 ACA FQDN**;其次 ①infra 畀 `managedEnvironments/**read**`(純唯讀)②Chris 個人帳號睇 Portal log。
- 💡 **方法論**:直接路封死唔等於冇路 —— **部署權限 / 觀測權限 / metrics 係三套嘢**,而 metrics 一直喺手上,四日冇人諗過用。詳見 `docs/13-deployment/09-dev-as-built.md`。
- 🟢 **W45(ADR-0029 assign 過程可見性)實作收晒**(2026-08-10):後端十步真回傳 `{outcome, failedAt?, steps[]}`;前端 `AssignResultDialog`(pre-flight 摺七道閘 + 三個副作用逐個 + `whoFixes`)。**light + dark 真 render 驗過。🔴 淨低 F4-4 live 驗,卡同一個 B8。**
  - 🔴 **順帶揭咗一個所有 test 層都捉唔到嘅 bug,形狀要記住**:`apiPatch` 由頭到尾 hand-roll `new ApiError(status, message)` **冇第三個參數** ⇒ error body 永遠唔會落 `ApiError.detail`(只有 `errorFrom` 會,而 `apiPatch` 從來冇用過佢)。ADR-0029 個 steps 擺喺 400 body ⇒ **喺瀏覽器永遠到唔到前端**,而 api/web test/tsc/lint **全綠** —— 因為 UI test **自己手砌 `ApiError` 連 detail**。⇒ **唔係「漏咗一條 test」,係「條 test 放錯層」**。已修 + 補 transport 層 test。⚠️ `apiGet` 一樣冇 detail(冇 caller 需要,刻意冇改)。
- **本機 runtime 避坑**:Prisma engine CDN 被公司 proxy 封(RISK R1);port 3000→Langfuse 佔用 ⇒ api 用 **3100**、5432→既有 Postgres 佔用 ⇒ docker **5433**;web **5173**。起 / 重啟一律用 `restart-stack` skill。
  - 🔴 **5433 同 `ai-doc-extraction-db` 硬衝突,只可以二揀一** —— 起 UOP 前要 `docker stop` 佢(**要 Chris 批**,係另一個項目),用完 `docker start` 還原。
  - 🔴 **`nest start --watch` 個 build-cache 假綠燈會再撞**:見到 **`Found 0 errors` 同 `MODULE_NOT_FOUND` 一齊出**,就係佢 —— 刪 `apps/api/*.tsbuildinfo` **同** `dist/`,然後**直接起 stack,中間唔可以插 `npm run build`**。⚠️ `Test-Path dist/main.js` 要喺 watch **起身之後**check 先有意義(watch 一起身就清 `dist/`,喺之前 check 會見到上一次 build 剩低嘅檔而誤判)。
  - 🔴 **本機 Graph 係通嘅** ⇒ 真跑一次成功 assign 會**喺公司 tenant 真派 licence**。要造「一定失敗」嘅 fixture,**先用唯讀 `POST /fulfilment/requests/:id/sync-check` 探**個 UPN 存唔存在 —— 2026-08-10 實測:一個砌出嚟嘅假 UPN 一樣返 `FOUND`,「個名睇落假」推論唔到「tenant 冇」。
- 🔴 **ServiceNow 寫入係逐個 table 分開開權,唔可以由「某張表寫得」推論「另一張寫得」**:`sc_request` insert **403**(BUG-010)· `sc_item_option` update **403**(ADR-0026)· `sc_req_item` / `sc_task` update ✅ · catalog `order_now` ✅。⇒ `target_user` **永遠**指住 requester,真 target 睇 `target_users_email`(DD-5)。
- 🔴 **UOP 同 n8n 共用 SN 帳號 `n8napiservice1`** ⇒ `sys_updated_by` 分唔到邊個系統做,唯一指紋係 `close_notes`(RISK **R7**)。查 SN 側「邊個做過乜」一律唔可以信 `sys_updated_by`。
- **仍未做 / pending**:見 `BACKLOG.md`(🔴 AUTH-2b 真 SSO e2e 同 DEPLOY-harden 卡住 IT app registration;W43 遺留 = live close 未驗 / 前端 light+dark 未 render 驗)。

---

## 10. Phase Planning Workflow

> Source of truth:`docs/01-planning/PROCESS.md`。

### 10.1 Per-Phase Artifacts
每 phase `docs/01-planning/W{NN}-{name}/`:`plan.md`(locked 後改要 changelog)/ `checklist.md`(daily tick)/ `progress.md`(daily + retro)。

### 10.2 Binding Rules
- **R1** — multi-day implementation 前必須有 approved pre-doc(plan/spec/report)。冇 → STOP。
- **R2** — Daily commit 對應 `progress.md` Day-N entry。
- **R3** — Plan/spec deviation 必須 log changelog,唔可以 silent drift。
- **R4** — Open question resolved → 同步更新對應文件 + progress。
- **R5** — 架構級決定 → 必寫 ADR。
- **R7** — Pending 工作變動必須反映喺 `BACKLOG.md`。

### 10.3 AI Session Start Protocol
每 session(§0 identity check 之後):①讀 `docs/12-ai-assistant/01-prompts/session-start.md`(詳版 onboarding)→ ②active phase `plan.md`(scope + acceptance)→ ③`checklist.md`(next unchecked)→ ④`progress.md` 最近 3 個 Day-N → ⑤`git status --short` + `git log --oneline -5` → ⑥唔清楚 ask。SessionStart hook 已自動注入 `SESSION_SUMMARY.md` + active phase + git;`/compact` 前用 `compact-session.md`。**Compact 後**必須 re-read ①-④。

---

## 11. Output / Communication Conventions

- **回覆語言**:**繁體中文為主**,英文只限 code identifier / 檔名 / API / commit hash / ADR 編號 / vendor 名。
- 唔好過度 disclaimer / hedging。重要決定明確 surface,唔好 bury 喺長文最後。
- Code change 說明 **what + why**,唔重複 code。引用 spec 標明 section。
- 遇到 §5 hard constraint trigger,**第一句就 STOP and explain**。

---

## 12. Self-Verification Before Marking Task Done

- [ ] 對應 spec 邊個 section?
- [ ] 有冇 violate §5 hard constraints?(有 → 未完)
- [ ] 有冇 violate §1 behavioral baseline?(每行改動 trace 得返 request?)
- [ ] Test 寫咗未?(critical path → H5)
- [ ] Linter / formatter run 過?
- [ ] Commit message follow Conventional Commits?
- [ ] 架構-adjacent 改動 → ADR 寫咗未?
- [ ] Phase checklist tick 咗?progress Day-N 寫咗?(R2)
- [ ] Pending 變動 → BACKLOG 同步咗?(R7)

---

## 13. When in Doubt(default behavior)

| 情況 | Default |
|---|---|
| Spec 同 your idea 衝突 | Spec wins,除非 explicitly raise + get approval |
| Spec 缺 detail | Ask user,don't guess |
| 兩種實作都 reasonable | 揀更接近既有 pattern 嗰個 |
| Stakeholder feedback 同 spec 衝突 | STOP — surface conflict,等 resolution |
| Scope 邊界模糊 | Default out-of-scope,ask(H3) |
| SKU 靠名定靠 GUID | 一律 `skuId` GUID,唔信 Excel / 記憶中嘅 part number |
| 要加 dependency 至做到 | STOP(H2),唔好靜靜 `npm i` |
| Assign 但 user 未 sync | 唔 assign — `findUser` null / `azureSyncedAt` 空 = Phase 1 sync gate 未過 |
| UI 想調色 / 間距 / 加元件 | 查 `design-system/tokens/*` 用 token,唔 eyeball / hardcode;要新 pattern 先問(H6) |
| Performance vs simplicity | 早期:simplicity wins |

---

## 14. Update This File

當以下發生 update:加新 vendor(approved + ADR)/ 改 phase / 加改 hard constraint / open question resolved / 新 convention / scaffold 現狀清除(§9)。
- 改動 commit 標 `docs(claude-md): <change>`。重大(§1 / §5)需 owner explicit approve;微調(routing entry / phase status)可自行做。

🔴 **§0 同 §9 嘅 phase 座標,每次 phase / CH / BUG closeout 都要順手掃一次** —— 同 `docs/12-ai-assistant/01-prompts/SESSION_SUMMARY.md` 一齊做(嗰份由 SessionStart hook 每 session 注入)。

**點解值得寫成一條規矩**:呢兩份係**唯一會被無條件讀入每個新 session** 嘅文件。佢哋過時唔係「文件唔靚」——係**下一個 session 會用錯前提開始工作**。2026-07-31 實測:§9 一直寫住「`apps/web` = placeholder、auth guard 未做、module C/D 未做」,而嗰陣全部早就交付咗;`SESSION_SUMMARY` 甚至寫住「本 worktree 冇 `apps/api/.env`」(嗰個係另一個 worktree 嘅 note),會令下手以為做唔到 live 驗證。

---

## Appendix: Quick Reference Card

```
Unified Operation Platform — Strict Mode
├─ Baseline (§1): think → simple → surgical → goal
├─ Platform spec: docs/architecture.md
├─ Module 1 (LicenseOps): docs/02-architecture/licenseops/DESIGN.md
├─ Design system: docs/02-architecture/design-system.md (視覺真相 design_handoff_licenseops/)
├─ Monorepo: apps/api (NestJS) + apps/web (React) — ADR-0001
├─ Stack: NestJS+Prisma+Postgres · Redis/BullMQ · Graph+ServiceNow · React/shadcn(FE)
├─ Hard Constraints (STOP+ask on trigger):
│  ├─ H1 Architectural change      H2 Vendor/dep lock
│  ├─ H3 Scope/Tier boundary       H4 Security/PII
│  ├─ H5 Test coverage (critical path)
│  ├─ H6 Design fidelity (token-only, 1 primary/view, lucide, light+dark)
│  ├─ H7 Tool-result integrity (唔作 tool 輸出 · send tool 即收口 · 結果 trace 真 output)
│  └─ H8 Tool-usage discipline (讀檔/搜尋用 Read/Grep/Glob 唔用 bash cat/grep · 唔 echo 拼裝 · 單一重定向)
└─ When in doubt: ask, don't guess · skuId not name · sync gate before assign · UI: token 唔 eyeball
```

---

**End of CLAUDE.md** · Version 1.2 · Owner: Chris Lai
