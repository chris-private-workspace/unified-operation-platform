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

### 🔴 未驗

- **DS-4 light + dark 真 render** —— 要起本機 stack,而 5433 同 `ai-doc-extraction-db` **硬衝突,要 Chris 批准借 port**
- **F5-6 live 驗**(改 provider → 睇 badge → 重啟 → 再睇)—— 同一個前提
- 兩個一齊做最抵
