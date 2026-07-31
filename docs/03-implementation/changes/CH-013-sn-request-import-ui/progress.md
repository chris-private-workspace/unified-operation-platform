---
change_id: CH-013
spec_ref: ./spec.md
checklist_ref: ./checklist.md
adr_ref: ../../../adr/0021-user-authenticated-servicenow-request-import.md
status: in-progress     # in-progress | closed
---

# CH-013 — Progress

> Day-N entries + 結尾 closeout。每個 commit 必須對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-07-31（spec + ADR,未寫任何 code）

### Done

- 開 `CH-013` folder,寫 `spec.md`(status: proposed)
- BACKLOG **C 區**(blocked on 用戶決定)加 CH-013 行(R7)
- Chris 三項拍板 → spec status `proposed` → **approved**
- 寫 **ADR-0021** + 入 `docs/adr/README.md` index(R5)
- 由 spec §3 衍生 `checklist.md`

### Decisions

**① H1 approved —— `IntakeService` 開第二個 caller。**

落 spec 途中揪出:兩條 intake route(`/requests/intake` · `/requests/intake/n8n`)**都係** `@Public()` + `IntakeKeyGuard`,即 `IntakeService` 今日只有一個入口、一個 caller、一個 m2m shared secret ——而 ADR-0017 D4 OQ-3 係明文咁揀(「one caller, one trust boundary, one secret to rotate」,逐字記錄喺 `intake.controller.ts:50-52`)。

前端唔可以持 `INTAKE_API_KEY`(H4:落到 bundle 就等於公開)⇒ 呢個功能**無論點做**都要開一條 user-authenticated 路 ⇒ OQ-3 嗰個前提由本 CH 落地起唔再成立。

⇒ Chris approve,**ADR-0021 Accepted**。要留意嘅區分:被改嘅係**入口唯一性**,唔係 **secret 強度** —— 新路徑用一個完全獨立、而且**更嚴格**(具名 JWT + ADMIN + audit)嘅信任模型,唔係把既有嗰個放寬。

**② 定位 = 長期 admin 補救工具**(唔係「n8n 通咗就刪」)。

呢個係整件事嘅前提。如果佢係即棄品,理性答案應該係**唔做 UI、繼續用 script** —— 唔值得為一個會死嘅功能去改 intake 信任邊界 + 寫 ADR。所以 ADR-0021 個 Option D(「唔做 UI」)係**被定位 reject,唔係被質素 reject**,呢點喺 ADR 寫實咗,免得日後有人以為當時冇考慮過。

**③ 角色 = `ADMIN` only。** 除咗 fail-safe,仲有一個結構理由:OpCo 由 SN 個 Job Function 推導,要**反查完先知** ⇒ 「你有冇權導呢張單」要打完 SN 先答到,呢種 gate 形狀本身易錯。放寬 = 重開 ADR-0021 D3,唔可以喺實作裡面順手加。

**④ 沿用 ADR-0017 D4 嘅 pattern,唔發明新嘢。** D4 當年面對同類問題(n8n 信封 vs canonical DTO 對唔上)嘅答案係「唔改 LOCKED 合約,另開一條 route」。本 CH 係同一 pattern 第三次應用 —— 所以 ADR-0021 D2 把四項檔案嘅 **diff = 0** 寫成硬邊界,並落咗 checklist C1 做實際驗證項,唔靠自律。

### Blockers

- 冇。三項 gate 已於同日全部清。

### Effort

- Planned:—(spec/ADR 唔計入 §5 嘅 1.5–2 日估算);Actual:~1h

### Commits

| Hash | Subject |
|---|---|
| `0d68a48` | `docs(planning): CH-013 spec draft — 由 SN REQ 號碼喺 UI 導入 request` |
| _(pending)_ | ADR-0021 + spec approved + checklist/progress |

---

## Day 1 — YYYY-MM-DD

（開工後填）

---

## Closeout（填於 status=closed）

### Acceptance verification

（spec §3 逐條 ✅ / ⚠️ / ❌）

### Effort summary

| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|

### Lessons

- What worked
- What didn't / unexpected friction
- Carry-overs

---

**End of CH-013 progress**
