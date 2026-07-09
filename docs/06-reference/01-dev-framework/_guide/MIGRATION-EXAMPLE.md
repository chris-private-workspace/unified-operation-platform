# 實戰對照範例 — 呢套框架跑起嚟長咩樣

> 前面 `GUIDE.md` / `SETUP.md` / `skeleton/docs/` 係**通用骨架**。
> 呢份用抽取來源嘅**真實項目(EKP — 一個企業知識 RAG 平台,跑咗 100+ phase)** 做示範,畀你睇「框架實際運作」係點,方便你 map 去自己個新項目。
> EKP-specific 嘅名(RAG / Azure / component 名)只係**例子**,你換成自己項目對應嘅嘢。

---

## 1. 一個 session 嘅完整生命週期(EKP 實際做法)

```
① Session 開始
   AI 讀 CLAUDE.md §0 身分卡(30 秒:知「我喺 EKP Tier 1、聽 Chris、Strict Mode ON」)
   → 讀 12-ai-assistant/01-prompts/session-start.md(volatile 當前座標:最近 phase、gates、避坑)
   → 讀 active phase 三件套(plan / checklist / progress 最近 3 個 Day-N)
   → git status + git log -5
   → 有疑問先問,先至回覆用戶第一句

② 收到任務 → 分類(PROCESS.md §1 決策樹)
   用戶:「Cohere reranker 掛咗會直接 502,想加個 fallback」
   AI:「我判斷呢個係 Change(改現有 retrieval 行為,scope < 3 日,有明確 acceptance)。
        建議走 Change workflow,即先寫 spec.md 等你 review。OK?」
   → 用戶 confirm

③ Pre-doc gate(R1)
   AI 開 03-implementation/changes/CH-020-cohere-reranker-hot-fallback/
   → 填 spec.md(status: proposed)→ STOP,等用戶 approve scope + acceptance
   → 用戶 approve → status: approved → 先至寫 code

④ 實作
   寫 FallbackReranker + test → 每 commit tick checklist + update progress Day-N
   commit message: feat(retrieval): CH-020 Cohere reranker 故障熱切換

⑤ 撞到 hard constraint(H2 vendor)?
   加 Azure semantic 做 fallback = 用返已 lock 嘅 vendor,唔算換 vendor → 唔觸發。
   但「自動熱降級」係架構行為改變 → 觸發 H1 → STOP → 寫 ADR-0074 → 用戶 Accept

⑥ Closeout
   acceptance 全 tick → progress 寫 completion summary → status: done
   → BACKLOG 對應項 B-15 改「完成」(R7)
   → 有非顯而易見教訓 → 寫 memory

⑦ Session 結尾(可選)
   /compact 前貼 compact-session.md 格式,強制紀律自檢
```

---

## 2. 三軌各一個真實例子

### Phase 例子 — `W72-document-profiling-engine`
- **觸發**:一條大 vision(per-KB 自適應配置)拆成多個 phase,W72 係第一個(profiler engine)。
- **流程**:kickoff 建 folder → `plan.md`(scope:rule-based 文件分類引擎 + acceptance:真文件 34/34 分類準確)→ derive checklist → 逐日 implement + progress → closeout retro。
- **關鍵**:呢個 phase **零侵入**(profiler 唔接 orchestrator),acceptance 用真實文件驗,唔係跑通就算。

### Change 例子 — `CH-020-cohere-reranker-hot-fallback`
- **本質**:改現有 retrieval 行為(reranker 掛咗自動降級),非新功能、非修 bug → Change。
- **產出**:`spec.md`(before/after + in/out scope + acceptance)→ 9 個 test → ADR-0074(因為涉及架構行為)。

### Bug 例子 — `BUG-044-pdf-parser-redundant-ocr`
- **本質**:born-digital PDF 被白行做 OCR,parse 慢 3 倍 → 行為壞咗 → Bug-fix。
- **產出**:`report.md`(症狀 + repro:87s vs 27s + severity)→ 定位根因 → fix(`do_ocr=False` 預設)→ regression test。

---

## 3. 一個決定點樣流過成套系統(真實:ADR-0056 per-KB config vision)

```
用戶提出「唔可以只服務一種文件,要先判類型再選流程」
   → AI 識別:呢個改 retrieval config 解析方式 = 架構級 → H1 STOP-and-ask   [CLAUDE.md §5]
   → 用戶 approve 方向
   → 寫 ADR-0056(Context / Decision / Alternatives / Consequences)         [adr/]
   → 更新受影響 component design note + COMPONENT_CATALOG                    [02-architecture]
   → BACKLOG 加主線 track,拆成 W72-W85 多個 phase                          [BACKLOG.md]
   → 逐 phase 用三軌流程落地                                                 [PROCESS.md]
   → 「config A/B 的 per-KB resolve 陷阱」呢類非顯而易見教訓 → 寫 memory      [Memory 系統]
   → 後來有 amendment(W98/W99)→ 喺原 ADR 加 §Amendment,唔改原決定
```

呢個就係「六大組件協同」嘅真實一次跑動 —— 一個決定順住 CLAUDE.md → ADR → catalog → BACKLOG → phase → memory 流過去。

---

## 4. EKP → 通用 → 新項目 對照表

| 組件 | EKP 實際長咩樣 | 通用化後(骨架畀你) | 你新項目點填 |
|---|---|---|---|
| **CLAUDE.md** | 64K,H1-H7(架構/vendor/Dify只讀/Tier邊界/安全/測試/設計還原) | `skeleton/CLAUDE.md` + 7 條 constraint menu | 揀 3-5 條啱你項目嘅 constraint |
| **Memory** | 33 個檔(feedback/project/principle…) | `skeleton/MEMORY.seed.md` 五類 type + 格式 | 頭幾個 session 開始沉澱 |
| **docs 分層** | `01-planning`…`12-ai-assistant`+`adr`,13 層都住滿 | `skeleton/docs/` 13 層 + 各層模版 | copy → 有內容嘅層先入住 |
| **三軌工作流** | 100+ phase + CH-NNN + BUG-NNN 實例 | `PROCESS.md` + `_templates/` + 範例實例 | 每個任務跑分類 → pre-doc → code |
| **ADR** | 74 個 ADR(0001-0074) | `adr/0000-TEMPLATE.md` + index 種子 | 每次 hard constraint approve 就寫一份 |
| **BACKLOG** | A-F 六區 + DD 登記 + track 指標 | `BACKLOG.md` 種子(六區) | 每次 pending 變動同步 |
| **大型 track** | `enterprise-rbac/`(TRACKER/ROADMAP/FINDINGS…) | `_templates/track/` | 主題跨 ≥3 phase 先開 |
| **AI prompt** | session-start / compact / SESSION_SUMMARY(hook 注入) | 三份 template + hook 說明 | 按你 agent 平台配 |

---

## 5. 畀新項目嘅 5 個 takeaway

1. **CLAUDE.md 唔好塞 spec** —— EKP 64K 都仍然係「routing + 紅線 + 慣例」,唔重複 spec 內容。塞細節 = AI 失焦 + stale。
2. **Pre-doc gate 係最值錢嘅一條** —— EKP 嘅 traceability 全靠「冇 approved plan/spec/report 唔准 code」。呢條守住,其餘自然跟。
3. **Hard constraint 揀少啲、守到底** —— EKP 得 7 條,每條都會真係 STOP。唔好一開始就 10 條當耳邊風。
4. **Memory 記「協作過程」唔記 code** —— EKP 33 個 memory 全部係「踩過嘅坑 / 用戶糾正 / 項目狀態」,冇一個係 code 已經講到嘅嘢。
5. **BACKLOG 只做 index** —— EKP 用一行指向 ADR / DEFERRED_REGISTER / track TRACKER,唔複製細節,所以幾少 stale。

---

> **落地下一步**:跟 `SETUP.md`。最小可用子集(CLAUDE.md + PROCESS.md + BACKLOG.md)半日搞掂,其餘按項目成長按需加。
