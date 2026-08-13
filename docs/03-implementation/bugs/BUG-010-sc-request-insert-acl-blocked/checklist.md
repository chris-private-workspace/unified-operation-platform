---
bug_id: BUG-010
report_ref: ./report.md
status: complete
last_updated: 2026-08-13
retro_filled: true        # 🔴 2026-08-13 追溯補寫,唔係當時逐項 tick — 見下面「本檔性質」
---

# BUG-010 — Checklist

> ## 🔴 本檔性質:**追溯補寫(retro-fill),2026-08-13**
>
> 呢份 checklist **唔係** 2026-08-04 修 bug 嗰陣逐項 tick 出嚟嘅。真正逐項 tick 過嘅記錄
> **一直存在**,只係佢**唔喺呢個 folder** —— 佢住喺 **`docs/01-planning/W43-onboarding-license-request/checklist.md`
> 個 `F1` 段(`F1-1` … `F1-9`,全部 `[x]`)**。
>
> **點解會咁**:BUG-010 唔係行 PROCESS §4 獨立 bug-fix workflow 修嘅,佢係**由 W43 呢個 phase 順帶修**
> (BACKLOG 2026-08-03 開 W43 嗰行原文:「順帶會修 **BUG-010**」)⇒ checklist 自然落咗 phase 度,
> 而 PROCESS §4.3 要求嘅 per-bug `checklist.md` 就冇建過。
>
> **所以本檔刻意寫成 pointer,唔複製內容** —— 逐條抄過嚟就係養第二份真相,
> 而兩份一旦漂移就冇人知邊份啱(**呢個項目今日已經因為呢種漂移中過招:BACKLOG 嗰行 stale
> 咗 9 日,令 2026-08-12 落咗個「approved 要修」喺一個 08-04 已經修好嘅 bug 身上**)。
>
> ⇒ **要睇實際做過乜,一律去 W43 `F1`。本檔只負責:①指路 ②記錄 bug lifecycle 嘅 gate。**

## Lifecycle gate(PROCESS §4.5)

| # | Gate | 狀態 | 證據來源 |
|---|---|---|---|
| 1-2 | Report + severity confirmed → `triaged` | ✅ 2026-08-01 | `report.md` frontmatter · Chris 定 **Sev3**(由初判 Sev2 降級,理由見 report §6) |
| 3 | Folder + report 填好 | ⚠️ **部分** — 只建咗 `report.md`,冇 `checklist.md` / `progress.md` | 本次(2026-08-13)補返 |
| 4 | Derive checklist | ✅ **但落咗 W43** | `W43/checklist.md` §F1 |
| 5-6 | Reproduce → root cause | ✅ 2026-08-01 | `report.md` §2 五項實測(**#2 最小 payload 一樣 403 ⇒ table-level 唔係 field-level**) |
| 7 | Fix + regression test | ✅ 2026-08-04 | `W43` `F1-3`(重寫走 catalog API)+ `F1-4`(11 個 unit test)+ **`F1-5` boundary test**(專項斷言 `createRecord` **零呼叫**) |
| 8 | Verify in env → `done` | ✅ 2026-08-04 | **G6 真 POST 一張**:`REQ0044071` / `RITM0047366` / `SCTASK0071831`(剛好一張 `Execution Step` active task = ADR-0018 D3 形狀) |
| 9 | Postmortem | ⏸️ **N/A** — Sev3 唔強制(PROCESS §4.4「🟡 Encouraged if recurring」);**冇 recurring** | — |
| 10 | RISK_REGISTER | ✅ **唔加,有理由** | 見下 |

## 🔴 值得記住嘅設計判斷(唔喺 W43 checklist 度,只喺 report / ADR)

- [x] **`F1-7` 刻意分兩段**:fix 落 code 之後 report **只轉 `verifying` 唔轉 `done`**,
      等 **G6 真 POST** 先轉。⇒ 「code 改咗」同「真環境行得通」係兩個 gate,冇一步到位。
- [x] **順帶得着(唔喺原本計劃內)**:改行 catalog API 之後,SN workflow **由 SN 自己行**,
      所以 REQ / RITM / **catalog task** 同真單**同一個形狀** —— 手砌 `sc_request` insert
      **永遠做唔到**呢件事,而 ADR-0018 D3「唯一 active task」正正靠呢個形狀。
      ⇒ 原本嘅 fix 由「繞過一個 403」變成「行返 SN 本身嘅正路」。
- [x] **`F1-6` 明確唔動 CH-014 script**:production 行 `ServiceNowService`,script 行自己嘅 `fetch`,
      **兩條路刻意唔合併**。
- [x] **RISK_REGISTER 唔加** —— 呢個 bug 嘅根因(SN 逐個 table 分開開權)**已經以更闊嘅形式**
      寫入 **DD-5**(W43 G7 撞 `sc_item_option` 403 之後落嘅):
      「**唔可以由「某張表寫得」推論「另一張寫得」**」。加多一條 risk 係重複記帳。

## ⚠️ 本 bug **冇**解決嘅嘢(唔好當 closed 就等於全清)

- [ ] 🚧 **report §7 路 0 從未驗證** —— `REQUEST_SUBMISSION_PROVIDER` 由 `direct` 撳去 `n8n`
      (ADR-0008 D3 明文預留嘅 fallback,**屬配置動作唔觸發 H1**)。
      `N8N_OUTBOUND_WEBHOOK_URL` / key **至今未配**,ADR-0017 三個接縫仍未通 ⇒ **一次都冇通過**。
      **理由 = 卡外部接線,唔係卡實作**;**target = 隨 n8n 接通(見 BACKLOG `N8N-SEAMS` / ADR-0017)**。
      🔴 呢條**唔屬 BUG-010 嘅 symptom**(BUG-010 講嘅係 `direct` 路 403,而佢已經修好)——
      佢係 report §6 用嚟**降級 Sev2 → Sev3** 嗰個理由嘅前提,所以留喺呢度,**唔可以刪**。
- [ ] 🚧 **`REQ0044071` 要人手 cancel** —— G6 真建出嚟嗰張,SN **刪唔到只可以 cancel**,
      已標 `[UOP TEST]` + work note。同 CH-014 OQ-2 嗰 3 張 + `REQ0044072` 一齊處理(共 5 張)。
      **target = 下次掂 SN 嗰陣順手做。**
