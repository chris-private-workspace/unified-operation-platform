---
phase: W36-opco-budget-gate
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: draft           # draft | active | closed
---

# W36 — Progress

> Daily log + retro。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-27:Phase 開單(**draft**,等 approve + OQ1)

**Action**:ADR-0016 Accepted(2026-07-26)後開 phase。plan / checklist / progress 三件齊,**全部鎖住**,等 Chris approve 並答 **OQ1**(前端 override 入口做唔做)。

### Grounding — 重量目標環境(ADR-0016 明文要求)

```
total 148 | alloc_zero 0 | at_or_over 22 | strictly_over 20
```

同 ADR 起草時**一致**。但逐行核對 22 個組合之後有一個**精確化**:

| | 數 |
|---|---|
| `assigned >= allocated` | **22** |
| 其中 SKU `active = false`(`VISIO_PLAN1` ×3 · `WIN_DEF_ATP` ×3) | **6** |
| ⇒ **真正會被凍結嘅 active 組合** | **16** |

理由:`intake.service.ts:57-60` 拒 inactive SKU ⇒ 嗰 6 個組合永遠唔會有新 line item 要 assign,撞唔到本 gate。**ADR-0016 寫「22 行」係上界,實際影響面 16。** 呢個唔改 ADR(Accepted 唔改內容),但 F5 runbook 要按 16 講。

Overage 最大 8(`RTMAP/POWERAUTOMATE_ATTENDED_RPA` 36→44 · `RKR/STANDARDPACK` 89→97 · `PFU-HK/SPE_E3` 108→116 · `RCN/Microsoft_365_Copilot` 51→59);最小 0(`RKR/Microsoft_365_Copilot` 38/38 = 剛好用盡,下一次 assign 就會係第一個被擋嘅)。

### 🔴 Grounding 揪出一個 ADR 冇處理嘅流程斷點(OQ2)

預算爆 → 操作員行 procurement path 買 licence → stage 推到 READY → **assign 仍然撞同一個 gate**,因為 `allocatedQuantity` 冇因為「買咗」而增加。

⇒ **「買咗都 assign 唔到」**,除非 ADMIN 手動 `PATCH /license/ledger/:id` 加 allocated(ADR-0007 正路)。

本 phase **唔自動化**(會掂 ADR-0004 嘅「Excel 定平台係 allocated SSOT」未解張力),但**必須喺 F5 runbook + F3 錯誤訊息寫明出路**,唔可以留一個 dead end 畀操作員自己撞。已入 plan §5 OQ2 + §6 R2。

### F3 係 OQ 嘅原因

ADR-0016 **完全冇講前端**。若只做 F1+F2,ADMIN 嘅 override 只能經 `/docs/api` ⇒ 實務上等於冇 override,而 ADR D3 反對「完全冇出口」嘅理由(逼人繞過平台直接用 Graph → 平台 ledger 同 audit 一齊斷)就會部分重現。⇒ 建議選項 A(做),但係 owner 嘅 scope 決定。

### Branch 決定

Branch `docs/w36-budget-gate` **off `feat/ch-009-assign-capacity`**(唔係 main)—— 因為 F3(若做)會改同一個 `request-detail.tsx`,而 CH-009 PR #29 仍 open。CH-009 merge 之後 rebase 落 main。

### Blockers

- **plan 未 approve**(`draft`)→ 依 R1,一行 code 都唔寫
- **OQ1 未答** → F3 scope 未定(phase 估算 8.5h[不含 F3] vs 12h[含])

**Commit**:`<hash>` — `docs(planning): W36 plan — ADR-0016 落地(OpCo 預算 gate)`

---

## Retro(填於 closed)

_(待實作)_
