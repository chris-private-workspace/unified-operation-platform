# BUG-011 — Progress

## Day 1 — 2026-08-10（triage + 兩個缺陷都修好,淨低真 render 驗）

### 覆核先於落手

報告提供咗六個機制斷言並註明「唔使再查,但值得覆核」。**六個全部覆核到**:

| 斷言 | 實測 |
|---|---|
| 一個掣管三個動作(seam ②) | ✅ `license-ops.provider.ts` 抽象包住 `listTenantSkus`/`findUser`/`assignLicense` |
| `n8n-license` = `graph`\|`n8n`,另外兩個 = `direct`\|`n8n` | ✅ `connectors.ts:217-247` |
| `describe()` 剝走 `kind`/`enumValues` | ✅ `ResolvedField` 只有 4 個欄 |
| 前端 `ConnectorField` 冇呢兩個欄 | ✅ `api-types.ts:516` |
| factory boot-once | ✅ `integration.module.ts` `useFactory` |
| status 用同一 resolver 即時讀 DB | ✅ `integration-status.service.ts:207` |

**另加三個發現**:

1. 🔴 **panel 唔係「零提示」** —— `integrations-panel.tsx:271-273` 一早有一句 static「Changes take effect after the API restarts.」。⇒ 缺陷 2 嘅真正形狀係**兩個 UI 元素互相矛盾**:一句細字話要重啟,一個 `active`/`inactive` badge 已經斬釘截鐵講咗新狀態。操作員信 badge 係合理嘅 —— 佢睇落係「而家點」而唔係「將來點」。已寫入 report。
2. 🟢 **`Select` primitive 一早存在**(`components/ui/select.tsx`,native `<select>` + lucide chevron + token-only)⇒ H6 唔使引入新 pattern。
3. 🔴 **第三個 factory 唔喺 integration module** —— `requestSubmissionProviderFactory` 住喺 `fulfilment.module.ts:38`。三個 seam 要一齊覆蓋就要跨 module,而 `ConnectorConfigService` 一早就係咁 export 過去,照跟。

### ⚠️ 我中途講錯過一次,即場更正

`Glob docs/03-implementation/bugs/*` 只返 `.gitkeep`,再 `Glob **/BUG-*` 零命中,我就講咗「repo 根本冇任何 BUG folder」。**錯** —— **Glob 只返檔案,唔返 directory**,而 BUG-xxx 全部係 directory。用 `bugs/**/report.md` 即刻見到 11 個。

⇒ 呢個係本 session 第 N 次「由一個唔對位嘅觀察推去一個更強嘅結論」(同 W44 Day 3 `az acr list` vs `show`、Day 7 `docker login` vs `push` 同族)。分別係今次喺**下一句就自己捉返**,冇寫入任何文件。**教訓具體到工具層面:`Glob` 唔係 `ls`。**

### 做咗乜

**缺陷 1 —— 把 enum 合法值送到操作員眼前**

- `ResolvedField` 加 `kind` + `enumValues`,`describe()` **三個分支(db/env/unset)都帶** —— unset 嗰個最緊要,因為一個被清空嘅 enum 正正係操作員最冇線索嗰刻
- 前端 `ConnectorField` 同步;`integrations-panel.tsx` 按 `kind === 'enum'` 分流到**既有** `Select`
- 🔴 **保住咗一個差啲被自己攞走嘅能力**:文字框清得空(= 清 DB override → fallback env),而一個只有兩個 option 嘅 select 清唔到。所以 select 一定要有 `value=""` 嘅 `Use environment default`。**呢個唔係新 feature,係唔准跌嘅既有行為** —— 而且佢係「轉返去 Graph」嘅第二條路
- H4 覆核:`kind`/`enumValues` 係 `connectors.ts` 嘅公開靜態常數,唔係配置值,`secrets[]` 一個字冇郁

**缺陷 2 —— 分開「配置咗咩」同「而家行緊咩」**

- 新 `SeamRuntimeRegistry`(internal helper,唔係新 module、唔改邊界):三個 factory 各自 record 自己 boot 時**實際**揀咗邊個
- 🔴 **record effective 值唔係 raw 字串**:每個 seam 都 fail-safe(非精準 `'n8n'` → default),記 raw 就會把一個從未生效過嘅 typo 顯示返畀操作員 —— **同呢個 bug 同一種謊,只係低一層**
- `ConnectorStatus` 加 `pendingRestart`;panel 喺 state badge 旁邊出一個 `warn` badge
- 🔴 **`state` 語意一個字冇改** —— 佢仍然係「配置咗咩」(ADR-0010 D3 / BUG-005 修法)。新 badge 係**加**一格資訊,唔係改舊嗰格
- 🔴 **factory 仍然 boot-once** —— ADR-0013 C2 一行都冇郁。改成每次 call resolve 會係 H1,本單明文唔行嗰條路

### Test

| | |
|---|---|
| api | **921 → 934 passed** / 69 suites |
| web | **288 → 293 passed**(⚠️ 另 6 條 **pre-existing** 紅 = `WEB-TEST-JSDOM`,`git stash` 早前已驗過係 baseline) |
| tsc | api 0 · web 0 |
| lint | root(api)**exit 0** · web **16 problems**,同 BACKLOG `LINT-web` 記錄**逐字一樣**,而且 `integrations-panel` / `api-types` **零命中** ⇒ 本單零新增 |

**三個 factory 嘅 fail-safe test 一條都冇跌** —— 佢哋簽名加咗一個參數,但每條 assertion 逐字不變。順帶各加一條:**記低嘅係 effective 值唔係打落去嘅字**。

`describe()` 側有一條**由 inventory derive** 嘅 test(掃 `CONNECTOR_KEYS` × 每個欄對 `CONNECTOR_CONFIG`)—— 將來有人加一個 enum 欄而 read-model 漏咗,佢會自己紅,唔使有人記得補 case。呢個正正係本 bug 嗰種「兩處各自維護,冇嘢逼佢一致」嘅解藥。

### Falsification 真跑過

把 `SeamRuntimeRegistry.record()` 改成 no-op ⇒ **7 條紅 / 927 綠**,而且數字**精確對得上**:4 條 factory「記 effective 值」+ 3 條 status `expect(true)`。還原後 **934 全綠**。

⚠️ **順帶暴露咗一件值得記嘅事**:另外 3 條 `expect(false)` 嘅 status test(「一致時唔 pending」/「冇 boot 答案時唔 claim」/「冇 seam 嘅 connector 唔 flag」)喺 no-op 之下**仍然綠**。佢哋單獨**證明唔到 registry 有效** —— 一個永遠返 `undefined` 嘅 registry 一樣令佢哋通過。

⇒ 佢哋要同 `expect(true)` 嗰幾條**成對**先有意義。呢個同今日 CH-023 嗰個 tautology 教訓**同族**:一條睇落嚴謹嘅 assert,可能同時被「正確實作」同「乜都唔做」滿足。**分辨方法唔係讀 test,係拆走實作睇佢紅唔紅。**

---

## Day 1（續）— live 驗,而佢即刻揭咗一個所有 test 層都捉唔到嘅缺口

Chris 批准借 5433(`docker stop ai-doc-extraction-db`),起本機 stack 做 live 驗。

### 🔴 第一件事就係:缺陷 2 嘅修法根本冇出到 API

Live 攞 `GET /admin/integrations` 嘅**第一個回應**,`enumValues` 有,但 **`pendingRestart` 整欄唔存在**。

**成因**:`IntegrationController.list()` **逐個欄砌回應,明文唔用 spread**(ADR-0013 D2 —— 令「擴大回應」永遠係一個要有人特登做嘅動作)。我加咗欄落 read-model,冇加落 controller。

🔴 **而三層 test 全部綠**:

| 層 | 點解捉唔到 |
|---|---|
| `integration-status.service.spec` | 打 service,service 真係返咗 |
| `integrations-panel.test.tsx` | 自己砌 fixture,fixture 有嗰個欄 |
| `tsc` | DTO 冇宣告嗰個欄 ⇒ 唔返佢**完全合法** |

⇒ **同 W45 `apiPatch` 嗰單一模一樣,同一日第二次**:唔係「漏咗一條 test」,係**每一層 test 都喺自己嗰層邊緣停低,而 bug 就住喺兩層之間**。

**修**:`ConnectorStatusDto` 加 `pendingRestart`、`ConnectorFieldDto` 補返 `kind`/`enumValues`(佢哋一直漏咗宣告,只係因為 `config:` 嗰行係直接用 service 結果所以實際有出 ⇒ **OpenAPI 一直講緊大話**),controller 加一行,**並且新開 `integration.controller.spec.ts`**。

### ⚠️ 而我第一版 guard 自己都係假嘅

新 spec 寫咗一條「唔准 drop read-model 任何欄」嘅 guard,用 `expect(out).toHaveProperty(key)`。

Falsification 一跑就穿:拆走 controller 嗰行之後,**只有 1 條紅,呢條 guard 仍然綠** —— 因為 `pendingRestart: undefined` 一樣係「有呢個 key」。

改成 `toHaveProperty(key, value)` 之後再拆 ⇒ **2 條紅**。

🔴 **今日第三次同族**(CH-023 tautology → status `expect(false)` → 呢個)。三次都係同一句話:**一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢係兩件事;唯一分辨方法係拆走實作睇佢紅唔紅。**

⚠️ 呢條 guard 有一個真限制,已寫落 spec:佢由 `row` fixture derive,而 fixture 標註咗 `: ConnectorStatus` ⇒ **read-model 加 required 欄,fixture 就 tsc 紅**,人被逼經過呢度。**係 TS 令佢自我維持,唔係 test 本身。**

### Live 驗結果（全部真 output）

| 步 | 結果 |
|---|---|
| baseline | 四個 seam `pendingRestart=False`;`licenseOpsProvider` 帶 `kind:enum` + `enumValues:[graph,n8n]`,而且係喺 **`source:unset`** 嗰個分支 |
| PATCH `n8n` | `state=active` **`pendingRestart=True`** ← 就係 bug 報告嗰個情境,而家畫面講得出。其餘兩個 seam 仍然 `False`(冇誤報) |
| UI(light) | `Active` + `Pending restart` 兩個 badge 並排;`Provider` 變咗 select;`Webhook base URL` 仍然係文字框 |
| UI(dark) | 同上,兩個 badge 對比足夠,select 跟 dark token ⇒ **DS-4 收** |
| select 內容 | `Use environment default` / **`graph`** / `n8n` —— 🔴 **`graph` 而家睇得到,呢個就係操作員之前估唔到嗰個值** |
| PATCH `graph` | OK,`pendingRestart=False` ⇒ **轉得返**,而且對稱點驗到 |
| PATCH `direct` | **400 `Provider must be one of: graph, n8n`** ⇒ 正正係佢撞到嗰個 400,而家 select 令佢冇可能再打得出 |
| PATCH `null` | OK,還原到 unset(本機 DB 已還原) |

### 收尾

api **937 passed / 70 suites** · web 293(另 6 條 pre-existing)· root lint 0 · api tsc 0 · web tsc 0。

⚠️ **環境還原有手尾**:交返 5433 嗰陣 `docker start ai-doc-extraction-db` 撞正 `uop-postgres` 未停而失敗,之後即使停咗 UOP、`docker restart` 都**唔會重新 attach port** —— container `healthy`、DB 內部 `accepting connections`、`inspect` 見到 `PortBindings` 仲喺,但 **host 5433 零 listener**。⇒ **正正係 restart-stack skill 硬規則 3 記低嗰個「healthy 都可以連唔到」**,今次係我自己踩返落去。Chris 批准之後用 `docker compose up -d postgres` recreate 修好,**真 TCP connect 驗過 = CONNECTED**(唔係睇 health flag)。

---

## Day 2 — 2026-08-11(merge + doc-sync,收單)

**PR #79 merged** → `main` = `8f7711a`。四個 commit 落咗 `main`(`86ed450` / `8500f98` / `50ba679` / `5314664`),`fix/connector-provider-switch` / `chore/b8-live-verification` / `feat/w44-azure-dev-deploy` 三條本地 branch 已 merge 兼刪 ⇒ **本地零 feature branch,下次由 `main` 開新條**。

**Doc-sync(R7 + CLAUDE.md §14)**:`CLAUDE.md` §0 座標 + §9 新增 BUG-011 一格 · `SESSION_SUMMARY.md` 座標 / test 數 / branch / 5433 還原陷阱 · `BACKLOG.md` 最後更新 + W44 kickoff branch 註 + BUG-011 row 標 merged。

🔴 **postmortem 最後嗰條未勾項而家有家** —— `apiGet` 冇 `detail` 已登記做 **`TD-2`**(BACKLOG E 區),連解封條件一齊寫低。**本單刻意唔喺度修**:冇 caller 就冇得驗,而「改咗但冇人證明佢有效」正正係呢一族 bug 嘅成因。⇒ 唔係「順手做埋」,亦唔係「靜靜唔做」。
