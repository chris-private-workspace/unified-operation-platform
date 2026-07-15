---
phase: W24-request-intake
---

# W24 Phase 甲 — Checklist(daily tick)

## D0 — doc-sync(ADR-0008 Accepted 帶嚟嘅 scope 真相)
- [x] `DESIGN §2` scope in/out 更新(獨立 request 建單 + M365/D365 + n8n 雙向 in;D365-side provisioning out)
- [x] `DESIGN §9 #5` M365 only → M365+D365 + 獨立 request
- [x] `architecture.md §2` in/out scope 更新
- [x] `architecture.md §11` D365 license(納入)vs D365 業務模組(future)澄清
- [x] `BACKLOG` R7 同步(Active 表 W24 行 + 頭部 + 路線)
- [x] memory 更新(新 `project_adr-0008-request-intake-d365` + MEMORY.md 索引)
- [x] **doc-review 後補齊 scope-sync 缺口**(2026-07-15,root cause 5 條同源 batch 補):BACKLOG §F · DESIGN §11 · architecture header/Decision Log · `schema.prisma` banner · ADR README(ADR-0004 適用範圍註)

## D1 — m2m auth + intake 合約(→ `CONTRACT.md`)
- [x] m2m auth 方式拍板(**static API key** `X-Intake-Key`,fail-closed;CONTRACT §2)
- [x] intake DTO / payload 合約定義(代表性 `N8nIntakeRequestDto` + 對映 + 為何新 endpoint;CONTRACT §1/§3/§4)
- [x] 🔶 (協調·外部→內部)同 n8n / Phase 1 team 對 → **`N8N-AGENDA.md`** ✅ **Chris = workflow 管理者本人,2026-07-15 即場答齊 10 條**(A1 只 push · A2 人手 queue[唔觸 ADR]· A3 non-blocking · A4 on-prem 延遲 · B1 GUID · B2 code · B3 REQ+RITM 齊 · B6 unassigned;B4/B5 推導預設)→ 已回寫 AGENDA 決定總結 + CONTRACT lock + DESIGN §7 + RISK R3

## D2 — intake endpoint + 建 mirror ✅
- [x] intake endpoint(`POST /requests/intake`)+ DTO validation(`N8nIntakeRequestDto`)
- [x] m2m guard `IntakeKeyGuard`(fail-closed 401,`X-Intake-Key`,getOrThrow env)
- [x] 建 mirror service `IntakeService`(resolve opcoCode/skuId → nested create `Request` + `RequestLineItem`,set REQ/RITM + `azureSyncedAt`,idempotent on REQ sysId + P2002 race)
- [x] schema additive(`RequestLineItem` 加 `serviceNowSysId/Number` RITM 欄,two-level)+ migration `20260715052910_add_lineitem_servicenow_ritm`
- [x] module 註冊(fulfilment.module:IntakeController + IntakeService + IntakeKeyGuard)

## D3 — H5 tests ✅(api 157→176,+19)
- [x] intake happy(建 mirror + REQ/RITM + sync gate) — intake.service.spec
- [x] 缺/錯 m2m credential → 401,零寫入 — intake-key.guard.spec(4 case)
- [x] payload validation(缺 required → 400)
- [x] sync gate 狀態正確落 `azureSyncedAt`(ISO → Date)
- [x] idempotent(同 REQ sysId 重推唔 double + P2002 race)
- [x] 回寫 per-line RITM + fallback — assign.service.spec(H5 critical path)

## D4 — verify + closeout ✅
- [x] build / lint / test 全綠(generate ✓ · nest build ✓ · jest 176 ✓ · eslint clean)
- [x] live curl(錯 key→401 · 建 mirror two-level · 重推 idempotent count=1 · 空 body→400;e2e data 已清)
- [x] regression(module D 履行 176 test 全 pass;backend watch reload 新 code)
- [x] BACKLOG / memory 同步 + progress retro + plan closed + Phase 乙 carry
