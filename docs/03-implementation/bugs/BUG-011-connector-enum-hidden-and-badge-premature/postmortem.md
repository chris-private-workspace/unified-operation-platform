# BUG-011 — Postmortem

> **點解 Sev3 都寫**:PROCESS §4.4 話 Sev3「encouraged **if recurring**」。本單同 **BUG-005** 係同一族嘅第二次 —— 監控面同 runtime 講唔同嘢。而更值得寫嘅係:**BUG-005 個修法本身係啱嘅,佢留低嗰條規則亦係啱嘅,但條規則唔完整,而個缺口啱啱好夠大去裝得落呢個 bug。**

## 1. 發生咗咩

Operator 喺 Azure DEV 把 license assign 由 Graph 轉去 n8n,之後**以為轉唔返去**。

後端由頭到尾冇壞。轉得返。兩個獨立缺陷令「轉唔返」成為一個完全合理嘅結論:

1. **合法值從未離開後端** ⇒ 想轉返「直接 integration」自然打 `direct`(另外兩個 seam 就係咁),被 400 頂返
2. **Badge 一 Save 就翻轉** ⇒ 但 runtime 要重啟先換,所以「已經轉咗」同「未轉到」兩個結論都有畫面支持

## 2. 🔴 點解 BUG-005 個修法擋唔到

BUG-005(panel 讀 env / runtime 讀 DB)修好之後,喺 code 入面留低一條規則:

> 「whatever decides the route at runtime is what this panel must ask. **Not a copy of the same logic — the same call.**」

**呢條規則被完整執行咗** —— `n8nLicenseSelected()` 真係打同一個 `connectorConfig.resolve(...)`,唔係一份 copy。

問題係:**條規則講咗要問邊個 call,冇講幾時問。**

而 ADR-0013 C2 令「幾時」變成決定性 —— factory boot 叫一次,panel 每次 request 叫一次。**同一個 call,兩個時間點,兩個答案,而只有一個描述緊真正跑緊嘅 process。**

| | panel 讀 | runtime 讀 | 症狀 |
|---|---|---|---|
| **BUG-005** | env | DB(自 W34) | 行緊 n8n,panel 話 `inactive` |
| **BUG-011** | **當下** DB | **boot 嗰陣**嘅 DB | 仲行緊舊嗰個,panel 話已經換咗 |

⇒ **一條防 drift 嘅規則,自己漏咗一個維度,就會喺同一個位置製造第二次 drift。** 修法(記低 boot 決定再對比)實質上係**把「幾時」補入條規則**。

## 3. 缺陷 1 潛伏咗更耐,而佢潛伏嘅原因唔同

`kind` / `enumValues` 由 **W34**(ADR-0013 panel 落地)起就冇送去前端 —— 潛伏成半年,經過三個 phase(W39 / W40 / CH-011)加新 enum 欄,冇人發現。

**點解冇人發現**:寫 code 嗰個**知道**合法值。`connectors.ts` 就喺手邊。呢個缺陷只有**唔睇 code 嘅人**先撞到,而佢哋冇渠道 report —— 佢哋只會得出「呢個掣壞咗」然後唔再掂。

⚠️ 呢個同 BUG-009(audit 白名單漏 5 個 column)嘅潛伏機制**一模一樣**:**冇外部症狀嘅缺陷,只會喺有人特登去用嗰一刻先浮面。** 兩單都係靠一次真實操作揭出嚟,唔係靠 test。

**而呢單仲多一重**:`enum` 個 validation **一早就寫得好好**(400 + 「must be one of: graph, n8n」)。錯誤訊息本身係啱嘅、有用嘅 —— 但佢**只喺打錯之後先出現**。一個「打錯先教你」嘅設計,對一個**根本估唔到要打乜**嘅操作員嚟講,等於冇。

## 4. 修咗啲乜（機制,唔係症狀）

| 缺陷 | 症狀式修法(**冇做**) | 實際修法 |
|---|---|---|
| 1 | 喺 placeholder 打「graph or n8n」 | 把 `kind`/`enumValues` 由 spec **derive** 出去,前端按 kind 分流 ⇒ 將來加 enum 欄自動有 |
| 2 | 喺 badge 旁邊寫一句「可能要重啟」 | **記低 boot 實際揀咗邊個**,對比當下配置 ⇒ 講得出係咪真係 pending |

兩個修法都係「由單一來源 derive」,唔係「加多一個地方講同一件事」—— 因為後者正正係呢族 bug 嘅成因。

🔴 **兩個明文冇做嘅嘢**:
- **冇統一三個 seam 嘅 enum 值**(把 `graph` 改成 `direct`)—— breaking change,現有 DB / env 值會失效,要 Chris 拍板
- **冇改 boot-once 語義** —— 改成每次 call resolve 會解決缺陷 2,但嗰個係 H1,要 ADR

## 5. 一個差啲喺修 bug 途中製造嘅新 bug

把文字框換成 select 嗰陣,**差啲攞走咗「清空 = 清 DB override」呢個能力** —— 文字框清得空,一個只有兩個 option 嘅 select 清唔到。而「清空」正正係**轉返去 Graph 嘅第二條路**。

⇒ select 加咗一個 `value=""` 嘅 `Use environment default`,並且有 test 釘住。

**教訓**:把一個 generic control 換成一個 specific control,會**靜靜咁刪走 generic control 附帶嘅能力**。呢啲能力通常冇人寫落 spec,因為佢哋係免費附送嘅。

## 6. 🔴 修法自己再中一次同族錯誤（live 驗揭）

缺陷 2 改好、三層 test 全綠、tsc 0 之後,live 攞第一個 API 回應 —— **`pendingRestart` 整欄唔存在**。

`IntegrationController.list()` **逐個欄砌回應,明文唔用 spread**(ADR-0013 D2)。我加咗欄落 read-model,冇加落 controller。而三層 test 全部睇唔到:service spec 打 service、UI test 自己砌 fixture、DTO 冇宣告嗰個欄所以 tsc 唔返佢**完全合法**。

⇒ **同 W45 `apiPatch` 一模一樣,同一日第二次。** 兩單嘅共同形狀:

> **每一層 test 都喺自己嗰層邊緣停低,而 bug 就住喺兩層之間。**
> 冇任何一條 test 係錯嘅;佢哋加埋一齊嘅覆蓋面**睇落**係完整,實際上中間有條縫。

⚠️ **值得記嘅係:呢個 D2 安全設計本身冇錯,而且應該保留。** 「逐個欄砌」正正係佢想要嘅效果 —— 擴大回應永遠要有人特登做。代價係**新欄唔會自己流出去**,而呢個代價之前冇人寫低過。而家寫低咗,並且有 `integration.controller.spec.ts` 守住。

### 而第一版 guard 都係假嘅

新 controller spec 寫咗「唔准 drop 任何 read-model 欄」,用 `expect(out).toHaveProperty(key)`。拆走 controller 嗰行做 falsification ⇒ **佢仍然綠**,因為 `pendingRestart: undefined` 一樣有嗰個 key。改成 `toHaveProperty(key, value)` 之後再拆 ⇒ 2 條紅。

🔴 **今日第三次同族**(CH-023 tautology → status `expect(false)` 嗰批 → 呢個)。同一句話:

> **一條 assert 睇落嚴唔嚴謹,同佢捉唔捉到嘢,係兩件事。唯一分辨方法係拆走實作睇佢紅唔紅。**

## 7. Action items

- [x] 三個 factory 嘅 fail-safe test 逐條保留,並各加一條「記 effective 唔記 raw」
- [x] `describe()` 加一條**由 inventory derive** 嘅 test —— 新 enum 欄漏咗會自己紅
- [x] **RISK_REGISTER → 新增 `R9`「監控面講嘅嘢同 runtime 實際做緊嘅唔同」**。🔴 **Chris 2026-08-10 拍板提早升級,冇跟 R5 個「第三次先升級」先例** —— 理由:R5 三次散落三個唔同 vendor 路徑,而呢兩次出喺**同一個 panel、同一組 seam、同一個 method**(`n8nLicenseSelected()` 本身就係 BUG-005 個修法)。同一個位置連續錯兩次,第三次唔值得等
- [x] Live 驗 + light/dark 真 render —— 全部做完(見 progress)。**live 第一個回應就揭咗 §6 嗰個 controller 缺口**,證明呢一步唔可以省
- [x] 新開 `integration.controller.spec.ts` 守住 service → DTO 之間條縫
- [x] ⚠️ **同族第三個接縫仲未有守門**:`apiGet` 一樣冇帶 `detail`(W45 刻意冇改,因為現時冇 caller 需要)。**「冇 caller 需要」係今日成立嘅事實,唔係結構保護** —— 下次有 caller 需要嗰陣,會係同一種靜默失敗。
  ⇒ **2026-08-11 已登記做 BACKLOG `TD-2`(E 區持續技術債)**,連解封條件一齊寫低:做嘅時候 test **一定要落 transport 層**。🔴 **本單唔喺度修** —— 冇 caller 就冇得驗,而「改咗但冇人證明佢有效」正正係呢一族 bug 嘅成因。
