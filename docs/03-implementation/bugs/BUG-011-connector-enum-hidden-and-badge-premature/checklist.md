# BUG-011 — Checklist

> **Status**: `done` —— code + test + **live 驗 + light/dark 真 render 全部收**(2026-08-10/11)。
> 決策依據 = `report.md`。🔴 **冇改 ADR-0013 C2 boot-once 語義**(嗰個係 H1)。

## F0 — 開單

- [x] F0-1 查現有最大編號 —— **BUG-010**(⚠️ `Glob **/BUG-*` 零命中係**工具只返 file 唔返 directory**,唔係「repo 冇 BUG folder」;要用 `bugs/**/report.md`)
- [x] F0-2 `report.md`(symptom / root cause / repro / impact / **Sev3**)
- [x] F0-3 覆核用戶提供嘅六個斷言 —— **全部成立**,另加三個發現(見 progress)
- [x] F0-4 BACKLOG 加 `BUG-011` row(R7)

## F1 — 缺陷 1 後端:把 enum metadata 送出去

- [x] F1-1 `ResolvedField` 加 `kind` + `enumValues?`
- [x] F1-2 `describe()` 三個分支(db / env / unset)都帶埋 —— **unset 嗰個最緊要**
- [x] F1-3 🔴 **H4 覆核**:`kind` / `enumValues` 係 `connectors.ts` 嘅公開靜態常數 ⇒ 唔違反 ADR-0013 D2/D5。`secrets[]` 一個字冇郁
- [x] F1-4 OpenAPI DTO —— 🔴 **我一開始標 N/A,係錯嘅**。`ConnectorFieldDto` **確實存在**,而佢一直冇宣告 `kind`/`enumValues`;兩個欄實際有出街只係因為 `config:` 嗰行直接用 service 結果 ⇒ **OpenAPI 一直講緊大話**。已補宣告(`enumValues` 用 `readonly string[]` 對齊 spec 常數)

## F2 — 缺陷 1 前端:enum render select

- [x] F2-1 `ConnectorField` 加 `kind` + `enumValues`
- [x] F2-2 按 `kind === 'enum'` 分流到**既有** `Select`(`components/ui/select.tsx`)
- [x] F2-3 🔴 **保住「清空 = 清 DB override」** —— select 加 `value=""` 嘅 `Use environment default`,有 test 釘住(送 `null`)
- [x] F2-4 三個 seam 共用同一條 render 路徑 ⇒ **一次過三個都修好**
- [x] F2-5 H6 `ui-design` 12 條自檢 —— **11 條 ✅ / 1 條未驗**(DS-4,見 F5-6)。DS-5 標 N/A:native `<option>` 冇得跨瀏覽器逐個 style,而既有文字框顯示同一批值時一樣唔係 mono

## F3 — 缺陷 2:分開「配置咗咩」同「runtime 而家係咩」

- [x] F3-1 新增 `SeamRuntimeRegistry`(internal helper —— 唔係新 module、唔改邊界)
- [x] F3-2 三個 factory 各自 record(seam ② / ④ 喺 `integration.module.ts`,seam ① 喺 `fulfilment.module.ts`,經既有 export 跨 module)
- [x] F3-3 🔴 record **effective 值唔係 raw 字串** —— 有專屬 test(`'N8N'` → 記 `false`)
- [x] F3-4 `IntegrationStatusService` 加 `pendingRestart`
- [x] F3-5 `ConnectorStatus` DTO + 前端 type 加欄
- [x] F3-6 panel 用**既有** `Badge tone="warn"` 出 `Pending restart`
- [x] F3-7 🔴 **factory 保持 boot-once** —— resolve 時機一行冇改;`state` 語意亦一個字冇改(ADR-0010 D3 / BUG-005 修法照舊)

## F4 — Test（H5）

- [x] F4-1 `connector-config.service.spec`:`describe()` 帶 shape,三個分支 + **一條由 `CONNECTOR_KEYS` derive 嘅全覆蓋 test**
- [x] F4-2 🔴 **既有 fail-safe test 一條冇跌** —— 三個 factory spec 每條 assertion 逐字不變(只加咗一個參數)
- [x] F4-3 `integration-status.service.spec`:`pendingRestart` 六條(一致 / 轉去 n8n / **轉返 graph** / 三個 seam / 冇 boot 答案 / 冇 seam 嘅 connector)
- [x] F4-4 🔴 **falsification 真跑** —— `record()` 改 no-op ⇒ **7 條紅 / 927 綠**,數字精確對得上(4 條 factory「記 effective」+ 3 條 status `expect(true)`)。還原後 **934 全綠**
  - ⚠️ **順帶學到嘢**:3 條 `expect(false)` 嘅 status test 喺 no-op 之下**仍然綠** —— 佢哋單獨證明唔到 registry 有效,要同 `expect(true)` 嗰幾條**成對**先有意義(同 CH-023 個 tautology 教訓同族)
- [x] F4-5 前端:enum 出 select + option 集合逐字 assert + 清空 option 存在 + 非 enum 仍係文字框 + pending badge 有/冇

## F5 — 收尾

- [x] F5-1 `npm run lint`(root)**exit 0** · api tsc **0** · web tsc **0**
- [x] F5-2 既有 test 一條冇跌 —— api **921 → 934** · web **288 → 293**(⚠️ 另 6 條 **pre-existing** 紅 = `WEB-TEST-JSDOM`)· web lint **16 problems = BACKLOG 記錄嘅同一批**,本單零新增
- [x] F5-3 `postmortem.md` —— 🟡 Sev3 但 **recurring**(BUG-005 同族第二次)
- [x] F5-4 BACKLOG(R7)+ `progress.md`
- [x] F5-5 RISK_REGISTER **新增 `R9`** —— Chris 2026-08-10 拍板**提早升級**(冇跟 R5「第三次先升級」先例,因為兩次出喺同一個 panel / 同一組 seam / 同一個 method)
- [x] F5-6 🔴 **live 驗 + DS-4 真 render 全部做完** —— Chris 批准借 5433。**而 live 第一個回應就揭咗 F6**

## F6 — 🔴 live 揭出嘅第二個缺口（同 W45 `apiPatch` 同一日第二次）

- [x] F6-1 `pendingRestart` **喺 API 回應根本唔存在** —— `IntegrationController.list()` 逐個欄砌、明文唔 spread(ADR-0013 D2),我加咗欄落 read-model 冇加落 controller
- [x] F6-2 三層 test 全綠仍然捉唔到:service spec 打 service · UI test 自己砌 fixture · DTO 冇宣告嗰個欄 ⇒ tsc 唔返佢**完全合法**
- [x] F6-3 修:DTO 加 `pendingRestart` + 補 `kind`/`enumValues` · controller 加一行
- [x] F6-4 **新開 `integration.controller.spec.ts`** 守住 service → DTO 條縫
- [x] F6-5 🔴 **第一版 guard 自己都係假嘅** —— `toHaveProperty(key)` 對 `undefined` 一樣 pass,falsification 一跑就穿(只 1 條紅)。改 `toHaveProperty(key, value)` 後再拆 ⇒ **2 條紅**。**今日第三次同族**
- [x] F6-6 guard 靠 `row: ConnectorStatus` 嘅 type 標註自我維持(read-model 加 required 欄 → fixture tsc 紅 → 人被逼經過呢度)

## F7 — 環境還原（有手尾，已修）

- [x] F7-1 `docker stop ai-doc-extraction-db` 借 5433(Chris 批)
- [x] F7-2 🔴 **還原一度失敗而且係「靜靜失敗」** —— `docker start` 撞正 `uop-postgres` 未停,之後即使停咗 UOP、`docker restart` 都唔會重新 attach port。container `healthy` · DB 內部 `accepting connections` · `inspect` 見到 `PortBindings` 仲喺 —— **但 host 5433 零 listener**。⇒ 正正係 restart-stack skill 硬規則 3 記低嗰個形狀,今次自己踩返落去
- [x] F7-3 Chris 批准後 `docker compose up -d postgres` recreate 修好,**真 TCP connect 驗 = CONNECTED**(唔係睇 health flag)
- [x] F7-4 UOP stack 已停(交返 5433);要再用打 `/restart`,但**兩個項目同時只可以有一個 5433**
