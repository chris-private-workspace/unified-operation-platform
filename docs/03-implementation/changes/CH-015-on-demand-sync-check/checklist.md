---
change_id: CH-015
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: 2026-08-01
---

# CH-015 — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## Implementation — Backend

- [x] **B1** `sync-gate-messages.ts` 加 `VERIFIED_ON_DEMAND` + 註解講點解要分三條
- [x] **B2** 抽 `openSyncGate` 做共用寫入(新檔 `open-sync-gate.ts`);sweep 只保留自己揀 message 嗰句
      🔴 **sweep 既有行為零改動** — `sync-sweep.service.spec.ts` **18/18 綠**(抽完即刻跑,R4)
- [x] **B3** 新 `SyncCheckService`:`getRequestDetail`(帶 404 + AUTH-3a 403)→ cooldown → `graph.findUser` → 命中 `openSyncGate`
      🔴 直接 inject `GraphService`,冇 `LicenseOperationsProvider`(ADR-0017 D0)
- [x] **B4** In-memory cooldown `Map<requestId, ms>`,30 秒,每次 check 順手 prune 過期 entry
- [x] **B5** `SyncCheckResultDto` 三態 + Swagger 標註
- [x] **B6** Controller `POST :id/sync-check` + module wiring
- [x] **B7** Graph throw → 既有 `graphUnavailable` helper → 503(順帶 BUG-004 scrubPii)
- [x] **B8** 已 synced 嘅 request:回 `FOUND`、唔打 Graph、唔重寫 timestamp / event
- [x] **B9**(spec 外,實作時發現)`@HttpCode(200)` — Nest 預設 201 對一個「miss 時零寫入」嘅 check 係錯語意。見 progress Decisions

## Implementation — Backend Test（H5,critical path)

- [x] **T1** FOUND → 開 gate + 寫 `VERIFIED_ON_DEMAND`(並 assert 字面含 `on-demand check`,唔淨係比對常數)
- [x] **T2** NOT_FOUND → 零寫入
- [x] **T3** THROTTLED → 零 Graph call(`findUser` 次數仍係 1)
- [x] **T4** Graph throw → 503,零寫入
- [x] **T5** OPCO_IT 跨 OpCo → 403,而且**未打過 Graph**
- [x] **T6** 已 synced → 唔覆蓋 timestamp、唔重複出 event
- [x] **T7** 🔴 Boundary test:`sync-check.service.ts` 加入 `MUST_STAY_DIRECT`
- [x] **T8** `sync-sweep.service.spec.ts` 18/18 綠
- [x] **T9** `npm test -w @uop/api` — **700 passed / 62 suites**
- [x] **T10**(spec 外)ADR-0009 權限矩陣 snapshot:讀完 diff 確認**只加一行**、零既有權限改動,先更新

## Implementation — Frontend

- [x] **F1** `useSyncCheck(requestId)` mutation
- [x] **F2** `api-types.ts` 加 `SyncCheckStatus` / `SyncCheckResult`
- [x] **F3** `Check now` = primary · `Mark synced` = ghost(+ title 講明佢係 break-glass)
- [x] **F4** 三態文案;THROTTLED 刻意唔講成 sync 結果;NOT_FOUND 用 ok tone 唔用 danger(R3)
- [x] **F5** Cooldown 本地倒數 + disabled(食 `retryAfterSeconds`)
- [x] **F6** 已 synced → 只出「Ready to assign」,兩個掣都唔出
- [x] **F7** Frontend test 7 條(三態文案 + 倒數 + 重新啟用 + primary/ghost + 已 synced)
- [x] **F8** `npm test -w @uop/web` — **213 passed / 26 files**
- [x] **F9** `ui-design` 跑咗:DS-5 命中並修正(倒數秒數改 mono);其餘 ✅ / N/A
      ⚠️ **DS-4(light + dark 實際 render)未驗** — 見 V5

## Verification

- [x] **V1** `/docs/api` OpenAPI 有 `POST /fulfilment/requests/{id}/sync-check`、200 response、三態 enum schema
- [x] **V2** Live 真 Graph **命中**:`FOUND` · `azureSyncedAt` null → `2026-08-01T14:39:08.850Z` · `accountCreatedAt` 同步補上 · timeline 出 `Phase 1 sync verified against Microsoft Graph (on-demand check)`
- [x] **V3** Live 真 Graph **未命中**(`@demo.invalid`):`NOT_FOUND` · `azureSyncedAt` **仍 null** · `events: []`
- [x] **V4** 連打兩次:第二次 `THROTTLED` + `retryAfterSeconds` 30,零寫入
- [x] **V6**(spec 外)vite proxy 路徑 `:5173/api/…/sync-check` → 200,shape 正確
- [ ] ❌ **V5 Browser 實際行一次(三態文案 + cooldown disable + light/dark)— 未驗證**
      `claude-in-chrome` extension 連唔上(同 memory `ui-verification-route` 記錄一致),本 session 亦冇 Playwright MCP。
      **唔當佢過(H7)。** 已覆蓋嘅替代證據:F7 七條 component test 係真 render + 真 assert;V6 證咗前端實際打嗰條 URL 通。
      **仍未證嘅係**:實際 light/dark 觀感。→ 交 Chris 人手一眼,或者下個 session 用 Playwright MCP 補。

## Cross-Cutting

- [x] Each commit references `progress.md` Day-N entry(R2)
- [x] Commit message 標對應 component tag
- [x] ADR:**唔觸發 H1**(理由見 spec §2.3 + progress Decisions);實作全程冇出現要改 `azureSyncedAt` 語意嘅情況
- [ ] Open-question status sync — N/A(本 CH 冇掂 open question)
- [x] Pending changes synced to `BACKLOG.md`(R7)— A 段加咗 CH-015 一行,狀態寫明「待 V5 補驗」
- [x] Push + PR — **PR #66**(`main` ← `feat/fulfilment-on-demand-sync-check`)。兩步都獨立驗過真:`git ls-remote` SHA = local HEAD;`gh pr view 66` = `OPEN` + commit oid 對得上
- [ ] `CLAUDE.md §0/§9` + `SESSION_SUMMARY.md` 座標掃過(§14 規矩)
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
