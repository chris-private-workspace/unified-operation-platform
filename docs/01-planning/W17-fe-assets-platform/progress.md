---
phase: W17-fe-assets-platform
status: closed
---

# W17 — FE-Assets-platform — Progress

## Day 0 — 2026-07-13（kickoff）

**緣起**：W16 起咗 tenant 三層 read-model（`/license/tenant-skus` + `/stats`）→ Assets Platform mode 解封。把 W16 灌落嘅 tenant Owned/Unalloc 數變成可見 UI，完成 Assets 全貌。

**查證（落 plan 前）**：
- **FE 完全冇 consume `/me` 真 role**：只得 `store/ui.ts` 假 role toggle（`Regional`/`RHK IT`，top-bar demo，非真 auth，AUTH-3b 先移除）→ Platform mode 唔可以靠 FE role gate。
- prototype Platform mode = mode 切換 + Tenant-by-SKU 表（Owned/Allocated/Assigned/Unalloc）按 category 分組 + subtotal + grand-total + 3 recon tile。
- tenant-skus DTO 無 `isBaseLicense` → BASE badge 需 `useCatalog` skuId lookup。

**決定（AskUserQuestion，Chris approve）**：
- **OD1** = Platform tab 常顯 + **403 graceful restricted state**（零 FE-role 依賴，唔牽 AUTH-3b；dev-bypass ADMIN work，OPCO_IT 點 Platform → 403 → restricted）。
- **OD2** = 按 category 分組 + subtotal + grand-total（貼 prototype；null→Uncategorized）。
- **決策（非問）**：mode default = By-OpCo；Platform query lazy（enabled=platform mode，避 By-OpCo 觸 403）；BASE via useCatalog lookup。

**做咗**：寫 plan（scope / 6 gate / 2 OD）+ checklist + progress。status active。

**下一步**：D1 — api-types + queries（lazy+retry-skip-403）+ `lib/tenant-skus.ts`。

---

## Day 1 — 2026-07-13（D1-D4 完成）

### Done
- **D1**：`api-types.ts`（`TenantSkuRow`[sku ref + owned/tenantConsumed/unallocated `number|null` + allocatedToOpcos/assignedToUsers + overAllocated] / `TenantSkuStats`）· `hooks/queries.ts`（`useTenantSkus(enabled)`/`useTenantSkuStats(enabled)`，**lazy** enabled + `retryUnless403`）· `lib/tenant-skus.ts`（`platformStatus`[over/not-synced/fully/available] · `groupByCategory`[null→Uncategorized + subtotal]）。
- **D2**：`assets.tsx` 重構成 thin shell（mode state default byopco + **neutral segmented 切換**）· 抽 `components/assets/by-opco-view.tsx`（W15 內容原封搬）· `components/assets/platform-view.tsx`（recon tiles 3 + over-pill · grouped table[grand-total + category subheader + subtotal] · SKU search · BASE via useCatalog · OwnedBar · owned=null「—」/Not synced · **403 restricted EmptyState** · honest note · states）。
- **D3**：`lib/tenant-skus.test.ts`（7）——platformStatus 4 tone（含 owned=null）· groupByCategory（分組/subtotal/null→Uncategorized/owned-null 當 0/empty）。
- **D4 verify**：lint 0（--fix prettier）· build 0（tsc + vite，msal-vendor 254KB « 500KB）· **web test 17→24 綠**；**live DOM + 截圖**（見下）。

### Decisions / 學習
- **mode switcher = neutral segmented**（active `bg-card shadow` on `bg-hover` track，唔用 accent）→ DS-3 一 primary/view 守住（截圖確認 active 態清晰）。
- **Platform query lazy**（PlatformView 只喺 platform mode mount + enabled=true）→ By-OpCo 用戶永不觸 403；`retryUnless403` 避 403 反覆 retry。
- **403 detection** = `error instanceof ApiError && status===403` → restricted EmptyState（OD1 graceful）。
- **BASE badge via `useCatalog` skuId lookup**（tenant-skus DTO 無 isBaseLicense）。
- **踩坑：Bash cwd 漂移**——多次 `cd apps/api` / apps/web 令 cwd 唔定,`npm run start:dev` / `npm run dev` 起錯 workspace（apps/web 無 start:dev / apps/api 無 dev）→ **改用 `npm --prefix <abs-path> run <script>`**（唔靠 cwd）+ 讀 log 用 Read tool（H8，一度誤用 cat 即改）。
- **computed-style vs 截圖**：getComputedStyle 一度讀到 active mode 掣 bg transparent（dark-toggle JS 殘留態 artifact）→ **截圖 = ground truth**（DS-11），確認 bg-card 有 apply、active 態正確。

### Verify（真 tool output）
- lint exit 0 · build exit 0 · **24 test**（tenant-skus 7 + ledger 9 + api 6 + app-shell 2）。
- **live（真 HTTP + JS DOM + 截圖，dev-bypass；臨時 seed snapshot e3 owned 2000 / e1 owned 100 用完 --clean 刪 + 刪 script）**：
  - **ADMIN**：mode 切換 By OpCo（default，4 行）↔ Platform；Platform → recon tiles（Owned **2100** / Allocated **2371** sub「−271 unallocated across tenant」/ Assigned 0）· grouped table：grand-total「All SKUs · total」2100/2371/0/−271 + 「Uncategorized」subheader + **e3 2000/2285/0/−285 Over-allocated**（紅 badge + 紅 bar）+ e1 100/86/0/14 Available（藍 bar）+ Subtotal · Uncategorized · **「1 SKU over-allocated」pill**（截圖確認全貌對 prototype）。
  - **light+dark（Platform 畫面取色）**：card 255→20 · danger bar/badge 200,30,30→244,113,113 token swap。
  - **run-as OPCO_IT**（`AUTH_DEV_USER_EMAIL`；`/me` OPCO_IT/RHK；tenant-skus 403）：default By-OpCo **2 RHK 行**（scoped work）；切 Platform → **「Platform view restricted」EmptyState**（非白畫/crash，table 唔顯示）→ OD1 graceful 正確。

### Blockers
- 無。

### Effort
- Planned：~1 日；Actual：D0-D4 同日。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | feat(web): W17 FE-Assets-platform — Platform mode (tenant owned/allocated/unalloc) |

---

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 mode 切換 + Platform lazy fetch | ✅ By OpCo default ↔ Platform;Platform 只切去先 fetch |
| G2 Platform recon + grouped table + 派生 live | ✅ ADMIN 截圖+DOM（grand-total/subheader/subtotal/e3 over-allocated） |
| G3 403 restricted state | ✅ run-as OPCO_IT 點 Platform → graceful restricted（非 crash） |
| G4 H6 fidelity + ui-design 自檢 | ✅ DS-1..12 全 ✅/N/A;截圖對 prototype;neutral switcher;light+dark |
| G5 lint 0 + build 0 + web test green | ✅ 24 test |
| G6 無 schema / 無 dep / 無 ADR | ✅ 純前端 consume 既有 endpoint |

全 6 gate ✅。

### Lessons
- **Assets 全貌完成**：W15 By-OpCo + W17 Platform = prototype License Assets 兩 mode 齊（Compare 仍 future）。W16 三層數據（owned/allocated/assigned）而家 Platform mode 全部可見。
- **honest 403 graceful > 隱 tab**：FE 無真 role（AUTH-3b 卡 IT），tab 常顯 + 403 restricted state 係零依賴嘅誠實解;真 role 隱 tab 留 AUTH-3b。
- **本地 seed 驗三層**：seed owned>allocated 造 over-allocated（e3 2285>2000）+ owned>allocated headroom（e1 100>86）exercise 到兩狀態;真 owned 生產數需 tenant catalog sync。
- **`npm --prefix` 起 server 避 cwd 漂移**（monorepo workspace 各有唔同 script 名）。

### Carry-overs
- **Compare mode**（prototype 第三 mode）= future（低優先）。
- **真 role 隱 Platform tab** = AUTH-3b（卡 IT app reg）;現 403 graceful。
- **生產真 owned 數** = tenant catalog sync（Graph）先有 snapshot。

---

**End of W17 progress**
