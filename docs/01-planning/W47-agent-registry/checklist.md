# W47 — Agent Registry · Checklist

> 由 `plan.md` derive。🟢 **plan `status: active`(Chris 2026-08-17 approve,四條 OQ 全答)**。
> 每項做完即勾 + 寫 `progress.md` Day-N(R2)。

## `F0` — 開工前(唔使 approve 都做得)

- [x] F0-1 掃 phase 號 —— `git fetch --all` + 掃晒所有 remote branch(PROCESS §2.1,有兩個 W36 撞過嘅實例)⇒ 最大 **W46**,揀 **W47**
- [x] F0-2 由 `origin/main` 開 `feat/w47-agent-registry`(`125ab50`,已含部署 #9 / #9b)
- [x] F0-3 確認 W46 前置真收 —— `A1`(container log `25 migrations found` → 三個 W46 migration 逐個 applied)· `B6`(`POST /agent/runs` **201** + SSE **200** `text/event-stream`)· DEV OpenAPI 三個 agent path 都喺
- [x] F0-4 🟢 **四條 OQ 2026-08-17 全部答齊,plan `draft → active`** —— `OQ-A` ADMIN only · `OQ-B` 獨立 route `/agent` · `OQ-C` 改 prompt 入 audit · `OQ-D` 舊 run 顯示「(W47 之前)」唔隱藏

## `F1` — `AgentProfile` model + migration(H1)

- [ ] F1-1 `AgentProfile` model(`principalId` / `name` / `model` / `prompt?` / `active`,`@@unique([principalId, name])`)
- [ ] F1-2 `AgentRun.profileId String?` —— **nullable**,理由喺 `R2`
- [ ] F1-3 migration 生成 + **對本機真 DB 跑**(⚠️ 5433 要 Chris 批准停 `ai-doc-extraction-db`)
- [ ] F1-4 seed:現有 `ai-assist` principal 掛一個 default profile
- [ ] F1-5 🔴 **G2 嘅 test**:`profileId = null` 嘅舊 run,`GET /agent/runs/:id` 唔可以 500
- [ ] F1-6 DEV migration(部署之後)

## `F2` — Profile CRUD

- [ ] F2-1 `AgentProfileService`(list / create / update / deactivate)
- [ ] F2-2 `GET/POST/PATCH /agent/profiles`,`@Roles` 跟 `OQ-A`
- [ ] F2-3 **唔提供硬刪** —— 只 `active=false`(`R3`)
- [ ] F2-4 名重複 → 409 · `model` 空 → 400
- [ ] F2-5 `permissions.spec.ts` drift test 認得新 endpoint(W28 機制)
- [ ] F2-6 🔴 改 `prompt` 入 audit(`OQ-C`;跟 ADR-0013 `ConnectorConfig` 先例)—— `R1` 第一道 mitigation
- [ ] F2-7 controller spec(BUG-011 教訓:bug 住喺兩層之間)

## `F3` — 啟動 run 揀 profile

- [ ] F3-1 `StartAgentRunDto` 加 `profileId?`
- [ ] F3-2 唔送 → 用該 principal 嘅 default profile
- [ ] F3-3 🔴 inactive / 唔存在 / 屬另一個 principal → **400,唔准靜靜 fallback**
- [ ] F3-4 `AgentRun.profileId` 寫低 + `GET /agent/runs/:id` 出得返
- [ ] F3-5 🔴 `buildAzureClient` 個 model 由 profile 嚟 —— ⚠️ **三個 `AZURE_OPENAI_*` 缺一即 503 呢個行為唔准鬆**(ADR-0037 `E1` 靠佢)
- [ ] F3-6 falsification:拆走 F3-3 個 guard ⇒ 應該紅

## `F4` — 全域 run 列表

- [ ] F4-1 `GET /agent/runs?status=&profileId=&since=&limit=&cursor=`
- [ ] F4-2 🔴 OpCo scope 照舊由**啟動者**帶入(`OQ-2` 個答案喺呢度第一次有實際後果)
- [ ] F4-3 cursor 分頁(**唔可以 `take` 一個大數扮分頁** —— `R5`)
- [ ] F4-4 🔴 `runState` **唔出 wire**(W46 個 `select` 就係唯一嗰道閘)
- [ ] F4-5 每個篩選 param 各一條 test
- [ ] F4-6 falsification:拆走 scope filter ⇒ 應該紅

## `F5` — 管理 UI(H6)

- [ ] F5-1 route / nav(跟 `OQ-B`)
- [ ] F5-2 profile 列表 + 建立 / 編輯 dialog
- [ ] F5-3 run 列表(狀態 / profile / 時間 / 入得去)
- [ ] F5-4 舊 run 顯示「(W47 之前)」,**唔隱藏**(`OQ-D`)
- [ ] F5-5 DS-5:id / 數字 mono · DS-3:一個 view 一個 primary · DS-8:狀態走 Badge
- [ ] F5-6 跑 `ui-design` skill 自檢
- [ ] F5-7 light + dark 真 render + 零橫向溢出(⚠️ 跑 full web suite 前停 dev server)

## `F6` — Gate

- [ ] F6-1 root `npm test`(api + web)exit 0
- [ ] F6-2 root `npm run lint` exit 0
- [ ] F6-3 root `npm run build` exit 0
- [ ] F6-4 `agent.boundary.spec.ts` 全綠(G3)
- [ ] F6-5 falsification 逐個真跑真紅 + 還原後**真跑一次**(唔可以只睇 `git diff`)

## `F7` — Live 驗

- [ ] F7-1 本機:兩個 profile(唔同 model)各跑一個 run,列表分得開
- [ ] F7-2 DEV:migration + 列表
- [ ] F7-3 ⚠️ **唔可以睇 revision status 當證據** —— entrypoint 令 migrate 失敗 NON-FATAL

## `F8` — 收尾

- [ ] F8-1 `plan.md` acceptance 逐條掃(**W46 教訓:呢張表由頭到尾冇更新過**)
- [ ] F8-2 progress retro
- [ ] F8-3 新 risk 入 `RISK_REGISTER.md`(特別係 `R1` prompt-in-DB)
- [ ] F8-4 `BACKLOG.md` 同步(R7)
- [ ] F8-5 `CLAUDE.md §0` + `SESSION_SUMMARY.md` doc-sync(§14:**佢哋過時 = 下個 session 用錯前提開始**)
