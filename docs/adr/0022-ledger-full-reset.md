# ADR-0022: Ledger full reset —— `assignedQuantity` 批量歸零成為常設路徑

**Date**: 2026-08-02
**Status**: Accepted
**Approver**: Chris Lai

## Context

CH-016(2026-08-02 收官)交付咗 allocation reset:`allocatedQuantity` 歸零,`assignedQuantity` 同 row 本身一個字唔郁。Chris 即日試用之後指出**效果同預期唔同** —— 佢要嘅係「整個 OpCo / 所有 OpCo 嘅記錄都清除掉,咁樣先可以重新導入真正存在而要管理嘅 license 記錄」。

### 實況查證(本地 dev DB `platform`,2026-08-02)

| 事實 | 數字 |
|---|---|
| ledger row | 150(24 個 OpCo) |
| `sum(allocatedQuantity)` | **0** ← 已跑過一次全平台 CH-016 reset |
| `sum(assignedQuantity)` | **6049** ← 完全冇郁 |
| `assignedQuantity > 0` 嘅 row | **127** |
| `LedgerAdjustment`(ADR-0007) | 10 條 / 6 個 row |

⇒ CH-016 做咗佢設計要做嘅嘢,但**唔夠**:`ledger-read.service.ts:33` 只隱藏 `allocated=0 AND assigned=0` 嘅行,所以 6049 個 assigned seat 令 127 行繼續留喺 License Assets 畫面。用戶睇到嘅「reset 咗但記錄仲喺度」係呢個。

### 點解要開 ADR(唔係「擴 CH-016 就算」)

ADR-0014 落 assigned baseline 嗰陣**明文預告咗呢一刻**(`apps/api/src/license/assigned-baseline.ts:14-17`):

> *"WHAT it deliberately is NOT: a repeatable self-service path. ADR-0014 chose a one-shot ops script precisely so no permanent API surface is added. **If bulk assigned updates are ever needed repeatedly (e.g. batch drift correction), that is a NEW ADR promoting this to a bulk endpoint — do not grow this file into that.**"*

本 ADR 就係嗰份 ADR。觸發 **§5 H1**(掂到 DESIGN §5「ledger 兩層數字」嘅寫入邊界 + ADR-0014 刻意唔開嘅 API surface)。

### 三條同時成立嘅 constraint

1. **ADR-0004 #5 alloc-only invariant** —— allocation import **永遠**唔寫 `assignedQuantity`。⇒ 清咗 assigned 之後,**重新 import 救唔返**,任何 SKU 都唔得(唔止 CH-016 §2.5 講嗰啲 inactive SKU)。
2. **DESIGN §5 / `reconcile.service.ts:72-77`** —— `assignedQuantity` 係 drift 對帳唯一基準。歸零 = 每個 SKU 都會爆 drift,直到重新灌 baseline。
3. **ADR-0016 D1 budget gate** —— `allocated=0` 會擋住嗰啲組合嘅所有 assign(ADMIN 可逐張 override)。

## Decision

**D1 — 新增「full reset」語意:`allocatedQuantity` 同 `assignedQuantity` 兩個都設 0,ledger row 保留,絕不 delete。**

`OpcoSkuLedger` row 一律唔 hard delete。理由唔係保守,係**刪 row 冇任何額外收益**:`ledger-read.service.ts:33` 已經令 `0/0` 行喺 UI 消失,而 delete 會令 `LedgerAdjustment` 經 `onDelete: Cascade` 一齊消失(ADR-0007 audit trail)。同樣效果,單邊代價 ⇒ 唔取。

**D2 — 開獨立 endpoint `POST /license/ledger/reset`,唔改 CH-016 嗰個。**

CH-016 嘅 `AllocationResetService` **一個字唔改**,佢守住嘅 invariant(「`assignedQuantity` 呢個欄位名唔准出現喺 write path」,有 test 鎖住)原封保留。新 service 獨立存在。⇒ 「allocation reset 唔會變成 full reset」呢件事由**型別同 test** 保證,唔靠人記得。

**D3 — 權限 ADMIN only(CH-016 係 ADMIN + REGIONAL)。**

清 allocation = 清一個可以 import 返嘅預算數;清 assigned = 清一個 import 救唔返、要重跑 ops script 先返到嚟嘅營運真數。兩者風險唔同級,權限唔應該同級。

**D4 — 清 `assignedQuantity` 每 cell 寫一條 `LedgerAdjustment`;清 `allocatedQuantity` 唔寫。**

呢個唔對稱係**刻意**,而且照住 `schema.prisma:154-158` 已寫低嘅分工:import / assign 唔寫 `LedgerAdjustment`,只有 per-cell 人手改動先寫。清 allocated 屬前者(跟 import 慣例,CH-016 已經係咁);清 assigned 屬後者,而 ADR-0014 baseline 正正就係咁做(「a baseline is semantically a batch of manual corrections」)。⇒ 6049 個 seat 點樣歸零,喺 `LedgerAdjustment` 逐格查得返。

**D5 — 兩個入口:HTTP endpoint(日常 / UAT)+ ops script(部署時大批初始化)。**

Script 同 endpoint **共用同一個 service**,唔各寫一份 —— 跟 ADR-0021「script 唔刪,同 endpoint 共用同一份 lookup」嘅先例。

**D6 — dry-run default,commit 要 explicit `dryRun: false` + `confirm` 字串對得上 scope。**

`confirm` 必須等於目標 OpCo code,或者全平台時等於 `ALL`。CH-016 只靠 dry-run + dialog;full reset 多咗一層打字確認,因為佢**冇 import 呢條回頭路**。

**D7 — 回應嘅 `warning` 必須分開講兩件唔同嘅事。**

- `allocated` 部分:重新 import 救得返(**inactive SKU 除外** —— CH-016 §2.5 嗰個坑照樣成立)。
- `assigned` 部分:**任何 SKU 都救唔返**,唯一出路 = 重跑 ADR-0014 `init-assigned-baseline.ts` 或逐格 `PATCH /license/ledger/:id`。

呢兩句唔可以合併成一句「reset 之後 import 返就得」—— 嗰句對 assigned 嚟講係錯嘅。

## Alternatives Considered

- **Option A:Hard delete ledger row** — rejected。用戶原話係「記錄清除掉」,呢個 option 語意上最貼,但查證顯示佢**冇任何額外收益**:UI 早已隱藏 `0/0` 行(CH-008),而 delete 會 cascade 走 `LedgerAdjustment`。Chris 2026-08-02 在知悉「零損失 vs 語意徹底」對比後拍板選 D1。
- **Option A+:Hard delete,但先把 `LedgerAdjustment` snapshot 落 `AuditLog`** — rejected。補返 A 嘅唯一缺點,但要多一層 snapshot 邏輯去換一個**用戶睇唔到嘅**差異(UI 兩者一樣)。§1.2 simplicity。
- **Option B:擴 CH-016 endpoint 加 `includeAssigned` flag** — rejected。少寫幾行,但會令 `AllocationResetService` 嘅 write path 出現 `assignedQuantity`,直接廢掉 CH-016 R4 嗰條守門 test(「防止 reset 被順手擴去掂 assigned」)。慳嘅係 code,蝕嘅係唯一一道結構性防線。
- **Option C:只做 ops script,唔開 API** — rejected。呢個係 ADR-0014 當時嘅選擇,前提係「一次性 go-live 初始化」。而家證實唔係一次性:UAT 階段每次數據有問題都要重來,Chris 明確要求 UI 入口。**但 script 唔刪**(D5),因為部署時大批初始化仍然唔應該經 HTTP。
- **Chosen:D1-D7** — 拎到「清空重來」嘅完整效果,同時零不可逆損失(A 嘅代價避開)、CH-016 invariant 完好(B 嘅代價避開)、UI 可自助(C 嘅代價避開)。

## Consequences

- **Positive**
  - 「上傳咗錯數據要全部重來」由**冇路可行**變成一個有 dry-run + 打字確認 + audit 嘅常設操作。
  - `LedgerAdjustment` 逐格保留(D4)⇒ 6049 個 seat 幾時、被邊個、由幾多歸零,事後查得返。
  - CH-016 一個字唔改,佢嘅 invariant test 繼續守住 allocation reset 嘅邊界。
- **Negative**
  - **Full reset 之後 drift 對帳失去基準**,直到重跑 ADR-0014 baseline —— 呢個係本操作嘅本質,唔係可以緩解嘅副作用。緩解手段只有「講清楚」(D7)。
  - 平台多咗一個 ADR-0014 刻意唔想開嘅 bulk assigned write path。⇒ D2/D3 用獨立 service + 收窄權限做圍欄。
  - 兩個名近似嘅 reset 操作並存,有撈亂風險。⇒ 前端一個入口、dialog 內二選一(見 CH-017 §2.2),唔喺 UI 擺兩個掣。
- **Neutral**
  - 零 schema 改動。`LedgerAdjustment` / `AuditLog` 都用既有 model。
  - `reconcile` 一個字唔改(同 ADR-0016 同一取態)。

## References

- `docs/adr/0014-assigned-baseline-initialisation.md` —— 明文指定「要開 bulk assigned 路徑就寫新 ADR」,本 ADR 即該份
- `docs/adr/0004-allocation-import-mechanism.md` #5 —— alloc-only invariant(⇒ import 救唔返 assigned)
- `docs/adr/0007-opco-ledger-manual-management.md` —— `LedgerAdjustment` audit 分工(D4)
- `docs/adr/0016-opco-budget-assign-gate.md` D1 —— `allocated=0` 擋 assign 嘅中間態
- `docs/03-implementation/changes/CH-016-allocation-reset/spec.md` —— 前身;§2.3 明文 out-of-scope 嘅嘢由本 ADR 解封
- `docs/02-architecture/licenseops/DESIGN.md` §5 —— ledger 兩層數字
- 落地 = `docs/03-implementation/changes/CH-017-ledger-full-reset/`
