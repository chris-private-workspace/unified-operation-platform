---
change_id: CH-001
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed     # in-progress | closed
---

# CH-001 — Progress

> Day-N entries during execution + 結尾 closeout summary。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 1 — 2026-07-13

### Done
- **Baseline 量度**(真 build output):單一 `dist/assets/index-CRkUFGd3.js` = **587.77 kB**(gzip 166.45 kB)+ Vite 警告「Some chunks are larger than 500 kB」確認存在。
- **改 `apps/web/vite.config.ts`**:加 `build.rollupOptions.output.manualChunks` 拆 3 個 vendor chunk(react-vendor / msal-vendor / query-vendor)。
- **Rebuild 驗證**(真 build output,警告消失):
  | chunk | size | gzip |
  |---|---|---|
  | msal-vendor | 254.17 kB | 64.85 kB |
  | react-vendor | 196.61 kB | 64.31 kB |
  | index(app) | 94.26 kB | 25.75 kB |
  | query-vendor | 42.20 kB | 12.77 kB |
  總和 ≈ 587 kB(與 baseline 一致 → 印證零 runtime 改變、純拆檔);最大 chunk 254 kB « 500 kB。
- **lint** exit 0 · **web 8 test 綠**(exit 0)。
- **Live**(`vite preview` serve 真 production `dist/`,browser tab 1081755877):Login 渲染(`readyState=complete`、W12 hardened copy「…under control.」)、React mount、MSAL provider mount 無爆、無 chunk/module error(console 只有 Chrome extension 雜訊「message channel closed」— 非 app-originated)、light↔dark token swap 正常(`rgb(245,245,246)`↔`rgb(8,8,10)`)。

### Decisions
- **只做 manualChunks,唔做 route-lazy**(Chris approve):MSAL 係 root singleton(`msal.ts:50`,被 `main.tsx`/`App.tsx`/`api.ts` first-paint 需要)無法 lazy;route-lazy 屬額外 scope、有 Suspense/test 風險 → 留將來若需削初始 paint 再開。
- **唔提高 `chunkSizeWarningLimit`**:嗰個掩蓋警告非真拆,違本 CH 目的。
- **Live 用 production preview 驗 Login(非 dev-bypass authed 頁)**:因無 route-split,所有 page component 都喺同一 `index` app chunk,Login 開機已載齊完整拆分圖(app + 3 vendor)→ authed 頁用同一批 chunk,已覆蓋。production preview 係最忠實測真 built chunk 嘅方法。

### Blockers
- 無。

### Effort
- Planned:~1h;Actual:~1h;Variance:0。

### Commits
| Hash | Subject |
|---|---|
| (待指示) | chore(web): CH-001 split vendor bundle via manualChunks |

---

## Closeout(status=closed)

### Acceptance verification
| # | 條件 | 結果 |
|---|---|---|
| 1 | build exit 0 + 無 >500 kB 警告 | ✅ |
| 2 | 具名 vendor chunk(react/msal/query-vendor) | ✅ |
| 3 | lint exit 0 | ✅ |
| 4 | web 8 test 綠 | ✅ |
| 5 | live:Login + MSAL mount + 無 chunk error + light+dark | ✅ |

全 5 條 ✅。

### Effort summary
| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| 1 | 1 | 1 | 0 |

### Lessons
- **What worked**:manualChunks 按頂層 package 名分組係最低風險嘅拆法;baseline→rebuild 對照 build output 直接量到警告消失 + chunk 分佈,無需臆測。live 用 production preview serve 真 dist 係驗 chunk graph 完整性嘅唯一忠實方法(dev server 唔套 manualChunks)。
- **What didn't / friction**:`Start-Job` 背景 preview 隨 PowerShell tool session 死亡(每次呼叫係獨立 `-NonInteractive` session)→ 改用 harness `run_in_background` 先持續。PowerShell 保留變數 `$pid` / `$_:` 語法踩坑兩次。
- **Carry-overs**:無。route-level lazy-load(真正削初始 paint)= 未來可選 chore,唔喺本 CH scope;DD-2(npm vuln)無關,維持 defer。

---

**End of CH-001 progress**
