# ADR-0026: `target_user` 回填改行 work note —— `sc_item_option` 寫入被 ACL 封死（supersede ADR-0025 D3 後半）

**Date**: 2026-08-04
**Status**: **Accepted**
**Approver**: **Chris Lai（2026-08-04）** —— 揀 (ii)+(iii) 一齊做（拆走回填 + 改行 work note）· **唔卡 OQ-1**（`sn_sc` API 未驗,但 ServiceNow ACL 綁 table 唔綁 API surface,而且估錯代價低:拆走嘅係一個 function,git history 攞得返,D5 本來就要求另寫 ADR 先恢復）· **OQ-2 按 default**（照寫所有 RITM）

## Context

ADR-0025 **D3 後半**同 **D4 尾條**建基於一個當時未驗證嘅假設:

> | Gate ② 通過 | `target_user` **PATCH 成新用戶真 sys_id** |
> — ADR-0025 D3
>
> Gate ② 開閘嗰刻順手攞到 `sys_id` ⇒ 同一個 transaction 內寫低,再 PATCH RITM 個 `target_user`（D3）。
> — ADR-0025 D4

W43 F3-7 照住實作（`ServiceNowService.updateCatalogVariable()`,行 `sc_item_option_mtom` → `sc_item_option` → `item_option_new` 三層 walk 搵到 variable,再 PATCH `sc_item_option`）,F3-8 特登做成 **non-fatal** —— 當時個理由係「寫權未證實」。

**G7 實測（2026-08-04,Chris 批准打一次真 PATCH,限 RITM0047366）**:

```
PATCH /api/now/table/sc_item_option/f11e6ba4… -> 403
{"error":{"message":"Operation Failed",
          "detail":"ACL Exception Update Failed due to security constraints"}}
```

驗證方式:行 **production class**、寫**同一個值**（唔改張飛任何事實,證據係 HTTP status 唔係新值）、覆核走**獨立 read 路**。結果 `value` 冇變、`sys_mod_count` **0 → 0** ⇒ ServiceNow **零副作用**。

⇒ `updateCatalogVariable` 對 `n8napiservice1` **永遠 work 唔到**。呢個唔係 transient failure,係一個**結構性事實**:

| Table | 操作 | 結果 | 出處 |
|---|---|---|---|
| `sc_request` | insert | **403** | BUG-010 |
| `sc_item_option` | update | **403** | 本 ADR（G7） |
| `sc_req_item` | update / work note | ✅ 寫得 | CH-010 close task 實證 |
| `sc_task` | update（close） | ✅ 寫得 | CH-010 / ADR-0018 |
| catalog `order_now` / cart | 落單 | ✅ 寫得 | W43 G6 |

呢個 instance 係**逐個 table 分開開權**,唔可以由「某張表寫得」推論「另一張表寫得」——ADR-0025 D3 後半就係踩咗呢個推論。

**觸發 hard constraint**:**H1** —— 改一個已 `Accepted` 嘅 ADR 入面已 lock 嘅 Decision。

## Decision

### D1 — 拆走 `target_user` 回填

刪 `ServiceNowService.updateCatalogVariable()` 同 `SyncSweepService` 嗰個 call（連對應 test）。

**點解唔留低做 best-effort**:佢嘅成功率係 **0%,而且係已證實嘅 0%**。一段永遠 403 嘅 code 唔係 resilience,係誤導 —— 下一個讀 `sync-sweep.service.ts` 嘅人會以為張單有自我修正機制,而實際上每一次都靜靜失敗。呢種「睇落有、實際冇」正正係本專案再三想杜絕嘅嘢。

### D2 — 同一個資訊改行 work note

Gate ② 開閘嗰刻,對該 request 名下每張 RITM 加一條 work note,走 `ServiceNowService.addWorkNote()`（寫 `sc_req_item`,**已證實寫得到**）:

```
Target user verified in ServiceNow (sys_user <sysId>).
The `target_user` variable on this item is the REQUESTER, not the target —
the target is the address in `target_users_email`.
```

**點解 work note 而唔係其他**:唯一同時滿足「寫得到」「O365 Support 一定會見到」「唔需要新權限」嘅路。

### D3 — `target_user` **永遠** = requester

ADR-0025 D3 嗰句紅字由「回填之前」升級成「永遠」:

> 🔴 `target_users_email` 由頭到尾承載「呢張單為邊個開」——`target_user` **永遠**係 placeholder,**任何邏輯都唔可以靠佢認人**。

呢句適用範圍包括 **ServiceNow 側** —— 任何靠 `target_user` 嘅 SN report / assignment rule / notification 都會指向 requester。呢個要同 SN 側講清楚,係本 ADR 最大嘅代價。

### D4 — work note 失敗維持 non-fatal

寫唔到 work note **唔可以**令 gate ② 重新關上,亦唔 throw。理由同 ADR-0025 F3-8 一樣:gate 記錄嘅係「ServiceNow 知唔知道呢個人」,執靚張單係另一回事。分別在於呢次 non-fatal 係真正嘅 resilience（路徑已證實可行,失敗即係真 outage）而唔係遮住一個必然失敗。

### D5 — 攞 `sc_item_option` 寫權**唔做 blocking dependency**

可以平行去追,但唔可以拖住 W43。攞到之後要恢復回填 = **另寫一份 ADR**,唔可以靜靜改返（呢份 ADR 就係要令「回填唔存在」變成一個明文決定而唔係一個遺漏）。落 `DEFERRED_REGISTER`。

## Alternatives Considered

- **Option A — 攞 `sc_item_option` 寫 ACL,保住 ADR-0025 D3 原設計**:唯一保住原設計嘅方法,**唔係被質素 reject,係被時序 reject** —— 批唔批、幾時批唔喺我哋手,而 W43 唔應該卡喺一個外部審批度。⇒ 轉 D5 defer。順帶一提,要求逐個 sub-table 開寫權本身同 least-privilege 方向相反（同 ADR-0018 OQ-2 揭到嘅缺口同源）。
- **Option B — 保留回填做 best-effort,當佢「將來可能 work」**:rejected。0% 且**已證實**嘅 0%,同「未知成功率」係兩件事。留低嘅唯一效果係令人以為有自我修正。
- **Option C — 建單時就填真人 sys_id,唔要 placeholder**:rejected —— 呢個係 ADR-0025 §Context 個時序矛盾:gate ② 未通即係 SN 未有呢個人,**根本冇 sys_id 可填**。
- **Option D — 改用 Service Catalog API（`/api/sn_sc/...`）改 variable**:**未 reject,但唔採用** —— 未驗過,而且要再開一條寫路兼再賭一次 ACL。若日後有人驗到佢寫得,值得重開（見 OQ-1）。
- **Chosen — D1 + D2（拆走 + work note）**:拆走一段永遠失敗嘅 code,改用一條**已證實寫得到**嘅路交付同一個資訊。Chris 2026-08-04 拍板。

## Consequences

- **Positive**:少一段永遠失敗嘅 code;交付路徑係已證實寫得到嗰條;gate ② 語意變乾淨 —— 佢淨係負責開閘,唔負責執靚張單;`sc_item_option` 呢個 ACL 事實由「未證實嘅假設」變成明文記錄,下次唔使再撞一次。
- **Negative**:🔴 **`target_user` 欄永遠指錯人** —— 任何 SN 側靠佢嘅 report / assignment rule / notification 都會指向 requester,只可以靠 work note + `target_users_email` 補。呢個係真代價,而且 UOP 呢邊補唔到。
- **Neutral**:**gate ② 行為一個字唔變** —— 開閘靠「SN 搵唔搵到呢個人」,同寫唔寫得到 variable 完全無關;assign 雙閘、`budgetOverrideReason` 唔 override 得 sync gate,全部維持。零 schema、零新 dep。

### 🔴 2026-08-04 post-Accept 附註 —— 校正一句話（**唔改 D1–D5**）

實作期間對返 **RISK R6** 揭到本 ADR 一句話講得太實:上文（同 D2）講 work note 路徑「**已證實寫得到**」。**精確講法**:CH-010 證實嘅係**個 PATCH 唔會被 403 拒絕**（對比 `sc_item_option` 一定 403），**唔係**「note 一定 land」。R6 記錄咗 `work_notes` 係 journal input field，Table API GET **永遠返空**，而 integration account 讀唔到 `sys_journal_field` ⇒ ServiceNow 完全做得到**收 `state` 而靜靜 drop `work_notes`**（field-level ACL），喺平台睇嚟同成功一模一樣。

**呢個唔改變決定**:一條**可能**寫得到嘅路，好過一條**已證實一定唔得**嘅路。但佢改變咗我哋可以聲稱幾多 —— D2 應該讀成「改行一條**冇被證實封死**嘅路」而唔係「改行一條保證送達嘅路」。ADR-0026 交付嘅係**唔再假裝有自我修正機制**，唔係**保證 fulfiller 一定睇到**。

⇒ R6 已加咗 gate ② note 做第二個 consumer。要真證實 note land，同 R6 一樣要**人手開 SN 望**。

## Open Questions

- **OQ-1（open,唔阻落地）** — Service Catalog API（`/api/sn_sc/...`）改 variable 寫唔寫得到?未驗。**Chris 2026-08-04 拍板唔卡喺呢度。** 我方睇法係**推理唔係實測**:ServiceNow ACL 綁 **table** 唔綁 API surface,任何寫 `sc_item_option` 嘅路都會行同一套 record-level 評估;而且 stock `sn_sc` surface 係 cart / order / item 定義嗰邊,**冇文檔化嘅「改已提交 RITM variable」路** ⇒ 驗佢係開放式探索,唔係一個平價檢查。若日後有人**實測**到寫得,重開 Option D 要行 D5（另寫 ADR）。
- **OQ-2 — resolved（Chris 2026-08-04,按 default）**:work note **照寫所有** RITM,唔限平台自己建嗰張。理由:work note 係 **append,唔覆蓋任何嘢** —— 最壞後果係人哋張飛多咗一條無關 note,同「個 target 被改走」唔同級。W43 G7 實測嗰個「平台 request 駁咗落另一位同事張 RITM」嘅情況,正正係呢個分別最重要嘅場景。

## References

- **Supersedes**:ADR-0025 **D3 後半**（gate ② 通過回填 `target_user`）+ **D4 尾條**（開閘同時 PATCH）。ADR-0025 其餘全部**不變**,尤其 D3 前半（建單填 requester placeholder）同整個 gate ② 機制。
- `docs/adr/0025-onboarding-license-request-creation.md`
- `docs/03-implementation/bugs/BUG-010-*`（`sc_request` insert 403,同源 ACL 事實）
- `docs/adr/0018-servicenow-catalog-task-closure.md` OQ-2（least-privilege 缺口）
- `docs/01-planning/W43-onboarding-license-request/progress.md` —— G7 read 半 / write 半兩節,含真 403 輸出
- 落地:**W43 批 C**
