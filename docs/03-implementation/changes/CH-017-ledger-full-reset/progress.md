---
change_id: CH-017
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
---

# CH-017 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — 2026-08-02

### Done

**ADR** — ADR-0022 起草 → Chris approve → Accepted;README index 加行。
**Backend** — B1~B12。新 `POST /license/ledger/reset`(ADMIN only),`allocated` + `assigned` 一併歸 0,row 一律唔刪。
**Test** — T1~T12。api **746 / 64 suites**(CH-016 收官 719)· web **237 / 27 files**(225)。
**Frontend** — F1~F10。既有 card 加 mode 二選一 + 打字確認 input。
**Script** — S1~S2。`npm run reset:ledger`,直接 new 同一個 service。
**Live** — V1~V9 全部真 output 核過(見 checklist),**含 browser light + dark**。

### 點解要開新 CH(而唔係 CH-016 做漏咗)

CH-016 做足咗佢設計要做嘅嘢。真正嘅落差喺 **read model**:`ledger-read.service.ts:33` 只隱藏 `allocated = 0 **AND** assigned = 0` 嘅行。dev DB 實測 `sum(alloc)=0`(CH-016 已全平台跑過)但 `sum(assigned)=6049` ⇒ **127 行照樣留喺 License Assets 畫面**。Chris 見到嘅「reset 咗但記錄仲喺度」就係呢個,唔係 bug。

⇒ 要達到「清空重新導入」,必須連 `assignedQuantity` 一齊清 —— 而嗰個動作 **ADR-0014 明文指定要開新 ADR**(`assigned-baseline.ts:14-17`:「要開 repeatable bulk assigned 路徑就寫新 ADR,唔好把呢個檔養大成嗰樣」)。所以本 CH 唔係「補鑊」,係 ADR-0014 一早寫低嘅升級路徑被觸發。

### Decisions

- **ADR-0022 approved**(Chris,2026-08-02)。兩項拍板:
  ① **清零兩個數字、row 留低**(否決 hard delete / hard delete + audit snapshot)
  ② **API + UI + ops script 三邊都要**(否決純 ops script)。
- **點解唔 hard delete** —— 呢個係本 CH 最值得記低嘅一條,因為用戶原話係「把記錄清除掉」,語意上 delete 先至最貼:
  查證之後發現 **delete 換唔到任何用戶睇得到嘅嘢**。`0/0` 行 CH-008 早就喺 read model 隱藏咗 ⇒ 清零同刪除喺 UI 上**完全一樣**;而 delete 會經 `onDelete: Cascade` 帶走 `LedgerAdjustment`(ADR-0007)。同樣效果、單邊代價 ⇒ 唔取。**把「查證出嚟嘅事實」擺喺「字面需求」之前,係呢個決定嘅關鍵**;直接照字面做就會靜靜咁蝕咗 audit trail。
- **點解開獨立 service 而唔係加 `includeAssigned` flag** —— 加 flag 少寫幾十行,但會令 `AllocationResetService` 嘅 write path 出現 `assignedQuantity`,直接廢掉 CH-016 R4 嗰條守門 test(「防止 reset 被順手擴去掂 assigned」)。慳嘅係 code,蝕嘅係唯一一道結構性防線。
- **權限唔同級**:CH-016 = ADMIN + REGIONAL,CH-017 = **ADMIN only**。理由唔係資歷,係**復原性不對稱** —— 清 allocated 重新 import 就返晒,清 assigned 任何 import 都救唔返。
- **`LedgerAdjustment` 刻意不對稱**(清 assigned 寫、清 allocated 唔寫):照 `schema.prisma:154-158` 已寫低嘅分工(import/assign 各有自己 audit,只有 per-cell 人手改動先落 `LedgerAdjustment`),ADR-0014 baseline 亦係咁做。
- **打字確認**:`confirm` 必須等於 scope。dry-run 擋嘅係「唔小心 commit」,打字擋嘅係「**故意 commit 但打錯咗 scope**」—— 兩者唔同,而後者對一個冇回頭路嘅操作先係真風險(R2)。ops script **照樣要求** `--confirm`,唔喺 script 開後門。

### 實作過程揭出嘅嘢

1. **interactive transaction 唔係風格選擇** —— 第一版跟 CH-016 用 array 形式 `$transaction`,即係喺 tx 外先 `findMany` 攞 before 值。但 `LedgerAdjustment.beforeValue` 嘅意義就係「呢句 statement 覆蓋咗嘅值」,喺 tx 外讀會令 audit 靜靜咁記錯。改成 interactive、喺 tx 內讀。
2. **script 唔喺 `src/**` = 冇 lint、冇 build 覆蓋** —— `npm run lint` 同 `nest build` 都唔會睇 `prisma/*.ts`。所以 script 一寫完即刻真跑 dry-run 驗(順帶完成 V2),first run 就爆咗 `DATABASE_URL not found`。
3. **`--env-file-if-exists=.env`(Node 22 內置)解 env,冇加 `dotenv`** —— `dotenv` 只係 `@nestjs/config` 嘅 transitive dep,為咗一個 script 升做直接 dependency 會觸發 H2。Node 內置 flag 零成本。
4. **CH-016 既有 test 紅過一次,而且係啱嘅** —— 我把 inactive-SKU 嗰句文案改成 full mode 用嘅版本,CH-016 test 即刻捉到。修法唔係改 test,係**只喺 full mode 換句子**(allocation mode 一個字唔改)。既有 test 紅 = 佢守住緊嘢,唔係阻住。

### 🔴 V7 —— 用真數據證明 warning 第二句唔係講嚟嚇人

Full reset RTW → 重新 import 一份正確 CSV:

| | 前 | import 後 |
|---|---|---|
| `sum_alloc` | 0 | **41**(22 + 19,返晒) |
| `sum_assigned` | 5971 | **5971**(**一格都冇返**) |

`STANDARDPACK` / `VISIO_PLAN1` 兩個 inactive SKU 連 allocation 都 import 唔到(CH-016 §2.5 照樣成立)。⇒ ADR-0004 #5 alloc-only invariant 嘅實證,亦即 UI 嗰句「reloading it is a separate ops step」嘅真憑據。

### Deviations

- **B12**(spec 外):`reset(actorId)` 放寬做 `string | null`。spec §2.5 要求 script 同 endpoint 共用同一個 service,而 script 冇登入用戶;`LedgerAdjustment.actorId` 同 `AuditLog.actorId` 本來就 nullable(ADR-0014 script 亦係「冇 `--actor` → null」)。純粹放寬型別,冇改任何行為 ⇒ 唔算 R3 級 deviation,但記低。
- **F10 / DS-2**:`max-w-[280px]` 係 repo 內唯一一個 280 → 改用既有 `240`。**同 CH-016 F8 一模一樣嘅坑**(嗰次都係 select 寬度),今次靠 `ui-design` 自檢即刻捉到,冇入 commit。

### Blockers

冇。

---

## Closeout — 2026-08-02

**交付**:`POST /license/ledger/reset`(ADMIN)+ Settings 內 mode 二選一 + `npm run reset:ledger`,三個入口共用同一個 service。ADR-0022 Accepted。

**驗證強度**:api 746 / web 237 全綠 · repo lint exit 0 · live 真 DB 前後對比(row 數 **150→150** 零 delete · assigned 精確 −78 · adjustment 精確 +4)· browser light + dark 全程零寫入。

**留低嘅狀態**:dev DB 而家 `150 rows | alloc 41 | assigned 5971 | adjustments 14` —— RTW 一個 OpCo 被 full reset 咗(驗證用),其餘 23 個 OpCo 嘅 assigned 完好。**全平台清空係 Chris 自己撳嗰下**,唔由本 CH 代做。

**下一步**(唔屬本 CH):Chris 若要全平台清空重來,順序係 ① full reset(`confirm: ALL`)② 重新 import allocation ③ `npm run baseline:assigned` 灌返 assigned ④ `POST /license/reconcile` 確認 drift 清。
