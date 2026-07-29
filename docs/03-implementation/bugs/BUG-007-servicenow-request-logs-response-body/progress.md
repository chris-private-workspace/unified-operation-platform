---
bug_id: BUG-007
report_ref: ./report.md
checklist_ref: ./checklist.md
status: done
last_updated: 2026-07-28
---

# BUG-007 — Progress

## 2026-07-28 — Triage → Fix → Verify

### 修嘅嘢好細,查證嘅嘢先係重點

Fix 本身係一行:`${text}` → `${scrubPii(text)}`。

有價值嗰半係**查證**:逐個查 `request()` 五個 caller,先講得出邊處有 PII、邊處冇。

| caller | path | payload |
|---|---|---|
| `getRecord(sysId)` | sys_id | — |
| `getRecordByNumber(number)` | REQ/RITM number | — |
| `query(sysparmQuery)` | **唯一 caller 傳空字串** | — |
| `createRecord(fields)` | 表名 | 🔴 `short_description` 帶 targetUpn |
| `updateRecord(sysId, fields)` | sys_id | note + state |

⇒ **path 側乾淨,payload 側唔乾淨。** 呢個同 BUG-004 啱好相反(嗰次個 UPN 就喺 path `/users/{upn}` 度)。

### 🔴 查證揭穿咗 BUG-004 一句寫錯咗嘅劃線理由

BUG-004 postmortem「唔做嘅嘢」寫:

> **冇**把全部 12 處 raw-message log 一次過改 —— 其餘 8 處嘅 vendor 呼叫**唔涉及特定 user**

**收窄範圍呢個決定係啱嘅**(§1.3),但**理由唔準確**:`DirectServiceNowProvider.submit()` 送嘅 `short_description` 就係 `M365/D365 license request — ${targetUpn}`。

真正嘅理由應該係「**當時冇逐個 caller 查證**」。

> 「呢類唔同風險」係一個**斷言**,同「呢個 test 綠」一樣需要證據。當時寫落去嗰陣冇證據支撐,而**佢讀落好似有** —— 之後每個讀到嗰句嘅人(包括我)都會當佢係已經查過。

已保留原文 + 加註更正(唔改寫 —— 改寫會令下手睇唔到呢個教訓)。

### 條既有 test 正正係 BUG-004 匿咗 18 日嗰個形狀

```
it('throws when ServiceNow returns a non-ok status (fail-closed)')
  → await expect(...).rejects.toThrow(/ServiceNow request failed \(400\)/)
```

**只 assert exception。** 而 exception message 係我哋自己砌嘅固定文字,一直乾淨。洩漏(如果有)喺 **log line**,而冇一條 test 望過 logger。

新 test **spy logger**。

### 兩個方向都 assert

- **唔夠 scrub** = PII 入 log
- **scrub 過頭** = 一樣係 failure。`'User Not Authorized'` 要原封保留 —— 佢係分辨「整合帳號冇權限」同「record 本身有問題」嘅唯一線索

同樣理由,`method` / `path` / `status` **唔掂**:佢哋係 log 呢行存在嘅唯一原因,而且上面逐個 caller 查證過唔含 PII。

### ⚠️ 誠實邊界

平台**冇真 ServiceNow**。「SN 400 回應會 echo 返 payload」係**推論**,唔係觀察。

呢個同 BUG-004 有本質分別 —— 嗰個係喺 test 輸出真係見到 UPN。所以本 bug 準確講法唔係「已知洩漏」,而係「**一個冇設防嘅信任邊界,而已知有一條路徑會送 UPN 出去**」。

## Closeout

**Status**:✅ done。`servicenow.service` 5/5 · 全套 **599 / 599** · lint 0 · tsc 0。

**RISK_REGISTER 加咗 R5** —— 見 postmortem。
