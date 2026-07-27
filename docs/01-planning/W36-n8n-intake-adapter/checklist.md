---
phase: W36-n8n-intake-adapter
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-27
---

# Phase W36 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
>
> ✅ **Gate 已解**(2026-07-27):OQ-1 = **code 常數表** · OQ-2 = **平台新增 OpCo**。plan flip `active`。
> 仍未解:**G1(Chris 確認 18/18 mapping)** —— F1 未 tick 完之前 F2 嘅 `department` resolve 冇表可用。

## F1 — 對接落差 grounding + mapping 表(doc,pre-code gate)

- [x] 抽 n8n `1002` `deptMapping` 全部 key(kickoff grounding 已做 → **18 條**)
- [x] 抽平台 `seed.ts` 全部 `Opco.code`(kickoff grounding 已做 → **23 條**)
- [x] 比對揪出三個結構性落差(格式 / 多對一 / `RAPO IT (RDC2)` 無對應)
- [x] 草擬 18 條 Job Function → `Opco.code` 對照表,逐條標「確定 / 待確認」→ `MAPPING.md §1`(6 條 ✅ 確定 / 11 條 ⚠️ 待確認 / 1 條 🔴 待拍板)
- [x] 列出 catalog 現有 `businessAlias` 覆蓋率 + 所有歧義 code(R4)→ `MAPPING.md §2`(**99 active / 只 8 個有 alias / 0 歧義**,dev DB psql 直查)
- [x] 文件加「snapshot 唔係 SSOT」防 stale 註記
- [x] 🔴 **發現 A**:RDC2 個 `description` 已經係 `RAPO/IT` → OQ-2 前提被推翻,已記入 `MAPPING.md §0`
- [x] 🔴 **發現 B**:WF1 送嘅 `department` 係 AI 抽自由文本,唔係 18 條 key → 已記入 §0
- [x] 🔴 **發現 C**:WF1 payload 用未驗證資料(`validated: false`)→ 已記入 §0
- [x] 🔴 **Chris 決定 §4 五項**(2026-07-27):A = **維持新增 OpCo** · B = **(a) n8n 送 `jobFunction`** · C = **改用 validated 值** · OQ-4 = **暫拎唔到,按 §2.3 規劃先行** · **18 條全部確認 = G1 達標** ✅
- [x] **G1 達標** —— `MAPPING.md` status flip 為 `confirmed`

## F1c — n8n 側 WF1 改動指示(交 Chris 執行)

- [x] 實讀 `1001` `prepare approval data` return block —— 證實 `jobFunction` + validated 三寶(`username`/`sAMAccountName`/`derivedEmail`)**已經現成**
- [x] `N8N-WF1-CHANGES.md`:1001 改動(7 個欄位 + `const p = $('prepare approval data')…`)
- [x] `N8N-WF1-CHANGES.md`:1005 改動(`Check Activate Date` + `Prepare Schedule Record` 各加 `jobFunction`;WF1 改讀 `ctx.jobFunction`)
- [x] 標明**唔好郁**:`_uopNeeded` gate · `licenseItems[]` 來源 · `idempotencyKey`
- [x] 寫平台側驗收表 + 「未改之前平台點反應」(令兩邊可並行)
- [ ] 🔴 **Chris 喺 n8n UI 執行改動**(含 **enable 1005 `WF1 - Call UOP Intake`**)
- [ ] 改完之後對一次真 payload(F4 R5)
- [x] **OQ-1 mapping 表放邊 拍板** → **code 常數表**(Chris,2026-07-27)
- [x] **OQ-2 `RAPO IT (RDC2)` 拍板** → **平台新增一個 OpCo**(Chris,2026-07-27)→ F1b
- [ ] **交 Chris 確認 18/18**(G1 —— 仍未解,F2 `department` resolve 等呢張表)

## F1b — 新增 OpCo `RAPO/IT (RDC2)`(code + 各環境 ops)

- [ ] `seed.ts` `OPCOS` 加 `{ code: 'RAPO/IT (RDC2)', company: 'RAPO', costCenter: 'IT (RDC2)' }`(跟 `RAPO/IT (RBS)` 格式)
- [ ] 更新 `seed.ts:6` 註解 provenance(「23 … from the FY26 M365 license summary」→ 分清 FY26 來源 vs n8n `deptMapping` 來源)
- [ ] **scratch DB 實跑重 seed 證冪等**(既有 23 行零改動,只多一行)—— 唔碰 dev DB
- [ ] 確認零 schema 改動(`Opco` model git diff = 0)
- [ ] 記 ops carry-over:**UAT / prod 各自要補一次**(建議走 CH-004 `POST /admin/opcos`,唔使重跑全 seed)

## F2 — Adapter endpoint + resolver(code)

- [ ] `dto/n8n-native-intake.dto.ts` —— n8n 原生信封 + class-validator
- [ ] `intake-adapter.service.ts`:`licenseCode → skuId` resolve(**唯一命中,≥2 候選 fail-closed**)
- [ ] `intake-adapter.service.ts`:`department → opcoCode` resolve(F1 表 + `active: true` 要求,落差 #5)
- [ ] `intake-adapter.service.ts`:REQ number → sysId 反查(`snow.getRecordByNumber`)
- [ ] `intake-adapter.service.ts`:攤平信封 → canonical DTO(`quantity` 預設 1)
- [ ] `POST /requests/intake/n8n` 掛 `IntakeController` + **同一個 `IntakeKeyGuard`**
- [ ] 驗證 `IntakeService` / canonical DTO / `CONTRACT.md` **零 diff**(G2 — `git diff --stat`)
- [ ] H4 自查:log / 錯誤訊息零 UPN、零 email、零 secret、零 payload 全文

## F3 — H5 test

- [ ] **先寫紅**:兩個「E5」歧義 test → assert 拋錯 **且** 零 `request.create`(G3 硬紅線)
- [ ] 記低 fails-before 證據入 `progress.md`
- [ ] `licenseCode` resolve happy / not-found / 歧義 三 case
- [ ] `department` resolve happy / not-found / OpCo `active: false` 三 case
- [ ] REQ number 反查 happy / not-found(SN mock)
- [ ] 冪等:同 REQ number 推兩次 → 一個 request
- [ ] H4 test:餵假 secret / PII assert 回應零洩漏(G7,仿 W30 G1)
- [ ] canonical route 迴歸:既有 intake test 全綠 **且零 assertion 要改**
- [ ] `npm test -w apps/api` 全綠(G5)

## F4 — Live 驗證 + doc-sync

- [ ] 由 n8n `1001` `WF1 - Prepare UOP Intake` 抄**當日真實** return shape,對一次(R5 —— 唔一致即停)
- [ ] 對比 1001(即時)vs 1005(排程)兩個 payload shape 係咪真係一樣(R3)
- [ ] live case 1:無 key → 401(貼真 output)
- [ ] live case 2:真 payload → 201 建成(貼真 output)
- [ ] live case 3:同 payload 重推 → 冪等返既有(貼真 output)
- [ ] live case 4:resolve 失敗 → 4xx 且訊息講得出邊個值對唔到(貼真 output)
- [ ] DB 實查建成嘅 `Request` + `RequestLineItem`(REQ sysId / skuId GUID / opcoId)—— **scratch DB,唔碰 dev DB**
- [ ] ⚠️ SN 不可達則明寫「未驗證」+ 記 carry-over,**唔准當 pass**(R2 / H7)
- [ ] doc-sync:`N8N-INTAKE-HANDOFF.md` §0 + §7 落差 #1(blocking → adapter 解決)
- [ ] doc-sync:`N8N-INTAKE-HANDOFF.md` §7 落差 #5(已收緊)
- [ ] doc-sync:`N8N-INTEGRATION-SETUP.md` 加 adapter route
- [ ] `npm run lint` 0 warning(G8)

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)—— OQ-1/OQ-2/OQ-3
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)—— **ADR-0017 已 Accepted;若 OQ-1 選 (b) DB 則需補新 ADR**
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro(→ 己:`LicenseOperationsProvider` 純重構)
- [ ] 跑 `anti-patterns` skill 自檢

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
