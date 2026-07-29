---
bug_id: BUG-006
report_ref: ./report.md
checklist_ref: ./checklist.md
status: done
last_updated: 2026-07-28
---

# BUG-006 — Progress

## 2026-07-28 — Triage → Fix → Verify(W40 三個 follow-up 同一批)

### 一個參數對唔上另一個

```ts
const snTarget = item.serviceNowSysId ?? request.serviceNowSysId;
await this.snow.addWorkNote(snTarget, note, 'sc_req_item');
```

**sys_id 揀咗兩個來源,table 只寫死一個。** 兩者本來要一齊變:per-line RITM 住 `sc_req_item`,parent REQ 住 `sc_request`。

### W40 令佢由「偶然」變「必然」

之前呢句嘅**主要**路徑(有 RITM)係啱嘅,錯嗰半只喺 legacy 資料出現。W40 之後有 RITM 改走 `closeComplete` ⇒ **呢句剩返嘅唯一情況就係 fallback**,即係只剩錯嗰半。

⇒ 唔係 W40 整壞咗佢,係 W40 令一個一直匿埋嘅缺陷變成必然路徑。

### 條 test 一直守住一個錯嘅值

改完 code 即刻跑,**2 條既有 test 紅**。呢個係好消息 —— 呢個位有守門。

但佢守嘅係 `'sc_req_item'`,而條 comment 仲寫住:

> fallback: this line has no RITM → write back to the parent REQ mirror,
> **still targeting the sc_req_item table** (two-level, ADR-0008 / CONTRACT §4)

**一個錯誤意圖被寫成 spec**,仲引用埋 ADR 撐腰。test 同 comment 一直互相印證,而**兩者都冇同 ServiceNow 對過**。

> AP-13 子型 ②(兩處各自答同一個問題)嘅一個變種:呢度兩處**答得一致**,只係兩個都錯。一致唔等於啱。

### 修法揀咗一個 const 而唔係兩個字面值

queued payload 個 `table` 會被 `repairWorkNote` **原封 replay**。如果呼叫用 `'sc_request'` 而 payload 寫 `'sc_req_item'`,每次 retry 都會用錯值失敗 —— **永遠**,而且冇任何嘢指出點解。

所以 table 名寫成一個 local const 用兩次,並加咗一條 assertion 釘住佢哋一致。

## Closeout

**Status**:✅ done。`assign.service` 49/49 · 全套 **599 / 599** · lint 0 · tsc 0。

⚠️ **未 live 驗證** —— 冇真 ServiceNow,「PATCH 錯表會 404」係推論。修完之後個行為**應該**係 work note 真係寫到落 REQ,但呢句要等真 SN 先講得實。
