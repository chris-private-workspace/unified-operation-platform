# {PROJECT_NAME} — Session Start(AI 詳版 onboarding)

> **AI coding agent:CLAUDE.md §10.3 Session Start Protocol 第一步就係讀呢份。**
> 定位:**session 開頭深讀一次嘅完整 onboarding**(比 CLAUDE.md 憲法補充更多 volatile 座標 + 背景)。
> 對照 `SESSION_SUMMARY.md`(每 session hook 自動注入嘅 **slim 即時摘要**)—— 呢份係詳版,嗰份係即時 slim。
> **On-demand 深讀,唔使每次由頭讀到尾**:用下面 TOC 跳去當前 session 相關嗰幾節。

## 目錄(TOC)
1. 你正在加入嘅項目(Why + 「唔係咩」) · 2. 最高指導原則 · 3. Component 清單 · 4. 權威排序 ·
5. 必讀 / 按需讀文件 · 6. Rolling Phase Planning 紀律 · 7. Task Type Classification ·
8. 當前進度自查(git) · 9. Open Questions · 10. Sprint / 當前座標 · 11. 常駐 milestones ·
12. 行為規範 checklist · 13. 今天嘅任務(填寫) · 附錄:本檔維護

---

## 1. 你正在加入嘅項目
- **Why**:{項目存在嘅理由 / 要解嘅問題}
- **一句定位**:{PROJECT_NAME} — {定位}
- **本項目「唔係」咩**(防常見誤解):
  - 唔係 {誤解 1}
  - 唔係 {誤解 2}

## 2. 最高指導原則(Strict Mode)
- **原則 1**:架構決定一旦 lock 唔可以單方面改 → 觸發 hard constraint 即 STOP+ask(CLAUDE.md §5)。
- **原則 2**:先文件後 code(pre-doc gate,PROCESS R1)。
- **原則 3**:{你項目第三條核心原則}。

## 3. Component 清單
{列 component id + 一句職責,或 link `02-architecture/COMPONENT_CATALOG.md`}

## 4. 權威排序(衝突時邊個 wins)
```
1. Hard Constraints(CLAUDE.md §5)
2. 主 spec(frozen sections)
3. ADR(Accepted)
4. Approved phase plan / change spec / bug report
5. CLAUDE.md conventions
6. {其他}
```

## 5. 必讀 / 按需讀文件
- **每 session 必讀**:CLAUDE.md · 本檔 · active phase 三件套。
- **按需深讀**:主 spec(改架構時)· COMPONENT_CATALOG(改 component 時)· BACKLOG(揀任務時)· ADR(問點解噉揀時)。

## 6. Rolling Phase Planning 紀律 ⭐
- ✅ **正確**:每 phase kickoff 先建 folder;只保留 active + 下一個 draft。
- ❌ **禁止**:一次過預建多個未來 phase folder / 喺 retro 寫具體未來 phase task / 跳過 plan 直接 code。
- **為何 rolling**:JIT 規劃避免猜錯未來需求(§1.2 simplicity)。

## 7. Task Type Classification
收到任務先分類(PROCESS.md §1),**propose → 等 confirm → 開 pre-doc → 先 code**:

| Signal | Type | Pre-doc |
|---|---|---|
| 符合 active phase deliverable | Phase | plan + checklist |
| 改現有行為(<3 日) | Change | spec(approved) |
| 修壞咗 / regressed 行為 | Bug-fix | report(triaged) |
| typo / 單行 / <30min | Trivial | 免 |

## 8. 當前進度自查(git)
```
git status --short
git log --oneline -5
```
{對照 active phase checklist 嘅 next unchecked item}

## 9. Open Questions snapshot
{N Resolved + M Open;Open 嗰啲用 default 繼續,見 CLAUDE.md §8}

## 10. Sprint / 當前座標(volatile — 每 phase closeout doc-sync 更新)
- **最近 closed phase**:{W{NN}}
- **進行中**:{當前工作}
- **剩餘 candidates**:{見 BACKLOG.md}
- **已知 blockers**:{外部 / 用戶決定}

## 11. 常駐 milestones / hard gates
| Gate | 狀態 |
|---|---|
| {G1 名} | {PASS / pending} |

## 12. 行為規範 checklist(最易犯)
- **必做**:{語言紀律 / pre-doc gate / STOP-and-ask on hard constraint}
- **紀律自檢**:{每段 reply / 每 task done 自檢嘅幾項}
- **唔做**:{destructive op 未授權 / silent drift / 過度 disclaimer}

## 13. 今天嘅任務(session 開頭填)
```
本 session 任務:{一句}
分類:{Phase / Change / Bug / Trivial}
對應文件:{plan / spec / report 路徑}
Next unchecked item:{}
```

---

## 附錄:本檔維護
- **幾時更新**:phase closeout doc-sync(§10 volatile 座標)· 加 component / open question resolved · timeline 變。
- **幾時退役**:{項目階段完成 → 轉下階段 onboarding}。
- **Update history**:

| Date | Change |
|---|---|
| YYYY-MM-DD | Initial |

**Companion**:`SESSION_SUMMARY.md`(slim hook 注入)· `compact-session.md`(session 結尾)。
