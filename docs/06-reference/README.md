# 06-reference — 參考素材

樣板、範例、playbook —— 幫開發時對照嘅參考物,唔係規格亦唔係實例記錄。

## 建議住客
- Sample 輸入 / 輸出檔(用嚟測試 / 示範)
- Playbook(例:某類任務嘅標準做法)
- 樣板 workflow / 樣板 config

## 已附方法論 playbook
- [`mockup-to-production-frontend-playbook.md`](./mockup-to-production-frontend-playbook.md) — **如何把 design mockup 轉成生產前端而唔累積視覺 drift**。核心:mockup 拆兩層,視覺層(CSS)**逐字複製、永不翻譯/convert**,邏輯層(JSX)先重寫接 API。若你項目有一份手寫 HTML/CSS mockup 要喺生產 toolchain 重現,**寫第一頁前先讀呢份**(含 EKP 實戰案例作證據)。

## 慣例
- 若有 **read-only 第三方 reference**(license risk)→ 應該有獨立處理(gitignore + 唔 copy,見 CLAUDE.md §7),唔好混入呢層 git-tracked 內容。
