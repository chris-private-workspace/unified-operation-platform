---
change_id: CH-011
spec_ref: ./spec.md
status: blocked          # blocked | ready | in-progress | done
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

## Day N — (待開工)
