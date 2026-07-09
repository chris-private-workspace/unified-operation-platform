# Workflow Framework

> **目的**:本 doc 係項目嘅 **workflow source of truth**。任何 work 開始之前必須跟呢套流程。`CLAUDE.md §10` routing 入面,任何 task 級 work 都 reference 返呢度。

**Version**: 1.0 | **Owner**: {技術 lead}

---

## 0. Why this exists

| 痛點 | 解法 |
|---|---|
| AI assistant 跳入 implementation 而無 plan,工作零碎 | Per-task pre-doc(plan / spec / report)+ pre-implementation gate |
| 無法區分 phase work / change / bug → 一律當 ad-hoc 做 | 3 explicit workflows + AI auto-classification |
| Change / bug fix 缺 documented process,易漏 verification + traceability | Per-type spec / report + checklist + progress |

---

## 1. Task Type Classification(AI Routing)

### 1.1 Decision Tree
```
incoming task
    │
    ├─► 符合 active phase plan 嘅 deliverable?           → Phase/Sprint workflow
    │
    ├─► 改現有 feature 行為(非 bug)?
    │      AND scope < 3 days?
    │      AND 有明確 acceptance criteria?               → Change workflow
    │
    ├─► 修 incorrect / broken / regressed 行為?          → Bug-fix workflow
    │
    └─► trivial(typo / single-line / < 30min)?          → 直接 commit(no doc folder)
```

### 1.2 Classification Heuristics

| Signal in user request | Likely type |
|---|---|
| 「implement F<n>」/ 符合 active phase | Phase/Sprint |
| 「改 X 嘅 behavior」/「add Y option」/「support Z」 | Change |
| 「X 唔 work」/「broken」/「fail」/「regression」/「錯咗」 | Bug-fix |
| 「fix typo」/「rename variable」/「update comment」 | Trivial |

### 1.3 AI Classification Protocol
收到非明顯 trivial 嘅 task:
1. **Classify** per §1.2。
2. **Propose to user**:「我判斷呢個係 [Phase / Change / Bug-fix],建議走 X workflow,即先準備 [plan.md / spec.md / report.md]。OK?」
3. **Wait for user confirm**(或 override classification)。
4. **Open corresponding doc**(per §1.4 R1)before any code。

### 1.4 Pre-Implementation Guard(R1)

> **冇對應 doc 唔可以開始 code。** HARD constraint per type:

| Type | 必有 pre-doc | If missing |
|---|---|---|
| Phase/Sprint | `plan.md` + `checklist.md` | STOP,ask user 開 phase kickoff |
| Change | `spec.md`(scope + acceptance,**approved by user**) | STOP,propose draft spec,await approve |
| Bug-fix | `report.md`(symptom + repro + severity confirmed) | STOP,propose draft report,await confirm |
| Trivial | None | Proceed directly to commit |

---

## 2. Phase / Sprint Workflow

### 2.1 Folder Convention
`docs/01-planning/W{NN}-{phase-name-kebab}/`

### 2.2 Per-Phase Artifacts(3 docs)
```
docs/01-planning/W{NN}-{phase}/
├── plan.md         ← Phase scope contract(locked at kickoff;deviation → §7 changelog)
├── checklist.md    ← Atomic checkbox items derived from plan(daily tick)
└── progress.md     ← Daily Day-N entries + 結尾 retro
```
Templates:`_templates/phase/`。

### 2.3 Lifecycle
```
Phase N-1 retro signed
        │
        ▼
Phase N kickoff:
  1. mkdir W{NN}-{phase}/
  2. cp _templates/phase/* → folder/(rename .md.tpl → .md)
  3. Fill plan.md(scope + carry-over from prev retro)
  4. Derive checklist.md from plan
  5. Init progress.md Day 0
  6. Commit: chore(planning): kickoff W{NN}
        │
        ▼
Daily execution(per AI session):
  1. Read CLAUDE.md
  2. Read W{NN}/{plan, checklist, progress(last 3 entries)}
  3. Identify next unchecked item → confirm if ambiguous
  4. Implement → commit + tick checklist → update progress Day-N
  5. If open-question resolved → sync;if deviation → changelog
        │
        ▼
Phase N closeout:
  1. All checklist done OR explicit defer(reason in progress)
  2. Write retro section in progress
  3. Generate ADR for any architecturally-adjacent decision
  4. Commit: docs(planning): close W{NN} retro
  5. Mark progress status=closed → trigger N+1 kickoff
```

---

## 3. Change Workflow

### 3.1 When to Use
| Use Change if… | Don't use(use other)if… |
|---|---|
| 改現有 feature 行為 | 全新 feature(→ Phase) |
| Scope < 3 days | Multi-week(→ Phase) |
| 行為本來啱,而家要改 | 行為本來就錯(→ Bug-fix) |

### 3.2 Folder / ID
`docs/03-implementation/changes/CH-{NNN}-{kebab}/`;`CH-001`,`CH-002`… 3-digit,**monotonic project-wide**(唔 per-phase restart)。

### 3.3 Per-Change Artifacts
```
CH-{NNN}-{kebab}/
├── spec.md         ← What / why / scope / acceptance(locked after approve)
├── checklist.md    ← Atomic implementation items
└── progress.md     ← During-execution log + completion summary
```
Templates:`_templates/change/`。

### 3.4 Lifecycle
```
1. AI classify → Change → propose spec.md draft(status: proposed)
2. User approve scope + acceptance → status: approved
3. mkdir + cp templates + fill spec
4. Derive checklist from spec §3 acceptance
5. Implement,daily update progress + tick checklist
6. Closeout:tick all acceptance,write completion summary,status: done
```

---

## 4. Bug-Fix Workflow

### 4.1 When to Use
| Use Bug-Fix if… | Don't use(use other)if… |
|---|---|
| 行為本來啱(per spec)但而家錯 | 行為一直錯 / spec gap → Change |
| Fix < 3 days | Multi-week refactor → Phase |
| Reproducible(或 trace 可偵測) | 模糊「feels slow」冇 metric → triage first |

### 4.2 Folder / ID
`docs/03-implementation/bugs/BUG-{NNN}-{kebab}/`;`BUG-001`… 3-digit,monotonic project-wide。

### 4.3 Per-Bug Artifacts
```
BUG-{NNN}-{kebab}/
├── report.md           ← Symptom + repro + impact + severity(locked after triage)
├── checklist.md        ← Investigation + fix + regression test + verify
├── progress.md         ← Timeline log + closeout summary
└── postmortem.md       ← OPTIONAL — Sev1/Sev2 mandatory
```
Templates:`_templates/bugfix/`。

### 4.4 Severity Scale
| Severity | Definition | Postmortem? |
|---|---|---|
| **Sev1** | Production outage / data loss / security breach | ✅ Mandatory |
| **Sev2** | Major feature broken / critical user impact | ✅ Mandatory |
| **Sev3** | Minor feature degraded / specific impact | 🟡 Encouraged if recurring |
| **Sev4** | Cosmetic / edge case / low-impact | ⏸️ Optional |

### 4.5 Lifecycle
```
1. AI classify → Bug-fix → propose report.md draft
2. User confirm repro + impact + severity → status: triaged
3. mkdir + cp templates + fill report
4. Derive checklist(investigate + fix + regression + verify)
5. Reproduce locally → investigating
6. Root cause → fixing
7. Fix + regression test → verifying
8. Verify in env → done
9. (Sev1/Sev2 OR recurring)Write postmortem
10. Update RISK_REGISTER if pattern is new
```

---

## 5. Binding Rules(process-level)

| ID | Rule | Trigger if violated |
|---|---|---|
| **R1** | Pre-implementation doc must exist(plan/spec/report) | STOP,ask user 開對應 kickoff |
| **R2** | Daily commit must reference `progress.md` Day-N entry(`docs(planning):` housekeeping 例外) | Reviewer 拒 merge |
| **R3** | Plan/spec/report deviation 必須先 log 入對應 changelog | 唔可以 silent drift |
| **R4** | Open-question resolved → 同步更新對應決策文件 AND progress entry | 兩處都要 reflect |
| **R5** | Architectural-adjacent decision(per CLAUDE.md §5)→ ADR | Block closeout |
| **R7** | Pending / next-candidate 嘅識別 + 進度變動 → 同步 `BACKLOG.md` | 唔可以 silent drift |

> R6(進階,可選)— active-flip 前 5-step grep 驗證,recursive 到 plan 文字本身。項目複雜到有「plan 文字繼承上一階段 stale 措辭」問題先需要。

---

## 6. AI Session Start Protocol

Per session start(after CLAUDE.md §0 + §10):
```
1. Read CLAUDE.md
2. Identify incoming task
3. CLASSIFY task type(§1)
   a. Active phase → read W{NN}/{plan, checklist, progress last 3} → next item → confirm → execute
   b. Change → propose spec.md → confirm scope → mkdir CH-NNN → execute
   c. Bug → propose report.md → confirm severity + repro → mkdir BUG-NNN → investigate
   d. Trivial → implement directly, single commit
4. NEVER skip classification(R1)— STOP and ask if unclear
```

---

## 7. Human Dev Responsibilities

| Stage | Human action |
|---|---|
| Kickoff(any type) | Approve `plan.md` / `spec.md` / `report.md` 之前 AI 唔 start |
| Daily | Provide open-question resolutions;answer ambiguous classification |
| Mid-execution | Approve changelog 重大 deviation |
| Closeout | Review retro / postmortem,confirm ADR coverage,sign-off |

---

## 8. Anti-patterns（必避免）

| ❌ Anti-pattern | ✅ Correct |
|---|---|
| 一次過建立所有 phase folder | Rolling:每 phase kickoff 先建 |
| Implementation 唔 update checklist + progress | 每 commit 後同步 tick |
| Scope 改晒但無 changelog | Deviation 必 log |
| Skip retro / postmortem(Sev1/Sev2) | 至少 cover what worked / didn't / action items |
| Multi-day work 無 plan/spec/report 直接做 | R1 STOP,先 kickoff |
| Architecture change 唔 trigger ADR | R5 必 ADR |
| Skip §1 classification → jump implementation | R1 violation,STOP and reclassify |

---

## 9. PROCESS.md Evolution Rules

- 加/改 binding rule(R1-R7):必須 user explicit approve。
- 加 routing entry / clarification:可自行 update。
- 加新 task type(beyond 3):重大,必須 user approve。
- 改 folder naming convention:重大,必須 user approve。
- 改動 commit message:`docs(process): update PROCESS — <summary>`。

---

**End of PROCESS.md — Source of truth for workflow framework.**
