---
bug_id: BUG-008
report_ref: ./report.md
checklist_ref: ./checklist.md
last_updated: 2026-07-29
---

# BUG-008 — Progress

## 2026-07-29 · 發現

Chris 要求把本地 `2b5057a` 同步上 Azure UAT。兩個 image 喺 ACR build 成功
(`uat-2b5057a`),`az containerapp update --image` 之後 api revision `--0000004`
`provisioningError: "Container crashing: ca-uop-api"`。

三次嘗試攞 container log 全部被公司 proxy MITM 擋(`azurecontainerapps.dev`
data-plane + Log Analytics query 都係)。Chris 選擇 rollback,UAT 回到
`uat-0cf0cf3`(W34)並驗證正常(web 200 / api docs 200 / 受保護 endpoint 401)。

## 2026-07-29 · 診斷

**攞唔到遠端 log,所以改為本機重現** —— 事後睇,呢個係應該一開始就行嘅路:
本機重現唔使過公司 proxy,而且畀到完整 stack trace。

1. 先查最可疑嘅:`@azure/communication-email` 喺 `dependencies` 唔係 dev ⇒ 排除
2. 讀四個新 migration SQL:**全部 nullable `ADD COLUMN`** ⇒ 推翻咗我自己講咗兩次嘅
   「migration 靜默失敗」假設
3. 建 scratch DB `uop_uat_repro` → `prisma migrate deploy` 15 個 migration 全部 apply
4. 用**同 UAT revision 一模一樣嘅 16 個 env**、cwd 設喺一個冇 `.env` 嘅目錄跑 app
   → 撞到 `Cannot find module ...dist\main.js`
5. Glob 發現實際輸出係 **`dist/src/main.js`** + `dist/scripts/send-connectivity-check.js`
6. 讀 tsconfig → 冇 `rootDir` + exclude 冇 `scripts` ⇒ 共同父目錄由 `src/` 抬到 `apps/api/`
7. `git log --diff-filter=A -- apps/api/scripts` → 引入者 `c7ec948`(CH-011)
8. 用正確路徑重跑 → `Nest application successfully started`,25 秒仍然 running
   ⇒ **其餘 boot path 完全正常**,唯一缺陷就係入口路徑

scratch DB 用完即 drop,冇碰 dev DB。

### 我行錯咗嘅路(記低)

- 「migration 靜默失敗 → SELECT 到唔存在嘅欄」呢個假設我喺對話中講咗兩次,**係錯嘅**。
  佢好合理,但一睇 migration SQL 就推翻得到 —— 應該**先睇最平嘅證據**,而唔係先砌一個
  完整故事。
- 三次去攞遠端 log 都撞同一堵 proxy 牆。第二次之後就應該轉本機重現。

## Timeline

| 時間 | 事件 |
|---|---|
| 2026-07-29 | UAT 同步 `2b5057a` → api CrashLoopBackOff |
| 2026-07-29 | 三次攞 log 失敗(proxy MITM)→ rollback 到 `uat-0cf0cf3` |
| 2026-07-29 | 本機重現成功,root cause 確證,開 BUG-008(Sev2) |
| 2026-07-29 | Chris 批 1+2+3(tsconfig 根治 + Dockerfile gate + 開單) |
