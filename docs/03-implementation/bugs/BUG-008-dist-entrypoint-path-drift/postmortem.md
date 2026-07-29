---
bug_id: BUG-008
severity: Sev2
written: 2026-07-29
---

# BUG-008 Postmortem — 五道 gate 全綠,而 image 保證起唔到身

## 1. 一句話

一個新加嘅 ops script 令 TypeScript 悄悄搬走 `main.js`,而**冇任何一道 gate 係喺睇「呢個
artifact 起唔起到身」** —— 所有 gate 睇嘅都係「source 啱唔啱」。

## 2. 發生咗咩

CH-011 加咗 `apps/api/scripts/send-connectivity-check.ts`。佢係 `src/` 以外第一個 `.ts`
(之前 `scripts/demo-harness/*` 全部係 `.js`,`allowJs` 冇開,tsc 唔會拾起)。

`tsconfig` 冇 `rootDir`,所以 tsc 用「所有被編譯檔案嘅共同父目錄」做 emit 根:

```
src/ + scripts/  →  共同父 = apps/api/  →  main.js 去咗 dist/src/main.js
```

`docker-entrypoint.sh` 跑嘅係 `node dist/main`。容器一起身就 `MODULE_NOT_FOUND`,
exit 1,CrashLoopBackOff。

## 3. 🔴 真正嘅教訓:gate 睇嘅係 source,唔係 artifact

| Gate | 結果 | 佢實際驗緊咩 |
|---|---|---|
| api 626 test | 綠 | **source 行為** —— ts-jest 直接跑 `src/**`,由頭到尾唔碰 `dist` |
| `npm run build` | 成功 | **type 正確性** —— tsc 唔覺得換 emit 佈局係問題,佢係設計如此 |
| `npm run lint` | 零 output | **source 風格** |
| `az acr build` | Succeeded | **image build 得成** —— 唔等於 image 起得身 |
| (冇呢一道) | — | **artifact 有冇入口點** ← 缺口就喺呢度 |

五道 gate,冇一道問過「build 出嚟嗰嚿嘢,`node dist/main` 行唔行?」

`RUN test -f dist/main.js` 呢一行(Fix 2)就係補呢個缺口。佢**唔係**修 bug —— `rootDir`
先係修 bug。佢係確保「同一類缺陷」下次喺 ACR 就爆,而唔係部署完先發現。

呢個分工要記住:**Fix 1 令呢次唔會再發生;Fix 2 令下次同類發生時,喺最平嘅地方爆。**

## 4. 我(AI)診斷時行錯咗嘅路

### 4.1 先砌完整故事,而唔係先睇最平嘅證據

攞唔到 container log 之後,我砌咗一個好完整、好合理嘅假設:

> `prisma migrate deploy` 靜默失敗(entrypoint 設計上 non-fatal)→ app 對住 W34 schema
> 起身 → `ConnectorConfigService.resolve()` 喺 boot 被三個 module factory 叫 →
> SELECT 到 W39/W40/CH-011 新加嘅欄 → crash loop

呢個故事**內部一致、有機制、有 code 支持**,而且我喺對話中講咗兩次。

推翻佢只需要**打開四個 migration SQL 檔**:全部係 nullable `ADD COLUMN`,唔可能失敗。
四次 Read,唔使一分鐘。

⇒ **一個假設越完整,越應該先問「推翻佢最平嘅一步係咩」。** 完整度唔係證據。

### 4.2 三次撞同一堵牆先肯轉路

`az containerapp logs show`、Log Analytics query —— 三次都被公司 proxy MITM 擋
(全部係 data-plane;memory `project_azure-uat-deployment` 早就記低咗呢條規律)。

第二次之後就應該轉本機重現。本機重現唔使過 proxy、有完整 stack trace,
而且**十分鐘就出咗答案**。

⇒ **當環境限制係已知且穩定嘅(proxy 只放行 management plane),重試同一條路唔會有新結果。**

### 4.3 途中差啲誤判 fix 冇效

改完 tsconfig 之後 rebuild,`dist/main.js` **仍然唔存在**,而 build exit 0、零輸出。
差啲以為 fix 錯咗方向。

真相係我自己整出嚟嘅:早一步跑咗 `tsc --noEmit -p tsconfig.build.json`,而 `--noEmit`
**唔建 outDir**,於是 incremental 狀態寫咗去 `apps/api/tsconfig.build.tsbuildinfo`
(`dist/` **外面**)。之後每次 `nest build` 都當「已是最新」→ 靜靜 skip emit。
清 `dist/` 清唔到佢。

呢個同 BUG-008 本體係**同一族**:build 工具靜靜做咗你冇預期嘅事,而且唔報錯。
已加入 anti-patterns(**AP-14**,連同本體一齊)。

(Docker build 唔會中:`.dockerignore` 已有 `**/*.tsbuildinfo`。)

## 5. 點解唔加新 RISK

跟 BUG-004 postmortem 同一個判斷方式 —— 問「呢個係殘留風險,定係已經有結構性防線?」

- `rootDir` 令同類新增變成**大聲嘅 build error**(TS6059),唔再係靜默重佈局
- `RUN test -f dist/main.js` 令 artifact 缺入口點喺 **ACR build 階段**就爆

兩者都係結構性、唔靠人記得,⇒ **唔屬殘留風險,唔入 RISK_REGISTER。**

**但**若果將來出現「第二次 build artifact 層面嘅缺陷」(例如 runtime stage 漏 copy 某樣嘢、
entrypoint 依賴嘅檔案唔喺 image 入面),就應該升級成一條「artifact 未經啟動驗證」嘅 risk,
並考慮喺 Dockerfile 加真正嘅 smoke(例如 `node -e "require('./dist/main.js')"` 或者
build 完起一次 container 打 `/docs/api`)。呢句係**預先承諾嘅觸發點**,同 BUG-004→BUG-007
嗰次一樣。

## 6. 遺留 / 未做

- ⚠️ **`az acr build` 喺本機 stream log 時會 charmap crash**(`'✔'` / `'✓'`,
  Windows console codepage),exit 1 係**假象** —— server 側照跑完。
  Workaround:`az acr task show-run --registry <r> --run-id <id> --query status -o tsv`。
  唔係本 bug 範圍,但佢真係拖慢咗兩次診斷,值得記低。
- ⚠️ **ACS 兩個 env 未入 `deploy/azure/aca.bicep`** ⇒ UAT 個 email connector 仍然 `inactive`。
  要改就要 `aca.params.uat.json`(唔喺任何 worktree)或者重設 DB 密碼重新生成 params。
- ⚠️ 本次**冇跑** `npm run email:check` / `npm run seed` 本機驗證(理由見 checklist);
  seed 已喺 UAT entrypoint 真跑,而 login probe 返 401 而非 500 間接證實 DB schema 正常。
