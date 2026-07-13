---
change_id: CH-001
title: "FE bundle split — manualChunks 拆 vendor,消 >500KB 警告"
status: done           # draft | proposed | approved | active | done | cancelled
created: 2026-07-13
target_completion: 2026-07-13
affects_components: [apps/web]
spec_refs:
  - docs/adr/0003-msal-frontend-sso.md（Consequences — MSAL 引入後 bundle >500KB 已知技術債）
  - docs/01-planning/BACKLOG.md（A 區 FE-bundle-split）
---

# CH-001 — FE bundle split（manualChunks 拆 vendor）

> **Spec version**:1.0(initial)
> **Owner**:AI(執行)
> **Approved by**:Chris Lai(2026-07-13,經 scope 深度確認 = 只 manualChunks)

## 1. Context (Why)
AUTH-2a(W10,ADR-0003)引入 MSAL 後,`apps/web` production build 產生單一 vendor chunk 587KB,超過 Vite 預設 500KB `chunkSizeWarningLimit`,build 每次出 warning。ADR-0003 Consequences 已記為已知技術債,BACKLOG A 區列 `FE-bundle-split` 候選。此為非架構 build-config chore。

**MSAL 不可 lazy-load 之查證**:`msalInstance` 係 module-level singleton(`src/lib/auth/msal.ts:50`),被 `main.tsx`(`initMsal` 喺 render 前跑)、`App.tsx`(`MsalProvider` 包住整個 tree)、`api.ts`(token attach)三處 first-paint 就需要 → MSAL 必在初始 critical path,無法拆成延遲載入的 Login-only chunk。故本 CH 只做 vendor chunk 拆分,不動 auth 初始化。

## 2. Scope (What)

### 2.1 Behavior Change
- **Before**:`vite.config.ts` 無 `build` key;Rollup 將所有 node_modules 打包成單一 vendor chunk(587KB)→ >500KB warning。
- **After**:`build.rollupOptions.output.manualChunks` 將大型 vendor 拆成具名 chunk(react-vendor / msal-vendor / query-vendor)→ 無單一 chunk 過 500KB;warning 消失;vendor chunk 跨 app deploy 可獨立 cache。**Runtime 行為零改變**(所有 chunk 照載,只係拆檔)。

### 2.2 In Scope
- `apps/web/vite.config.ts` 加 `build.rollupOptions.output.manualChunks`:
  - `react-vendor` ← `react`, `react-dom`, `react-router-dom`
  - `msal-vendor` ← `@azure/msal-browser`, `@azure/msal-react`
  - `query-vendor` ← `@tanstack/react-query`
  - 其餘小型 util(zustand / clsx / tailwind-merge / cva / lucide 已 tree-shaken)留主 app chunk。

### 2.3 Out of Scope（explicit）
- **唔改 auth flow / MSAL 初始化**(`main.tsx` / `App.tsx` / `msal.ts` 不動)。
- **唔加 route-level lazy / React.lazy**(Chris 明確揀「只 manualChunks」;route-lazy 留將來若需削初始 paint 再開)。
- **唔加新 dependency**(H2)、**唔改 UI / token**(H6)、**唔改 API**。
- **唔提高 `chunkSizeWarningLimit`**(嗰個係掩蓋警告,唔係真拆)。

## 3. Acceptance Criteria
- [ ] `npm run build`(於 `apps/web`)成功,exit 0,**無 >500KB chunk 警告**(無單一 chunk 超 `chunkSizeWarningLimit`)。
- [ ] Build 產出見到具名 vendor chunk(`react-vendor` / `msal-vendor` / `query-vendor`)。
- [ ] `npm run lint` exit 0。
- [ ] `npm run test` web 8 test 全綠(無 runtime 改,test 不應受影響)。
- [ ] dev-bypass live 驗:Login(`/login`)+ 一個 authed 頁(`/`)載入正常、MSAL provider 無爆、console 無 error;light + dark 各驗一次。

## 4. Risks
| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | manualChunks 分組令某 vendor 重複載入或循環依賴 | Low | Med | 只按頂層 package 名分組;build 後檢 chunk 圖 + live 驗 app 正常 |
| R2 | 拆後某 chunk 仍 >500KB(如 msal 單獨超線) | Low | Low | build output 檢實際大小;若 msal 單 chunk 仍超,再細分或（此情況）視為可接受並記錄 |

## 5. Effort Estimate
~1 hour(config 改動 + verify + doc)。

## 6. Dependencies
- 無外部依賴。純本地 build-config。不涉 DD-1 / IT app reg。

## 7. Spec Changelog（deviation log）
| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-13 | Initial draft → approved | Chris approve scope（只 manualChunks,route-lazy out） | Chris Lai |

---

**Lifecycle reminder**:呢份 spec locked after status=approved。重大 deviation → §7 changelog。
