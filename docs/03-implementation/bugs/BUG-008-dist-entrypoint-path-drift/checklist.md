---
bug_id: BUG-008
report_ref: ./report.md
status: in-progress
last_updated: 2026-07-29
---

# BUG-008 — Checklist

## Investigate

- [x] 讀 `docker-entrypoint.sh` → 確認 entrypoint 係 `exec node dist/main`(cwd `/app/apps/api`)
- [x] Glob `apps/api/dist/**/main.js` → **實際輸出係 `dist/src/main.js`**,`dist/main.js` 唔存在
- [x] 讀 `tsconfig.json`(冇 `rootDir`)+ `tsconfig.build.json`(exclude 冇 `scripts`)→ 得出「共同父目錄被抬高」機制
- [x] Glob `apps/api/dist/scripts/**/*.js` → `send-connectivity-check.js` 存在,證實 `scripts/` 真係入咗編譯集
- [x] `git log --diff-filter=A -- apps/api/scripts` → 引入者 = **`c7ec948`(CH-011)**;`d489797` 全 `.js` 唔觸發
- [x] **本機重現**(scratch DB `uop_uat_repro` + 同 UAT 一樣嘅 16 個 env + cwd 無 `.env`):
      `node dist/main.js` → exit 1 `MODULE_NOT_FOUND`;`node dist/src/main.js` → boot 成功
- [x] 排除 5 個假設(migration 失敗 / dep 缺失 / placeholder 憑證 / ACS boot / `.env` 洩漏)—— 見 report §3
- [x] scratch DB 用完即 `DROP DATABASE ... WITH (FORCE)`,冇碰 dev DB

## Fix

- [x] **Fix 1** — `rootDir: "./src"` 加喺 **`tsconfig.build.json`**,連同 exclude 加 `"scripts"`
- [x] 🔴 **`rootDir` 刻意唔加落 `tsconfig.json`** —— 加咗會令 `prisma/seed.ts`(UAT entrypoint
      `RUN_SEED_ON_START` 會跑)同 `scripts/*.ts` 走 ts-node 時撞 `TS6059: not under rootDir`。
      Build 專用先係啱嘅範圍:pin 住產物佈局,唔郁 ts-node / ts-jest
- [x] **Fix 2** — `apps/api/Dockerfile` build stage `npm run build` 之後加 `RUN test -f dist/main.js`
- [x] 🔴 **唔改 `docker-entrypoint.sh`** —— 改佢做 `dist/src/main` 係跟住浮動嘅嘢走,
      將來 `scripts/*.ts` 移走輸出又反轉,再 crash 一次

## Regression gate(fails before, passes after)

- [x] **Fails-before 實證**:fix 之前 `dist/main.js` 不存在 + `node dist/main.js` 真係 exit 1 `MODULE_NOT_FOUND`
- [x] Fix 之後重 build → `dist/main.js` **True**、`dist/src/main.js` **False**、`dist/scripts` **False**
- [x] **端到端**:`node dist/main.js`(entrypoint 真正跑嘅路徑)+ UAT env + scratch DB
      → `[NestApplication] Nest application successfully started`,25 秒仍然 running
- [x] `RUN test -f dist/main.js` 就係長期 gate —— 用 **Dockerfile** 而唔係 test,
      因為呢個缺陷只喺「編譯 + 打包」呢層出現,jest 永遠見唔到(report §6)

## ⚠️ 途中撞到嘅第二個 build 陷阱(唔屬本 bug,但同族)

- [x] `tsc --noEmit -p tsconfig.build.json` 會喺 **`dist/` 外面**留低
      `apps/api/tsconfig.build.tsbuildinfo`(因為 `--noEmit` 唔建 outDir)。之後每次
      `nest build` 都當「已是最新」→ **靜靜 skip emit,exit 0、零輸出、零檔案**。
      清 `dist/` 清唔到佢。清走個 stray tsbuildinfo 之後即刻正常
- [x] Docker build **唔會**中呢個伏:`.dockerignore` 已有 `**/*.tsbuildinfo`

## Verify

- [x] api test **626 passed / 58 suites**(同 fix 前一模一樣)· lint 零 output
- [ ] ⚠️ **未跑** `npm run email:check` / `npm run seed` —— 兩者都走 `tsconfig.json` + ts-node,
      而本次改動只掂 `tsconfig.build.json`,路徑上唔相交。seed 會喺 UAT entrypoint 真跑,
      屬下游可觀察驗證
- [ ] `az acr build` 兩個 image(api 必須重 build;web 未受影響但一齊出保持版本一致)
- [ ] 真部署上 UAT → revision `Running` 而非 `Failed`
- [ ] UAT smoke:web 200 / api docs 200 / 受保護 endpoint 401

## Doc

- [ ] Postmortem(**Sev2 mandatory**)—— 重點寫 gate 缺口,唔係寫個 typo
- [ ] BACKLOG 同步(R7)
- [ ] RISK_REGISTER:評估是否加「build artifact 未經啟動驗證」一條
