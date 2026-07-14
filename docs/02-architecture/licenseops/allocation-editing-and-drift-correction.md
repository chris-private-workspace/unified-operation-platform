---
artifact: design-doc
title: "Allocation 手動編輯 + Drift 對回 — Design Proposal"
status: draft            # draft | active | superseded
created: 2026-07-14
spec_refs: [DESIGN §1/§5/§6/§10, ADR-0004, CLAUDE.md §5 H1/H3/H4/H5]
affects_components: [LicenseModule (apps/api), apps/web Assets, apps/web Drift]
---

# Allocation 手動編輯 + Drift 對回 — Design Proposal

> 跨 component 設計方案,落 code 前把問題想清楚 + 畀 owner review。
> **本檔係探討 + 選項,唔係已拍板決定。** 方案定案後,關鍵決定沉澱入 **ADR-0007**,本檔留做佐證。
> **Owner 拍板點**:§4.2(SSOT 定位)、§8(Open Questions)—— 呢幾點未 resolve,唔應該開 code。

---

## 0. TL;DR(一頁睇晒)

- **問題**:License Assets 頁面唯讀,`allocatedQuantity`(OpCo 配額)目前只能經 **CSV import** 管理(ADR-0004)。Chris 要求增加**頁面直接編輯**,主場景 = 單點修正 / 手動改數量 / 修正差異,並開放畀 **Regional** 角色。
- **點解而家冇**:唔係遺忘 —— ADR-0004 已 care Regional 自助,但當時定位 **「Excel = budget SSOT,平台做鏡像」**,import 覆蓋咗主場景(批量鏡像),direct edit 因兩條 open question(對帳「對回」機制 / OpCo self-service 時機,DESIGN §10)未解而擱住。
- **核心洞見**:手改 **`allocatedQuantity` 唔會 break 對帳**(四處實證:DESIGN §5 line 96-97 / schema 註解 / ADR-0004 / `reconcile.service.ts` 都寫明 allocated **不參與 drift**)。真正要拍板嘅唔係「技術做唔做到」,而係 **「allocated 嘅 source of truth 係 Excel 定平台」**(§4.2)。
- **關鍵區分**:`allocated`(budget,可安全手改)vs `assigned`(drift baseline,**唔應該**畀手改)。用戶口中「改數量」= 前者;「修正差異」= 後者層面,係另一回事(§4.1)。
- **觸發**:掂 **H1**(改 allocated 嘅 source model / 對帳)+ **H3**(Regional scope)→ 定案要 **ADR-0007** + phase plan。

---

## 1. Problem / Motivation

### 1.1 觸發
Chris 測試時發現 License Assets 頁面改唔到數量,提出:**頁面直接編輯同 CSV import 兩者都應該存在**,因為各有場景;而 Regional 角色喺日常營運需要喺 UI 直接:
1. **手動改配額數量**(單點微調,唔使為改一格整份 CSV re-import);
2. **修正差異**(drift 出現時喺 UI 處理)。

### 1.2 現狀點解唔夠
- `allocatedQuantity` 唯一寫入路徑 = `POST /license/ledger/import`(CSV,ADR-0004),入口喺 Settings › Integrations。
- 日常「呢個 OpCo 呢個 SKU 加 2 個」要 export Excel → 改 → re-import,對單點操作太重。
- Drift Alerts 頁(W08)只做**偵測 + 顯示**,冇任何「修正 / 對回」動作。
- 結果:平台對 Regional 嘅日常配額營運缺咗一個直接操作面。

---

## 2. As-Built / 現況(防重造既有嘢)

| 已有 | 喺邊 | 可唔可以 reuse |
|---|---|---|
| CSV allocation import(dry-run + curation-as-scope + `allocatedQuantity`-only write) | `apps/api` LicenseModule · `POST /license/ledger/import`(ADR-0004) | ✅ 保留,做批量入口 |
| Import UI(file.text → preview → commit) | `apps/web` `components/settings/allocation-import.tsx` | ✅ 保留 |
| Drift 偵測(SKU TOTAL level:tenant consumed vs assigned sum) | `apps/api` `reconcile.service.ts` · `POST /license/reconcile` | ✅ 對回機制建喺其上 |
| Drift 顯示 | `apps/web` Drift Alerts 頁(W08) | 要改(加 action) |
| Ledger 讀 + Assets 顯示(By-OpCo / Platform) | `apps/web` `components/assets/*`(W15/W17) | 要改(加 edit affordance) |
| Per-OpCo scope 強制(fail-closed 403) | `apps/api` `auth/opco-scope.ts`(AUTH-3a) | ✅ 直接 reuse 落 write gate |
| 前端 role gating(canSeePlatform / canSeeAdminNav) | `apps/web` `lib/roles.ts`(AUTH-3b) | ✅ reuse |
| Operational history(actor / type / message) | `prisma` `RequestEvent`(綁 `requestId`) | ⚠️ **綁死 request,唔啱 ledger** — 見 §5 |

**關鍵 schema 現況**(`apps/api/prisma/schema.prisma`):

```
model OpcoSkuLedger {
  allocatedQuantity Int @default(0)  // budget / owned (OpCo-managed) → 純顯示,不參與 drift
  assignedQuantity  Int @default(0)  // baseline assigned (+1 on assign) → 方案甲 drift baseline
  updatedAt         DateTime @updatedAt
  @@unique([opcoId, skuCatalogId])
  // ← 冇 audit field:冇 who / 冇 reason / 冇 history
}
model DriftAlert {
  note String?          // 有 note,但冇 resolvedById / actor
  status DriftStatus    // OPEN | RESOLVED
}
```

**四處實證 `allocatedQuantity` 不參與 drift**(呢個係成份 proposal 嘅地基):
1. **DESIGN §5 line 96-97**(SSOT 決策原文):「`allocatedQuantity` = OpCo budget…→ 顯示/反映,**不參與 drift**」/「`assignedQuantity` = …**只有這個**拿去對帳」。
2. schema 註解:`allocatedQuantity = ... → display`。
3. ADR-0004 Consequences:「`allocatedQuantity` 不參與 drift(純顯示/反映)」(ADR 原文標「DESIGN §96」= DESIGN.md **line 96**,唔係 section 96)。
4. `reconcile.service.ts:23`:「Only assignedQuantity reconciles — allocatedQuantity (OpCo budget) is display only.」

→ **手改 allocated 對 drift 偵測邏輯零影響。** 對帳係 `tenant consumed vs assigned sum`,唔睇 allocated。

---

## 3. Goals / Non-Goals

### Goals
- G1 — Regional / ADMIN 可喺 UI **直接編輯 `allocatedQuantity`**(單點),唔使 re-import。
- G2 — 每次手改留 **audit trail**(who / when / old→new / reason),令平台數字可追、可解釋。
- G3 — 提供 **drift「對回 / 修正」** 動作(至少人手 note + resolve;進階分攤按 §4.4)。
- G4 — 手改與 import **共存唔打架**(明確 SSOT + 覆蓋規則)。
- G5 — Regional 權限邊界清晰,後端 fail-closed(reuse AUTH-3a)。

### Non-Goals(明確唔做,防蔓延)
- N1 — **唔畀手改 `assignedQuantity`**(drift baseline;手改會污染對帳,H1)。assigned 只由 assign 流程 / sync 動。
- N2 — 唔做自動 drift 對回(唔自動 apply Graph 數)—— 平台定位 System of Action、保留人手介入控制點(DESIGN §1 line 17 / §4.3 line 73);對帳(§5)只做偵測,唔自動 apply。
- N3 — 唔開放 OPCO_IT 寫 allocated(沿 ADR-0004:import 已排除 OPCO_IT;self-service 時機仍係 open question)。
- N4 — 唔掂成本 / 發票金額(H3;DocuWare owns)。
- N5 — 唔改 import 機制本身(ADR-0004 保留)。

---

## 4. Proposed Design

### 4.1 關鍵區分 — 兩個數,風險天差地別

| 數字 | 意義 | 手改? | 理由 |
|---|---|---|---|
| **`allocatedQuantity`** | OpCo 配額 / budget(邊個 OpCo 分到幾多) | ✅ **可以** | 純管理決定,不參與 drift → 手改零對帳風險(只需 audit) |
| **`assignedQuantity`** | 實際指派 baseline(對帳基準) | ❌ **唔可以** | 係 drift baseline;手改直接整亂對帳語意(H1) |

→ 用戶「手動改數量」= 改 **allocated**(安全);「修正差異」= **assigned / drift 層**(敏感,§4.4 分開處理)。

### 4.2 ⭐ 核心拍板點 — Allocated 嘅 Source of Truth

ADR-0004 定位:**「Excel 仍是 budget 的 SSOT,平台做鏡像」**。一旦加 UI 直接編輯,就會出現**兩個 writer**(Excel-經-import vs UI-edit)改同一個 `allocated`。若唔決定 SSOT,**下次 re-import 會覆蓋(clobber)UI 嘅手改** —— 呢個係共存嘅真正衝突點,唔係技術難度。

| 選項 | 描述 | 好處 | 壞處 |
|---|---|---|---|
| **X. 平台 authoritative(建議)** | 平台成為 allocated 嘅 SSOT;Excel/import 退為「初次遷移 + 偶爾 bulk」。UI edit 係正式改法。 | 乾淨;無 clobber;符合 schema 開篇定位「System of Action」;Regional 日常真正自助 | 要 Chris 明確拍板 Excel **退場為次要**;bulk 覆蓋要諗點同 UI 手改協調 |
| **Y. Excel 保持 SSOT,UI = 臨時 override** | UI 手改只係臨時,re-import 會蓋返 | 唔改定位 | 混亂、反直覺(手改「消失」);**唔建議** |
| **Z. 雙寫 last-write-wins + audit** | import 同 UI 都寫,最後改嘅算,全部有 record | 兩邊都「即時生效」 | re-import 仍會蓋 UI(除非 import 改成 merge);審計要靠 audit 分辨 |

**建議 = X**(平台 authoritative)。理由:平台 positioning 本來就係 System of Action;Regional 要嘅係「真‧自助」,唔係「改完被 Excel 蓋」。**但呢個要 Chris 拍板**,因為佢改變 ADR-0004 嘅 mirror 定位 → **ADR-0007 首要決定**。

> 若揀 X:import 保留做「bulk 覆蓋」工具,但 UI 要喺 import commit 前警示「呢次 import 會覆蓋 N 格手改」(dry-run preview 已有 delta,加標記即可)。

### 4.3 Allocated 手動編輯 + Audit

**API**(LicenseModule 內):
- `PATCH /license/ledger/:id`(或 `/ledger/:opcoId/:skuCatalogId`)—— body `{ allocatedQuantity, reason }`。
- `@Roles(ADMIN, REGIONAL)`;REGIONAL 若日後收窄到 per-OpCo,經 `opco-scope.ts` fail-closed(§4.5)。
- **Invariant**:只寫 `allocatedQuantity`,**絕不掂 `assignedQuantity`**(對齊 ADR-0004 import invariant)。
- 驗證:`allocatedQuantity >= 0`;`reason` required(non-empty)。
- 每次成功寫 → 同一 `$transaction` 內寫一條 audit(見 §5)。

**FE**:By-OpCo view(Regional 主場景)每行 `allocated` 格變成可編輯(inline edit / 小 dialog),要填 reason,confirm 先 commit;optimistic + 錯誤 rollback + toast。一個 view 一個 primary(H6)。

### 4.4 Drift「對回 / 修正」— 幾個方案 + trade-off

Drift 本質:`delta = tenantConsumed − sum(assignedQuantity)`。「對回」= 消除 delta。**真難題 = delta 屬邊個 OpCo**(tenant total 唔分 OpCo;DESIGN §10 明確 deferred)。

| 方案 | 做法 | 好處 | 壞處 / 風險 | 掂 assigned? |
|---|---|---|---|---|
| **A. Note + Resolve(建議先做)** | 操作員喺 drift alert 寫 reason + mark RESOLVED,記 who/when。唔郁數字。 | 最安全;即刻有值(記錄「已離線處理 / 已知原因」);零對帳污染 | 唔真正「修數」,只 close alert | ❌ |
| **B. 人手指定 OpCo 分攤** | 操作員將 delta 落一個/多個 OpCo 嘅 `assignedQuantity`,調 baseline | 真正修數;delta 歸零 | **改 assigned baseline = 敏感**;要嚴格 audit + 防誤操作;要 Chris 定分攤規則 | ✅(高危) |
| **C. 引導式對回** | 系統按最近 assign 活動提示可能 OpCo,人手確認 | 減人手判斷 | 要更多資料 model;太早 | ✅ |
| **D. 維持現狀** | drift 只偵測,對回留 Excel / 離線 | 零工作 | 未滿足需求 | ❌ |

**建議次序**:**先 A**(輕、安全、即刻有值),**B 之後另議**(綁 §8 open question「分攤規則」,要 Chris 拍板;因為改 assigned 掂 H1 drift baseline,風險最高,唔應該同 allocated 手改綑一齊做)。

### 4.5 Regional 權限邊界

- 沿 ADR-0004:allocated 寫 = **ADMIN + REGIONAL**,**排除 OPCO_IT**(self-service 時機仍 open,N3)。
- REGIONAL 讀權限 = 睇曬所有 OpCo(schema `Role` 註解「sees all OpCos」)。**但有定位 tension**:DESIGN §1 line 20 / §9 明確寫「**Regional IT = reflector + executor,不是 owner;license 數量的管理責任屬 OpCo(將來 self-service 交回)**」。即 spec 原意 Regional 係執行 / 反映 OpCo 嘅數量決定,唔係數量 owner。**畀 Regional 喺 UI 直接改數量 = 由 reflector 擴張成部分 owner**,呢點要明確拍板(見 §8 OQ-3)。
- 若日後要 REGIONAL 收窄:reuse `opco-scope.ts` `assertOpcoScope`(AUTH-3a),後端 fail-closed 403,前端 `roles.ts` gate 為輔。
- Drift 對回(§4.4):tenant-level 操作 → **ADMIN(+ REGIONAL?)**;OPCO_IT 排除。B 方案改 assigned = 更高權限,建議 **ADMIN-only** 起步。

---

## 5. Schema / 資料模型變更

| 變更 | File / table | Migration | Breaking? |
|---|---|---|---|
| 新 `LedgerAdjustment`(audit ledger 手改) | `apps/api/prisma/schema.prisma` | 加 model(additive) | 否 |
| `DriftAlert` 加 `resolvedById`(+ reason 用既有 `note`) | 同上 | additive 加欄(nullable) | 否 |
| (方案 B 才需)assigned 調整 audit | 沿用 `LedgerAdjustment`(field 標 assigned) | — | — |

**點解要新 model(唔 reuse `RequestEvent`)**:`RequestEvent` 綁死 `requestId`(`onDelete: Cascade`),係 request-scoped;ledger 手改冇 request context,塞唔入。**而且呢個唔係新構思 —— DESIGN §6 line 116 早已規劃**:「ledger 逐次修改的獨立 audit 表(先靠 `RequestEvent`,將來需要再加 `LedgerAdjustment`)」。本 proposal = 兌現呢個 spec-planned 嘅 `LedgerAdjustment`:

```
model LedgerAdjustment {
  id            String   @id @default(cuid())
  ledgerId      String
  ledger        OpcoSkuLedger @relation(...)
  field         String   // 'allocatedQuantity'(方案 B 才有 'assignedQuantity')
  oldValue      Int
  newValue      Int
  reason        String
  actorId       String
  actor         AppUser  @relation(...)
  createdAt     DateTime @default(now())
  @@index([ledgerId, createdAt])
}
```

(需喺 `OpcoSkuLedger` / `AppUser` 加對應 relation 反向欄。additive,唔 break 現有。)

> **注意**:加 model = schema 改動 = **H1 觸發** → 要 ADR-0007 approve 先寫 migration。

---

## 6. Alternatives Considered(機制層面)

- **Audit 用擴 `OpcoSkuLedger` 加 `lastEditedById`/`lastEditReason`** — rejected:只留最新一次,冇完整 history;licence 涉錢,要 full trail。
- **Audit 用 generalize `RequestEvent` → 通用 `AuditLog`** — rejected(至少現階段):大改、影響現有 request 歷史;新 `LedgerAdjustment` surgical,亦係 DESIGN §6 line 116 指定方向。
- **Import 改成 merge(唔覆蓋 UI 手改)** — 保留做 X 選項下嘅 refinement,唔係首選(增加 import 複雜度;先用 dry-run 警示覆蓋已足)。
- **Drift 自動 apply Graph 數** — rejected:對帳定位係偵測 + 人手介入(DESIGN §1 System of Action / §5 只偵測),唔自動 apply(N2)。

---

## 7. Impact

- **Affected components**:`apps/api` LicenseModule(新 endpoint + service + audit)、`prisma`(schema + migration)、`apps/web` Assets By-OpCo view(inline edit)、Drift 頁(對回 action)。
- **Migration**:additive(`LedgerAdjustment` + `DriftAlert.resolvedById`);唔 breaking。
- **Hard constraints 觸發**:
  - **H1** — 改 `allocated` source model(mirror → authoritative,§4.2)+ 新 schema + (方案 B)掂 drift baseline → **必 ADR-0007**。
  - **H3** — Regional 寫權限 scope。
  - **H4** — allocated 手改屬中央操作(reuse ADMIN/REGIONAL gate);audit 記 actor,唔 log PII。
  - **H5** — 掂 ledger write(critical-path adjacent)→ 必寫 test(allocated write invariant「唔掂 assigned」、audit 落帳、scope fail-closed、方案 A resolve)。Graph mock。
  - **H6** — inline edit UI token-only、一 view 一 primary、light+dark。

---

## 8. Open Questions & Risks(← 要 Chris resolve 先開 code)

- **OQ-1(最關鍵)**:Allocated SSOT = **平台 authoritative(X)** 定維持 Excel mirror?→ 決定 import 同 UI 點協調(§4.2)。
- **OQ-2**:Drift 對回做到邊 —— 只 **A(note+resolve)**,定要埋 **B(改 assigned 分攤)**?B 要埋「delta 點分落 OpCo」規則(DESIGN §10 老問題)。
- **OQ-3**:Regional 改所有 OpCo,定要 per-OpCo 收窄?OPCO_IT 幾時開放(self-service 時機,DESIGN §10)?**更根本(新加)**:DESIGN §1 line 20 定位 Regional = reflector/executor **非 owner**、數量責任屬 OpCo —— 畀 Regional 喺 UI 直接改數量係咪有意調整呢個定位?(SSOT/OQ-1 之外另一條要拍板嘅定位問題。)
- **Risks**:
  - R-A:UI 手改 + re-import clobber(OQ-1 未定則存在)→ 靠 §4.2 X + import 覆蓋警示緩解。
  - R-B(方案 B):手改 assigned 污染對帳 baseline → 嚴格 audit + ADMIN-only + 大量 test;建議延後。
  - R-C:並發兩人改同格 → `updatedAt` optimistic lock / 後端 last-write + audit。

---

## 9. Rollout Plan(分階段;每階段獨立有值)

> **Phase 0(pre-code,必須)**:Chris resolve OQ-1/2/3 → 寫 **ADR-0007**(SSOT 定位 + audit model + 權限)。冇呢步唔開 code(R1/H1)。

| 階段 | 範圍 | 交付 | 依賴 |
|---|---|---|---|
| **P1 — Allocated 手改 + audit** | §4.3 + `LedgerAdjustment`(§5)+ Regional gate(§4.5) | `PATCH /ledger/:id` + By-OpCo inline edit + audit + test | ADR-0007(OQ-1) |
| **P2 — Drift 對回 A(note+resolve)** | §4.4-A + `DriftAlert.resolvedById` | Drift 頁 resolve action + audit + test | ADR-0007(OQ-2) |
| **P3(可選,另議)— Drift 對回 B(分攤)** | §4.4-B(改 assigned) | 分攤 UI + 嚴格 audit + test | OQ-2 定分攤規則;風險最高 |

P1 + P2 已覆蓋 Chris 主場景(手改數量 + 修正差異);P3 綁最難嘅 open question,建議 explicitly 押後。

---

## 10. References

- `docs/adr/0004-allocation-import-mechanism.md`(import 機制 + 「Excel = SSOT 平台鏡像」定位)
- `docs/02-architecture/licenseops/DESIGN.md` §1(定位:Regional = reflector/executor 非 owner,數量責任屬 OpCo,line 20)· §5(方案甲對帳 / allocated-assigned 兩層,line 94-98)· §6(domain model;line 116 已規劃 `LedgerAdjustment`)· §10(對回機制 / self-service,line 165-166)
- `apps/api/src/license/reconcile.service.ts`(drift 偵測;allocated 不參與)
- `apps/api/prisma/schema.prisma`(`OpcoSkuLedger` / `DriftAlert` / `RequestEvent`)
- `apps/api/src/auth/opco-scope.ts`(AUTH-3a fail-closed scope)· `apps/web/src/lib/roles.ts`(AUTH-3b gate)
- CLAUDE.md §5 H1(架構 / schema / 對帳 lock)· H3(scope)· H4(security)· H5(ledger write test)· H6(FE fidelity)
- **定案後 → `docs/adr/0007-*.md`**(本檔為佐證)
