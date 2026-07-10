---
name: ui-design
description: LicenseOps 前端設計系統自檢 — 寫 / review / 驗收任何 apps/web UI(component、畫面、樣式)之前掃一次,確保忠實還原 hifi 設計、唔走偏。Use when writing, reviewing, or finishing any UI work under apps/web (components, screens, Tailwind/styles).
---

# LicenseOps UI 設計自檢(DS)

> **契約 SSOT**:`docs/02-architecture/design-system.md`。**視覺真相**:`design_handoff_licenseops/`(prototype + `design-system/tokens/*`)。
> **強制**:CLAUDE.md §5 **H6 Design Fidelity**。任何 ❌ = 未 done,先處理或 STOP 問 owner。
> 用法:寫 / review / commit UI 前逐條答 ✅ / ❌ / N/A。

| # | 檢查 | ❌ 常見症狀 | 對應 token / 規則 |
|---|---|---|---|
| DS-1 | **Token-only,唔 hardcode** | code 出現 `#xxxxxx` / 寫死 px 色距半徑陰影 | 全部經 `tokens/*.css` CSS var / Tailwind theme |
| DS-2 | **唔 eyeball** | 憑感覺調數值,冇查 `tokens/*.css` 實際值 | 用實際 `--token` |
| DS-3 | **單一 accent + 一 primary** | 一個 view 多過一個 primary;用咗 Ricoh red 以外 accent | `--accent` 只此一家;其餘走 semantic tint |
| DS-4 | **Light + dark 都掂** | 淨試 light;`.dark` swap 有爆(硬色/對比不足) | `:root` / `.dark` 都要行過 |
| DS-5 | **數字 / 識別碼 mono** | seat 數 / delta / id / UPN / GUID 用 sans | Geist Mono |
| DS-6 | **Icon = lucide stroke** | 用 emoji / filled / 第三方 icon / PNG | `lucide-react` stroke-only(唯一多色 = login MS logo) |
| DS-7 | **平面美學** | 加 blur 陰影 / colored-left-border card / 自加 gradient | 深度靠 1px border + surface tint;gradient 只此兩處 = login + Avatar brand(owner-approved) |
| DS-8 | **狀態走 Badge + semantic** | 自創狀態色;冇跟 stage→tone map | Ready→ok / Quoting·Awaiting→warn / Requested→info / Blocked→danger / Assigned→neutral / AI→purple |
| DS-9 | **Motion 克制** | bounce / scale / 長 transition | fadeIn / toastIn / spin;120–150ms |
| DS-10 | **Voice / casing** | 長句 label;亂 UPPERCASE;chrome 內加 emoji | 短名詞;Sentence case;caps 只細結構 label |
| DS-11 | **視覺對照** | 冇對住 prototype 睇 | 對 `design_handoff_licenseops/prototype/full-console.html` |
| DS-12 | **唔捏造 logo** | 自製 Ricoh logo | 用 Geist wordmark + generic glyph |

## 走偏嘅唯一合法路徑
要加**新 primitive / 新 pattern / 改 token / 加新色** → **STOP(H6)** → 傾 owner → 更新 `docs/02-architecture/design-system.md`(+ 架構級寫 ADR)→ 先落 code。組合既有 primitive / 用 token 砌新畫面 = OK,唔使問。

## 輸出
逐條 ✅ / ❌ / N/A;有 ❌ 先處理。維護:踩到新 UI 反模式 → 加一行 + 同步 design-system.md。
