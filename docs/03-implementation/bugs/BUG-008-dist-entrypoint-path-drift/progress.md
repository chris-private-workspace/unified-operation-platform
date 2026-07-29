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
| 2026-07-29 | fix commit `1bc7cdb`;626 test / lint 全綠;`node dist/main.js` 本機真 boot |
| 2026-07-29 | ACR build `uat-1bc7cdb`(api `ckb` / web `ckc` 都 Succeeded) |
| 2026-07-29 | 部署 UAT → api `--0000006` + web `--0000005` 都 Running/Healthy;smoke 全過 |

## 2026-07-29 · 修復 + 部署

**Fix**(commit `1bc7cdb`):

1. `tsconfig.build.json` 加 `"rootDir": "./src"` + exclude 加 `"scripts"`。
   **刻意只落 build config** —— `tsconfig.json` 加 `rootDir` 會令 `prisma/seed.ts`
   (UAT entrypoint 真係會跑)同 `scripts/*.ts` 走 ts-node 時撞 TS6059。
2. `Dockerfile` build stage 加 `RUN test -f dist/main.js`。
3. **冇**改 `docker-entrypoint.sh` —— 改佢做 `dist/src/main` 係跟住浮動嘅嘢走。

**途中撞到第二個 build 陷阱**:改完 rebuild,`dist/main.js` 仍然唔存在、build exit 0
零輸出,差啲以為 fix 錯方向。真相係我早一步跑嘅 `tsc --noEmit` 留低咗
`apps/api/tsconfig.build.tsbuildinfo`(喺 `dist/` **外面**),令之後每次 build 都當
「已是最新」靜靜 skip emit。清走就正常。已入 anti-patterns **AP-14**。

**驗證**:

| 項 | 結果 |
|---|---|
| emit 佈局 | `dist/main.js` True · `dist/src/main.js` False · `dist/scripts` False |
| 本機真 boot | `node dist/main.js` + UAT env 集 + scratch DB → `Nest application successfully started` |
| api test / lint | **626 passed / 58 suites**(同 fix 前一致)· lint 零 output |
| ACR build | api `ckb` Succeeded · web `ckc` Succeeded(`Step 1/29` = 新 gate 真係行過) |
| UAT revision | api `--0000006` RunningAtMaxScale/Healthy · web `--0000005` Running/Healthy · 同 tag |
| UAT smoke | web 200 · api docs 200 · `/api/me` 401 · **login probe 401(唔係 500)⇒ migrate 成功** |

## Closeout

UAT 已經行緊 `uat-1bc7cdb`,即 W35 → CH-011 全部功能(包括 ADR-0015 sync sweep
同 ADR-0016 預算 gate —— 呢兩個行為改變之前因為 rollback 而未生效,今次一齊上)。

**遺留**(見 postmortem §6):`az acr build` 本機 stream log 會 charmap crash(exit 1 係假象);
ACS 兩個 env 未入 `aca.bicep` ⇒ UAT email connector 仍 `inactive`。
