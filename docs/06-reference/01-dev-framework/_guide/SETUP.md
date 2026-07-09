# SETUP — 把框架落到新項目

> 先讀 `GUIDE.md` 理解成套方法論,再跟呢份落地。
> 全部路徑相對於新項目嘅 repo root。

---

## 0. 落地前:諗清楚 5 樣嘢

開始 copy 之前,用一兩句答呢 5 條(呢啲會填入 `CLAUDE.md §0` 身分卡):

| # | 問題 | 例 |
|---|---|---|
| 1 | 項目叫咩?一句定位? | 「XYZ 平台 — 內部報表工具」 |
| 2 | 主 spec 文件喺邊? | `docs/02-architecture/spec.md` |
| 3 | 架構決定 owner 係邊個? | 技術 lead 姓名 |
| 4 | Scope/business 決定 owner 係邊個? | PM / stakeholder |
| 5 | 揀邊 3-5 條 hard constraint?(見 §3) | 架構變更 / vendor 鎖定 / 安全 |

---

## 1. 最快落地(一句 copy)

`skeleton/` 已經係**完整項目外殼**(鏡射真實項目結構)。落新項目 = copy 成個 `skeleton/` 內容做你 repo 根:

```
cp -r dev-framework/skeleton/.  <新項目>/     # 連隱藏檔(.claude/.github/.gitignore…)一齊 copy
```

> ⚠️ 尾 `/.` 好重要 —— 確保 `.claude/` / `.agents/` / `.github/` / `.gitignore` / `.env.example` 呢啲隱藏檔都 copy 到。

copy 完你 repo 就有:`CLAUDE.md` / `AGENTS.md` / `.claude/`(commands+skills+hooks)/ `.github/workflows/` / `scripts/hooks/` / `docs/`(主 spec + 13 層 + 全部模版)。之後**淨係要填 `{佔位符}`**(見 §2)。

**最小可用子集**(想更快):至少填 `CLAUDE.md §0` 身分卡 + `docs/architecture.md` 主 spec 骨架 + 開第一個 phase,就可以開工。其餘按需填。

---

## 2. 逐個佔位符填(copy 之後)

### Step 1 — 全域 replace `{PROJECT_NAME}`
```
# 例(按你工具):grep -rl "{PROJECT_NAME}" . | xargs sed -i 's/{PROJECT_NAME}/你的項目名/g'
```

### Step 2 — CLAUDE.md(身分卡 + 紅線)
編輯 `<新項目>/CLAUDE.md`:
1. **§0 身分卡** — 填 §0 嗰 5 個答案。
2. **§2 Document Routing** — 對齊你實際 docs 佈局。
3. **§3 Coding Conventions** — 填你 stack 嘅語言 / 命名 / 測試 / linter。
4. **§5 Hard Constraints** — 由 constraint menu(見本檔 §3)揀 3-5 條,寫實定義 + trigger。
5. **§13 When in Doubt** — 對齊你項目嘅 default 行為。
6. **`AGENTS.md`** — 若你有第二個讀 AGENTS.md 嘅 agent,同步 CLAUDE.md;冇就刪。

### Step 3 — 主 spec + 根 config
- `docs/architecture.md` — 填主 spec 骨架(WHAT + WHY)。
- `docs/setup.md` — 填本地 setup。
- `.env.example` / `.gitignore` — 填你 stack 嘅 env key + ignore 規則。
- `README.md` — 填項目 readme。

### Step 4 — AI 本機工具(`.claude/`)
- `.claude/commands/{session-start,preflight,restart}.md` — 填你項目嘅服務 / 重啟步驟。
- `.claude/settings.json` — 填 UserPromptSubmit 紀律提醒 + enabledPlugins。
- `.claude/skills/anti-patterns/SKILL.md` — 填你項目反模式(踩到坑就加)。
- `docs/12-ai-assistant/01-prompts/session-bootstrap.ps1` — SessionStart hook 腳本(已通用,通常唔使改)。
- `.agents/skills/` — 若有第二個 agent runtime,同步 `.claude/skills/`;冇就刪。

### Step 5 — CI + hooks
- `.github/workflows/ci.yml` — 填你 stack 嘅 lint / type-check / test / build。
- `scripts/hooks/{pre-commit,pre-push}` — 填你 lint / test 命令;`git config core.hooksPath scripts/hooks` 啟用。

### Step 6 — Memory 系統(repo 外)
1. 喺 AI agent 嘅 per-project memory 目錄(Claude Code 為 `~/.claude/projects/<project-slug>/memory/`)放 `MEMORY.md` 索引:
   ```
   cp dev-framework/skeleton/MEMORY.seed.md  <memory 目錄>/MEMORY.md   # 之後改做真索引
   ```
2. 頭幾個 session 開始沉澱:每次用戶糾正你、或踩到環境坑,寫一個 `{type}_{slug}.md` + `MEMORY.md` 加一行。
3. `skeleton/MEMORY.seed.md` 有格式 + 五類 type 說明(填完刪走說明段)。

### Step 7 — 第一個 phase / 開工
1. 開第一個 phase folder(參考 `docs/01-planning/W01-example/`):
   ```
   mkdir docs/01-planning/W01-<phase-name>
   cp docs/01-planning/_templates/phase/*.md.tpl  docs/01-planning/W01-<phase-name>/
   # rename .md.tpl → .md,填 plan.md
   ```
2. 填 `plan.md`,status `draft` → 用戶 approve 後 `active`。
3. Derive `checklist.md`,init `progress.md` Day 0。
4. **先至開始寫 code。**

### Step 8 — 清走範例
- `docs/01-planning/W01-example/` + `docs/03-implementation/{changes/CH-000-example,bugs/BUG-000-example}/` 係展示用,填完自己嘅就可刪(或留做參考)。

---

## 3. Hard Constraint Menu(揀 3-5 條落 CLAUDE.md §5)

由呢個 menu 揀啱你項目嘅。每條落地時要寫實 **定義**(咩算 violate)+ **Required behavior**(STOP → explain → 等 approval → 寫 ADR)。

| 代號建議 | Constraint | 揀佢如果… |
|---|---|---|
| H-架構 | 改核心 component / storage layout / 資料模型 → STOP | 你有一份想守住嘅架構 spec |
| H-vendor | 技術棧已 lock,加 dep / 換 vendor → STOP | 你想控制依賴蔓延 |
| H-scope | 有 in/out-of-scope 或 Tier 邊界 → STOP | 項目分階段,唔想過早做未來嘢 |
| H-安全 | 唔 log secret/PII、唔 hardcode credential → 硬規則 | 任何掂到敏感資料(尤其企業) |
| H-測試 | 指定 module 寫 code 必須同步 test | 有品質/覆蓋率要求 |
| H-參考 | 某 reference code 只讀唔可 copy → STOP | 有 license-risk 嘅第三方 reference |
| H-設計 | UI 必須 100% 還原 mockup,唔可以大概模仿 → STOP | 有高保真設計稿嘅前端 |

**建議起步組合**:
- 純後端 / API 項目:H-架構 + H-vendor + H-安全 +(有測試要求加)H-測試。
- 前端 / 全棧 + 設計稿:H-架構 + H-設計 + H-安全。
- 早期原型:H-scope + H-安全(輕量,唔好太多閘拖慢)。

---

## 4. 落地後嘅日常循環

```
每個 session:
  1. AI 讀 CLAUDE.md + active phase 三件套 + git 狀態(session-start protocol)
  2. 收到任務 → 分類(Phase / Change / Bug / Trivial)
  3. 非 trivial → 開對應 pre-doc(plan/spec/report)→ 等 approve
  4. 寫 code + 每 commit tick checklist + update progress
  5. 掂到 hard constraint → STOP and ask → approve → 寫 ADR
  6. pending 變動 → 同步 BACKLOG
  7. task done → 跑 §12 self-verification
  8. 非顯而易見教訓 → 寫 memory
```

---

## 5. 常見落地陷阱

| 陷阱 | 點解衰 | 對策 |
|---|---|---|
| 一次過填晒 13 層 docs | 大部分層冇內容,變擺設 | 只入住有內容嘅層,其餘留 README |
| Hard constraint 揀太多 | AI 記唔住、會忽略,失去嚴肅性 | 3-5 條真守得住 > 10 條當耳邊風 |
| CLAUDE.md 塞晒 spec 細節 | 變超長,AI 失焦,又 stale | CLAUDE.md 只做 routing,細節落 docs |
| Memory 亂存 code 已有嘅嘢 | 冗餘 + 誤導(code 變咗 memory stale) | 只存「非顯而易見」+ 協作過程嘅嘢 |
| 跳過 pre-doc gate 直接 code | 失去 traceability,scope 蔓延 | R1 binding:冇文件 STOP |
| BACKLOG 複製細節 | 兩處維護,必 stale | BACKLOG 只 index,細節 link |

---

## 6. Checklist(落地完成自查)

- [ ] `docs/` 13 層就位,每層有 README
- [ ] `CLAUDE.md` §0 身分卡填好、§2 routing 對齊實際佈局
- [ ] §5 揀咗 3-5 條 hard constraint,每條有定義 + Required behavior
- [ ] `PROCESS.md` 三軌 + `_templates/` 齊
- [ ] `BACKLOG.md` 開咗(可以空,但入口存在)
- [ ] `adr/README.md` index + `adr/0000-TEMPLATE.md` 齊
- [ ] Memory `MEMORY.md` 索引就位
- [ ] 第一個 phase folder 開咗,`plan.md` approved 先開工

---

**End of SETUP.md**
