---
phase: W23-B-assets-inline-edit
status: closed
---

# W23-B — Assets By-OpCo inline edit — Progress

## Day 0（2026-07-14）— kickoff + D1–D4 同日完成
- **W23-A 完成 + commit**(`6e74ac1` / `90b735f`)後 kickoff W23-B。
- **UX 揀定(AskUserQuestion)**:Row edit mode(每行 ✎ → input + Save[Ricoh red]/Cancel,一行一 PATCH)+ reason 選填 note。
- **D1**:`UpdateLedgerBody` type + `useUpdateLedger`(invalidate ledger/tenant-skus/drift)。
- **D2**:`by-opco-view.tsx` 加 edit state + `LedgerTableRow`(display/edit 兩態)+ Pencil/Save/Cancel + reason input + `lib/ledger.ts` `evaluateLedgerDraft`/`initLedgerDraft` 純函數。
- **D3**:`ledger.test.ts` +12(evaluateLedgerDraft 11 + initLedgerDraft 1)。
- **D4**:build 0 · lint 0 · **web 63→75 test** · **live browser 端到端驗**。

## Closeout（status=closed）

### Acceptance verification（plan §4 gates）
| Gate | 結果 |
|---|---|
| G1 mutation invalidate | ✅ live:Save 後 stats 2371→2375(refetch 真數) |
| G2 inline edit live | ✅ ✎→edit→改 661→665→Save→表 665/headroom 665 + toast + 退 display |
| G3 一個 primary | ✅ Save = #E60027(rgb230,0,39)accent / Cancel ghost |
| G4 錯誤/邊界 | ✅ 負數 → Save disabled + "Enter 0 or more" hint;save 中 Saving… disable |
| G5 scope | 〜 OPCO_IT 只見/改自己(backend scopeWhere + assertOpcoScope 403,W15/W22 已驗;本 phase 未再 run-as 對照) |
| G6 H5 test | ✅ web 75(+12 draft) |
| G7 H6 | ✅ token-only · Pencil/Check/X lucide · light+dark token swap(input rgb255→20,23 · Save #E60027 一致)· 一 primary |
| G8 regression | ✅ build/test 綠 · filter/search/分頁/stats 保留 |

全 gate 過(G5 靠 backend + 前期覆蓋)。

### Lessons
- **backend 先落(W23-A)令前端純接**:endpoint + audit + scope 已 live-驗,W23-B 只需 mutation + edit UI,零後端改。
- **honest-data 貫徹**:edit 中 Available/Util/Status 顯 '—',Save 後靠 refetch 真數重算(唔前端 optimistic 造數)。
- **React controlled input 驗證坑(重申)**:browser 改值要 native value setter + `input` event(bubbles),`.value=` 直接設唔更新 React state → Save enable 邏輯測唔到。
- **Row edit mode > inline cell**:有 Save/Cancel 確認步驟,一行一 PATCH 對應後端單 row endpoint,符合 H6 一 primary。

### Carry-overs
- **OPCO_IT inline edit run-as live 對照**(改自己 200 / 改別人 backend 403)—— backend 已 test 覆蓋,前端 run-as live 未再跑(低風險)。
- 本地 seed RHK×SPE_E3 已復原 661(測試無殘留)。

---

**End of W23-B progress**
