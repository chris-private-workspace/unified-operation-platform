---
change_id: CH-015
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: in-progress     # in-progress | closed
---

# CH-015 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — 2026-08-01

### Done

**Backend** — B1~B9 全部落地。新 `POST /fulfilment/requests/:id/sync-check`,三態回傳,直接打 `GraphService`。
**Test** — T1~T10。api **700 passed / 62 suites**;web **213 passed / 26 files**(新增 1 file / 7 test)。
**Frontend** — F1~F9。`Check now` primary + `Mark synced` ghost + 30 秒本地倒數。
**Live 驗證** — V1~V4 + V6 全部真 output 核過(見 checklist)。**V5 browser 未驗證**(見 Blockers)。

### Decisions

- **Spec approved**(Chris,2026-08-01)。三個開放決定即場拍板:
  ① `Check now` = primary / `Mark synced` 降 ghost ② per-request cooldown 30s ③ 新開 `VERIFIED_ON_DEMAND` message。
- **判定唔觸發 H1**:ADR-0015 D1 已經 lock 咗 `azureSyncedAt` = 「平台向 Graph 證實過」;本 CH 用**完全相同**嘅證實方法同寫入語意,只係換咗個觸發器(cron → 人手)。冇改 schema / 欄位語意 / module 邊界。實作全程冇出現要改呢個語意嘅情況。
- **Cooldown 唔落 schema**:加 Prisma 欄位就係 H1,而 cooldown 只係防手震連按、唔係安全 gate ⇒ in-memory Map,明文接受唔跨 instance(spec R1)。
- **唔加 audit row**:跟既有 `markSynced` 一致 —— `RequestEvent(SYNC)` 已經係 per-request 完整記錄。sweep 之所以要 audit 係因為佢 bulk + 冇 actor,呢度兩樣都唔成立。
- **抽 `openSyncGate` 而唔係複製**(B2):兩份一模一樣嘅 gate 寫入 = 兩個令 ADR-0015 D1 語意漂移嘅地方。抽完即刻跑 sweep 既有 18 條 test 確認零行為改動(R4 mitigation)。
- **Cooldown 喺 Graph call **之前** 打時間戳**,唔係之後:一個 throw 咗嘅 call 一樣消耗咗 vendor round-trip,而 Graph 429 / 掛咗嗰陣正正係最唔應該即刻重試嘅時候。有 test 守住(T3 同 cooldown-after-failure)。
- **三態 body 而唔係 429**:「Graph 未有呢個帳號」同「你啱啱先問過,所以我冇問」係兩件完全唔同嘅事。擺去 HTTP error path 就會令前端靠 status code 分辨,而最易寫錯嘅方向就係把 throttle render 成「未 sync」。前端有一條 test 專門守呢個 wording。
- **`@HttpCode(200)`(B9,spec 外嘅實作修正)**:live V3 第一次打返 **201**。Nest `@Post` 預設 201,但呢個 endpoint 喺 miss / throttle 時**一個字都冇寫**,命中時改嘅亦係一張既有 request —— 201 Created 會令 API consumer 去搵 Location header。屬純語意修正,唔改三態 body,故只記喺呢度,唔開 spec changelog。
- **ADR-0009 權限矩陣 snapshot**(T10):spec 明文寫住「Do NOT run `jest -u` reflexively」。讀完 diff 確認**只加一行**、零既有權限改動,新 route 繼承 controller class-level `@Roles(ADMIN, REGIONAL, OPCO_IT)`(同 `PATCH :id/sync` 一致),先更新。
- **DS-5 修正**:`ui-design` 自檢命中 —— 倒數秒數係數字,原本用 sans。改成 `font-mono`(同全站 seat 數 / ID 一致)。

### Blockers

- 🔴 **V5 browser 驗證做唔到,唔當佢過(H7)**。`claude-in-chrome` extension 連唔上(同 memory `ui-verification-route` 記錄一致),本 session 亦冇 Playwright MCP。
  - 已有嘅替代證據:F7 七條 component test 係**真 render + 真 assert**(三態文案 / 倒數 / 重新啟用 / primary-ghost / 已 synced 唔出掣);V6 證咗前端實際會打嗰條 vite proxy URL 通、shape 正確。
  - **仍未證**:實際 light / dark render 觀感(DS-4)。→ 交 Chris 人手一眼,或下個 session 用 Playwright MCP 補。

### Live 驗證原始結果(V1~V4 / V6)

| # | 對象 | 結果 |
|---|---|---|
| V1 | OpenAPI | `POST /fulfilment/requests/{id}/sync-check` · 200 response · enum `[FOUND, NOT_FOUND, THROTTLED]` |
| V2 | 真 Graph **命中** | `FOUND` · `azureSyncedAt` null → `2026-08-01T14:39:08.850Z` · `accountCreatedAt` 同步補上 · timeline 出 `Phase 1 sync verified against Microsoft Graph (on-demand check)` · `actorId: null`(同 sweep 一致) |
| V3 | 真 Graph **未命中**(`@demo.invalid`) | `NOT_FOUND` · `retryAfterSeconds: 30` · `azureSyncedAt` **仍 null** · `events: []` |
| V4 | 連打兩次 | call 1 `NOT_FOUND` / call 2 `THROTTLED`,兩次都 HTTP 200、零寫入 |
| V6 | vite proxy | `:5173/api/…/sync-check` → 200,shape 正確 |

> ⚠️ V2 為咗攞一個**真存在於 Entra** 嘅 UPN,把一張 seed 測試單(`scope.rhk@rhk.com`,2026-07-10 建)嘅 `targetUpn` 改成 CH-013 已證實過嘅真帳號。呢張單自此永久 synced 咗 —— dev DB 測試數據,影響僅此。

### Effort
- Planned:1 日;Actual:約 3.5h;Variance:−4.5h

### Commits
| Hash | Subject |
|---|---|
| `35b5fe6` | feat(fulfilment): CH-015 request 層 on-demand Azure sync 檢查 |
| `6088310` | docs(planning): BACKLOG 記低 CH-015 — 實作完成,待 V5 browser 補驗 |

Branch `feat/fulfilment-on-demand-sync-check`(從 `main` 開,唔污染 CH-014 個 PR #64)→ **PR #66**。
🔴 push / PR 兩步都**獨立驗過真**(memory `git-network-output-unreliable`:兩者都會假報成功):
`git ls-remote` 返嘅 SHA = local HEAD `6088310858…`;`gh pr view 66` 返 `state: OPEN` · `main ← feat/fulfilment-on-demand-sync-check` · 兩個 commit oid 對得上。

---

## Closeout(填於 status=closed)

### Acceptance verification
_(待 V5 補驗後填)_

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| 1 | 8 | 3.5 | −4.5 |

### Lessons
_(待填)_

### Component design note status updates
_(待填)_

---

**End of CH-015 progress**
