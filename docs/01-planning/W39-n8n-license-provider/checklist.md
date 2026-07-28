---
phase: W39-n8n-license-provider
plan_ref: ./plan.md
status: complete       # in-progress | complete
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
- [x] **同一組 case 餵兩個 provider,assert 同一 outcome** —— `license-ops.contract.spec.ts`,**10 test**(= ADR-0017 rollout 表列明嘅庚驗收標準,已達成)。**7 個 case 各寫兩次**(一次 Graph 語言、一次 n8n 語言)—— 令兩個 arrangement 意思相同**就係呢條 test 嘅真功夫**,亦係 mistranslation 唯一會匿埋嘅地方
- [x] 兩樣**刻意唔 assert**:①**唔要求 error message 相同** —— vendor 掛咗嗰陣運維要知係**邊個**掛,所以「Microsoft Graph is unavailable」同「n8n is unavailable」兩句都啱而且必須唔同;contract 係**失敗類別**(兩邊都 503)唔係字眼 ②**唔要求 replay 相同**(見下)
- [x] 🔴 **replay 分岔明文釘死**:Graph `assigned` / n8n `already_assigned` 各自 assert。有人日後「統一」佢哋(Graph 側加 probe,或者抹走 n8n 嘅分辨)就會紅,逼佢返去睇 OQ-1 而唔係靜靜推翻
- [x] `no_seats` 兩個 provider 都產生唔到 —— **獨立一條 test** 釘住(union 有個成員冇實作返過,唔解釋就似漏咗)
- [x] **fails-before 實證**:令 n8n 個 `not_synced` 返 non-null(= 最痛嗰個分岔,會令 sync gate 個 400 唔再觸發、未 sync 嘅 user 被當成已 sync)→ **只有嗰條紅,其餘 9 條綠** → 還原(`grep` = 0)
- [x] ➕ **刪走自己寫嘅一條廢話 test**(`expect([...]).toHaveLength(2)` 永遠綠)—— 佔住 test count 但**冇可能失敗**,係噪音唔係覆蓋

## F3 — `n8n-license` connector

- [x] 非機密欄落 `ConnectorConfig`(**`licenseOpsProvider` + `n8nLicenseBaseUrl` 兩個新 column**);**`x-uop-secret` 只經 env**
- [x] 🔴 **H1 觸發並已 STOP + Chris approve** —— kickoff 假設「零 schema」破產:`ConnectorConfig` 係**具名 column** model 唔係 key-value bag ⇒ 加 connector **必然**要 `ALTER TABLE`。已入 plan §7 changelog D1 + **ADR-0013 實作補註**(記喺嗰度而唔止 progress,因為**下一個加 connector 嘅人會踩同一個坑**)
- [x] migration `20260728021452_w39_n8n_license_connector` 純 additive、兩個 nullable TEXT、applied、欄位實查存在
- [x] 三條 webhook path 落 `N8N_LICENSE_PATHS`(由 **workflow JSON 實讀**,唔係 ADR 轉述)
- [x] 🔴 **我之前寫「`CONNECTOR_KEYS` 自動 derive、全綠零改動」係錯判斷** —— `integration-status.service.list()` 其實係**手寫陣列**。條 test 叫 `reports all four connectors` 而佢**仍然綠**,正正因為 `n8n-license` **根本冇出現喺 `/admin/integrations`**。「test 全綠」唔等於「嘢做咗」
- [x] `list()` 補 `n8n-license` row + `n8nLicenseSelected()`(OQ-4:未配置 = **`inactive`** 唔係 `error`)
- [x] `lastSuccessAt` **刻意留 null** —— 平台冇任何嘢記錄邊個 provider 執行過 assign,而預設係 Graph ⇒ 任何時間戳都係講「有 assign 成功過」唔係「n8n work」。同 `n8n-inbound` 同一條規矩:**寧可講明個 gap,都唔畀一個似層層嘅數字令人判斷 connector 死咗未**
- [x] ➕ 把 `reports all four connectors` 改成**由 `CONNECTOR_KEYS` derive** —— **第四次**撞同一種毛病(probe G2 手抄 / TD-1 audit options 手抄 / 呢度 ×2)
- [x] **硬紅線 test**:`N8N_LICENSE_WEBHOOK_KEY` + base URL 餵入 G1 leak test,assert 序列化後零洩漏(連片段都唔准)
- [x] **fails-before 實證**:把 `lastSuccessNote` 改成真係塞個 secret 落去 → **leak test 真係紅**(連帶 note 條 test 都紅),其餘 9 條綠 → 還原(`grep` = 0)
- [x] ⚠️ **順帶揪到一個既有缺口,冇順手修**:`n8nLicenseSelected()` 同既有 `n8nSelected()` 一樣**只讀 env**,而 runtime factory 係 **DB-then-env** ⇒ 經 UI 改咗 DB override,呢個面板仍然會顯示 `inactive`。修佢要畀 `IntegrationStatusService` 攞 resolver,**同時**改埋 `n8n-outbound` 個 state ⇒ 超出 W39 範圍(H3),已寫入 progress 做 follow-up。**一次過修兩行先係啱嘅做法**

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
- [x] `BACKLOG` 己庚辛 row · 最後更新
- [x] ADR-0017 兩個「未達成」標記**精準回填**:contract test 嗰個改為已達成;**真切換未 live 驗證嗰個保留**(唔可以一次過抹走)
- 🚧 `SESSION_SUMMARY` · runbook 08(切換前置)—— **未做**;runbook 待真切換前置齊備先寫先有意義

## Verify

- [x] `npm test -w @uop/api` **499 / 499**(47 suites)· **lint 0** · **tsc 0**
- [x] **G3(修訂後)**:`schema.prisma` diff **只有嗰兩個 nullable 欄** + 一個 additive migration;**3 個 `package.json` diff = 0**(用 global `fetch`,零新 runtime dep)
- [x] 🚧 **G8 live 切換 = 明文唔做**(plan §1 誠實邊界)—— n8n 側 secret 仍 `CHANGE_ME_SHARED_SECRET` · UAT 未接通 · 平台未部署。**唔准當 pass**
- [x] `anti-patterns` 自檢(12 條全跑,見 progress retro)—— **AP-2 判 ⚠️ 而唔係 ✅**:本 phase 全程冇真 n8n,緩解得幾好都好,真切換依然係未驗

---

## Cross-Cutting

- [x] All deliverables committed to git
- [x] OQ 拍板反映入 ADR-0017 實作補註(R4)—— 五個 OQ + 一個 H1
- [x] 架構-adjacent 決定 → ADR(**無新 ADR**:ADR-0013 / ADR-0017 各加實作補註,兩份都係**收緊/補充唔推翻**)
- [x] Pending 同步 `BACKLOG.md`(R7)
- [x] `progress.md` retro + status flip
- [x] Phase N+1 trigger noted(= **辛** `TicketUpdateProvider`,號碼 **W40**)

