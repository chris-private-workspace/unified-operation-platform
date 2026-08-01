# CH-014 — Checklist

> Derived from `spec.md` §4 acceptance。✅ = 有真 tool output 支持;❌ = 未驗(唔可以因為「應該冇問題」而 tick)。

## 1. 探索 / 可行性

- [x] E1 — 確認 SN 連得通(`--use-system-ca` 解 `SELF_SIGNED_CERT_IN_CHAIN`)→ HTTP 200
- [x] E2 — 讀真 onboarding REQ/RITM/SCTASK 形狀(REQ0044064 / RITM0047361 / SCTASK0071827)
- [x] E3 — 確認 `sc_request` 直接 insert 403 係 table-level(最小 payload 一樣 403)→ **BUG-010**
- [x] E4 — 數帳號 role(71 個,含 `sn_request_write`)⇒ 唔係單純冇權
- [x] E5 — 確認 Service Catalog API 讀得到(item + order guide 各 200)
- [x] E6 — 展開 variable set,搵齊 4 個 mandatory variable
- [x] E7 — 由真 RITM 讀返 variable 真值(opco code / action_type / license_type)

## 2. 實作

- [x] I1 — `seed-servicenow-onboarding.ts`:catalog API 落單(order_now / cart)
- [x] I2 — dry-run 做 default,`--post` 先寫
- [x] I3 — 落單後用真 `ServiceNowLookupService` 驗
- [x] I4 — cart 非空即停(D3)
- [x] I5 — 落單後 PATCH `[UOP TEST]` 標記(D5)
- [x] I6 — npm script `seed:sn-onboarding`(含 `--use-system-ca`)
- [x] I7 — 順帶修 `intake:from-sn` 嘅 TLS flag

## 3. 驗證

- [x] V1 — dry-run 零寫入(A1)
- [x] V2 — single:REQ0044067 / RITM0047363,1 active task(A2)
- [x] V3 — multi:REQ0044068 / RITM0047364 + 0047365,各 1 active task(A3)
- [x] V4 — importable 由真 lookup service 判斷(A4)
- [x] V5 — 3 張 RITM 標記成功,PATCH 各 200(A5)
- [ ] V6 — cart 非空會停(A6)— 要製造非空 cart 先撞得到
- [ ] V7 — repo script 內嘅標記 block 經 `--post` 真跑一次(A7)— 下次 `--post` 順帶驗
- [x] V8 — REQ0044067 匯入平台成功(A8)— `GET /requests/servicenow-lookup` 見到 importable,`POST /requests/import-from-servicenow` **HTTP 201**,`azureSyncedAt=null`(sync gate 如設計般擋住)

## 4. 收尾

- [x] C1 — memory 記低實測發現(`project_servicenow-write-path`)
- [x] C2 — BUG-010 report 寫好(待 Chris triage severity)
- [x] C3 — CH-014 spec / checklist / progress
- [x] C4 — BACKLOG 同步(R7)— A 表加 CH-014 + BUG-010
- [x] C5 — commit `2d92881` on `feat/ops-sn-onboarding-fixture`(7 files)
- [x] C6 — push + PR **#64**(base `main`)— 兩步都用獨立指令驗真(`git ls-remote` 對 HEAD · `gh pr list`),唔信 push/create 自己嘅 output
