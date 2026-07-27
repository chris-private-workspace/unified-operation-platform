---
phase: W36-n8n-intake-adapter
plan_ref: ./plan.md
status: complete       # in-progress | complete —— 2026-07-27 收官
last_updated: 2026-07-27
---

# Phase W36 — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。
>
> ✅ **Phase 收官(2026-07-27)**:F1 / F1b / F2 / F3 / F4 / Cross-Cutting 全部完成,**Gate 9/9**。
> 仍然 `[ ]` 嘅只有 **兩項 🚧**(F1c —— Chris 喺 n8n UI 操作 + 改完對真 payload),平台側代做唔到,已轉 retro **C1/C2** carry-over。

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
- [ ] 🚧 **Chris 喺 n8n UI 執行改動**(含 **enable 1005 `WF1 - Call UOP Intake`** + 🆕 **加 `X-Intake-Key` header** + `UOP_INTAKE_URL` 指去 `/requests/intake/n8n`,見 `N8N-WF1-CHANGES.md §2.5`)—— **延後:平台側無法代做,等 owner 喺 n8n UI 操作**;target = 真對接當日(retro **C2**)
- [ ] 🚧 改完之後對一次真 payload(F4 R5)—— **延後:依賴上一項 + 真 SN 可達(R2)**;target = `DEPLOY-harden`(retro **C1/C2**)
- [x] **OQ-1 mapping 表放邊 拍板** → **code 常數表**(Chris,2026-07-27)
- [x] **OQ-2 `RAPO IT (RDC2)` 拍板** → **平台新增一個 OpCo**(Chris,2026-07-27)→ F1b
- [x] **交 Chris 確認 18/18** → **全部確認,G1 達標**(2026-07-27);mapping 表已落 `opco-department-map.ts` + 4 條 drift-guard test

## F1b — 新增 OpCo `RAPO/IT (RDC2)`(code + 各環境 ops)

- [x] `seed.ts` `OPCOS` 加 `{ code: 'RAPO/IT (RDC2)', company: 'RAPO', costCenter: 'IT (RDC2)' }`(跟 `RAPO/IT (RBS)` 格式)
- [x] 更新 `seed.ts:6` 註解 provenance(「23 … from the FY26 M365 license summary」→ 分清 FY26 來源 vs n8n `deptMapping` 來源)
- [x] **scratch DB 實跑重 seed 證冪等** —— seed×1 → **24** 行 + RDC2 欄位正確;seed×2 → 仍 **24**、RDC2 **恰好 1 行**;scratch DB 已 drop
- [x] 確認零 schema 改動(`schema.prisma` 零 diff,只改 `seed.ts` data + 註解)
- [x] 記 ops carry-over:**本機 dev DB / UAT / prod 各自要補一次**(建議走 CH-004 `POST /admin/opcos`,唔使重跑全 seed)—— ⚠️ **本機 dev DB 未補**,F4 live 測 RDC2 前要做

## F2 — Adapter endpoint + resolver(code)

- [x] `dto/n8n-native-intake.dto.ts` —— n8n 原生信封 + class-validator
- [x] `intake-adapter.service.ts`:`licenseCode → skuId` resolve(**唯一命中,≥2 候選 fail-closed**)
- [x] `intake-adapter.service.ts`:`department → opcoCode` resolve(F1 表 + `active: true` 要求,落差 #5)
- [x] `intake-adapter.service.ts`:REQ number → sysId 反查(`snow.getRecordByNumber`)
- [x] `intake-adapter.service.ts`:攤平信封 → canonical DTO(`quantity` 預設 1)
- [x] `POST /requests/intake/n8n` 掛 `IntakeController` + **同一個 `IntakeKeyGuard`**
- [x] 驗證 `IntakeService` / canonical DTO / `CONTRACT.md` **零 diff**(G2 — `git diff --stat`)
- [x] H4 自查:log / 錯誤訊息零 UPN、零 email、零 secret、零 payload 全文

## F3 — H5 test

- [x] **先寫紅**:兩個「E5」歧義 test → assert 拋錯 **且** 零 `request.create`(G3 硬紅線)
- [x] 記低 fails-before 證據入 `progress.md`
- [x] `licenseCode` resolve happy / not-found / 歧義 三 case
- [x] `department` resolve happy / not-found / OpCo `active: false` 三 case
- [x] REQ number 反查 happy / not-found(SN mock)
- [x] 冪等:同 REQ number 推兩次 → 一個 request
- [x] H4 test:餵假 secret / PII assert 回應零洩漏(G7,仿 W30 G1)
- [x] canonical route 迴歸:既有 intake test 全綠 **且零 assertion 要改**
- [x] `npm test -w apps/api` 全綠(G5)

## F4 — Live 驗證 + doc-sync

- [x] 由 n8n `1001` `WF1 - Prepare UOP Intake` 抄**當日真實** return shape,對一次(R5)—— 實讀 node `jsCode`,逐欄對 DTO **無落差**;再用**逐字照抄**嘅 shape(含 `|| ''` 空字串 + nested `variables`)live 打一次 → **201**
- [x] 對比 1001(即時)vs 1005(排程)兩個 payload shape 係咪真係一樣(R3)—— **實讀兩個 node 確認 shape 完全一致**,差別只喺取值來源(`aiBrain` vs `execution_context`);body 表達式亦各自正確(`$json._uopPayload` vs `$json`)
- [x] live case 1:無 key → **401** `{"message":"Invalid or missing intake key"...}`
- [x] live case 2:真 payload → **201**,`serviceNowSysId: sys-REQ0043858` · `opco RHK` · `skuId 06ebc4ee-…`(E5)
- [x] live case 3:同 payload 重推 → **同一個 `id`**(`cms2urtmj00018ypc985xtq9d`),DB 仍然 1 request / 1 line item
- [x] live case 4:三種 resolve 失敗全部 **400 且回顯對唔到嘅值** —— 未知 Job Function / 未知 licence code / REQ 不存在;另加 `event` 錯值、`department` 空、`licenseCode: null` 三個 envelope 拒收
- [x] **額外**:`RAPO IT (RDC2)` Job Function live 打通 → 201 落 `RAPO/IT (RDC2)`(F1b 個 seed row 真係 work)
- [x] DB 實查建成嘅 `Request` + `RequestLineItem`(REQ sysId / skuId GUID / opcoId)—— **scratch DB `w36live`(dev dump + seed),已 drop;dev DB 全程零改動**
- [x] **負面實證**:6 個被拒 case 喺 DB **零行**,而且 mock-SN log **完全冇佢哋** ⇒ cheapest-first ordering 真係擋喺網絡之前
- [x] ⚠️ **SN 反查:用 demo-harness mock,唔係真 ServiceNow** —— 證到嘅係 adapter→`IntakeService`→DB 成條路真係通 + 反查用啱 table(`sc_request`)/ 用啱 REQ number;**未證** SN 真實回應欄名。真 SN 端到端 **仍然未驗證**(R2 憑證 placeholder),記 carry-over,**唔當 pass**
- [x] 🔴 **F4 新發現(blocking)**:兩個 `WF1 - Call UOP Intake` **完全冇送 `X-Intake-Key`**(無 `sendHeaders`、`credentials: []`)→ 一 enable 就全部 401。已寫入 `N8N-WF1-CHANGES.md §2.5`
- [x] 修正 `scripts/demo-harness/mock-servicenow.js`:GET query form 本來返 object,真 Table API 返 **array** → 令所有 number 反查睇落都似「搵唔到」(R3 計劃外改動,已記 progress)
- [x] doc-sync:`N8N-INTAKE-HANDOFF.md` §0 + §7 落差 #1(blocking → adapter 解決;明寫 **LOCKED 合約零改動**)+ 新 **§8** adapter route 全節 + §2 加 RDC2 註記 + §9 索引
- [x] doc-sync:`N8N-INTAKE-HANDOFF.md` §7 落差 #5(adapter 已收緊;明寫 **canonical route 行為不變**)+ 新增落差 #6(各環境要補 RDC2)
- [x] doc-sync:`N8N-INTEGRATION-SETUP.md` 加 adapter route(§0 總覽 + 新 **§1.5** 兩條 route 對照 + §1.4/§5 deploy 前提 + §6 索引)
- [x] `npm run lint` 0 warning(G8)

---

## Cross-Cutting

- [x] All deliverables committed to git —— `6bc32c8`(ADR+F1)· `9b5b2b3`(F1b/F2/F3)· `3a04a53`(F4)· closeout commit。**`docs/06-reference/03-n8n-workflow/` 四次全部刻意排除**(明文憑證,見 SEC-001)
- [x] All open-question status changes reflected in decision tracker(R4)—— `plan.md §8`:OQ-1 ✅ · OQ-2 ✅ · **OQ-3 由「待確認」改「✅ 收貨:同一個 key」**(live 驗過)· OQ-4 🟡 仍開(轉 retro C5)
- [x] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)—— **無新 ADR**:ADR-0017 事前 Accepted 且全程冇踩出範圍(零 schema[seed data ≠ schema]· 零新 runtime dep · 零 scope 外功能);OQ-1 選咗 (a) code 常數表故唔觸發補 ADR
- [x] Pending / next-candidate changes synced to `BACKLOG.md`(R7)—— 戊 row → ✅ 完成 + carry-over;`n8n-intake-handoff` row 落差 #1/#5 劃走;己庚辛 row → 「己解封 = W37 候選」;**新登 A 區 `SEC-001`**;最後更新段落
- [x] `progress.md` retro section written —— What worked / didn't / 5 個 surprises / **C1-C6 carry-over 表** / ADR triggers / Gate 9 條 / Phase status
- [x] `progress.md` frontmatter status flipped to `closed`(連 `plan.md` → `closed` + changelog v1.3 · 本檔 → `complete`)
- [x] Phase N+1 kickoff trigger noted in retro(→ 己:`LicenseOperationsProvider` + `GraphLicenseProvider` 純重構,零行為改變)
- [x] 跑 `anti-patterns` skill 自檢 —— **AP-2 ❌ 揪到並修好**(`N8N-INTEGRATION-SETUP` §0「成熟度 ✅」/ §1「production-ready」會被讀成連 adapter route 都驗過,實情 SN 係 mock、n8n 側三個缺口未補 → 兩處改成誠實表述 + 明列驗到邊);其餘 ✅ / N/A。**新增 AP-11**(驗錯咗第二個 checkout)+ **AP-12**(冇驗「唔應該發生嘅嘢真係冇發生」)入 skill

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
