---
change_id: CH-012
title: "接線 ACS email + APP_BASE_URL 落 UAT 部署 template"
status: approved          # draft | proposed | approved | active | done | cancelled
created: 2026-07-30
target_completion: 隨 W41 一齊部署(OQ-3)
affects_components:
  - deploy/azure/aca.json (加 3 parameter + 1 secret + 3 env — 唯一實質改動)
  - deploy/azure/aca.params.example.json (加對應 placeholder + 說明)
  - deploy/azure/aca.bicep (同步改 — OQ-2 已答)
  - docs/13-deployment/04-deploy-runbook.md §4 (secret 清單加 ACS)
spec_refs:
  - ADR-0019(ACS email transport 決策來源;D4 = 唔用 getOrThrow)
  - ADR-0013(Model C connector config · D2/D5 secret 三重守)
  - ADR-0012(UAT deployment topology — 本 change 唔改 topology)
  - CH-011(email transport 已落地;本 change 只係令佢喺 UAT 有 config)
  - docs/13-deployment/02-environment-reference.md「可選功能」
---

# CH-012 — 接線 ACS email + APP_BASE_URL 落 UAT 部署 template

> **Spec version**:1.1
> **Owner**:AI(執行)· 決策 = Chris Lai
> **Status**:**`approved`**(2026-07-30,Chris 答齊三條 OQ 解封)—— template 改動已完成,**但未部署**(隨 W41 一齊上,見 §8)
>
> **Spec locked。** 之後任何 deviation 必須入 §7 changelog(PROCESS R3)。

## 1. Context (Why)

2026-07-30 核對 `docs/13-deployment` 時查到(真讀 artifact,唔係推論):

| # | 事實 | 依據 |
|---|---|---|
| 1 | `deploy/azure/aca.json` 對 `ACS_CONNECTION_STRING` / `ACS_SENDER_ADDRESS` / `APP_BASE_URL` **一個 parameter 都冇** | `aca.json` parameters 19 個、secrets 7 個、api env 16 個,逐個數過 |
| 2 | CH-011 已收官,email transport code 喺 `main` | commit `c7ec948` + CH-011 spec status `approved` → A1-A12 全過 |
| 3 | W41 密碼重設靠 `APP_BASE_URL` 砌連結 | `apps/api/src/auth/auth.controller.ts:115` |
| 4 | 兩者都用 `config.get` 而非 `getOrThrow` | `acs-email.service.ts:115` · `auth.controller.ts:115`(ADR-0019 D4 刻意) |

**後果**:UAT 部署得幾多次都好,email 永遠唔會 work。而因為刻意唔 `getOrThrow`(一個可選功能配置錯唔應該令平台起唔到身),**冇任何 boot error 提示你漏咗**。

🔴 **最值得警惕嘅係失敗形態**:密碼重設會**靜默**失敗 —— token 照發、`POST /auth/forgot-password` 照返 `204`、前端顯示「已寄出」,用戶就係永遠收唔到信,只有 api log 一行 error。冇人會 report 一個「睇落成功」嘅功能。

## 2. Scope

### 2.1 In

1. `aca.json` 加 3 個 parameter:
   - `acsConnectionString`(**securestring**)
   - `acsSenderAddress`(string,`defaultValue: ""`)
   - `appBaseUrl`(string,`defaultValue: ""`)
2. `aca.json` `configuration.secrets` 加 1 項:`acs-connection-string`
3. `aca.json` api container env 加 3 項:`ACS_CONNECTION_STRING`(secretRef)、`ACS_SENDER_ADDRESS`、`APP_BASE_URL`
4. `aca.params.example.json` 加對應 placeholder + 說明(**唔放真值**)
5. `04-deploy-runbook.md §4` secret 清單補 ACS(現時只列 5 個 secret)

### 2.2 Out(明確唔做)

- **唔改 topology**(ADR-0012 不變:仍然 internal api + external web + 單一 origin)
- **唔加 `SYNC_SWEEP_*`** —— 三個都有 default 且現行值就係想要嘅值,接線只會多三個要維護嘅 parameter。要調就用 `az containerapp update --set-env-vars`,或者將來另開。
- **唔碰 Key Vault / Managed Identity** —— 屬 `DEPLOY-harden`,同本 change 正交
- **唔 provision ACS 資源本身** —— 假設 ACS resource + 已驗證 sender domain 已存在(CH-011 A11 已真寄成功 ⇒ 存在)。**呢點要 Chris 確認 UAT 用邊個 ACS resource**(OQ-1)
- **唔碰 n8n outbound 三個變數** —— 另一件事,provider 現時寫死 `direct`

## 3. 設計決定

### D1 — `appBaseUrl` 用 parameter 手填,唔用 ARM `reference()` 自動組

**實作時發現理由比原本寫嘅更硬**:`aca.json` 嘅 web app 已經 `dependsOn` api(因為 `API_UPSTREAM` 要 `reference()` 取 api 嘅 internal FQDN)。所以若 api 反過來 `reference()` web 嘅 FQDN,就係**循環依賴**,ARM 直接拒絕 —— 唔止「改變部署順序」咁輕。

⇒ 當 parameter 手填。現行值:`https://ca-uop-web.lemonhill-2df17b88.eastasia.azurecontainerapps.io`

**代價**:重建 ACA env 後要記得更新。已喺 params 範本 `_acs_email_note` 註明。

### D2 — `acsSenderAddress` 落 env 而唔係只靠 DB

ADR-0013 Model C 下,`acsSenderAddress` 屬非機密、ADMIN 可喺 Settings › Integrations 改(DB 蓋 env)。但 **env 仍然要設** —— 否則首次部署到 ADMIN 入去設定之間嘅窗口,email 係死嘅;而且 DB 一 reset 就冇。env = fallback,DB = 覆寫。

### D3 — `acsConnectionString` 必填(修正原設計)

原 spec 寫「三個 parameter 都畀 `defaultValue: ""`,未填都部署得」。**實作時改咗**:`acsConnectionString` **唔畀 default**,即必填。

理由:佢被 `configuration.secrets` 引用,而 ACA secret 接受唔接受空 value **我未驗證過**,`az` 喺呢個網路環境跑唔到(見 §8)。與其賭,不如跟 template **已經確立嘅 pattern** —— `graphClientSecret` / `servicenowPassword` 一直都係「必填,未接就填非空 placeholder」(見 `aca.params.example.json`)。零新風險、同其餘 secret 一致。

`acsSenderAddress` / `appBaseUrl` 係普通 string env,保留 `defaultValue: ""`(env 空值無疑問)。

行為上冇損失:填一個非空 placeholder 落去,`acs-email.service.ts:122` 會當 malformed → email disabled + log 一行,平台照起身(ADR-0019 D4)。

> ⚠️ 但呢個決定嘅另一面依然成立:**漏填 / 填錯唔會有任何警告**。所以 acceptance 一定要有一項係「真寄一封」,唔可以靠「部署成功」當證明。

### D4 — `aca.bicep` 同步改(OQ-2 已答:同步)

三個 parameter + secret + env 已同步落 bicep,並喺 file header 加咗說明:**`aca.json` 係實際部署嘅 artifact**,bicep 只係保持同步、唔會被部署(bicep CLI 喺公司 proxy 後裝唔到,`04 §0`)。

🔴 **同步過程中發現 bicep 本身早已 drift**(**唔係 CH-012 造成,亦冇喺本 change 修 —— 出 scope**):

| # | Drift | 後果 |
|---|---|---|
| 1 | api ingress **缺 `allowInsecure: true`** | `aca.json` 有。冇佢 → http upstream 被 301 轉 https,nginx 到唔到 api(`04 §8.3` 記錄過嘅坑) |
| 2 | `API_UPSTREAM` 係 `'http://${api.name}'` | `aca.json` 用 resolved internal ingress FQDN |

即係 **今日照 bicep 部署會重現一個 `aca.json` 已經修好嘅 bug**。已喺 bicep header 寫明,建議另開一個細 change 對齊(或者索性刪 bicep,因為佢冇被任何流程用到)。

## 4. Acceptance criteria

| # | 判準 | 狀態 | 依據 |
|---|---|:---:|---|
| A1 | ARM template 結構正確 | ✅ | **`az` 跑唔到**(`az account show` hang 到 timeout,proxy)⇒ 改用 `deploy/azure/check-template.py`(已入 repo,可重跑),7 項全過:JSON parse · `parameters()` 引用↔宣告(冇缺冇多餘)· `secretRef`↔`secrets` 冇懸空 · 必填 param 齊 · 範本冇多餘 key · **bicep↔json api env 一致** · 範本冇真 secret。並做過 fails-before:注入 4 種壞法(打錯 secretRef / 未宣告 param / 範本漏必填 / bicep 少一個 env)全部 detect 到 |
| A2 | api container 有齊三個 env | ✅ | template 靜態 19(json 同 bicep 都數過);**running container 亦實測 19**(2026-07-30,`az containerapp show` —— 但注意呢三個 env 唔係本 change 令 container 有嘅,見 §8 頂) |
| A7 | 冇真 secret 入 repo | ✅ | `aca.params.uat.json` 仍喺 `.gitignore`;只 commit example,9 個 SECRET 值全部仍係 `<…>` placeholder 形式 |
| A3 | `ACS_CONNECTION_STRING` 唔出現喺任何 API 回應 / audit / log | ❌ 未驗 | 要部署後打 `GET /admin/integrations` 睇 connector read-model(ADR-0013 D5 三重守) |
| A4 | 🔴 **真寄一封信到真收件人並確認收到** | ✅ | **2026-07-30 真寄,Chris 確認收到。** `npm run email:check -w @uop/api -- --to=chris.lai@rapo.com.hk`(`NODE_OPTIONS=--use-system-ca`,否則死喺 proxy MITM 自簽證書)· sender `UnifiedOperationsPortal@rci-t.com` · stamp `2026-07-30T08:06:39.608Z` · ACS operation `31bb7805-587c-47ca-862f-8bc7b208d9ed`。⚠️ **判準係收件人確認,唔係 script 印咗 `sent`** —— custom sender domain 嘅失敗模式正正係 ACS 返 `Succeeded` 而 DNS 側掉咗(CH-011 R1) |
| A5 | `POST /auth/forgot-password` → 真收到重設信,連結入得去 | ❌ 未驗 | 端到端驗 W41 路徑,連結格式 `<APP_BASE_URL>/reset-password#token=…` |
| A6 | revision `Running/Healthy` + `04 §7` smoke 全過 | ❌ 未驗 | **唔可以只睇 `az acr build` Succeeded**(BUG-008 教訓) |

> **A3–A6 全部要等真部署。** A4 同 A5 **必須真做**,唔可以用 mock 或「配置睇落啱」代替 —— 呢個 change 嘅全部價值就係「信真係寄得出」,而失敗形態係靜默嘅。

## 5. Open questions —— 全部已答(Chris,2026-07-30)

| # | 問題 | 答案 |
|---|---|---|
| **OQ-1** | UAT 用邊個 ACS resource / sender domain? | **用現時已配置嘅內容** ⇒ sender = `UnifiedOperationsPortal@rci-t.com`(CH-011 A11 真寄成功嗰個),沿用同一個 ACS resource。connection string 真值**唔入 repo**,由 owner 填落 gitignored params 檔 |
| **OQ-2** | `aca.bicep` 點處理? | **同步改**(見 D4)。同步時發現 bicep 早已有兩處 drift,已喺 header 標明但**冇修** —— 出 scope |
| **OQ-3** | 部署時機? | **隨 W41 一齊上**。所以本 change 只交付 template 改動,A3–A6 留待該次部署驗(見 §8) |

## 6. Risk

| 風險 | 緩解 |
|---|---|
| 重跑 `az deployment group create` 會覆寫現有 secret | 用 gitignored persistent params 檔(`04 §4`)—— 全部 secret 值都喺裡面,唔會出現 W34「舊 DBPW 冇咗」。**部署前確認該檔存在且齊全** |
| connection string 貼錯 / 半截 | `acs-email.service.ts:122` 有 malformed 檢查會 log 並 disable email(唔會 crash);但**唔會有人主動睇** → 靠 A4 |
| 改 `aca.json` 手誤令整個部署失敗 | A1 先 `validate`,唔直接 `create` |

## 7. Spec Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-30 | Initial draft(status `proposed`) | 文件核對揾到 aca.json 缺 3 個 env;屬部署 artifact 改動,按 PROCESS R1 需 approved spec 先開工 | — |
| 2026-07-30 | `proposed → approved`;三條 OQ 答案入檔 | Chris 答齊 OQ-1/2/3 解封 | Chris |
| 2026-07-30 | **D3 修正**:`acsConnectionString` 由 `defaultValue: ""` 改為必填 | 實作時發現佢被 `configuration.secrets` 引用,而 ACA 接受唔接受空 secret value 我驗證唔到(`az` 喺此網路 hang)。改為跟 template 已確立嘅 pattern(`graphClientSecret` 等一直係「必填 + 非空 placeholder」),零新風險 | AI(記錄;R3) |
| 2026-07-30 | **D1 理由更正** | 原寫「會改變部署順序」,實際係**循環依賴**(web 已 `dependsOn` api) —— 更硬嘅理由 | AI(記錄;R3) |
| 2026-07-30 | **A1 判準改法** | 原寫「`az deployment group validate` 真跑」。`az` 喺此環境 hang 到 timeout ⇒ 改為本地交叉引用檢查 + fails-before 驗證。真 validate 順延到部署時 | AI(記錄;R3) |
| 2026-07-30 | 🔴 **§1 前提更正 + change 價值重新定性**(見 §8 頂) | 原判斷「email 永遠唔會 work」係由 template 推論 container 得出,實測 container 一直有 ACS 兩個 env(owner 2026-07-29 手設)⇒ email 一直寄得出。本 change 實為**防 regression**(避免全量 ARM 抹走手設 env),唔係「令 email work」。連帶 A2–A6 狀態、`02`/`07`/`README`/docx 嘅同類錯陳述一併更正 | AI(記錄;R3) |

## 8. 交付狀態(2026-07-30)

> 🔴 **本 spec §1 有一個前提錯誤,喺此更正(唔改上文,保留原判斷以資對照)。**
>
> §1 寫「UAT 部署得幾多次都好,email 永遠唔會 work」。**錯。** 嗰個結論由「`aca.json` 冇 ACS parameter」推論出嚟,但 **template 同 running container 係兩本獨立嘅帳** —— 日常部署走 `az containerapp update --image` 完全唔碰 template,而 env 可以直接設落 container。
>
> **實測(2026-07-30)**:running api container 有 **19 個 env**,`ACS_CONNECTION_STRING`(secretRef)同 `ACS_SENDER_ADDRESS` 早於 **2026-07-29 由 owner 親手設落 container**,`APP_BASE_URL` 亦已設(設之前 18)。⇒ **email 一直配置齊、寄得出。**
>
> **所以本 change 嘅真正價值 = 防 regression**:template 冇呢三個 parameter 嘅話,一旦有人走全量 ARM(`az deployment group create`),宣告式 template 就會**抹走**手設嘅 env,email 靜靜死掉。接線之後兩本帳對齊,風險消除。
>
> 教訓:講 env 狀態一律 `az containerapp show --query "…env[].{name,secretRef}"` 實測,唔好由 template 推論(亦唔好信文件 —— `02`/`07`/`README` 三份都曾經寫錯「16 個」)。

**已完成** —— template 側全部改動:

| 檔案 | 改動 |
|---|---|
| `deploy/azure/aca.json` | +3 parameter · +1 secret(`acs-connection-string`)· +3 env(api container 16 → 19) |
| `deploy/azure/aca.bicep` | 同步以上;header 加「aca.json 才是部署 artifact」+ 已知 drift 清單 |
| `deploy/azure/aca.params.example.json` | +3 placeholder · `_acs_email_note` 說明三個坑 |
| `docs/13-deployment/04-deploy-runbook.md` | §4 secret 說明加 ACS 三項 |

**A4 已過(2026-07-30)—— 但要睇清楚佢證明咗咩**:

| 證明到 | **證明唔到** |
|---|---|
| ACS 憑證有效 · transport 通 · `rci-t.com` custom sender domain 真係送得到(唔止 ACS 收貨) | **UAT container 嗰組 secret 值**同本機 `.env` 一唔一樣 |

🔴 呢封信係喺**本機**用 `apps/api/.env` 嘅憑證寄,**唔係經 UAT container**。UAT container 實測有齊三個 env **名**,但 secret **值**查唔到(亦唔應該查)。**唔好由呢邊推另一邊** —— 呢個 change 開頭就係咁錯過一次(§8 頂)。

**未完成**:

1. **A5 密碼重設端到端** —— 要行 `POST /auth/forgot-password` 條路(而唔係直接叫 transport),先驗到 `APP_BASE_URL` 同連結格式。⚠️ 需要收件地址係該環境嘅 **local** account:W41 對 SSO / 唔存在 / cooldown 一律返 `204` 但**真零寫入**(anti-enumeration),所以打錯對象會「成功」但冇信。同 W41 **F8c** 係同一件事。
2. A3(`ACS_CONNECTION_STRING` 唔出現喺 API 回應 / audit / log)—— 打 `GET /admin/integrations` 睇 connector read-model(ADR-0013 D5 三重守)。
3. A6 **不適用** —— 本 change 唔觸發部署(container 已齊料,`--image` 唔碰 template)。template 改動會喺**下次全量 ARM** 生效,嗰時先驗 revision Healthy。
4. **下次走全量 ARM 之前**:確認 gitignored `aca.params.uat.json` 有 `acsConnectionString` 真值 + `appBaseUrl` 係現行 web FQDN,否則宣告式 template 會抹走 container 現值。
5. A5 / A3 過之後 status → `done`,並寫 `report.md`。

🔴 **「配置齊」唔等於「信寄得出」。** 呢個 connector 冇 probe,sender domain 唔對嗰陣 ACS 會收貨但唔送達而 API 仍返 `Succeeded`。漏 `APP_BASE_URL` 更深一層 —— audit 寫 `reason:'issued'` 而信一封都冇寄,連 audit 都答唔到「為咩收唔到信」。
