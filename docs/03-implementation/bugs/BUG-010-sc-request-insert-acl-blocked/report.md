---
bug_id: BUG-010
title: "sc_request 直接 insert 被 ACL 擋死(403),DirectServiceNowProvider 開單路徑喺 ricohapdev 行唔通"
severity: Sev2          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4) — 待 triage 確認
status: proposed        # proposed | triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-08-01
reporter: "CH-014 造 ServiceNow fixture 時實測撞到"
affects_components: [fulfilment/direct-servicenow.provider, integration/servicenow]
spec_refs:
  - docs/adr/0008-request-intake-d365.md D3(Phase 乙 — 平台直接經 Table API 開 SN ticket)
  - docs/03-implementation/changes/CH-014-sn-onboarding-fixture-script/spec.md
---

# BUG-010 — `sc_request` 直接 insert 被 ACL 擋死

> **Report version**:1.0(initial)
> **Triage approver**:**待 Chris Lai 確認**(severity 同 §5 推論邊界)

## 1. Symptom

用平台嘅 ServiceNow integration 帳號 `POST /api/now/table/sc_request`,**一律** 403:

```
HTTP 403  {"error":{"message":"Operation Failed",
           "detail":"ACL Exception Insert Failed due to security constraints"}}
```

## 2. 實測證據(2026-08-01,`ricohapdev`)

| # | 做過乜 | 結果 |
|---|---|---|
| 1 | POST `sc_request`,完整 payload(short_description / requested_for / company / u_order_guide_name) | 🔴 403 |
| 2 | POST `sc_request`,payload **只有 `short_description` 一個 field** | 🔴 403 |
| 3 | GET `sys_user_has_role` 數帳號 role | ✅ 200 — **71 個 role**,含 `sn_request_write`、`itil`、`task_editor`、`snc_platform_rest_api_access` |
| 4 | PATCH `sc_req_item`(同一帳號、同一 instance) | ✅ 200 |
| 5 | Service Catalog API `order_now` / `cart.submit_order` | ✅ 200 — SN 自己建到 REQ + RITM + catalog task |

**#2 係關鍵**:最小 payload 一樣 403 ⇒ 擋喺 **table level**,唔係某個 field 嘅 field-level ACL。
**#4 對照**:同一張 request 家族嘅 `sc_req_item` **update 得** ⇒ 唔係「帳號完全冇寫權」,而係 **insert 同 update 係兩套 ACL**。

## 3. 影響邊個 code path

`apps/api/src/fulfilment/direct-servicenow.provider.ts:28` — `submit()` 第一件事:

```ts
const req = await this.snow.createRecord({...}, 'sc_request');
```

`ServiceNowService.createRecord()`(`servicenow.service.ts:156`)= `POST /api/now/table/{table}`,即係 §2 #1/#2 打嗰個 endpoint,用同一組 `SERVICENOW_USER` / `SERVICENOW_PASSWORD`。

⇒ **ADR-0008 乙 phase「IT 開單 → create SN ticket」喺呢個 instance 用呢個帳號會喺第一步就 403。**

## 4. Expected vs Actual

- **Expected**(ADR-0008 D3):平台開單 → SN 出一張 REQ + 每個 line 一張 RITM。
- **Actual**:REQ create 就 403,`submit()` throw,一張都出唔到。ADR-0008 D3 本身已標明呢個 field mapping 屬 **REPRESENTATIVE、未同 ServiceNow owner 對齊**(該 provider 檔頭 comment + ADR §10 open item)—— 呢個 bug 係嗰個 open item 兌現咗。

## 5. 🔴 推論邊界(睇清楚證明咗乜、未證明乜)

| 已實測 | **未實測** |
|---|---|
| 同一 endpoint、同一 credential、同一 instance、最小 payload → 403 | **`DirectServiceNowProvider.submit()` 本身未真跑過** |
| 帳號 role 清單 · `sc_req_item` PATCH 得 · catalog API 得 | 其他 instance / 其他帳號嘅行為 |

推論鏈係 `submit()` → `createRecord()` → 該 endpoint,三段都係同一份 code、同一組憑證,所以結論好硬 —— 但**佢仍然係推論**。要 100% 落實,喺 triage 時行一次真 `POST /requests`(provider = `direct`)睇佢 503/500。

⚠️ 唔好因為「睇落好明顯」就當實測過(memory:由真 output 過度推論因果)。

## 6. Severity 判斷 = Sev2(建議,待確認)

- 唔係 Sev1:冇資料損壞、冇洩漏、UAT 未有人靠呢條路做嘢。
- 建議 Sev2:一個**已 merge、已寫入 ADR、被當成已交付**嘅 feature,真 live 100% 失敗;而且失敗形態係 throw,唔會靜默 —— 但亦**冇任何 test 捉到**(Graph / ServiceNow 一律 mock,H5/§3.4),所以幾時上真環境幾時先爆。

## 7. Fix 方向(未實作,未 approve)

三條路,互斥:

1. **改走 Service Catalog API**(CH-014 已證可行)—— `order_now` / `add_to_cart`+`submit_order`。好處:SN workflow 自己行,catalog task 真起,同真單同形。代價:要決定平台開嘅單對應邊個 catalog item + 點填 mandatory variables(見 CH-014 §3),而呢啲係**業務決定**,唔係實作細節。
2. **要求 ServiceNow owner 開 `sc_request` insert ACL** —— 保住現有 code。但 SN 標準姿態本身就係唔畀 insert REQ,呢個要求可能唔會過。
3. **確認呢條路根本唔應該存在** —— 若 ADR-0008 乙嘅真實流程係「平台唔開單,單一律由 SN/n8n 側開」,咁應該刪 provider 而唔係修。

🔴 **1 同 3 都改到 ADR-0008 已 lock 嘅決定(D3),屬 H1** ⇒ 揀邊條之前要 STOP + ADR,唔可以直接改 code。

## 8. References

- `apps/api/src/fulfilment/direct-servicenow.provider.ts:28` — 出事嗰行
- `apps/api/src/integration/servicenow/servicenow.service.ts:156` — `createRecord`
- `apps/api/scripts/seed-servicenow-onboarding.ts` — 可行路徑嘅實作(CH-014)
- memory `project_servicenow-write-path` — 實測全紀錄
