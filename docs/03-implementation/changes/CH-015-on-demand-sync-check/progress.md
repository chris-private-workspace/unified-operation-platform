---
change_id: CH-015
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
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
| `6088310` | docs(planning): BACKLOG 記低 CH-015 |
| `888e7bd` | docs(planning): 記低 push + PR #66 |
| `056c665` | docs(planning): CH-015 收官 — closeout summary + 座標同步 |
| `94f95d9` | Merge origin/main — 解 `BACKLOG.md` 衝突(PR #64/#65 喺我開 branch 之後 merge 咗,兩邊都喺 A 段表格頂插新行;merge 唔 rebase,因為已 push,冇必要 force push) |
| `a49e9c2` | style(fulfilment): 修 prettier 格式(CI lint fail,見 Lessons) |
| **`baffed7`** | **Merge pull request #66 → `main`**(2026-08-01) |

Branch `feat/fulfilment-on-demand-sync-check`(從 `main` 開,唔污染 CH-014 個 PR #64)→ **PR #66 已 merge,branch 已刪**(本地 + remote)。
🔴 push / PR / merge **三步都獨立驗過真**(memory `git-network-output-unreliable`:三者都會假報成功):
`git ls-remote` 返嘅 SHA = local HEAD · `gh pr view 66` 返 `state: OPEN` → 後來 `SUCCESS` + `MERGEABLE` · merge 唔信 `gh` 講,而係查 **`git log main -- sync-check.service.ts`** 真係返 `35b5fe6` ⇒ code 確實喺 main 上。

---

## Closeout — 2026-08-01

### Acceptance verification

**spec §3 全部 ✅**,但證據來源分兩類,照實分開:

| 條 | 結果 | 證據來源 |
|---|---|---|
| OpenAPI 有 endpoint + 三態 schema | ✅ | AI 真跑(`/docs/api-json`) |
| 真 Graph 命中 → 開 gate + `(on-demand check)` timeline | ✅ | AI 真跑(真憑證真 tenant) |
| 真 Graph 未命中 → 零寫入 | ✅ | AI 真跑 |
| 30 秒內第二次 → THROTTLED 且零 Graph 流量 | ✅ | AI 真跑(live)+ test spy |
| OPCO_IT 跨 OpCo 403 · Graph throw 503 · boundary | ✅ | AI 真跑(test) |
| api / web 全套 test | ✅ | AI 真跑(700 / 213) |
| `ui-design` 零 violation | ✅ | AI 跑,DS-5 命中並修正 |
| **前端三態文案 · cooldown disable · light + dark 實際 render** | ✅ | 🔴 **Chris 人手驗證** —— AI 從來冇 render 過(extension 連唔上 + 冇 Playwright MCP) |

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| 1 | 8 | 3.5 | −4.5 |

估多咗約一倍。主因:抽 `openSyncGate` 之後,on-demand 個 service 冇乜自己嘅邏輯要寫 —— 難嘅嘢(gate 寫入語意)ADR-0015 已經解決咗,本 CH 實質只係加一個觸發器。

### Lessons

**work**
- **抽共用 helper 之後即刻跑既有 test**(B2 → 18/18)。呢個順序令「有冇改壞 sweep」由推測變成事實,而且只花咗 30 秒。
- **live 打真 Graph 揭到 test 揭唔到嘅嘢** —— `HttpCode` 201 全部 unit test 都綠(佢哋 assert service 回傳值,唔經 HTTP layer),第一個 curl 就見到。**凡有 HTTP 語意嘅嘢,test 綠 ≠ 對。**
- **三態 body 而唔係 429**:寫 test 嗰陣先真正見到價值 —— 前端嗰條「throttle 唔可以 render 成未 sync」嘅 test,如果用 429 就要 assert error path,寫出嚟會鬆好多。

**didn't / friction**
- 🔴 **收工漏跑 lint,PR CI 一開就紅**(closeout 之後先發生,補記於此)。掛嘅係兩個**純 prettier 格式**:`sync-check.service.spec.ts` 個 import 過長冇拆行 · `license-ops.boundary.spec.ts` 用咗單引號 + `\'` escape(prettier 要雙引號)。零邏輯問題,`eslint --fix` 一鍵清,api 700 test 仍綠。
  **值得記嘅唔係「今次唔記得」** —— `CLAUDE.md §12` 明明列住「Linter / formatter run 過?」。真正嘅教訓係:嗰次 test 700 綠、`tsc --noEmit` 乾淨、live 打真 Graph 驗齊、`ui-design` skill 都跑埋 —— **全部係我自己揀嘅驗證,而 CI 真正會 gate 嗰樣一次都冇跑**。
  ⇒ **收工前跑 CI 嗰條命令本身(`npm run lint`),唔好跑「我覺得等價」嘅嘢。** 已收入 memory `feedback_local-build-verification-traps` §3(同嗰份 memory 原本兩個陷阱同源:**壞咗都照綠**;呢個變種係「我驗嘅全部綠,但我冇驗會 gate 我嗰樣」)。
- **PowerShell 傳 JSON 畀 `curl.exe` 嘅 quoting 坑**:`-d '{\"a\":\"b\"}'` 靜靜傳咗字面反斜線,回 400。**唔好同 quoting 鬥** —— 寫 body 落檔案再 `-d "@file"`,一次搞掂。
- **Browser 驗證仍然係本項目嘅結構性缺口**(memory `ui-verification-route` 記錄咗好耐):`claude-in-chrome` 連唔上,本 session 亦冇 Playwright MCP ⇒ **任何前端 CH 嘅最後一哩路都要人手**。呢次靠 7 條真 render 嘅 component test 補到大部分,但 light/dark 觀感補唔到。

**carry-over**
- V2 為咗攞一個真存在 Entra 嘅 UPN,把 seed 單 `scope.rhk@rhk.com` 指去真帳號,佢自此永久 synced。dev DB 測試數據,影響僅此,但下次有人數緊「未 gate 嘅單」會少一張。

### Component design note status updates
- 無 —— 本 CH 冇動任何 component 邊界(新 service 落既有 `FulfilmentModule`,前端改既有畫面)。

---

**End of CH-015 progress**
