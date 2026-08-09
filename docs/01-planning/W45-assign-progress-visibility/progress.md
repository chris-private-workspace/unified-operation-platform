# W45 — Assign 過程可見性 · Progress

> **Status**: `draft` —— 未開工。第一個 Day-N entry 喺 F0 全部 tick 之後先寫(PROCESS R2)。

## Day 0 — 2026-08-09（planning only,零 code）

### 起因

Chris 逐步對帳「n8n → onboarding → assign → SN complete」九步流程,問「**現在我們卡在哪了**」。對帳結果:三步已通、兩步 code 齊但從未證實、**兩步根本未起**。本 phase 係其中一步(另一步 = CH-021 通知)。

### 決定

- **方案**:Chris 同日拍板 = **回傳每步結果,維持 atomic call**(ADR-0029 D1)
- **否決**:分步 endpoint(會製造 DRIFT 風險)· SSE(基建成本,而 DEV 部署先一個禮拜)
- **分類**:Phase 而唔係 Change —— 觸發 H1 要 ADR,前後端都要改

### 三個查證結果值得記低

**① mockup 真係有完整設計,唔係要從零諗。** `IT Ops Platform.dc.html:1444-1450` 五步 + `:1347-1355` 七個失敗場景。⇒ **設計問題已經答咗一半,而冇人知佢喺度。**

**② 🔴 但 mockup 同實際對唔齊,而個差異啱好就係今個禮拜實測撞到嗰個。** mockup 個 `precheck` 把 OpCo budget 同 tenant seat 合併成一步;實際係兩層兩道 gate。2026-08-07 撞嘅正正係 tenant 嗰層(`POWER_BI_PRO` `prepaidEnabled=0`)而 OpCo budget 係綠(`80/90`)—— **合併就講唔出係邊層擋住**,而兩者下一步完全唔同(叫採購買 vs 加 allocation)。

⇒ **照抄 mockup 會做出一個講唔出真相嘅畫面。** 十步清單(plan §3)就係為咗呢個。

**③ `ticket: skipped` 係 mockup 冇、但我哋而家最需要嗰格。** line item 冇 RITM 就 fallback 去 parent REQ 加 work note,**冇任何嘢被 complete** —— 而呢個分別今日 UI 完全睇唔到,正正係 W44 F7-12 追緊嗰個問題。⇒ 本 phase 順帶把佢由「要靠推理」變成「畫面上一行字」。

### 🔴 已知最危險嗰條(plan R1)

改契約會令前端 `onError` 讀唔到 `message` ⇒ **錯誤訊息變空白**。呢個係典型「紅得靜」:test 全綠、build 綠、畫面出得到,只係出咗個空白。⇒ checklist F1-2 要求**呢條 test 先寫兼且 fails-before 實證**。

### Blockers

- 🔴 **ADR-0029 仍係 Proposed** —— H1 gate 未過,一行 code 都唔可以寫
- 🔴 **W44 未收官** —— rolling JIT 唔可以兩個 phase 同時 active
- ⚠️ live 驗(G11)要一個 tenant 有剩 seat 嘅 SKU:W43 已查證 = `POWERAUTOMATE_ATTENDED_RPA`,**要先加 `allocated`**

### Commits

- `<pending>` — `docs(planning): W45 plan + ADR-0029 draft`
