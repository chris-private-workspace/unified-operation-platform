---
bug_id: BUG-004
severity: Sev3
written: 2026-07-28
trigger: "recurring — BUG-001 係同一類(PII 入 log)"
---

# BUG-004 — Postmortem

> Sev3 本身唔強制,但 `PROCESS.md §4.4` 講明 **recurring 要寫**。呢個係第二次 UPN 入 log。

## 一句話

我哋修好咗「**唔好自己寫 UPN 落 log**」(BUG-001),但冇問過「**如果 UPN 係人哋塞畀我哋呢?**」

## 時間線

| 時間 | 事 |
|---|---|
| 2026-07-09 | **BUG-001** 修好 —— `GraphService` 自己個 template literal 插咗 UPN |
| 2026-07-10 | **BE-graph-harden** 建 `graphUnavailable()`,把 `err.message` 原封 log。**同日寫落個 doc comment:`H4: never log the target UPN`** |
| 2026-07-10 → 2026-07-27 | 五個 caller 陸續接上。冇人察覺 |
| 2026-07-27 | W39 寫 H4 test 嗰陣**喺 test 輸出見到** |
| 2026-07-28 | 修 |

**潛伏 18 日,而且期間至少三個 phase 掂過呢啲檔案。**

## 點解冇人發現

### ① 條 test 望錯位

由 W38 起就有 test 叫「H4 — no PII escapes through the error path」。佢一直綠。

佢 assert 嘅係 **exception message**,而嗰度一直乾淨 —— 因為 exception 個 message 係我哋自己砌嘅固定文字。洩漏喺 **log line**,而**冇一條 test 望過 logger**。

> 個 test **名**講咗一件比佢**做**嘅更闊嘅事。名一旦寫得闊,佢就變成一個「呢方面已經守住」嘅訊號。

### ② 個 comment 講咗一件佢做唔到嘅事

`graph-unavailable.ts` 寫住 `H4: never log the target UPN or any secret`。

呢句同**下面三行 code** 直接矛盾。而因為佢寫喺一個講 H4 嘅檔度,任何 review 呢個檔嘅人都會覺得「H4 已經處理咗」。

> **一句做唔到嘅承諾,比冇承諾更差。**

### ③ 兩個洩漏來源長得唔似

BUG-001:`` `... ${upn}` `` —— 一眼睇得出。
BUG-004:`` `... ${err.message}` `` —— 睇落係 log 一個錯誤,好正常。

**外來字串嘅內容唔喺 code 度睇得到**,所以 code review 幫唔到手。

## Root cause

**信任邊界唔清晰。** 平台把 vendor 嘅 free-text message 當成安全內容。

呢個唔係「有人唔小心」。BUG-001 個 fix 完全正確,只係佢解決嘅係另一條路徑。

## 修咗咩

- 共用 `scrubPii()`,四個 **identity 路徑** call site 用
- test **assert logger 本身**,唔再淨係 assert exception
- **靜態守門**防止第五個 call site 漏(assert 冇 raw pattern + 真係 call scrubPii)
- 把個做唔到嘅 comment 改成講清楚實際保證同**已知限制**

## 學到嘅(可行動)

**① test 個名唔可以闊過佢 assert 嘅嘢。** 「no PII escapes」讀落係一個全面保證,實際只覆蓋一條路徑。而家嗰條叫「the 503 **MESSAGE** never carries the UPN」。

> 呢條同 `feedback_verification-that-proves-nothing` 係同一件事,但今次係**名**過闊而唔係 assert 過弱。

**② 凡係「外部系統畀嘅字串」,預設當佢有 PII。** 唔止 Graph —— n8n 會轉發 Graph 嘅文字,ServiceNow 會 echo 你送過去嘅 payload。

**③ 一個 comment 講緊一個保證,就要有 test 頂住佢。** 否則佢只係一句願望,而下手會當佢係事實。

## 唔做嘅嘢(有意識)

- **冇**把全部 12 處 raw-message log 一次過改 —— 其餘 8 處嘅 vendor 呼叫唔涉及特定 user,同一 pattern 唔係同一風險(§1.3)

  > **⚠️ 2026-07-28 更正(BUG-007)** —— **收窄範圍呢個決定係啱嘅,但上面寫嘅理由唔準確。**
  >
  > 「其餘 8 處**唔涉及特定 user**」對 `ServiceNowService.request()` 唔成立:`DirectServiceNowProvider.submit()` 開 REQ 嗰陣送嘅係 `short_description: \`M365/D365 license request — ${targetUpn}\``,即係**確確實實帶住 UPN**。
  >
  > 真正嘅理由應該係「**當時冇逐個 caller 查證**」。BUG-007 逐個查完 5 個 caller 先講得出邊處有 PII、邊處冇(`query()` 唯一 caller 傳空字串,所以 path 側乾淨 —— 呢點同本 bug 相反)。
  >
  > **教訓**:「呢類唔同風險」係一個**斷言**,同「呢個 test 綠」一樣需要證據。當時寫落去嗰陣冇證據支撐,而佢讀落好似有。
- **冇**把 regex 寫得更闊去捉非 email 格式嘅識別碼 —— 咁會開始食走 AADSTS 碼呢啲**我哋 log 呢段文字嘅唯一原因**

## RISK_REGISTER

**唔加新 risk。** 呢個係一次過嘅實作缺陷 + 一個已經修好嘅測試盲點,唔係一個持續存在嘅結構性威脅。若果第三次出現同類洩漏,就應該升級成 register 入面一條「外部字串處理」嘅 risk。
