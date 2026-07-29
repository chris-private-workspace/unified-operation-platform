---
bug_id: BUG-008
title: "編譯輸出根目錄被一個新 ops script 悄悄抬高,令容器 entrypoint 指向唔存在嘅 dist/main.js"
severity: Sev2          # Sev1 | Sev2 | Sev3 | Sev4 (per PROCESS.md §4.4)
status: triaged         # triaged | investigating | fixing | verifying | done | wont-fix
reported: 2026-07-29
reporter: "Chris — Azure UAT 同步 2b5057a 時 api revision CrashLoopBackOff"
affects_components: [build/tsconfig, deploy/docker]
spec_refs:
  - docs/13-deployment/04-deploy-runbook.md §8.1(self-migrate / entrypoint)
  - docs/adr/0012-uat-deployment-topology.md
  - CLAUDE.md §5.7 H7(結果類陳述必須 trace 真 output)
---

# BUG-008 — `dist/main.js` 唔再存在,容器 entrypoint 即死

> **Report version**:1.0(initial)
> **Triage approver**:Chris(2026-07-29,批 1+2+3 落實)

## 1. Symptom

`az containerapp update --image acruopuat.azurecr.io/uop-api:uat-2b5057a` 之後:

```
ca-uop-api--0000004
  healthState        : Unhealthy
  provisioningState  : Failed
  provisioningError  : "Container crashing: ca-uop-api"
  runningStateDetails: "1/1 Container crashing: ca-uop-api"
```

同一份 code 喺本機 626 test 全綠、lint 零 output、`nest build` 成功、`az acr build` 報 Succeeded。

## 2. Root Cause

`apps/api/docker-entrypoint.sh:30` 最後一行:

```sh
exec node dist/main
```

而 `2b5057a` build 出嚟嘅實際輸出係 **`dist/src/main.js`** —— `dist/main.js` 唔存在。

### 點解輸出路徑會搬

`apps/api/tsconfig.json` **冇設 `rootDir`**,`tsconfig.build.json` 嘅 exclude 係
`["node_modules","test","dist","**/*spec.ts","prisma"]` —— **冇 `scripts`**。

TypeScript 喺冇 `rootDir` 時,用「所有被編譯檔案嘅共同父目錄」做輸出根:

| | 被編譯嘅 `.ts` | 共同根 | 輸出 |
|---|---|---|---|
| W34 `0cf0cf3`(上次成功部署) | 只有 `src/**` | `src/` | `dist/main.js` ✅ |
| `2b5057a` | `src/**` + `scripts/send-connectivity-check.ts` | `apps/api/` | `dist/src/main.js` ❌ |

`git log --oneline --diff-filter=A -- apps/api/scripts` 返:

```
c7ec948 feat(integration): CH-011 — ACS email transport + 最小通知底座
d489797 chore(api): add demo harness for ADR-0008 request flows
```

`d489797` 個 demo harness 全部係 **`.js`**(`allowJs` 冇開)⇒ tsc 唔會拾起 ⇒ 唔觸發。
**`c7ec948`(CH-011)加嘅 `scripts/send-connectivity-check.ts` 係 `src/` 以外第一個 `.ts`** ⇒ 就係佢抬高咗共同根。

### 本機實證(同一份 code · 同一組 UAT env · scratch DB 跑晒 15 個 migration)

```
node dist/main.js      → EXITED code 1
                         Error: Cannot find module '...\apps\api\dist\main.js'
                         code: 'MODULE_NOT_FOUND'
node dist/src/main.js  → STILL RUNNING after 25s
                         [NestApplication] Nest application successfully started
```

`apps/api/dist/scripts/send-connectivity-check.js` 亦確認存在。

## 3. 排除咗嘅假設(記低,因為佢哋當時都好似好合理)

| 假設 | 點解唔成立 |
|---|---|
| `prisma migrate deploy` 靜默失敗 → app 對住舊 schema 起身 → SELECT 到唔存在嘅欄 crash | 四個新 migration **全部係 nullable `ADD COLUMN`**,唔可能失敗;scratch DB 15 個 migration 全部 apply 成功 |
| 新 dep `@azure/communication-email` 冇入 production image | 佢喺 `dependencies`(唔係 dev);而且 `npm ci` 對唔上 lockfile 會令 build 失敗,但 build 係 Succeeded |
| placeholder Graph/ServiceNow 憑證令 `onModuleInit` throw | 本機用同一組 placeholder env 跑,boot 成功 |
| ACS 未配置令 boot 死 | ADR-0019 D4 明確唔喺 boot 讀 ACS;`acs-email.service.ts` 全部 lazy |
| `.env` 真憑證經 build context 洩漏上 Azure | `.dockerignore` 有 `**/.env` + `!**/.env.example`,正確排除 |

⚠️ 第一個假設我喺對話中講過兩次,**係錯嘅** —— 記喺度免得下次再兜同一個圈。

## 4. Impact

- **範圍**:任何以 `c7ec948` 之後嘅 code build 出嚟嘅 `uop-api` image,**100% 起唔到身**。唔係間歇、唔挑環境。
- **實際後果**:UAT 同步 `2b5057a` 失敗,已 rollback 返 `uat-0cf0cf3`(W34)。UAT 目前服務正常但落後 W35→CH-011 全部功能。
- **Workaround available?**:有(rollback),但代價 = UAT 停留喺 6 個 phase 之前。
- **Security implication?**:No。

## 5. Severity Justification

**Sev2**:

- 唔係 production ⇒ 唔到 Sev1(冇 outage / data loss / security breach)
- 但唔係「某個 feature 壞」,而係**部署 artifact 整個不可用** —— 任何往前嘅部署都必然 crash ⇒ 高過 Sev3
- ⇒ postmortem **mandatory**(PROCESS.md §4.4)

## 6. 🔴 呢個 bug 真正嘅一半:冇任何一道 gate 攔得到

| Gate | 結果 | 點解攔唔到 |
|---|---|---|
| api 626 test | 綠 | ts-jest 直接跑 `src/**`,由頭到尾唔碰 `dist` |
| `npm run build` | 成功 | tsc 冇報錯 —— 佢係**靜靜**換咗輸出佈局,唔當呢個係問題 |
| `npm run lint` | 零 output | 無關 |
| `az acr build` | Succeeded | 只證明 image build 到,**唔證明佢起得身** |

一個保證會 crash 嘅 image 一路過關直到部署。**呢個係流程缺口,唔淨係一個 typo** ——
所以 fix 唔可以只係「改返個路徑」,必須包含一道會攔到佢嘅 gate。

## 7. Acceptance for Fix

- [ ] **Fix 1(根治佈局)**:`tsconfig.json` 加 `"rootDir": "./src"`;`tsconfig.build.json` exclude 加 `"scripts"`。
      `rootDir` 係重點 —— 將來再有 `src/` 以外嘅 `.ts` 被 include,**tsc 直接報錯**,而唔係靜靜搬走 entrypoint。
- [ ] **Fix 2(build-time gate)**:Dockerfile build stage 喺 `npm run build` 之後加 `RUN test -f dist/main.js`,
      令「build 成功但一定死」喺 ACR 就爆。
- [ ] **唔採用**「改 entrypoint 做 `node dist/src/main`」:嗰個係跟住浮動嘅嘢走,
      將來 `scripts/*.ts` 一移走輸出又會反轉,再 crash 一次。
- [ ] **Fails-before 驗證**:改之前先實證 `dist/main.js` 唔存在 / `node dist/main` MODULE_NOT_FOUND(已做,見 §2)。
- [ ] `npm run email:check` 仍然行得(佢用 ts-node 跑 `.ts` 源檔,唔靠編譯輸出)。
- [ ] api test 全綠(唔應該有任何改變 —— 若有變,即係 fix 掂咗唔應該掂嘅嘢)。
- [ ] 重 build image + 真部署上 UAT 驗證 revision `Running` 而非 `Failed`。
- [ ] Postmortem(Sev2 mandatory)。

## 8. Report Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-29 | Initial triage(Sev2)+ root cause 確證 + 排除 5 個假設 | UAT 同步 `2b5057a` CrashLoopBackOff;本機重現 + git 追到引入 commit `c7ec948` | Chris |
