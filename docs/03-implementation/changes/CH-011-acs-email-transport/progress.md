---
change_id: CH-011
spec_ref: ./spec.md
status: in-progress      # blocked | ready | in-progress | done
last_updated: 2026-07-29
---

# CH-011 — Progress

> During-execution log。每個 commit 對應一個 Day-N entry(PROCESS R2)。

## Day 0 — 2026-07-29(開單,未開工)

### 做咗咩

**唔係實作,係開單 + 查證。** 本 change 而家 `blocked`,零行 code。

**查證(真跑,唔係推論)**:

| # | 查咩 | 結果 |
|---|---|---|
| 1 | 平台有冇發郵件能力 | **零** —— 全部 `package.json` 只有 `@azure/identity`(api)+ MSAL(web);`apps/api/src/` 全掃零發信 code |
| 2 | `.env` 入面嗰段 ACS 讀唔讀到 | **讀唔到** —— 第 34 行整行被 `#` comment;36/37 行係拆開嘅 `endpoint=` / `accesskey=` 片段,**冇任何 env var 名**,而且細楷(違反 §3.3 命名)。⚠️ 只查 key 名冇查值(H4) |
| 3 | AUTH-4c-C 卡咗幾耐、卡邊度 | **2026-07-13 起 blocked**,卡 transport(ADR-0006 §分階段:「SMTP / Graph `Mail.Send` 係另一未決 + IT-gated」) |
| 4 | 4c-C 要由零起幾多 | **唔使** —— `@Public()` decorator · `validatePassword()` · `USER_PASSWORD_CHANGE` audit action · `RefreshToken` opaque-token 先例 **全部已存在** |

**同 Chris 三項拍板**(AskUserQuestion,開 ADR 之前):

| # | 問題 | 決定 | 備註 |
|---|---|---|---|
| 1 | Workflow 分類 | **拆兩份** | AI 建議 Phase W41;Chris 揀拆兩份 ⇒ CH-011 = transport,4c-C 另開 |
| 2 | Scope 邊界 | **順便鋪通知底座** | ⚠️ **AI 喺選項描述入面明文 push back**(屬 over-engineering,§1.2:而家得一個 caller,第二個 caller 嘅需求仲未存在)。Chris 揀咗 ⇒ **即為決定,照做** |
| 3 | Test connection | **唔畀探** | 跟 `n8n-outbound` 先例 |

### 交付

- `docs/adr/0019-acs-email-notification-transport.md`(**Proposed**)
- `docs/03-implementation/changes/CH-011-acs-email-transport/{spec,checklist,progress}.md`(**proposed / blocked**)

### 🔴 開工前 blocking(Gate 0)

| # | 未解決 | 點解 blocking |
|---|---|---|
| **OQ-1** | **ACS sender address 有冇 provisioned?** | 冇 verified sender **一封都寄唔出**,A11 做唔到。**唯一一個平台側解決唔到嘅前置** |
| **OQ-2** | 「收件人解析」收窄成「caller 傳地址」—— approve 定推翻? | 決定底座大細 |
| **OQ-3** | 零 caller 嘅 live 證明用一次性 ops script —— 接受? | 唔接受即推翻「拆兩份」 |
| Gate | ADR-0019 `Proposed → Accepted` | H2 新 dep + H1 schema |
| Gate | spec `proposed → approved` | PROCESS R1.change |

### 判斷記錄(免得日後要重推一次)

**① 分類:AI 判 Phase,Chris 判 Change(拆兩份)。**
AI 理由 = 新 dep(H2)+ 新 schema(H1)+ 未認證 endpoint + 新前端頁 + audit 擴充,超出「改現有 feature 行為 / < 3 days」。
Chris 拆兩份之後,**CH-011 剩返嘅部分確實落返 Change 範圍**(冇 endpoint、冇前端、冇 `PasswordResetToken`)⇒ 分類成立。**4c-C 嗰半仍然係 Phase 體積**,開嗰陣要照 Phase workflow(plan + checklist + progress)。

**② 「拆兩份 + 鋪底座」合埋產生一個已知後果:CH-011 落地嗰刻零 production caller。**
呢個唔係疏忽,係拆法嘅必然結果。CH-010 啱啱先因為「冇 caller 到達得到、測唔到嘅 code」刪走 n8n 2004 client ⇒ 唔可以扮睇唔見。
**處理方式**:寫入 spec §1 開宗明義 + ADR-0019 Consequences(Negative)+ CH-011 R2。緩解**唔係技術手段**,係「4c-C 緊接住做」。

**③ 收窄咗一樣嘢,但冇靜靜收窄。**
「收件人解析」我收窄成「caller 明確傳地址」,因為推導所需嘅 policy(邊個 role 收邊類通知)**一條都未存在**,建出嚟係冇輸入嘅空殼。
**呢個收窄寫成 ADR-0019 OQ-2,交返畀 Chris approve 或推翻** —— 唔係我單方面決定咗當冇事發生。

### Next

Gate 0 五項全清 → checklist `blocked → ready` → 先開始 code。

---

## Day 1 — 2026-07-29(Gate 0 收窄至一格,仍然零行 code)

### 做咗咩

PR **#48** merged(`7ac40fd`,獨立驗證 —— `gh pr view` MERGED + `git ls-remote` 對得上,唔靠 push 命令自報)。Chris 答齊三條 OQ ⇒ **ADR-0019 `Proposed → Accepted`**。

| OQ | 答案 |
|---|---|
| **OQ-1** | **`UnifiedOperationsPortal@rci-t.com`** |
| **OQ-2** | **Approve 收窄** ⇒ ADR-0019 D3 成立,唔建收件人推導層 |
| **OQ-3** | **接受** 一次性 ops script ⇒「拆兩份」維持 |

### 🔴 一個要記住嘅發現:R1 唔係消失咗,係換咗面目

原本 R1 = 「sender address 未 provisioned ⇒ 一封都寄唔出」。地址一有,直覺會當佢消解 —— **但佢係 custom domain(`rci-t.com`)而唔係 Azure-managed(`*.azurecomm.net`)**,而兩者嘅失敗模式**唔同**:

| | Azure-managed | Custom domain |
|---|---|---|
| 依賴 | 開箱即用 | **多一層 DNS**(SPF / DKIM) |
| 壞咗點樣 | 配置錯 → 直接報錯 | **ACS 收貨但唔送達 —— API 照返 202** |

⇒ 新 R1 = **「靜默唔送達,而平台側睇落完全成功」**。而 **D5 刻意唔畀探**,即係呢個位**冇第二層守門**。

**所以 A11 收緊咗**:由「真寄一封」改成「**以收件人真係收到為準,唔係 API 返 202 就算**」。
呢個正正係 AP-1(假驗收)同 CH-008 A8(第一次係假驗)同一類陷阱 —— 202 係「ACS 收咗你張單」嘅事實,唔係「人收到封信」嘅事實。

### 代查嘅嘢(結果 + 佢證明唔到咩)

開 PR 前掃過全部 **8 個 subscription**(3 個 tenant),`CommunicationServices` + `EmailServices` **零命中**。
⚠️ **呢個證明唔到「唔存在」** —— 連接字串明明喺 `.env`,即係 resource 一定喺度。只收窄到「目前 `az` 身份睇唔到」(第四個 tenant,或者 RBAC 擋住 —— 嗰種情況 `az resource list` 返空白而唔報錯)。**最後係靠 Chris 直接畀答案,唔係靠我掃出嚟。**

### Gate 0 現況

| 項 | 狀態 |
|---|---|
| OQ-1 / OQ-2 / OQ-3 | ✅ 全答 |
| ADR-0019 Accepted | ✅ |
| **Chris approve spec** | ✅ **已 approve**(2026-07-29,spec 內容零改動) |

⇒ **Gate 0 五項全清**,`blocked → in-progress`。R1 pre-doc 要求已滿足,可以開工。

### Next

按 spec §2.1 D1→D6 落地:dep → `EmailService` + boundary → template 機制 → connector + additive migration → H4 三條邊界(全部要 test)→ 失敗佇列接線 → ops script live 驗(A11,**以真係收到為準**)。

---

## Day N — (待開工)
