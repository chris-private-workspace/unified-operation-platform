# CH-027 — Implementation Checklist

> Spec:`spec.md`(**approved** 2026-08-12)· 決策 SSOT:**`ADR-0033`**(Accepted)
> 每項對應 spec §3 acceptance。🚧 = 延後,附理由 + target。

## A — Graph 攞齊四個欄（`src/integration/graph`）

- [x] **A-1** `SubscribedSku` 加 `suspendedUnits` / `warningUnits` / `lockedOutUnits`
- [x] **A-2** `getSubscribedSkus()` map 多三個欄,`?? 0` 兜底
- [x] **A-3** test 用真實形狀 fixture(`prepaidUnits` 四個 key,SPE_E3 21/4477)— acceptance **A1**
      · 另加一條「欄全部缺失 → 全部 0」,因為一個 `undefined` 會令 gate 變 NaN 比較(永遠唔擋)

## B — Schema（H1 · ADR-0033 D1）

- [x] **B-1** `TenantSkuSnapshot` 加三個 `Int @default(0)` + `capabilityStatus String @default("Enabled")`
- [x] **B-2** migration `20260812160000_ch027_tenant_seat_buckets`,**只加欄**,零 `UPDATE` / 零 `INSERT` — **B1**
- [x] **B-3** 舊 snapshot(新欄 = 0)之下 `owned` 同今日逐字一樣 — **B2**
      · 靠 `tenant-owned.service.spec.ts` 個 `snap()` helper:所有 pre-CH-027 期望值一個數字都冇改
- [ ] 🚧 **B-4** migration 對真 DB 跑過 —— **卡本地 stack**(5433 畀 `ai-doc-extraction-db` 佔住,停佢要 Chris 批)。target:同 CH-026 A-2 一齊做

## C — 寫入（`catalog.service.syncFromTenant`）

- [x] **C-1** `tenantSkuSnapshot.create` 存齊四個數 + `capabilityStatus` — **C1**

## D — Seam ② 契約（H1 · ADR-0033 D3）

- [x] **D-1** `TenantSkuSeats` 加 `assignableUnits`
- [x] **D-2** `graph-license.provider` → `prepaidEnabled + warningUnits` — **D1**
- [x] **D-3** `n8n-license.provider` → `prepaidEnabled` — **D2** ⚠️ 見下面「偏離」
- [x] **D-4** seam ② **冇** `warning`/`suspended`/`lockedOut`/`capabilityStatus`;`Object.keys` 長度 4 + 三條 `not.toHaveProperty` — **D3**

## E — Read-model（H1 · ADR-0033 D2）

- [x] **E-1** `owned = prepaidEnabled + warningUnits`;SPE_E3 fixture 出 `4498` — **E1**
- [x] **E-2** `ownedBreakdown` + **DTO 宣告**(`TenantSkuOwnedBreakdownDto`)— **E2**
      · 🟢 BUG-011 個縫今次真係關住咗:DTO 一宣告,`apps/web` tsc **即刻紅**(5 個 fixture 缺 `ownedBreakdown`)

## F — Assign gate（**H5** · ADR-0033 D4）

- [x] **F-1** gate 改 `consumedUnits >= assignableUnits` — **F1**(POWER_BI_PRO 0/790/91 過閘)/ **F2**(VIVA 0/50 仍擋)/ **F3**(Teams_Rooms_Basic 22/22 仍擋)
- [x] **F-2** `seats` step 帶 grace-period `detail` — **F4**
      · 配一條**反面**:`enabled` 夠用嗰陣 `detail` 必須 `undefined`(否則 `graceSeats > 0` 單獨就滿足 F4,每個 SPE_E3 assign 都會被標成 grace)
- [x] **F-3** `unlimited` 逐字不變(仍 `skipped`、仍唔打 Graph)— **F5**

## G — `noPrepaidSeats` 收窄（ADR-0033 D5）

- [x] **G-1** `owned === 0 && consumed > 0` — **G1**(POWER_BI_PRO false / VIVA true)
- [x] **G-2** badge `Subscription suspended`,由 `capabilityStatus` 讀 — **G2**

## H — Platform view（ADR-0033 D7）

- [x] **H-1** Owned cell `title` 出全套 breakdown · `warning > 0` 出副行 `21 + 4477 grace` · KPI → `Available seats` · 底部 scope note 改寫 — **H1**
      · 副行**唔係第二個 badge**:Status 欄已經揸住狀態(DS-8),兩個地方各自宣稱狀態就會漂
      · `unlimited` 唔標註(佢個 `owned` 係 sentinel,標註等於描述一個作出嚟嘅數)

## 驗證

- [x] **V-1** api **1011 passed / 73 suites**(995 → 1011)— **T1**
- [x] **V-2** web **358 passed**;7 紅 = 6 條 pre-existing + `requests.new-request-flag` flake(**單獨跑 4/4 綠**,已實測)— **T2**
- [x] **V-3** api lint **0**;web lint 回到 **16 條 pre-existing**(我加嗰 11 條 prettier 已 fix)— **T3**
      · 📌 順帶把 `LINT-web` 個數**量咗**而唔係數:**16** = `allocation-reset.test.tsx` 11 + `allocation-reset.tsx` 4 + `request-detail.sync-check.test.tsx` 1
- [x] **V-4** 🔴 **Falsification ×2** — **T4**,詳見下面
- [ ] 🚧 **V-5** `ui-design` 逐條自檢**做咗**(見下),但 **light + dark 真 render 未做** —— 卡本地 stack。target:同 CH-026 D-9 一齊
- [ ] 🚧 **V-6** 真環境 sync:`SPE_E3` `owned` 21 → 4498 — **V1**,同樣卡本地 stack

## 🔴 Falsification 結果（T4）

| # | 拆走乜 | 結果 |
|---|---|---|
| ① | assign gate 改回 `>= prepaidEnabled` | 🟢 **真紅 2 條**(`assigns from the expiry grace period…` + `says so on the seats step…`) |
| ② | badge 改成由 `suspended > 0` 推 | 🔴 **第一次冇紅 —— 27 條全綠**,見下 |

🔴 **②第一次失敗,值得記住(同 CH-023 tautology 同族)**:我原本兩條 G2 assert 睇落一正一反好嚴謹,但**兩個 fixture 之下「`suspended > 0`」同「`capabilityStatus === 'Suspended'`」永遠同時成立**⇒ 分辨唔到兩條規則。加咗一條**兩者衝突**嘅 case(`suspended: 0, lockedOut: 5, capabilityStatus: 'Suspended'`)之後先真紅。

📌 **嗰個形狀係真嘅唔係砌出嚟**:`capabilityStatus` 係 Microsoft 對**訂閱**嘅判斷,而四個 bucket 係**會郁嘅數** —— 保留期一完,seat 就會離開 `suspended`,而個判斷仲喺度。**呢個正正就係 D1 揀「存 status」唔揀「由數推」嘅理由**,而家有一條 test 守住佢。

## ⚠️ 偏離 spec（R3 — 必須 log）

**acceptance D2 寫住「n8n 路既有 test 一條都唔使改」—— 字面上做唔到,改咗 1 條。**

`n8n-license.provider.spec.ts` 個 `listTenantSkus` **形狀** assert(`toEqual`)要加 `assignableUnits: 100`,因為 seam ② 真係多咗一個欄。**行為**嗰邊一條都冇改:`findUser` / `assignLicense` / 錯誤路 / `license-ops.contract.spec.ts` 嘅跨 provider 等價 —— 全部原封不動兼綠。

⇒ D2 個**意圖**(n8n 路行為逐字不變)守住晒;**字面**守唔到,因為契約加欄必然掃到形狀 assert。

## Doc-sync

- [x] **X-1** `BACKLOG.md` 同步(R7)
- [x] **X-2** spec changelog + 本 checklist 收尾

## `ui-design` 自檢（H6）

| # | 結果 | 註 |
|---|---|---|
| DS-1 token-only | ✅ | 只用 `text-fg-subtle`;零 hex |
| DS-2 唔 eyeball | ✅ | `text-[10.5px]` **逐字等於**同檔 `TH`;`leading-[1.5]` 等於同檔 footnote。冇引入新數值 |
| DS-3 單一 accent / 一 primary | ✅ | 冇加掣 |
| DS-4 light + dark | 🚧 | token 本身兩邊都 swap,但**真 render 未做**(V-5) |
| DS-5 數字 mono | ✅ | 副行喺 `NUM` cell 入面,`font-mono` 繼承落嚟 |
| DS-6 lucide only | ✅ | 冇新 icon |
| DS-7 平面 | ✅ | 冇陰影 / gradient |
| DS-8 狀態走 Badge | ✅ | **刻意唔加第二個 badge**,副行係數字註腳唔係狀態 |
| DS-9 motion | N/A | |
| DS-10 voice | ✅ | `21 + 4477 grace` — 短、Sentence case |
| DS-11 對 prototype | 🚧 | 同 DS-4 一齊(V-5) |
| DS-12 唔捏造 logo | N/A | |
