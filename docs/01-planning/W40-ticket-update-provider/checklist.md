---
phase: W40-ticket-update-provider
plan_ref: ./plan.md
status: draft
last_updated: 2026-07-28
---

# W40 — Checklist

## D0 — Kickoff gate(🔴 未解除前唔准寫任何 code)

- [x] `git fetch --all --prune` + 掃晒所有 branch → **W40 未被佔**(只有 `main` / `feat/ch-008-ledger-empty-rows` / 本地 deployment branch;git history 零 `docs/01-planning/W4*`)—— 呢步係 BACKLOG 頂部「兩個 W36」事件之後嘅防再犯規則
- [x] 實讀 **2004 workflow JSON** 逐個 node(唔靠 ADR 轉述)→ 揪到**三處**同 D3 對唔上,其中落差 #1 係 blocking(plan §2.2)
- [x] 實讀 **1007** `Prepare SN Update` → 確認佢只 close **action item 類** RITM(plan §2.3)
- [x] 查 code 揪到 **命名衝突**(`DirectServiceNowProvider` 已被 W25 佔用)+ **第二個 `addWorkNote` caller**(plan §3.1 / §3.2)
- [x] 確認加 connector **必然改 schema**(H1)—— **事前**就知,因為 W39 把教訓寫入 ADR-0013 補註
- [ ] 🔴 **§8 五個 OQ 拍板**(A 最重要:`addWorkNote` 喺 2004 冇對應 mode)
- [ ] 🔴 **H1 approve**:additive migration 兩個 nullable 欄(`ticketUpdateProvider` / `n8nTicketWebhookUrl`)
- [ ] plan `status: draft → active`,commit `docs(planning): W40 D0 gate 解除`

## F1 — `TicketUpdateProvider` 抽象 + `DirectTicketProvider`

- [ ] (待 OQ-A/B 拍板後展開)

## F2 — `N8nTicketProvider`(2004)

- [ ] (待拍板)

## F3 — `n8n-ticket` connector + migration + 面板

- [ ] (待 H1 approve)

## F4 — `assign.service` 走 seam

- [ ] (待 OQ-E 拍板 —— 呢項嘅範圍完全取決於「邊個 code path 有權 close」)

## F5 — Contract test + 1007 分工邊界文件化

- [ ] (待拍板)

## F6 — doc-sync(ADR-0017 補註 · BACKLOG · runbook 08)

- [ ] (待拍板)
