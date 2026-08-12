
---

## 2026-08-12 — G9 live 驗收咗（本機，同 W45 F4-4 一次撳收埋）

真 assign 成功之後，`Operational history` 多咗一條：

```
NOTE | ServiceNow skipped: This line has no RITM and the request has no ServiceNow mirror
```

同一次回應入面 dialog 個 ticket step：

```
ticket | skipped | This line has no RITM and the request has no ServiceNow mirror
```

- ✅ 形狀 **`ServiceNow {status}: {detail}`** 對得住
- ✅ **兩處逐字一樣，零 drift** —— 呢個就係「由同一個 step 推導，唔另寫文案」嘅實證
- ✅ **重新 GET 一次 request，條 NOTE 仲喺**（由 DB 讀返，唔係 dialog 嗰份記憶體）

🟢 **而且驗到嘅正正係 `skipped` 分支，唔係將就。** 本 CH 個 driver 就係「ADR-0029 令 `ticket: skipped` 由要靠推理變成畫面一行字，**但嗰行字得五秒命**」⇒ **`skipped` 係最對題嗰個分支**，而佢而家真係留得低。

⚠️ **另外三個分支未 live 驗**（RITM close requested / parent REQ work note / failed）—— 要一張真有 RITM 嘅單先撳得到，即係要額外開一張真 SN 單。三個都有 unit test 蓋住，**唔阻收官**；將來有真 onboarding 單流過就會自然覆蓋。
