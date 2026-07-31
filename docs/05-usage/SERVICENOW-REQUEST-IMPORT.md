# 由 ServiceNow REQ 號碼導入 request

> **對應**:CH-013 · **ADR-0021** · 角色 **ADMIN only**
> **入口**:Settings › Integrations › **Import request from ServiceNow**
> **CLI 等價**:`npm run intake:from-sn -w @uop/api -- --req=<REQ> …`

---

## 1. 幾時用（同幾時唔用）

| 情況 | 用唔用 |
|---|---|
| n8n 漏咗一張單 / 推失敗 / 要重推 | ✅ **正是為此而設** |
| n8n UAT 未接通,要造測試數據 | ✅ |
| 平時嘅 onboarding request | ❌ **唔用** —— n8n 正路會自己推入嚟 |
| 想喺 ServiceNow **開新單** | ❌ 用 Requests › **New request**(W25 / ADR-0008 乙) |

呢個唔係「n8n 通咗就刪」嘅臨時嘢。就算 n8n 接通,補救場景仍然存在 —— 而補救唔應該要人開 terminal(ADR-0021 Context)。

---

## 2. 點用

1. **入 REQ number** → 撳 **Look up**。平台會由 `sc_request` 走落 `sc_req_item`,再數每張 RITM 底下有幾多個 **active `sc_task`**。
2. **睇每張 RITM 嘅判斷**:
   - 🟢 **1 active task** → 可導入
   - 🔴 **0 或 2+** → **唔可導入**,面板會講原因。呢個唔係吹毛求疵:平台履行完成時要 close 「自己嗰張」catalog task,0 張冇嘢可 close、2+ 張分唔清邊張係自己嘅(**ADR-0018 D3**)。呢一刻擋住,好過 assign 完先發現張單 close 唔到。
3. **逐張可導入嘅 RITM 揀一個 licence**。
4. **揀 OpCo + 填 target UPN**。
5. **Import**。

導入之後張 request 就同 n8n 推入嚟嗰啲**一模一樣** —— 之後照行既有流程(推 stage → sync gate → assign)。

---

## 3. 三件必須知嘅事

### 3.1 🔴 licence 一定要人手揀,平台**唔會**猜

ServiceNow 個 RITM 標題(「Create a new O365 user license maintenance request」)同平台嘅 `skuPartNumber`(`SPE_E5`)之間**冇任何機械對應**。所以面板唔會 prefill,亦唔應該。

⚠️ **絕不可以**把 ServiceNow 嘅標籤填入 `SkuCatalog.businessAlias` 嚟造一個對應 —— 嗰個 column 屬 **ADR-0004 allocation import**,污染咗會連 import 一齊搞爛。

### 3.2 sync gate 唔會因為「導入咗」而打開

`azureSyncedAt` 維持 **null**。「一個 admin 導入咗呢張單」同「Entra 見到呢個 user」係兩件事,而 sync gate 存在嘅唯一目的就係阻止呢種推論(**RISK R3**)。

gate 開啟仍然只有兩條路:ADR-0015 個排程 sweep 向 Graph 證實,或者人手 break-glass(而後者個 timeline 會誠實標明「未經 Graph 證實」)。

### 3.3 同一張 REQ 導入兩次係安全嘅

REQ 嘅 sys_id 係 `@unique`,所以第二次唔會開多張,亦**唔會**再寫一條 audit(冇嘢發生過就唔應該有紀錄講發生過)。

---

## 4. 🔴 AD 類 RITM：導入得,但唔好推去 assign

ADR-0017 D3 有一條硬規矩:

> n8n **1007** 只 close **AD 類** RITM;平台只 close **license 類**。兩邊**永不**掂對方嘅。

如果你導入咗一張 AD 類 RITM(例如 `New Hire Windows Domain Account`):

- **導入本身唔踩線** —— 導入唔 close 任何嘢
- **但唔好推佢去 assign** —— 一 assign,平台就會去 close 一張屬於 1007 嘅 task

呢個平台**唔會**幫你擋(佢分唔出 RITM 嘅類別),所以係操作紀律。

---

## 5. 權限

| Role | 睇唔睇到 |
|---|---|
| `ADMIN` | ✅ |
| `REGIONAL` / `OPCO_IT` | ❌ **完全唔 render**(唔係 disable),API 亦 403 |

點解唔開放畀 OPCO_IT:一張 request 嘅 OpCo 係由 ServiceNow 推導,要**反查完先知** —— 一個要先做外部呼叫先答得到嘅授權 gate,係會出事嘅形狀。放寬 = **重開 ADR-0021 D3**,唔係改一行 code。

---

## 6. 清理測試 request

導入嘅 request 同其他一模一樣,冇特別標記。清理方法同一般測試數據:

```sql
-- 先睇清楚要刪咩
select id, "serviceNowNumber", "targetUpn", status
from "Request" where "serviceNowNumber" = 'REQ00xxxxx';
```

刪之前**記得**:如果嗰張已經 assign 過,ledger 個 `assignedQuantity` **唔會**跟住減 —— 直接刪 request 會製造一格 drift。未 assign(`stage` 仲係 `REQUESTED` / `READY`)嘅就冇呢個問題。

---

## 7. CLI 等價（無 browser 時用）

```bash
# 睇呢個帳號見到啲咩單,連每張 RITM 嘅 active task 數
npm run intake:from-sn -w @uop/api -- --list

# 睇一張單(dry run,乜都唔寫)
npm run intake:from-sn -w @uop/api -- --req=REQ0044038

# 連 work note 一齊睇（見 RISK R6 —— 讀唔到唔代表冇寫）
npm run intake:from-sn -w @uop/api -- --req=REQ0044038 --notes

# 真導入
npm run intake:from-sn -w @uop/api -- --req=REQ0044038 --sku=SPE_E5 \
    --upn=someone@rapo.com.hk --post
```

script 同 UI **共用同一份反查**(`ServiceNowLookupService`,ADR-0021 D6),所以兩者對「呢張 RITM 導唔導得」永遠答同一個答案。

⚠️ script 個 `--post` 行嘅係 **m2m intake route**(要 `INTAKE_API_KEY`),UI 行嘅係 **user-authenticated route**。兩條最後都入同一個 `IntakeService`,結果一樣,但 audit 唔同:UI 嗰條會記低**邊個**導入(`request.imported_from_servicenow`),script 嗰條冇 actor 可記。

---

## 8. 已知限制

| 限制 | 詳情 |
|---|---|
| 一次一張 REQ | 冇批量。刻意 —— 每張都要人揀 licence,批量只會令人亂揀 |
| 冇 file upload | Chris 明確要求「只提供 request 號碼」 |
| 冇「連去 request detail」 | toast 講明 request number,自己去 Requests 頁搵。要做 link 就要改共用 `Toast` primitive(H6:要先問 owner) |
| 反查成本 | 一張 REQ 帶 N 張 RITM = `1 + N` 個 GET。唔會自動跑,要撳掣;冇 retry |
| 冇速率限制 | 一個 ADMIN 可以連續導入好多張。緩解只有「收窄到 ADMIN」+ 每次寫 audit(ADR-0021 Consequences 有明寫) |
