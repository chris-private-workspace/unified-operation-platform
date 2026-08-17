---
change_id: CH-031
derived_from: spec.md §6
status: blocked          # 🔴 ADR-0040 仲係 Proposed ⇒ 唔可以落 code(H1)
---

# CH-031 — Implementation checklist

> 由 `spec.md §6` acceptance derive(PROCESS §3.4 步驟 4)。
> 🔴🔴 **開工閘**:`ADR-0040` 一日未 `Accepted`,S1 以下一條都唔可以做。
> 📌 **勾之前**:每條要搵返**實際證據**(邊個 spec / 邊個 `describe` / 邊個 tool output),**唔靠記憶勾**(W46 教訓)。

---

## S0 — 開工閘

- [ ] **S0-1** `ADR-0040` 由 `Proposed` → `Accepted`(Chris),`docs/adr/README.md` 狀態欄同步 → 收 `F3`
- [ ] **S0-2** 由 `main` 開 branch(`main` 而家 = `125ab50`)

## S1 — Schema + migration

- [ ] **S1-1** `schema.prisma` `AgentRun` 加 `hiddenAt DateTime?` + 註釋(講**點解係 soft-hide 唔係 delete**,指返 ADR-0040)
- [ ] **S1-2** `prisma migrate dev` 生 migration → 收 `A1`
- [ ] **S1-3** 🔴 **親自 Read 個 migration SQL**,確認一行 `ADD COLUMN`、冇 `UNIQUE`、冇 index、冇 `NOT NULL`(唔靠 Prisma 講,跟 ADR-0035 先例)→ 收 `A1`
- [ ] **S1-4** 對真 Postgres 跑;既有 row `hiddenAt` 全 `NULL` → 收 `A2` 本機半
  - ⚠️ **本機 5433 陷阱**:`ai-doc-extraction-db` 佔住,停佢**要 Chris 批**,而且佢會自己返嚟搶 port(§9)⇒ 一氣呵成做完
  - ⚠️ 起 stack 前先刪 `apps/api/*.tsbuildinfo` + `dist/`

## S2 — API

- [ ] **S2-1** `AiAssistService` 加 `hideRun` / `unhideRun`:行返 `getRun`(拎 404 + OpCo scope)→ terminal 閘 → `agentRun.update` + `AuditLog` 同一 `$transaction`
- [ ] **S2-2** `findLatestForRequest` 加 `hiddenAt: null`;**`getRun` 明文唔加**(寫註釋講點解)→ 收 `B3` `B4`
- [ ] **S2-3** Controller 加兩條 route + method-level `@Roles(Role.ADMIN)` → 收 `B1` `B6`
- [ ] **S2-4** `audit-fields.ts` 加 `AGENT_RUN_HIDDEN: 'agent.run_hidden'` + docblock(講點解 —— 引 `AGENT_KILL_SWITCH_SET` 個論據)→ 收 `D1`
- [ ] **S2-5** 更新 `permissions.spec.ts.snap`,**逐行睇過**唔好 `-u` 咗就算 → 收 `B6`

## S3 — Test(H5)

- [ ] **S3-1** service spec:hide / unhide / terminal 閘 409 / OpCo scope → 收 `B1` `B2` `B5`
- [ ] **S3-2** controller spec:403 for REGIONAL、200 for ADMIN → 收 `B6`
- [ ] **S3-3** 🔴 `review-stats` 前後逐字一樣 → 收 `C1`
- [ ] **S3-4** 🔴 `kill-switch.settled` 唔受影響 → 收 `C2`
- [ ] **S3-5** 🔴🔴 **Falsification**:`review-stats.service.ts` 個 `where` 硬加 `hiddenAt: null` ⇒ S3-3 **必須真紅**;記低紅幾多條 + 有冇誤傷;**還原** → 收 `C3`
- [ ] **S3-6** `agent.boundary.spec.ts` 加 `writersOf('agentRun')`;**故意喺第二個檔案加一句 `agentRun.update` 驗佢真紅**,再還原 → 收 `C4`
- [ ] **S3-7** audit 同一 transaction 嘅 rollback test(跟 W29 先例)→ 收 `D3`

## S4 — 前端(H6)

- [ ] **S4-1** `ai-assist-card.tsx` 加 hide 入口,ADMIN-only(`roles.ts`)→ 收 `E1`
- [ ] **S4-2** hidden 之後張卡消失 / 空態,唔留壞 loading → 收 `E2`
- [ ] **S4-3** ⚠️ hide **唔可以做 primary action**(張卡已有 Approve / Reject / Stop)→ 收 `E4`
- [ ] **S4-4** 跑 `ui-design` skill 自檢
- [ ] **S4-5** **light + dark 真 render**,零橫向溢出 → 收 `E3`
  - ⚠️ 跑 full web suite 前**停 dev server**(§9:stack 跑緊會令一條 test 撞爆 5s timeout)

## S5 — Gate

- [ ] **S5-1** root `npm test` exit 0,api + web 零紅 → 收 `F1`
- [ ] **S5-2** root `npm run build` + tsc ×2 + lint → 收 `F2`

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
