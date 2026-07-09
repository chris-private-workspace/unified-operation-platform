# {Track Name} — Roadmap

> 呢條 track 嘅分階段路線圖。定 P0/P1/P2… 各階段目標 + 依賴 + 邊界。
> **狀態追蹤** 喺 `TRACKER.md`(本檔定路線,唔追日常狀態)。

**最後更新**:YYYY-MM-DD ・ **Owner**:{owner}

## 0. 背景 / 驅動
{點解要做呢條 track?咩問題 / 需求驅動?}

## 1. 目標定調
- **In scope**:{呢條 track 涵蓋咩}
- **Out of scope / 未來 tier**:{明確唔喺呢條 track 做嘅(防蔓延)}

## 2. 分階段路線

| 階段 | 目標 | 交付 | 需 ADR? | 依賴 / 前置 | 粗估 | Tier |
|---|---|---|---|---|---|---|
| **P0** | {地基} | {交付物} | {是/否} | {前置} | {工期} | Tier 1 |
| **P1** | {第一步} | | | P0 | | Tier 1 |
| **P2** | {第二步} | | | P1 | | Tier 1 |
| P5+ | {治理 / 進階} | | 是 | | | Tier 1.5 |
| P6+ | {規模化} | | 是 | | | Tier 2 |

## 3. 次序鐵律(ordering 紀律)
- **影響索引 / storage 結構嘅最先定**(改咗代價最大)。
- **保命 / 安全先做**(阻塞上線嘅先行)。
- **修債同新建分開**(唔混入同一階段)。
- **Rolling JIT**:每階段開工先建對應 phase folder,唔預建。
- **ADR 硬閘**:觸發 hard constraint 嘅階段,ADR Accept 先開工。

## 4. 關鍵決策點
- {每階段開工前需用戶拍板嘅決定 — 標明邊啲觸發 hard constraint / ADR}

## 5. 風險
{link RISK_REGISTER 對應 entry}

## 6. Changelog

| 日期 | 變更 | 由 |
|---|---|---|
| YYYY-MM-DD | Initial roadmap | {owner} |
