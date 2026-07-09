# dev-framework — AI-協作開發架構 Starter Kit

一套可複用嘅「人 + AI coding agent 長期協作」開發架構同流程。抽取自一個真實運行超過 100 個 sprint phase 嘅項目,**已去除所有業務內容**,只留方法論外殼 + 可直接 copy 嘅骨架。

## 兩層結構

```
dev-framework/
├── README.md              ← 你而家睇緊呢份
├── _guide/                ← 框架自己嘅說明(唔 copy 落新項目,睇完就算)
│   ├── GUIDE.md           ← 總指引:6 大組件 + 設計哲學 + 各部分點運作(先睇)
│   ├── SETUP.md           ← 落新項目 step-by-step + 最小可用子集
│   └── MIGRATION-EXAMPLE.md ← 用真實項目(EKP)示範框架跑起嚟長咩樣
└── skeleton/              ← ★ copy 呢個成個落新項目 = 完整項目外殼(內容已抽走)
    ├── CLAUDE.md · AGENTS.md · README.md · .gitignore · .env.example · MEMORY.seed.md
    ├── .claude/           ← AI agent 本機工具(commands / skills / settings + hooks)
    ├── .agents/           ← 第二個 agent runtime 嘅 skill 鏡射
    ├── .github/workflows/ ← CI 骨架
    ├── scripts/           ← git hooks + 工具
    └── docs/              ← architecture.md 主 spec + 13 層(模版鏡射 EKP 佈局)
```

**關鍵分野**:`_guide/` 係「教你點用」;`skeleton/` 係「真係 copy 落去嗰嚿」。`skeleton/` **完全鏡射真實項目結構**(唔係抽屜式 template folder)—— 每個檔都係項目該有嘅位,內容抽走變佔位符。

## 30 秒理解

```
CLAUDE.md / AGENTS.md → AI 每 session 必讀嘅項目憲法(身分 / routing / 紅線 / 慣例)
.claude/ + hooks      → AI 本機工具(slash commands / 反模式 skill / session 自動注入)
Memory 系統           → 跨 session 持久記憶(踩過嘅坑 / 偏好 / 狀態),repo 外
docs/ 13 層 + 主 spec → 職責單一嘅文件分層
三軌工作流            → Phase / Change / Bug,每種先開文件再寫 code
ADR 系統              → 架構決定嘅不可變記錄
BACKLOG + registers   → pending 工作單一入口 + 決定登記
```

核心一句:**把資深工程師 onboard 新人會講嘅所有嘢(慣例 / 紅線 / 流程 / 踩過嘅坑 / 本機工具),固化成 AI 每次都會讀嘅結構化項目外殼。**

## 由邊度開始

1. 讀 **`_guide/GUIDE.md`** 理解成套方法論(~15 分鐘)。
2. 睇 **`_guide/MIGRATION-EXAMPLE.md`** 睇真實例子。
3. 跟 **`_guide/SETUP.md`** copy `skeleton/` 落你嘅新項目,逐個 `{佔位符}` 填。
4. 唔使一次過用晒 —— `SETUP.md` 有「最小可用子集」,其餘按項目成長按需加。

## 呢套嘢適合邊類項目
- 用 AI coding agent(Claude Code / Cursor / Codex 類)做主力嘅項目。
- 預期會做**多個 session / 多星期以上**。
- 想要 traceability、防止 scope 蔓延、防止 AI 擅改架構。

## 呢套嘢唔係咩
- 唔係語言/框架特定 —— 純方法論 + 結構,任何 stack 都套得(`skeleton/` 內嘅 stack-specific 位都係佔位符)。
- 唔強制全部用晒 —— 揀啱你規模嘅子集。
