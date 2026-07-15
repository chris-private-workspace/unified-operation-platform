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

## D1 — m2m auth + intake 合約(→ `CONTRACT.md`)
- [x] m2m auth 方式拍板(**static API key** `X-Intake-Key`,fail-closed;CONTRACT §2)
- [x] intake DTO / payload 合約定義(代表性 `N8nIntakeRequestDto` + 對映 + 為何新 endpoint;CONTRACT §1/§3/§4)
- [ ] 🔶 (協調·外部)同 n8n / Phase 1 team 對真實 payload field 名 — CONTRACT §5 六項待確認(lock 前必對;不阻 D2 用代表性推進)

## D2 — intake endpoint + 建 mirror
- [ ] intake endpoint(`POST /requests/intake`)+ DTO validation
- [ ] m2m guard(fail-closed 401)
- [ ] 建 mirror service(map payload → `Request` + `RequestLineItem`,set SN 關聯 + `azureSyncedAt`)
- [ ] schema additive(若需 `Request` origin/type 標記)+ migration
- [ ] module 註冊

## D3 — H5 tests
- [ ] intake happy(建 mirror)
- [ ] 缺/錯 m2m credential → 401,零寫入
- [ ] payload validation
- [ ] sync gate 狀態正確落 `azureSyncedAt`
- [ ] idempotent(同 SN number 重推唔 double)

## D4 — verify + closeout
- [ ] build / lint / test 全綠
- [ ] live curl(帶/唔帶 key · 重推 · sync 狀態)
- [ ] regression(module D 履行 / dev-bypass)
- [ ] BACKLOG / memory 同步 + progress retro + plan closed + Phase 乙 carry
