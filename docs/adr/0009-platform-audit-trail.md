# ADR-0009: 平台 audit trail(通用 `AuditLog` 與既有 domain 記錄共存 · 白名單 before/after · 平台 vs ServiceNow audit 分工)

**Date**: 2026-07-20
**Status**: **Proposed** ← 待 Chris 拍板 OQ-1 / OQ-2(見 §Decision 6-7)先 flip Accepted
**Approver**: Chris Lai(pending)

## Context

觸發 **CLAUDE.md §5.1 H1** —— 新增 Prisma model + 橫切 6+ 個 service 嘅寫入路徑 + 擴展平台喺 audit 上嘅架構定位。

**業務驅動(Chris,2026-07-20)**:平台將來要滿足 audit 需求,需要以下四項可查:①用戶列表 ②角色 / 權限列表 ③權限可訪問嘅功能列表 ④操作記錄(收 request、建 request、assign license、改 request stage、改 license assets、建 / 改用戶帳號、建 / 改角色權限)。

**現況查證**(詳見 `docs/02-architecture/audit-and-integration-observability.md` §2,全部有 code 佐證):

- ①用戶列表 ✅ 已有(`AppUser` + Users & roles UI)。
- ②角色 ⚠️ 半 —— `Role` enum 三值(`schema.prisma:29-33`),但**冇 permission table**,權限 100% hardcode 喺 `@Roles()` decorator。
- ③權限→功能對照 ❌ **完全冇**,冇任何 DB 或文件記錄。
- ④操作記錄 ❌ **約一半冇留痕**:已有 `RequestEvent`(request 生命週期 + assign)同 `LedgerAdjustment`(ledger 逐格手改);但**用戶帳號 CRUD、角色 / scope 變更、密碼重設、登入成敗、OpCo CRUD、catalog 編輯、allocation import、drift resolve 全部零留痕**。

**兩個必須先處理嘅前提**:

1. **架構定位張力** —— `docs/architecture.md:17` 把 audit 定位為 ServiceNow(System of Record)責任「誰申請、誰批、記錄」。但上述缺口 ServiceNow **一件都唔知**。所以本 ADR 唔係補漏,係**擴展平台嘅 audit 責任範圍**。
2. **同既有決定衝突** —— `allocation-editing-and-drift-correction.md:193`(ADR-0007 前置分析)曾明確 **reject** 通用 `AuditLog`,理由係「大改、影響現有 request 歷史」。本 ADR 重啟該 alternative,但**繞開原本嘅 reject 理由**(見 Decision 1)。

## Decision

### 1. 通用 `AuditLog` 與既有 domain 記錄**共存**,而唔係取代

```
RequestEvent      → request 生命週期 + assign(既有 UI 消費)      不動
LedgerAdjustment  → ledger 逐格手改(ADR-0007 決定)               不動
AuditLog（新）    → 上述兩者唔覆蓋嘅所有 write                     新增
```

**點解可以推翻當時嘅 reject**:當時 reject 嘅係「**generalize** `RequestEvent`」,唔係「有一張通用 audit 表」。共存方案下,`RequestEvent` 完全唔改 → 原本「影響現有 request 歷史」嘅理由**唔再成立**;「大改」則由 rollout 分階段消化。ADR-0007 嘅決定完整保留,**唔 supersede**。

### 2. 平台 vs ServiceNow audit 分工(明文化,補 `architecture.md:17`)

| 稽核問題 | 由邊個答 |
|---|---|
| 邊個申請、邊個批、SLA | **ServiceNow**(不變) |
| 平台內邊個改咗權限 / 數字 / 配置 | **平台 `AuditLog`**(新) |
| license 實際點解 assign 咗 | **平台 `RequestEvent`**(既有,不變) |

### 3. Model(additive,無 breaking migration)

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?          // AppUser id;null = system / cron / m2m
  actorType  String           // 'user' | 'system' | 'm2m'
  action     String           // 'user.role_change' | 'opco.update' | …
  targetType String           // 'AppUser' | 'Opco' | 'SkuCatalog' | …
  targetId   String
  before     Json?            // 白名單欄位 only(Decision 5)
  after      Json?
  metadata   Json?            // reason / correlationId / 來源
  createdAt  DateTime @default(now())

  @@index([targetType, targetId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
}
```

`action` / `targetType` 用 **string 而非 enum** —— 新增 audit 事件唔應該次次要 migration。合法值集中喺一個 TS const map,由 test 鎖死。

### 4. 覆蓋範圍(首階段)

`user.create` / `user.update` / `user.role_change` / `user.deactivate` / `user.password_reset` · `auth.login_success` / `auth.login_failed` / `auth.locked` · `opco.create` / `opco.update` · `catalog.update` · `allocation.import` · `drift.resolve`。

### 5. 🔴 白名單 before/after(H4 強制)

每個 `targetType` 有一張**明文白名單欄位表**;只有白名單內欄位可入 `before`/`after`。`passwordHash` / `tokenHash` / 任何 secret **永久 blacklist**。

> **點解呢條係 blocking**:實作時若圖方便寫 `before: user`(整個 Prisma object),就會把 `passwordHash` 寫入 audit table —— 災難級 H4 violation。**必須由 test 鎖死**(H5)。

### 6. ⏸️ OQ-1 — 記唔記 before/after【待 Chris 拍板】

- **建議:記(白名單)。** 唔記嘅話稽核員問「改成點」答唔到,audit 價值大減。
- 反面:資料量較大、實作較重。

### 7. ⏸️ OQ-2 — PII 策略【待 Chris 拍板】

`LedgerAdjustment` 個 schema comment(`schema.prisma:133`)特登寫「actor is an AppUser id, **never PII**」。但要 audit「改咗用戶 email」,唔記舊 email 就等於冇記到。

| 選項 | 做法 | 得失 |
|---|---|---|
| P-A | 一律只存 id | H4 最乾淨 / audit 價值大減 |
| **P-B(建議)** | actor·target 存 id;`before`/`after` 白名單**可含** email·displayName | audit 真正有用 / table 含 PII,要 role gate |
| P-C | 存 hash / masked | 折衷 / 稽核員睇唔到實值 |

> H4 原文係「唔好 log 落 **plaintext file**」。DB table + role gate ≠ log file,故 **P-B 唔違反 H4 字面**,但屬 H4-adjacent → **必須 Chris 明確拍板,AI 唔自行決定**。

### 8. 其他決定

| # | 決定 |
|---|---|
| 8.1 | **審計寫入與主操作同一 `$transaction`** —— 寧可整個操作失敗,都好過「做咗但冇記錄」(OQ-3 建議) |
| 8.2 | **讀取權限 ADMIN only** 起步;REGIONAL / OPCO_IT 將來另議(OQ-4 建議) |
| 8.3 | **唔做 retention / 清理** —— 靠 index;量大先加(避免過早優化) |
| 8.4 | **唔補歷史** —— 冇來源。audit 由上線日起計,文件明寫起始日 |
| 8.5 | **權限矩陣由 code derive** —— 唔起 permission table(rollout item 2)。`@Roles` 保持唯一真相,矩陣係 derived artifact + drift test 保證同步 |

**點解唔起 permission table**:兩處真相必然 drift。`@Roles` decorator 已經係 enforcement point,再起一張 DB 表只會令「表寫住可以、code 唔畀」成為可能。Derived + test 鎖死 = 單一真相 + 可稽核。

## Alternatives Considered

- **A. Generalize `RequestEvent` → 通用 audit** — rejected(沿用 `allocation-editing-and-drift-correction.md:193` 原判斷):會影響既有 request 歷史同 UI。
- **B. 逐 domain 加表**(`UserAudit` / `OpcoAudit` / `CatalogAudit` …)— rejected:需求橫跨 6+ domain,逐個加表會爆;跨 domain 查詢(「呢個人今個月改過乜」)要 union 一堆表。
- **C. 只記事件唔記 before/after** — 見 OQ-1,待拍板。
- **D. 起 permission table** — rejected(Decision 8.5):雙真相必 drift。
- **E(Chosen). 通用 `AuditLog` 與既有記錄共存 + 白名單 before/after + 權限矩陣 derive** — 繞開原 reject 理由、零 breaking migration、單一真相。

## Consequences

- **Positive**:§2.2 全部零留痕操作變可稽核;權限矩陣首次有可查證形式(+ drift test);平台 vs ServiceNow audit 分工明文化;additive migration,零迴歸。
- **Negative**:6+ 個 service 要 hook,實作面廣;三張記錄表,跨表查詢要 union;audit 同 transaction 綁 → audit 故障會 block 業務操作(8.1 嘅刻意取捨);若採 P-B,audit table 含 PII → 要 access control,將來或需 retention。
- **Neutral**:`RequestEvent` / `LedgerAdjustment` / ADR-0007 完全不變;對帳方案甲 / ledger 兩層數字 / sync gate 全部不受影響。

## References

- `docs/02-architecture/audit-and-integration-observability.md`(本 ADR 嘅前置分析)
- `docs/architecture.md:17`(ServiceNow = System of Record,含 audit)
- `docs/02-architecture/licenseops/allocation-editing-and-drift-correction.md:193`(通用 AuditLog 當時被 reject)
- ADR-0007(`LedgerAdjustment`;本 ADR **唔 supersede** 佢)
- `CLAUDE.md` §5.1 H1 · §5.4 H4 · §5.5 H5
- 現況查證(2026-07-20):`schema.prisma:29-33,133,283` · `user-admin.controller.ts:30` · 全部 `@Roles` grep
