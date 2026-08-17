---
change_id: CH-031
derived_from: spec.md §6
status: in-progress      # 🟢 2026-08-17 ADR-0040 Accepted ⇒ 開工閘過咗
---

# CH-031 — Implementation checklist

> 由 `spec.md §6` acceptance derive(PROCESS §3.4 步驟 4)。
> 🟢 **開工閘 2026-08-17 過咗**(`ADR-0040` `Accepted`)。
> 📌 **勾之前**:每條要搵返**實際證據**(邊個 spec / 邊個 `describe` / 邊個 tool output),**唔靠記憶勾**(W46 教訓)。

---

## S0 — 開工閘

- [x] **S0-1** `ADR-0040` 由 `Proposed` → `Accepted`(Chris 2026-08-17),`docs/adr/README.md` 狀態欄同步 → 收 `F3`
- [x] **S0-2** branch `feat/ch-031-agent-run-soft-hide`(由 `main` = `125ab50` 開,doc commit 一齊帶住 ⇒ 一個 PR 一件事)

## S1 — Schema + migration

- [x] **S1-1** `schema.prisma` `AgentRun` 加 `hiddenAt DateTime?` + 註釋(講**點解係 soft-hide 唔係 delete**,指返 ADR-0040)
- [x] **S1-2** migration `20260817090000_ch031_agent_run_hidden_at` → 收 `A1`
  - 🔴 **R3 deviation**:**手寫**唔係 `prisma migrate dev` 生 —— 本機 5433 畀 `ai-doc-extraction-db` 佔住(停佢要 Chris 批),而 `migrate dev` 要 shadow DB。範本逐字跟 `20260728135856_w40_ticket_held_at`(同樣 nullable `DateTime`)。**代價**:未經 Prisma 生成 ⇒ S1-4 真跑之前,唔可以講佢同 schema 對得上
- [x] **S1-3** SQL 實讀:`ALTER TABLE "AgentRun" ADD COLUMN     "hiddenAt" TIMESTAMP(3);` —— 一行、冇 `UNIQUE`、冇 index、冇 `NOT NULL` → 收 `A1`
- [ ] **S1-4** 🚧 對真 Postgres 跑;既有 row `hiddenAt` 全 `NULL` → 收 `A2` 本機半
  - 🔴 **卡住**:`ai-doc-extraction-db` 佔住 5433,**停佢要 Chris 批**,而且佢會自己返嚟搶 port(§9)⇒ 一氣呵成做完
  - ⚠️ 起 stack 前先刪 `apps/api/*.tsbuildinfo` + `dist/`

## S2 — API

- [x] **S2-1** `AiAssistService` 加 `hideRun` / `unhideRun` / private `setRunHidden`:行返 `getRun`(拎 404 + OpCo scope)→ terminal 閘 → `agentRun.update` + `AuditLog` 同一 `$transaction`
- [x] **S2-2** `findLatestForRequest` 加 `hiddenAt: null`;**`getRun` 明文唔加**(兩邊都寫咗註釋講點解)→ 收 `B3` `B4`
- [x] **S2-3** Controller 加兩條 route + method-level `@Roles(Role.ADMIN)`;`AgentRunDto` 加 `hiddenAt` → 收 `B1` `B6`
- [x] **S2-4** `audit-fields.ts` 加 `AGENT_RUN_HIDDEN: 'agent.run_hidden'` + docblock(引 `AGENT_KILL_SWITCH_SET` 個論據)→ 收 `D1`
- [x] **S2-5** `permissions.spec.ts.snap` 更新;**diff 逐行睇過 = `2 insertions, 0 deletions`,兩行都 `→ roles [ADMIN]`** → 收 `B6`

## S3 — Test(H5)

- [x] **S3-1** service spec 11 條:hide / unhide / terminal 閘 409(3 個 status)/ 可 hide(5 個 status)/ OpCo scope / 404 / **只寫 `AgentRun` 一張表兼只寫一個欄** / audit / 兩條讀路徑 → 收 `B1` `B2` `B3` `B4` `B5` `D1` `D3`
- [x] **S3-2** RBAC:**唔用 controller unit test,用 `permissions.spec.ts` derive 出嚟嘅矩陣**(更強 —— 佢係由 `@Roles` decorator 真 derive)→ 收 `B6`
- [x] **S3-3** `review-stats` 個 `where` 永遠唔提 `hiddenAt`(assert query 唔 assert 數字 —— 數字可以啱得好彩,`where` 冇提就結構上濾唔到)→ 收 `C1`
- [x] **S3-4** `kill-switch` 嗰條**原本就係 exact-match `toHaveBeenCalledWith`** ⇒ 加 `hiddenAt` 落去佢自己會紅。**冇重複寫一條**,只補註釋標明佢而家兼任 D4 守衛 → 收 `C2`
- [x] **S3-5** 🔴🔴 **Falsification ×3 全部真跑真紅零誤傷**:
  - `review-stats` `where` 加 `run: { hiddenAt: null }` ⇒ **1 紅 / 13 綠**,紅嗰條 = `never filters on whether the run was hidden` → 收 `C3`
  - `kill-switch.service.ts` 加一個真 `agentRun.update` writer ⇒ **1 紅 / 16 綠**,紅嗰條 = `only ai-assist.service writes AgentRun` → 收 `C4`
  - `findLatestForRequest` 拆走 `hiddenAt: null` ⇒ **1 紅 / 78 綠**(本單核心功能)
- [x] **S3-6** `agent.boundary.spec.ts` 加 `writersOf('agentRun')`(見上面 falsification 第 2 條)→ 收 `C4`
- [x] **S3-7** audit 同一 transaction:用既有 `auditSawOpenTransaction` flag(佢分得出「transaction 開住嗰陣寫」同「transaction 閂咗之後寫」)→ 收 `D3`

## S4 — 前端(H6)

- [x] **S4-1** `ai-assist-card.tsx` 加 `Hide`,ADMIN-only(新 `canHideAgentRun` 落 `roles.ts`)+ `useHideAgentRun` mutation + `AgentRun.hiddenAt` 落 `api-types.ts` → 收 `E1`
- [x] **S4-2** hide 成功 ⇒ invalidate `agentRunKey` ⇒ 個 query 返 `null` ⇒ 張卡返去 EmptyState(**服務端就係濾嗰條 query**);hide 失敗會出喺既有 error div(有 test) → 收 `E2`
- [x] **S4-3** `variant="ghost"`,同隔籬 `Stop` 一樣。**核過成張 card 零 `variant="primary"`** → 收 `E4`
- [x] **S4-4** 跑咗 `ui-design` skill:DS-1 ✅(個掣零 `className`,`button.tsx:14-15` ghost 全 token 零 hex)· DS-3 ✅ · DS-7/9/10 ✅ · DS-5/6/8/11/12 N/A · **DS-4 見 S4-5**
- [x] **S4-5a** web UI test 5 組 14 條(4 個 terminal status 有掣 · 3 個 non-terminal 冇 · REGIONAL/OPCO_IT 冇 · **REGIONAL 有 Stop 冇 Hide** · error 顯示);falsification 拆走 role check ⇒ **2 紅 / 23 綠**,紅嗰兩條正正係 RBAC
- [ ] **S4-5b** 🚧 **light + dark 真 render**,零橫向溢出 → 收 `E3`
  - 🔴 **卡住**:同 S1-4 —— 要起 stack,要 5433
  - ⚠️ 跑 full web suite 前**停 dev server**(§9)

## S5 — Gate

- [x] **S5-1** root `npm test` **exit 0** —— api **1381 / 92 suites**(基線 1362)· web **450 / 43 files**(基線 439),**兩邊零紅** → 收 `F1`
- [x] **S5-2** root `npm run build` **exit 0**(web `tsc --noEmit && vite build`,1719 modules)· root `npm run lint` **exit 0**(api + web)· api `tsc --noEmit` **exit 0** → 收 `F2`

## S6 — 部署 + live

- [ ] **S6-1** 部署 #10 上 DEV(migration 會跟住跑)→ 收 `A2` DEV 半
- [ ] **S6-2** DEV 兩個測試 run hide 走;驗 **request detail 唔再見到** **兼且** `GET /agent/runs/:id` **仍然 200** → 收 `G1`
- [ ] **S6-3** 落 DB / 落 API 對數,唔係睇 HTTP 200 → 收 `G2`

## S7 — 收尾

- [ ] **S7-1** `progress.md` 寫 Day-N(R2)
- [ ] **S7-2** `spec.md §6` **逐條搵返證據**勾(唔靠記憶)
- [ ] **S7-3** `BACKLOG.md` CH-031 行更新;`agent-boundary-gaps` 行按實際結果調整(R7)
- [ ] **S7-4** `CLAUDE.md §0` + `SESSION_SUMMARY.md` 掃一次(CLAUDE.md §14 硬規矩)
- [ ] **S7-5** `RISK_REGISTER.md`:睇下 `R13` 要唔要補一句(hide 唔影響佢,但值唔值得寫落 risk 度做記錄)
