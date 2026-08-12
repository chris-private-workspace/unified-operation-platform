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
- [x] **B-4** migration 對真 DB 跑過(2026-08-12,Chris 批准停 `ai-doc-extraction-db`)—— `prisma migrate deploy` 對 `localhost:5433` db `platform`,**21/21 applied**,同 CH-026 `A-2` 一次過收

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
- [x] **V-5** `ui-design` 逐條自檢 + **light + dark 真 render**(2026-08-12,六張截圖)— **H6**
- [x] **V-6** 真環境 sync:`SPE_E3` `owned` **21 → 4498** — **V1**,見下

## 🟢 V-6 真環境驗證結果（2026-08-12）

`POST /license/catalog/sync` 打真 Graph ⇒ `{created:0, updated:101, deactivated:0, snapshots:101}`。

| SKU | owned **before** | owned **after** | breakdown | gate |
|---|---|---|---|---|
| **`SPE_E3`** | **21** | **4498** | 21 enabled + **4477** grace | 677 用緊 → **過閘** |
| `SPE_E5` | 4502 | **4744** | 4502 + 242 | 4543 → **由擋死變過閘**(CH-020 2026-08-03 個「超支 33」之謎) |
| `MCOEV` | 20 | **1402** | 20 + 1382 | 1007 → 過閘 |
| `POWER_BI_PRO` | 0 · `noPrepaidSeats:true` | **790** · **`false`** | 0 + 790 | 91 → 過閘 |
| `VIVA` | 0 · status `Enabled`(migration default) | 0 · **`Suspended`** | suspended 50 | **仍然擋** |

🟢 **`VIVA` 個 `capabilityStatus` 由 default `Enabled` 變真值 `Suspended`** ⇒ 順帶證咗 C1 寫入路真係行到,唔係靠 default 撐住。

🟢 **gate 拒絕數實測 `32 → 11`** —— 由 read-model 101 行算返:`consumed >= enabled` = **32**、`consumed >= enabled + warning` = **11**,**同 `ADR-0033 D4` 個表逐字一樣**。
⚠️ **但組成同 ADR 寫嘅唔同**:ADR 寫「6 個真係用晒 + 5 個 `Suspended`」,實測係 **7 個用晒/超支 + 4 個 `Suspended`**。總數啱、拆法差一個。冇改變決定(11 個個個講得出理由),但**呢個差異本身就係「probe 數字會郁」嘅證據** —— 而嗰樣正正係 D1 揀存 `capabilityStatus` 唔揀由數推嘅理由。
`noPrepaidSeats` 實測 **6 → 2**(⚠️ 唔係 ADR 講嘅 15 → 4 —— 嗰個 15 係「`enabled = 0` 嘅 SKU」全體,而 flag 要 `consumed > 0`,兩個係唔同 set,冇矛盾)。

🔴 **`totalOwned` = 4,270,779 · `unlimitedSkus` = 0** —— 因為 **CH-026 `G-7`(人手 curate 22 個 SKU)未做**,一個 SKU 都未標 `unlimited`。KPI 仲係畀哨兵值主導,**呢個唔係 code 問題,係 Chris 落 UI 嗰步**。

**B2 端到端實證**:sync **之前**個 read-model,`SPE_E3` owned = **21** 而四個 bucket 全 0 ⇒ **舊 snapshot 之下 `owned` 完全等於 `enabled`**,行為同 CH-027 之前逐字一樣。DB 側:101 個舊 snapshot,`warningUnits`/`suspendedUnits`/`lockedOutUnits` **全部 0**、`capabilityStatus` **全部 `Enabled`**。

## 🖼 Render 驗證（V-5，六張截圖）

| 畫面 | light | dark | 見到乜 |
|---|---|---|---|
| Platform KPI | ✅ | ✅ | **`Available seats`**(`Prepaid seats` 冇咗)+ `1 unlimited SKU excluded` |
| Platform 表(grace) | ✅ | ✅ | `SPE_E3` **4498** + 副行 **`21 + 4477 grace`**;`SPE_E5` `4502 + 242 grace`;全表 **54 行**有副行 |
| Platform 表(suspended) | ✅ | ✅ | `VIVA` + `Teams_Premium_(for_Departments)` 兩個 **`Subscription suspended`** warn badge |
| Platform hover | ✅ | — | `title` = `enabled 0 · expiry grace period 10 · M365 status Enabled`(實測 DOM attribute) |
| SKU Catalog `SEATS` 欄 | ✅ | ✅ | `Prepaid` + **`UNLIMITED`** badge ⇒ **CH-026 `D-9` 同一次收埋** |

⚠️ `UNLIMITED` 要見到就要有 SKU 標咗 unlimited,而 `G-7` 未做 ⇒ 暫時 PATCH `POWER_BI_STANDARD` 做 fixture,**驗完已還原**(`unlimited SKUs remaining = 0` 實測)。

📌 **順帶更正兩句我自己講錯嘅嘢**:①第一張 catalog 截圖我叫咗做 dark,實際係 light(navigate 之後 theme reset),已補真 dark ②我一度講「SKU Catalog 個 pager 冇 `‹ ›`」—— **錯**,佢有箭嘴;舊款嘅係「13 頁全列」呢半(CH-025 記低嗰句仍然成立)。

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
| DS-4 light + dark | ✅ | 六張截圖,grace 副行同 `Subscription suspended` badge 兩邊對比度都夠 |
| DS-5 數字 mono | ✅ | 副行喺 `NUM` cell 入面,`font-mono` 繼承落嚟 |
| DS-6 lucide only | ✅ | 冇新 icon |
| DS-7 平面 | ✅ | 冇陰影 / gradient |
| DS-8 狀態走 Badge | ✅ | **刻意唔加第二個 badge**,副行係數字註腳唔係狀態 |
| DS-9 motion | N/A | |
| DS-10 voice | ✅ | `21 + 4477 grace` — 短、Sentence case |
| DS-11 對 prototype | ✅ | 表格結構 / badge / 副行都係既有 primitive 組合,冇加新 pattern |
| DS-12 唔捏造 logo | N/A | |
