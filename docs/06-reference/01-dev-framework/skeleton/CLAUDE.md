# CLAUDE.md — {PROJECT_NAME} Standing Instructions

> **AI coding agent:呢份文件係你嘅 standing instructions。每個 session 開始必須先讀,然後先做任何嘢。**
> **本 instruction 採用 Strict Mode**:架構決定一旦 lock 就唔可以單方面改,凡涉及 architectural change 必須 STOP and confirm。
>
> <!-- 填寫指引:{...} = 必填佔位符;<!-- ... --> = 給你嘅提示,填完刪走;[...] = 揀一個 -->

---

## 0. Quick Identity Check(每 session 開始 30 秒讀)

| 項目 | Value |
|---|---|
| Project | **{PROJECT_NAME}** — {一句定位} |
| Primary Spec | `docs/architecture.md`(version / status) |
| Phase | {當前階段 / sprint;或「早期原型」} |
| Strict Mode | **ON** — see §5 Hard Constraints |
| Behavioral Baseline | **§1** — universal coding mindset,適用於所有 code change |
| Decision Owner(architecture) | {技術 lead 姓名} |
| Decision Owner(scope / business) | {PM / stakeholder} |

---

## 1. Behavioral Baseline(universal coding mindset)

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
- 你嘅改動製造嘅 orphan(unused import / var)→ 要刪(自己嘅 mess 自己清)。
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
| Multi-day phase / sprint work | `docs/01-planning/PROCESS.md §2` + active phase folder |
| Change to existing feature(<3 日) | `docs/01-planning/PROCESS.md §3` + new `docs/03-implementation/changes/CH-{NNN}-{kebab}/` |
| Bug-fix | `docs/01-planning/PROCESS.md §4` + new `docs/03-implementation/bugs/BUG-{NNN}-{kebab}/` |
| 改架構 / 違反 §5 設計 | **STOP** — 必須先確認(H-架構)+ 寫 ADR `docs/adr/` |
| 加 vendor / 換 component | **STOP** — 必須先確認(H-vendor)+ 寫 ADR |
| 寫 / 改 backend feature | `{backend spec 路徑}` |
| 寫 / 改 frontend feature | `{frontend spec / design 路徑}` |
| 寫 / 改 API endpoint | `{api contract 路徑}` |
| 寫 eval / test | `{test / eval 方法論路徑}` |
| Risk-related decision | `docs/01-planning/RISK_REGISTER.md` |
| <!-- 按你項目加 routing row。原則:高頻查閱嘅任務都應該有一行。 --> | |

**Default**:唔確定 task 屬邊個 doc 範圍 → **ask before guessing**。

---

## 3. Coding Conventions

### 3.1 {語言 A,例 Backend / Python}
- <!-- 語言版本 / 型別要求 / async 慣例 / schema 慣例 / logging / import 規則 / function 長度 cap / 測試框架 / coverage target / linter / formatter -->

### 3.2 {語言 B,例 Frontend / TypeScript}
- <!-- 同上,按 stack 填 -->

### 3.3 共通
- **Naming**:<!-- files / vars / functions / classes / constants / DB fields 各自慣例 -->
- **Comments**:解釋 **why**,唔係 **what**。
- **TODO format**:`# TODO(<owner>): <description> [<issue-id>]`。
- **絕不 commit**:secret / API key / PII / `.env` 內容 /（若有）read-only reference 檔。

---

## 4. Git & Workflow Conventions

### 4.1 Branch naming
```
main / master                 ← protected,永遠 deployable
feat/<area>-<short-desc>
fix/<area>-<short-desc>
chore/<short-desc>
docs/<short-desc>
adr/<adr-number>-<short>
```

### 4.2 Commit message(Conventional Commits)
```
<type>(<scope>): <description>
```
Types:`feat` / `fix` / `chore` / `docs` / `refactor` / `test` / `perf` / `style`。
Scope:<!-- 你項目嘅模組名 -->。

### 4.3 PR Rules
- One feature per PR,no kitchen-sink。
- PR description 必須:link to spec section / list test scenario /（前端）screenshots。
- Pre-merge:tests pass / coverage 不降 / no linter warning / ADR updated(若架構改動)。

### 4.4 Files & folders 絕不 touch
- `.git/`、`.env*`、任何含 credential 嘅檔。
- <!-- read-only reference 目錄(若有,license risk)-->
- 主 spec 嘅 content-locked section(只有 owner approve 後先 increment version)。

---

## 5. Hard Constraints(Strict Mode)

> 呢啲 constraint **violate 即係 broken project**。遇到以下情況**必須 STOP and ask**。
> <!-- 由 SETUP.md §3 constraint menu 揀 3-5 條落嚟,寫實定義 + Required behavior。以下 3 條係最常用範本,按需增刪。 -->

### 5.1 H1 — Architectural Change Constraint

**定義**:任何符合以下其一 —— 加/改/刪主 spec 提到嘅 core component;改 vendor / service;改 storage layout / 資料模型 / schema;{你項目其他架構紅線}。

**Required behavior**:
1. **STOP** 寫 code。
2. 喺 chat 講明:①想做咩架構改動 ②點解現 spec 唔啱 ③proposed 替代方案。
3. 等用戶回應「approved + write ADR」先繼續。
4. 寫新 ADR 入 `docs/adr/`(format see §6)。

**唔屬架構改動(可自行做)**:bug fix / 內部 refactor 冇改 interface / 加 internal helper / UI polish / 加 test / 加 logging。

### 5.2 H2 — Vendor / Dependency Constraint

**定義**:技術棧已 lock。加新 runtime dependency 或換 vendor = 觸發。

<!-- 填你嘅 locked stack 表:
| Layer | Locked vendor |
|---|---|
| {層} | {vendor} |
-->

**加新 dependency 嘅唯一合法路徑**:STOP → 解釋點解現 stack 唔夠 → 等 approval → 寫 ADR。
**例外(可自行加)**:pure utility lib / type stub / dev dependency(test / linter / formatter)。

### 5.3 H3 — {安全 / Scope / 設計 / 測試 …揀你嘅第三條}

<!-- 例(安全):
**絕不 log** full prompt / user payload 到 plaintext file。
**絕不 commit** connection string / API key / secret。
**絕不 hard-code** tenant id / resource name(都 from env var)。
-->

<!-- 需要更多 constraint 就加 §5.4 H4 … 但記住:3-5 條真守得住 > 10 條當耳邊風。 -->

---

## 6. Architecture Decision Record (ADR) Format

任何違反 §5 hard constraint 嘅改動,approval 後必須寫 ADR。Format 見 `docs/adr/0000-TEMPLATE.md`:
`Context` → `Decision` → `Alternatives Considered` → `Consequences`(正/負/中性)→ `References`。

- 檔案位置:`docs/adr/NNNN-short-title.md`(NNNN 4-digit zero-padded sequential)。
- Index 喺 `docs/adr/README.md`。
- Status:`Proposed` → `Accepted` → `Superseded by ADR-MMMM`。一旦 Accepted 唔改內容,要推翻就寫新 ADR。

---

## 7. External References(若有)

<!-- 若項目依賴 read-only reference(third-party code 學 pattern):
- 絕不 copy-paste 入 codebase / 絕不 import / 絕不 fork。
- 可以 read 學 layout / pattern;PR comment 標明 reference path。
若無,刪呢節。 -->

---

## 8. Open Questions(影響 default behavior)

<!-- 若項目有未定嘅決策點,列一個表 + status(Open / Resolved / Blocked):
- Open → 用 spec default 繼續,commit message 標「depends on OQ-QN default」。
- Resolved → 直接用。
- Blocked → STOP 對應 work item,ask user。
若無,刪呢節。 -->

---

## 9. Sprint / Phase Awareness

<!-- 若用 sprint,列 timeline 表(week / default focus / status)。
若 rolling / 無固定 sprint,寫「rolling JIT — 每 phase kickoff 先建 folder,見 BACKLOG」。 -->

如果 AI 唔清楚而家喺邊個 phase,**ask user**。

---

## 10. Phase Planning Workflow

> Source of truth:`docs/01-planning/PROCESS.md`。

### 10.1 Per-Phase Artifacts(3 docs)
每 phase 喺 `docs/01-planning/W{NN}-{name}/`:`plan.md`(locked 後改要 changelog)/ `checklist.md`(daily tick)/ `progress.md`(daily + 結尾 retro)。

### 10.2 Binding Rules(process-level)
- **R1** — 任何 multi-day implementation 前必須有 approved pre-doc(plan/spec/report)。冇 → STOP。
- **R2** — Daily commit 對應 `progress.md` Day-N entry。
- **R3** — Plan/spec deviation 必須 log changelog,唔可以 silent drift。
- **R4** — Open question resolved → 同步更新對應文件 + progress。
- **R5** — 架構級決定 → 必寫 ADR。
- **R7** — Pending 工作嘅識別/進度變動必須反映喺 `BACKLOG.md`。

### 10.3 AI Session Start Protocol
每 session 開始(§0 identity check 之後)順序執行:
1. 讀 `docs/12-ai-assistant/01-prompts/session-start.md`(若有)。
2. 讀 active phase `plan.md`(知 scope + acceptance)。
3. 讀 active phase `checklist.md`(知 next unchecked item)。
4. 讀 active phase `progress.md` 最近 3 個 Day-N entries。
5. Run `git status --short` + `git log --oneline -5`。
6. 唔清楚 → ask user。

**Compact 後**:context 重組後必須 re-read 步驟 1-4。

---

## 11. Output / Communication Conventions

- **回覆語言**:{填你要嘅語言,例「繁體中文為主,英文只限 code identifier / 檔名 / API / commit hash / ADR 編號 / vendor 名」}。
- 唔好過度 disclaimer / hedging。
- 重要決定明確 surface,唔好 bury 喺長文最後。
- Code change 說明 **what + why**,唔重複 code 內容。
- 引用 spec 標明 section。
- 遇到 §5 hard constraint trigger,**第一句就 STOP and explain**。

---

## 12. Self-Verification Before Marking Task Done

完成 task 之前 run through:
- [ ] 對應 spec 邊個 section?
- [ ] 有冇 violate §5 hard constraints?(有 → task 未完)
- [ ] 有冇 violate §1 behavioral baseline?(每行改動 trace 得返 request?)
- [ ] Test 寫咗未?(若 critical module)
- [ ] Linter / formatter run 過?
- [ ] Commit message follow Conventional Commits?
- [ ] 架構-adjacent 改動 → ADR 寫咗未?
- [ ] Phase checklist 對應 item tick 咗?progress Day-N entry 寫咗?(R2)
- [ ] Pending 變動 → BACKLOG 同步咗?(R7)

---

## 13. When in Doubt(default behavior)

| 情況 | Default |
|---|---|
| Spec 同 your idea 衝突 | Spec wins,除非 explicitly raise + get approval |
| Spec 缺 detail | Ask user,don't guess |
| 兩種實作都 reasonable | 揀更接近既有 pattern 嗰個 |
| Stakeholder feedback 同 spec 衝突 | STOP — surface conflict,等 resolution |
| Scope 邊界模糊 | Default to out-of-scope,ask if uncertain |
| Performance vs simplicity | 早期:simplicity wins |
| <!-- 加你項目特定嘅模糊情況 --> | |

---

## 14. Update This File

當以下發生,update 呢份 file:加新 vendor(approved + ADR)/ 改 timeline / 加改 hard constraint / open question resolved / 新 convention。

**Update 規則**:
- 改動 commit message 標 `docs(claude-md): <change>`。
- 重大 update(改 §1 或 §5)需 user explicit approve。
- 微調(加 routing entry / update sprint status)可自行做。

---

## Appendix: Quick Reference Card

```
{PROJECT_NAME} — Strict Mode
├─ Behavioral baseline (§1): think → simple → surgical → goal
├─ Spec: {主 spec 路徑}
├─ Stack: {一行技術棧}
├─ Hard Constraints (STOP+ask on trigger):
│  ├─ H1 — Architectural change
│  ├─ H2 — Vendor / dependency lock
│  └─ H3 — {你嘅第三條}
└─ When in doubt: ask, don't guess
```

---

**End of CLAUDE.md** · Version 1.0 · Owner: {技術 lead}
