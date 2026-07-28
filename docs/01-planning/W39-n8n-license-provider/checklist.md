---
phase: W39-n8n-license-provider
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: 2026-07-28
---

# Phase W39 — Checklist

## ✅ D0 Gate —— 已解除(2026-07-28,Chris Lai,五個全跟建議)

- [x] **OQ-1 = A**:`already_assigned` **一視同仁照 +1**,同 `assigned` 完全一樣處理 ⇒ **`assign.service` 要開一個 `already_assigned` 分支**(W38 對非 `assigned` 一律 fail-loud;呢個就係 W38 明文留低嘅「庚必須正面處理」)。⚠️ **代價要入 ADR 補註**:n8n 路徑明知有更準嘅資訊但刻意唔用
- [x] **OQ-2 = A**:provider **唔傳遞** n8n 個 `details`,只留 status + 平台自己寫嘅安全描述
- [x] **OQ-3 = B**:`ritmId` **唔入**介面(Graph 實作永遠用唔着)
- [x] **OQ-4 = A**:未配置 → **`inactive`**;配置咗但打唔通先 `error`
- [x] **OQ-5**:維持**唔加** `listUsersBySku`(2002 有 mode 2 ≠ 平台需要佢)
- [x] Chris approve plan → `status: draft → active`

## F1 — `N8nLicenseProvider`

- [x] `n8n-license.provider.ts` —— `extends LicenseOperationsProvider`,用 global `fetch`(**零新 dep**)
- [x] `listTenantSkus()` → 2002 **mode 1** → map 三個欄
- [x] `findUser(upn)` → 2005 單筆 → `synced`→`DirectoryUser` / `not_synced`→**null**(同 Graph 語意一致)· ➕ `error` → **503 而唔係 null**(返 null 會開咗 sync gate 個 400,同運維講「未 sync」而真相係「查唔到」)
- [x] `assignLicense()` → 2003 —— **兩種 response 形狀都 handle**
- [x] transport 失敗 **throw 503**;➕ **非 2xx 都 throw**(401 = 我哋自己 wiring 錯,唔可以扮成 `{status:'error'}` 令人以為「派唔到」,真相係「根本冇人被問過」)
- [x] 🔴 **條 test 捉到一個真 bug**:`this.secret()` 原本喺 `fetch()` args 入面求值 = 喺 `try` **內**,所以「冇設 key」會被包成「n8n is unavailable」—— 運維會去查第三方,而真相係我哋漏設。已移出 `try`
- [x] verify:`graph-license.provider.ts` / `license-ops.provider.ts` **兩個檔 diff = 0**;`assign.service.ts` **只有 OQ-1 嗰個分支**(見 F5)

## F2 — Outcome mapping + 雙向 H5 contract test

- [x] `success`→`assigned` · `not_synced`→`not_synced` · 未知→`error` · `already_assigned`→ 按 **OQ-1** 原樣傳上去
- [x] **OQ-2 守門 test**:餵一個 `details` 含 UPN 嘅 2003 回應,assert 出到嚟嘅 outcome **唔含該 UPN**(`n8n-license.provider.spec` 16 test)
- 🚧 **同一組 case 餵兩個 provider,assert 同一 outcome** —— **未做**(Chris 2026-07-28 決定縮減範圍,優先 F4 修正 + F6)。⚠️ **呢個係 ADR-0017 rollout 表列明嘅庚驗收標準**,已喺 ADR 實作補註明標「未達成、唔係已完成」。現有覆蓋 = **各自單邊**(W38 Graph 9 test + W39 n8n 16 test,兩邊都逐個 outcome 測過,但冇一條拎同一 case 對照)。補嗰陣要寫成「**除咗 replay 之外**相等」,唔可以寫成「必然相等」—— 兩邊已知有一處**刻意**分岔
- 🚧 test 註釋寫明 **`no_seats` 兩個 provider 都產生唔到** —— 隨 contract test 一齊補(單邊 spec 寫呢句冇對照意義)

## F3 — `n8n-license` connector

- [x] 非機密欄落 `ConnectorConfig`(**`licenseOpsProvider` + `n8nLicenseBaseUrl` 兩個新 column**);**`x-uop-secret` 只經 env**
- [x] 🔴 **H1 觸發並已 STOP + Chris approve** —— kickoff 假設「零 schema」破產:`ConnectorConfig` 係**具名 column** model 唔係 key-value bag ⇒ 加 connector **必然**要 `ALTER TABLE`。已入 plan §7 changelog D1 + **ADR-0013 實作補註**(記喺嗰度而唔止 progress,因為**下一個加 connector 嘅人會踩同一個坑**)
- [x] migration `20260728021452_w39_n8n_license_connector` 純 additive、兩個 nullable TEXT、applied、欄位實查存在
- [x] 三條 webhook path 落 `N8N_LICENSE_PATHS`(由 **workflow JSON 實讀**,唔係 ADR 轉述)
- [x] `GET /admin/integrations` 三態(OQ-4)—— `CONNECTOR_KEYS` 自動 derive,`integration-status.service.spec` 全綠零改動
- 🚧 **硬紅線 test:餵假 secret assert 回應 + audit row 零洩漏** —— **未做**(同 F2 一齊縮減)。⚠️ 機制層面已守(schema **冇** secret 欄 · `CONNECTOR_CONFIG.secrets` 只列 envKey · resolver 只掂非機密欄),但**冇一條 test 為 `n8n-license` 專門 assert 呢件事** —— W30 對其餘 connector 有做,呢個係**覆蓋缺口唔係設計缺口**

## F4 — Probe(2002 mode 1)

- [x] `PROBEABLE` 加 `n8n-license`,只探 **2002 mode 1**
- [x] 🔴 **實作揪到我自己開嘅窿**:`execute()` 對任何「可探但冇具名分支」嘅 key **fall through 去打 ServiceNow** ⇒ 撳 n8n-license 個 Test connection 會探 ServiceNow **而標籤寫住 n8n**。加 `PROBEABLE` 而唔加分支 = 一個**綠色剔畀一個從來冇被聯絡過嘅 connector**
- [x] ⚠️ **注入具體 `N8nLicenseProvider` 而唔係抽象** —— 注入抽象會令「測 n8n connector」實際探緊當前選中嗰個(預設 Graph),即係喺 n8n 標籤下報 Graph 健康
- [x] 🔴 **負面斷言**:assert 探完 **2003 / 2005 從未被呼叫** + **唔會 fall through 去 ServiceNow / Graph** + 失敗訊息唔洩漏 vendor 文字
- [x] ➕ **順手修一個同類毛病**:G2「never calls anything that writes」原本**手抄** 4 個 key 而自稱「run every probe there is」⇒ 加新 key 就靜靜漏。改成 iterate `CONNECTOR_KEYS`(**靠人手同步嘅守門 = 有窿嘅守門**,同 TD-1 同病)
- [x] code comment 寫明「Do not add a probe for 2003/2005」+ 理由(2003 真派 licence · 2005 要真 UPN = H4)
- [x] **fails-before 實證**:拆走分支 → **3 條 W39 test 全紅,其餘 11 條照綠** → 還原(`grep` = 0)。➕ **揭到舊 G2 冚唔到呢個 bug** —— fall-through 打嘅係 `snow.query`(**讀**唔係寫),所以舊 G2 照樣綠 ⇒ 新加嗰條「does NOT fall through」先至係真正守門

## F5 — 選路 wiring

- [x] `integration.module` `useClass` → **async factory**(讀配置選 `graph` **預設** / `n8n`)
- [x] **掣嘅預設方向**:任何**非 `'n8n'`** 字串(unset / typo / 半完成配置)一律落 **Graph** —— 唔完整嘅配置絕不可以靜靜把真 licence 派發路由去第三方
- [x] **OQ-1 落地**:`assign.service` 開 `already_assigned` 分支當 `assigned`(W38 留低嘅 fail-loud 正面處理咗);其餘 outcome **仍然 fail loud**
- [x] **G6 / G1**:全套 **487/487 綠**,既有 spec 零改動 —— 預設路徑行為同 W38 一致
- [x] 🔴 **`license-ops.boundary.spec.ts` 捉到我**:probe 必然要 import `N8nLicenseProvider`,而 W38 條 test 係 `not.toContain('license-ops')`。查清楚後判斷 —— W38 嗰條規則嘅**理由**係「唔准**經 seam**(抽象)去探」,而我用**具體類**正正係為咗「Graph 仍選中時仍探得到 n8n」⇒ **條 test 嘅實作寬過佢嘅意圖**。**收緊**佢:明文禁**抽象 import**(舊版從來冇真正 assert 過呢點)+ 禁 `assignLicense`/`findUser`
- [x] ➕ 改完仍然紅 —— 因為我喺 **comment** 寫咗 `LicenseOperationsProvider` 個名,而 `toContain` 唔分 code 同註釋。改成 match **import path**(comment 提名唔誤中,真 import 一定中)

## F6 — Doc-sync

- [x] **ADR-0013 實作補註** —— 加 connector = 改 schema 呢個連帶後果 + 第四個 connector 表 + 點解唔開新 ADR
- [x] **ADR-0017 實作補註「庚」段** —— 四處合約落差 + 五個 OQ 拍板 + H1 + probe 邊界 + **兩個 🚧 誠實邊界**(真切換未驗 · rollout 表個庚驗收標準未達成)
- [x] ADR-0017 replay 段由「留畀庚拍板」改為「**W39 OQ-1 已拍板**」+ 明寫代價
- [ ] `BACKLOG` 己庚辛 row · 最後更新
- 🚧 `SESSION_SUMMARY` · runbook 08(切換前置)—— **未做**;runbook 待真切換前置齊備先寫先有意義

## Verify

- [x] `npm test -w @uop/api` **487 / 487**(46 suites,基線 467 + n8n provider 16 + probe 4)· **lint 0** · **tsc 0**
- [x] **G3(修訂後)**:`schema.prisma` diff **只有嗰兩個 nullable 欄** + 一個 additive migration;**3 個 `package.json` diff = 0**(用 global `fetch`,零新 runtime dep)
- [x] 🚧 **G8 live 切換 = 明文唔做**(plan §1 誠實邊界)—— n8n 側 secret 仍 `CHANGE_ME_SHARED_SECRET` · UAT 未接通 · 平台未部署。**唔准當 pass**
- [ ] `anti-patterns` 自檢(尤其 **AP-2 mock 當 real** —— 本 phase 全程冇真 n8n)

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] OQ 拍板反映入 ADR-0017 實作補註(R4)
- [ ] 架構-adjacent 決定 → ADR(預期**無新 ADR**:ADR-0017 已 Accepted)
- [ ] Pending 同步 `BACKLOG.md`(R7)
- [ ] `progress.md` retro + status flip
- [ ] Phase N+1 trigger noted(= **辛** `TicketUpdateProvider`,號碼 W40)
