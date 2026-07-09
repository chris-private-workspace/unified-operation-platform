# 07-skills — 項目專屬 AI skill 說明

記錄項目專屬嘅 AI agent skill / checklist 嘅設計同用法(實際 skill 檔可能住喺 `.claude/skills/`,呢層做文檔說明)。

## 建議住客
- 反模式自檢 checklist(commit / 驗收前掃一次項目反覆出現嘅坑)
- 項目專屬嘅 review / verification skill 說明

## 慣例
- Skill 內容應該係「項目反覆踩到、值得固化成自動檢查」嘅嘢。
- 同 memory(feedback 類)嘅分工:memory 記單一事實;skill 記「一組要一齊跑嘅檢查步驟」。

## 模版
[`_TEMPLATE-skill.md`](./_TEMPLATE-skill.md) — 就緒,有第一個項目專屬 skill 先入住。
