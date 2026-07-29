---
bug_id: BUG-007
severity: Sev3
written: 2026-07-28
trigger: "recurring — 第三次同類(BUG-001 → BUG-004 → BUG-007)"
---

# BUG-007 — Postmortem

> BUG-004 postmortem 尾段寫低咗一個**條件**:「若果第三次出現同類洩漏,就應該升級成 register 入面一條『外部字串處理』嘅 risk」。呢份就係兌現嗰個承諾。

## 一句話

我哋修好咗兩條**具體路徑**,但每次都用「其餘嗰啲唔同風險」嚟劃線 —— 而嗰句從來冇被查證過。

## 三次同源

| | 洩漏來源 | 修法 | 劃線時講咗咩 |
|---|---|---|---|
| **BUG-001** | 我哋自己格式化嘅字串 | 唔好寫 UPN 落去 | — |
| **BUG-004** | Graph 塞畀我哋嘅 message(path 帶 UPN) | 4 個 identity 路徑 `scrubPii()` | 「其餘 8 處**唔涉及特定 user**」 |
| **BUG-007** | ServiceNow 塞畀我哋嘅 response body | 同一個 helper | —(改為**逐個 caller 查證**) |

## Root cause —— 唔係「又漏咗一處」

真正嘅 root cause 唔係「BUG-004 修漏咗」。**收窄範圍係啱嘅做法**(§1.3:唔順手改冇 break 嘅嘢)。

問題喺於**點樣**收窄:當時用咗一個**未經查證嘅斷言**做界線,而嗰句寫落 postmortem 之後就變成事實 —— 之後每個讀到嘅人(包括寫 W40 嗰個我)都會當佢已經查過。

> **一句未經查證嘅劃線理由,同一句做唔到嘅 comment 承諾(BUG-004 §2)係同一種東西**:兩者都令下手唔再去查。

BUG-007 嘅修法係逐個 caller 查證,然後**寫低查證結果本身**(邊個 caller path 有 PII、邊個冇),而唔係再寫一句概括判斷。

## 點解今次要升級成 RISK

前兩次都當係「一次過嘅實作缺陷」。第三次就唔可以再咁講:

- 三次都係**接一個新 vendor / 加一條新路徑**嗰陣重犯
- 三次嘅共通結構係**信任邊界**:外部字串嘅內容**唔喺我哋 code 入面睇得到**,所以 code review 本質上幫唔到手
- 平台已知會送 UPN 出去(outbound create 個 `short_description` · Graph `/users/{upn}`)

⇒ 呢個係**結構性傾向**,唔係三次獨立手誤。`RISK_REGISTER` **R5** 已加。

## R5 入面最要緊嗰兩條 mitigation

**① 凡 assert「冇 PII」嘅 test 必須 spy logger。** BUG-004 匿咗 18 日就係因為條 test assert exception message,而洩漏喺 log line。今次 `servicenow.service.spec` 條既有 test **完全一樣嘅形狀**。

**② 接新 vendor / 加新 log 點嗰陣要逐個 caller 查證 path 同 payload。** 唔可以憑「呢類唔涉及 user」劃線。

## 唔做嘅嘢(有意識)

- **冇**擴闊 `scrubPii()` 去捉非 email 格式嘅識別碼 —— 會開始食走 AADSTS 碼呢啲**我哋 log 呢段文字嘅唯一原因**。呢個限制已明列入 R5,唔係當佢唔存在。
- **冇**去掃其餘未修嘅 raw-message log 點 —— 但今次唔再用「佢哋唔同風險」做理由。實情係:**未查過**。R5 已經把「接新 vendor 要查」寫成常設 mitigation,下次改到嗰啲檔嘅人有嘢可以跟。

## 對照:一件做啱咗嘅嘢

BUG-004 建 `scrubPii()` 做**共用 helper** 而唔係喺 `graph-unavailable.ts` 入面寫個 regex。所以今次修 ServiceNow 側只係 import + 包一層,零重複邏輯。

如果當時每處各寫一個 regex,今日就會有兩份要各自維護嘅 PII 定義 —— 即係 **AP-13**。
