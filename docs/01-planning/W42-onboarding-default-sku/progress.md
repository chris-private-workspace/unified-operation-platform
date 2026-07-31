---
phase: W42-onboarding-default-sku
plan_ref: ./plan.md
checklist_ref: ./checklist.md
last_updated: 2026-07-31
---

# W42 — Progress

## Day 1 — 2026-07-31 · kickoff + pre-doc

**背景**(Chris 原話兩個問題):n8n 側未接通 ⇒ 收唔到 ServiceNow onboarding 資料 ⇒ 平台做唔到端到端測試;同時業務方要求「所有 user onboarding default 需要 E5,即使 SN 個 requested item 一行 licence 都冇」。

**分類判斷**:兩塊工作(fixture 純 dev tooling · default 注入觸發 H1)。原本 propose 拆兩個 change,**Chris 揀一併做 phase**。⇒ **W42**,配 **ADR-0020**(H1)。

**Grounding**(落 plan 前實讀 / 實測,唔靠記憶):

| 讀咗 / 跑咗 | 攞到嘅嘢 |
|---|---|
| `intake.service.ts` | canonical intake **零外部依賴**(純 DB 寫)⇒ fixture 唔使等 n8n;收 0 行 line item 已經 work,唔使改 |
| `intake-adapter.service.ts` | native 路線**要真 ServiceNow**(REQ number→sysId 反查,:172);fail-closed 哲學同其理由(:24-31) |
| `assign.service.ts:141` | 🔴 assign 前一定要 Graph `findUser` 真命中 ⇒ **端到端真正卡點唔係 n8n** |
| `assign.service.ts:339` | 冇 RITM 嘅 line item 有 fallback(work note 落 parent REQ)⇒ 注入行唔會 crash |
| 兩個 intake DTO | 兩邊都 `@ArrayMinSize(1)` ⇒ 「零 licence 行」永遠入唔到 adapter,**放寬係邏輯必然** |
| `connectors.ts` | `n8n-inbound` 現時 `editable: []`;`kind` 有 `guid` 但**只驗格式** |
| `integrations-panel.tsx:229` | `editable.map(...)` ⇒ **前端零 code 改動** |
| `GET /license/catalog`(實跑,200) | **99 個 active SKU**(SESSION_SUMMARY 寫「12」已 stale → F11)· **兩個 E5 變體並存** |

**🔴 Day 1 最重要嘅發現**:`intake-adapter.service.ts:138` 註解寫「今日 `E5` 唯一,只係因為 no-Teams 變體未 curated,係運氣唔係保證」——

實測 `Microsoft_365_E5_(no_Teams)` **已經 active 咗**。結論(今日仍唯一)仍然成立,但**理由變咗**:`findUniqueSku` 用 `equals` 唔係 contains,而 `businessAlias` 先查、只有 `SPE_E5` 帶 `E5` 呢個 alias。

⇒ default 必須指 `06ebc4ee-1bb5-47dd-8120-11324bc54e06`(SPE_E5)。**「一律 GUID 唔靠名」由紀律變成實證。**(F0b ✅,註解更正入 F11)

**Chris 四項拍板**(2026-07-31):
1. fixture **兩條路都要** —— 走 canonical 灌數據會完全繞開 adapter,而 adapter 係最新最易錯嗰舊 code
2. 注入邏輯放 **`IntakeAdapterService`** —— canonical CONTRACT(LOCKED)一個字唔郁
3. **只喺完全冇 licence 行時加** —— 有 E3 就唔加,尊重 SN 側 curation
4. default 落 **connector config**(DB + UI),**要驗真實存在** —— 原話「如果是自行填的,一定要驗證是否真實存在」⇒ 新 `kind: 'sku'`

另拍板 fail 行為 = **照收零行 + warn,唔 audit**(沿用 W41 OQ-1 裁決:配置錯屬 ops,唔屬業務 audit)。

**Gate**:G0 ✅ plan approve(draft→active)· G2 ✅ ADR-0020 Accepted · G1 **部分** —— OQ-1/OQ-3 有答案,**OQ-2 仍 open**。

**🚧 OQ-2(未答,阻塞驗收唔阻塞實作)**:成個 CH-B 建基於「n8n 喺 SN 零 licence RITM 時會 POST 一個**空 list**」呢個**未證實前提**。若 n8n workflow 其實根本唔 POST(自己 filter 咗),ADR-0020 落地咗都永遠唔會觸發。**要同 n8n 側對。**

**Branch**:PR #58 已 merge(實測 `mergedAt` 2026-07-30T15:02:21Z),main = `be24b3f` ⇒ 從 main 開 `feat/w42-onboarding-default-sku`。

**Day 1 產出(pre-doc)**:`plan.md`(v1.0 active)· `checklist.md` · `docs/adr/0020-*.md`(Accepted)· ADR README index。

---

## Day 1(續)— 2026-07-31 · F2–F9 實作

**完成**:F1–F9。api test **651 → 661**(59 suites 全綠)· lint **exit 0**。

### 🔴 最重要:fails-before 揭穿咗一個假驗證

寫完「重推唔重複 audit」嗰條 test,先拆走 `preExisting` guard 驗佢會唔會紅 —— **23 個 test 全部仍然綠**。

原因:我 mock 第二次 push 返 `{ id: 'r1', lineItems: [] }`,而 `auditInjection` 入面一個 defensive `if (!line) return` 就撞啱擋住咗。但真實情況係 `findByReq` 用 `include: { lineItems: true }`,existing request **一定帶住第一次注入嗰行**,`find` 會命中 → 寫第二行重複 audit。

**mock 唔真實 → 假通過。** 修正 mock 後再拆 guard:`Expected 1, Received 2` ✅ 真紅;還原 guard → 23/23 綠。

⇒ 順手證明 `preExisting` guard 唔係多餘 code。要唔係做咗 fails-before,交出去嘅係一個**保護唔到嘢嘅防重複 audit**,而佢守護嘅正正係 W41 F8d 修過嗰種誤導性 audit 行。呢個對應 memory `feedback_verification-that-proves-nothing`。

### ⚠️ 發現既有 gap(唔屬本 phase,冇擅自改)

`AUDIT_FIELD_WHITELIST.ConnectorConfig` 只列 6 個 column,但表已有 11 個。缺:`licenseOpsProvider` · `n8nLicenseBaseUrl` · `ticketUpdateProvider` · `n8nTicketWebhookUrl` · `acsSenderAddress`。

⇒ W39 / W40 / CH-011 嘅 connector 配置改動,`before`/`after` 一直被 `pickAuditFields` **靜靜 drop**(audit 行仍在,內容空)。只加咗自己嗰個 `defaultOnboardingSkuId`;其餘**冇掂** —— 該處註解自己講「adding a line here is a privacy decision」,唔係實作者可以順手決定。**待 Chris 決定要唔要開 BUG 單。**

### 🎁 test 主動捉到我一次

`integration-status.service.spec.ts` 有個 registry 強制「任何新 connector env key 都要納入 leak 測試」。加 `DEFAULT_ONBOARDING_SKU_ID` 即刻被 assert 捉住 —— 呢個設計值得記低:**佢令「靜靜加一個 env key 而唔驗漏唔漏」變成做唔到**。

### 其他

- `validate()` 由 sync 改 async(`kind: 'sku'` 要查 catalogue),22 → 26 test 全過,無一條要改。
- 抽 `GUID_RE` 做常數(`guid` 同 `sku` 兩處共用)。
- **前端零 code 改動**已核實:`integrations-panel.tsx:229` data-driven,前端亦冇 `kind` union type。
- H4 核對:所有新 log 只帶 REQ number / SKU part number,**零 UPN**。

---

## Day 1(續)— F10 live 驗證

**環境**:mock SN `8980` + API `3101`(`node dist/main`,dist 由 3100 個 `nest start --watch` 維護 —— 實測 dist 已含新 code,所以**唔使自己 build**,避開 `tsbuildinfo` 陷阱同 race)。全程**冇掂 owner 跑緊嘅 3100 / 5173**。

| 驗 | 結果 |
|---|---|
| connector 真返新 field | `n8n-inbound → defaultOnboardingSkuId (unset)` ✅ |
| 未配置 + 空 licence list | **`201`**(唔係 400 ⇒ D5 放寬生效)· **0 行** · `WARN` 零 UPN · **audit 零新行**(baseline 24) |
| 寫入驗證 | `E5` → 400 `must be a GUID`(shape-first)· 不存在 GUID → 400 `no SKU with id … exists in the catalogue` · 真 SPE_E5 → **200** |
| 配置後 + 空 licence list | **`201`** · **1 行** · line item id `cms8bwvwr…` **同 audit `targetId` 逐字對上** · `ritmSysId=null` · meta `SPE_E5` / `source=n8n-intake` / **`actor=null`** |
| 有 licence 行(canonical×2 + native×2) | 每張 **1 行**(唔係 2 行)· audit 不變 ⇒ 冇亂注入 **且 canonical 行為不變** |
| 重推同一 REQ | `201` 返 existing · audit **26 → 26** ⇒ `preExisting` guard **live 生效** |

**兩個過程中嘅自我糾正**:
1. 第一次 PATCH connector 四個 case 全部 400,睇落似「驗證 work」—— 但訊息係 `values must be an object`,**body shape 錯**,四個 case 一個都冇真正跑到驗證。改對 body 才見到真訊息。⇒ **400 唔等於驗證 work,要睇訊息。**
2. 用咗一次 bash `grep` 讀 test output,**違反 H8**,即時改用 Grep 工具。

**Cleanup**:清 5 張 fixture request(4 line items),**保留 `sys-REQ46525400`** —— 佢就係「平台自己加咗一行 E5」嗰張,留畀 owner 喺 UI 睇。harness 兩個進程已停,`3101`/`8980` 回 FREE,`3100`/`5173` 未動。

🚧 **UI 目視(light+dark,H6)未做** —— 交 owner。3100 已跑最新 code 且同一 DB,所以 `http://localhost:5173/settings` → Integrations 直接睇得到。
