---
bug_id: BUG-008
report_ref: ./report.md
status: complete
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
- [x] `az acr build` 兩個 image `uat-1bc7cdb`:api run `ckb` **Succeeded** / web run `ckc` **Succeeded**
- [x] 🔴 **新 gate 實證行過**:build log `Step 1/29`,而新 Dockerfile 正好 29 個 instruction
      (加 `RUN test -f dist/main.js` 之前係 28)⇒ 該步真係執行且通過 ⇒ image 內確有 `dist/main.js`
- [x] 真部署上 UAT:`ca-uop-api--0000006` **RunningAtMaxScale / Healthy / traffic 100**
      (對比失敗嗰次 `--0000004` = Failed / Unhealthy / "Container crashing");
      `ca-uop-web--0000005` **Running / Healthy / traffic 100**,兩者同 tag
- [x] UAT smoke:web `200` · api docs `200` · `/api/me`(無 token)`401`
- [x] 🔴 **migrate probe**:`POST /api/auth/login`(`@Public`,會打 DB)用一個唔存在嘅帳號
      → **401 而唔係 500** ⇒ Prisma 讀得到表同欄位 ⇒ entrypoint 個 `prisma migrate deploy`
      成功 apply 咗四個新 migration。呢個 probe 係特登揀嘅:唔使 token 又真係查 DB

## Doc

- [x] Postmortem(**Sev2 mandatory**)—— 重點寫五道 gate 全綠嘅缺口,唔係寫個 typo
- [x] BACKLOG 同步(R7)
- [x] **RISK_REGISTER:評估後唔加** —— `rootDir`(TS6059)+ `RUN test -f` 兩者都係結構性防線,
      唔靠人記得 ⇒ 唔屬殘留風險。postmortem §5 寫低咗**下次觸發就升級**嘅預先承諾
- [x] anti-patterns 加 **AP-14**「build 綠 ≠ artifact 起得身」(含 stray tsbuildinfo 子型)
