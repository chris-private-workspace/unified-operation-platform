---
skill_name: {kebab-name}
purpose: "{一句 — 呢個 skill 幫 AI 做咩}"
trigger: "{幾時用 — 例:review diff 前 / commit 前 / 驗收 user-facing feature 前}"
last_updated: YYYY-MM-DD
---

# Skill: {Skill Name}

> 項目專屬嘅 AI agent skill / checklist 說明。實際 skill 檔可能住喺 `.claude/skills/{name}/`;呢層做設計說明。
> **同 memory 分工**:memory 記單一事實;skill 記「一組要一齊跑嘅檢查步驟」。

## 幾時觸發
{描述 trigger 場景 — 具體到 AI 認得幾時要用}

## 檢查步驟 / 內容
1. {check 1 — 掃咩、判斷準則}
2. {check 2}
3. {check 3}

## 呢個 skill 專治嘅反模式（為咩存在）
- {項目反覆踩到嘅坑 1 — 呢個 skill 就係要 catch 佢}
- {坑 2}

## 輸出
{AI 跑完應該 produce 咩 — 例:一個 pass/fail 清單 + 每項 finding}

## 維護
{幾時更新呢個 skill — 例:發現新反模式 / 舊 check 過時}
