# _TEMPLATE-track/ — 大型跨階段 Track 模版

當一個**主題跨越多個 phase**(例:一整條安全加固線、一整個大功能演進)時,單靠 phase folder 唔夠統籌 —— 開一個 **track subfolder** 做持續追蹤入口。

## 幾時開 track subfolder
- 一個主題會跨 ≥3 個 phase。
- 需要一個「唔隨個別 phase closeout 而消失」嘅持續追蹤點。
- 有跨 phase 嘅事實 / 現狀需要單一事實來源。

## 建議結構
```
docs/01-planning/{track-name}/
├── TRACKER.md      ← 跨階段狀態總覽 + 可勾工作清單 + 變更日誌(追蹤入口)
├── ROADMAP.md      ← 分階段路線圖(P0/P1/P2… 各階段目標)
├── FINDINGS.md     ← 單一事實來源(現狀 / 實測 / 缺口,TRACKER 只追狀態唔複製事實)
└── (可選) REPORT.md / RECORD.md / SOP.md
```

## 同 phase folder 分工
- **Track subfolder** = 跨 phase 統籌(狀態 + 路線 + 事實)。
- **Phase folder**(`W{NN}-*/`) = 個別 phase 嘅執行(plan / checklist / progress)。
- Track 嘅每個階段,落地時開對應 phase folder;TRACKER link 去嗰啲 phase folder。

## 同 BACKLOG 分工
- BACKLOG = 全項目 pending 嘅 index(一行)。
- Track TRACKER = 呢條 track 內部嘅細緻階段追蹤。
- BACKLOG 用一行指向 track TRACKER,唔複製細節。

模版:本 folder 嘅 `TRACKER.md` / `ROADMAP.md` / `FINDINGS.md`(copy 成個 folder 做 `{track-name}/` 落地)。
