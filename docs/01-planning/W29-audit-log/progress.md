---
phase: W29-audit-log
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed         # in-progress | closed
---

# Phase W29 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-20: Kickoff

**Action**:Phase W29 kickoff(audit rollout **item 3**)

- Templates copied from `_templates/phase/`
- `plan.md` filled,status=**`draft`**(**未 active** —— 待 Chris approve §9 三點,R1 gate)
- `checklist.md` derived from plan deliverables(F0 gate + F1 基建 + F2a/b/c 分組 hook + F3 endpoint + F4 前端 + Verify)
- Branch `feat/audit-log`,由 `main`(`3f326fb`)開出

**前置**:
- **ADR-0009 Accepted**(2026-07-20;OQ-1 記白名單 before/after · OQ-2 = P-B)
- **W28 完成**(rollout item 2)—— 權限矩陣;其 unguarded test 會**自動覆蓋**本 phase 新增嘅 endpoint,免費迴歸網
- 本 phase 完成後,Chris 四項 audit 需求全部落地(①用戶列表 ②角色 ③權限可訪問功能 = W28 ④**操作記錄 = 本 phase**)

**本 phase 定位 —— 同 W28 相反,要特別小心**:

W28 係**零行為改動**(純 derive 現有 `@Roles`)。本 phase **會 additive 改 schema、會 hook 入 6+ 個既有 write service、會改佢哋嘅 transaction 邊界**。風險高一級。

**已識別最高風險 R1**:`$transaction` 改造觸及多個既有 service。緩解 = F2 分三組(identity / auth / config+bulk)逐組 commit,**每組完成即跑全 api test,一紅即停,唔繼續落下一組**。既有 223 test 就係迴歸網。

**🔴 硬紅線 G2**:`passwordHash` / `tokenHash` 永不入 audit。做法 = allow-list(唔用 deny-list)+ 永久 blacklist 雙重保險 + **H4 test 寫喺 hook 之前**(先有網,再落刀)。

**主動提出嘅一處收緊**(plan §8):ADR-0009 Decision 5 只講 `before`/`after` 要白名單,**冇講 `metadata`**。若唔管,`metadata` 就係繞過白名單嘅逃生門。本 phase 令 `metadata` 同樣受固定 key set 約束;closeout 建議喺 ADR-0009 補註。

**Commit**:`11ad3f3` — `chore(planning): kickoff W29 audit-log (plan status=draft)`

**⏸️ 等 Chris approve plan §9 三點先開 F1**(R1)。

---

## Day 1 — 2026-07-20

### Decisions / Open-Questions Resolved（R4)

Chris 拍板 plan §9 三點 → plan status `draft` → **`active`**,R1 gate 解除。

| # | 決定 | 備註 |
|---|---|---|
| **Q1** | **記 `metadata.emailAttempted`** | 偵測撞庫 / 鎖戶排查需要。**全 phase 唯一主動寫 PII 落 `metadata` 嘅 case**,owner 明確知情 |
| **Q2** | **獨立 `/audit` 頁 + sidebar 項目** | **偏離我原建議**(我建議 Settings 第 7 tab)→ 觸發連鎖後果,見下 |
| **Q3** | **逐組 commit,做完三組先 review** | 中途任何一組令既有 test 紅 → 即停報告 |

### 🔎 Q2 連鎖後果 —— 查證後發現要補 SSOT

拍板後即刻 grep `design_handoff_licenseops/prototype/`(`full-console.html` + `IT Ops Platform.dc.html`):

> **prototype 冇 audit / activity log 畫面,亦冇對應 sidebar 項目。** 全份 handoff 得 `only auditor` 一個 role 描述字眼,唔係畫面。

所以 `/audit` = **prototype 以外嘅新畫面 + 新導航項目**。H6 判斷:

- **唔屬 violation** —— owner 已 approve 方向;實作只組合既有 primitive(sidebar item / Card / Badge / 既有表格 pattern),唔加新 token / accent / 元件類型。H6 明文允許「用既有 token 砌新畫面」。
- **但必須補 SSOT** —— F4 要更新 `design-system.md` 記低呢個係 owner-approved 嘅 prototype 外新畫面。**唔補嘅話,將來 fidelity audit 會把佢報成 drift** —— 同當年 Avatar gradient 一模一樣嘅情況(嗰次係 handoff 有但 design-system 冇寫,今次係 handoff 冇但實作有,方向相反、後果一樣)。

已同步入 plan §9.1 + §7 changelog + checklist F4。

### Done

**F0 gate 通過**(拍板 + status flip + Q2 prototype 查證)。

**F1 完成 —— schema + 白名單基建 + AuditService。**

跟 plan「**先有網,再落刀**」:H4 test 喺任何 service hook 之前就寫好並綠。

| 項目 | 結果 |
|---|---|
| `AuditLog` model | additive(`AppUser` 只加 relation field,**無新 column**)· `prisma validate` ✅ |
| migration `add_audit_log` | apply 成功 · **live DB 實查**:10 欄 + 3 index 齊,`before`/`after`/`metadata` = `jsonb` |
| H4 test | **13 條全綠** |
| 全 api test | **223 → 236**(+13),31 suites · build 0 · lint 0 |

**H4 邊界嘅三層設計**(G2 硬紅線):

1. **Allow-list 而非 deny-list** —— 冇人列過嘅欄位永遠唔會寫入。日後有人喺 Prisma model 加 column,唔會靜靜開始洩漏。
2. **永久 blacklist 覆蓋 whitelist** —— 即使有人手誤把 secret 加入白名單都擋得住。順序寫死喺 code 並加註「唔准反轉」。
3. **白名單交叉驗 test** —— 專門一條 test 掃勻每個 whitelist,assert 冇一個 key 中 blacklist。

**一個容易寫錯嘅位**(已加 regression test):blacklist 若用 substring match `password`,就會**誤殺 `mustChangePassword`** —— 佢係合法審計欄位。所以規則係「精確名 + `*Hash` / `*Secret` 後綴」,唔係 substring。

**設計決定**:
- `log()` / `logChange()` 收 **原始 entity**,白名單喺 service 內部做 —— 咁樣冇任何 call site 可以自己砌 payload 繞過 H4 邊界。
- `logChange()` 只存**變咗嘅欄**,no-op update **唔寫 row**(唔想 audit 出現一條「乜都冇改」嘅紀錄)。
- `AuditModule` 用 **@Global**(同 `PrismaModule` 一致):audit 橫跨 identity / OpCo / catalog / reconcile,逐個 module 加 imports 係純 churn,而且每次編輯都係一次碰到無關嘢嘅機會(§1.3)。

**環境**:`prisma generate` 撞到 `EPERM`(backend process 鎖住 query engine DLL)→ 停 backend → generate → build → test → 重起。已回復,`/docs/api` 200。

### Blockers
- 無(R1 gate 已解除)

### Actual vs Planned Effort
→ 全 phase 匯總見 **Retro § Effort**(F1–F4 全部低於估算,phase 由 3 日壓到 2 日)。

### Commits
- `63db61c` — docs(planning): W29 §9 拍板 → status active + Q2 連鎖後果(F0)
- `219075f` — feat(audit): W29 F1 — AuditLog schema + 白名單基建 + AuditService
- `2a60d48` — feat(audit): W29 F2a — identity 事件落 audit trail(236 → 242)
- `b0634ed` — feat(audit): W29 F2b — 登入結果落 audit trail(242 → 247)
- `b8d3c30` — feat(audit): W29 F2c 部分 — OpCo + catalog 事件

---

## Day 2 — 2026-07-21

### Done

**F2c 收尾**(`91b4c40`,今晨):`allocation.import` summary 一條(`buildLogArgs()` 入 array-form `$transaction` 同批)+ `drift.resolve`(`reconcile(actorId)` 區分人手 / @Cron:actorType `user`+`manual-reconcile` vs `system`+`scheduled`)。**F2 三組 13 事件全落地**,api 247 → 256。

**R1(本 phase 最高風險)實績**:改 6 個既有 service 嘅 transaction 邊界,**既有 test 冇一條 assertion 要改** —— 關鍵係 `$transaction` mock 傳返同一個 prisma mock,全部 `prisma.xxx.*` 斷言原封不動;F2a 試出後五個 service 照搬。

**F3 完成**(`95bd083`)—— `GET /admin/audit`:

| 項目 | 結果 |
|---|---|
| 篩選 | actorId / targetType / targetId / action / from / to;action + targetType 用 `@IsIn` 對齊 write-path 常數(typo 即 400 唔會靜靜 match 零) |
| 分頁 | limit(default 50)/ offset;**cap 100 兩重**:DTO `@Max` + service re-clamp(內部 caller 繞過 pipe 都唔會擴窗) |
| 權限 | `@Roles(ADMIN)`;controller comment 明寫 P-B 連帶義務 ①,放寬須重開 ADR-0009 |
| W28 gate 實證 | snapshot 即 fail 並捕捉 `GET /admin/audit → roles [ADMIN]` —— **新 endpoint 自動被權限矩陣攔截 review**,兩重 gate(snapshot + controller 名單)deliberate update |
| test | 256 → **263**(31 → 32 suites)· build 0 · lint 0 |
| G5 live | 三重驗證:`/me` 200 = opco.it.rhk(OPCO_IT)→ `/admin/audit` **403** → 同身分 `/license/ledger` 200 對照 |

**F4 完成**(`5c0cb24`)—— 獨立 `/audit` 頁(Q2):

- `pages/audit.tsx`:唯讀時間序表 + action / target 篩選(變更自動 reset offset)+ Newer / Older 分頁 + before→after 展開 row。**零 primary action**。403 → 「Access required」restricted state(後端 403 係真權威)。
- sidebar Administration 加「Audit log」(`canSeeAdminNav` gate;ADMIN 陣列 `tab` → `to` union,同時支援 settings deep-link 同 standalone route)。
- `lib/audit.ts` 純函數 + 7 條 test(query string 序列化 / DS-8 tone map / 13 action + 5 target type 數量 drift guard);web 85 → **92**。
- **design-system.md 新增 §6「Prototype 以外嘅 owner-approved 畫面」**登記 `/audit`(Q2 拍板出處 + 零新 token 聲明)—— 將來 fidelity audit 唔會誤報 drift(Day 1 識別嘅 SSOT gap 已補)。
- browser 驗:light + dark 實截、真數據 render(G2 兩條 row)、filter 生效、展開 diff mono render。ui-design skill 12 條全 ✅。

**G2 live 抽查**(Verify):實觸發 `PATCH /admin/users/:id` deactivate + 還原 → `/admin/audit` 見 `user.deactivate` + `user.update` 兩條 row,diff 只含 `active`,actor join 正常,**冇任何 secret 欄位**。

**G8**:git diff 核全 additive —— audit.service 只加 read path(write path 收 tx 設計不變),snapshot +1 行純新 route,sidebar refactor 行為等價。

### 過程紀錄
- 403 驗證需扮 OPCO_IT 重啟 backend(shell env `AUTH_DEV_USER_EMAIL`,唔 touch `.env`);驗完已還原 default ADMIN dev-bypass,`/me` 確認 chris.lai ADMIN。
- 期間清咗一條 orphaned backend 進程 chain(parent 已死,聽住 3100)。

### Blockers
- 無

### Commits
- `91b4c40` — feat(audit): W29 F2c 完成 — import + drift 事件,F2 三組全數落地
- `95bd083` — feat(audit): W29 F3 — GET /admin/audit 查詢 + 分頁
- `5c0cb24` — feat(audit): W29 F4 — 獨立 /audit 頁 + sidebar + design-system §6

---

## Day 3 — 2026-07-22

**未使用** —— F3 + F4 提前喺 Day 2 完成(plan §5 原排 D3),phase 兩日收。

---

## Retro

### What worked

**1. 「先有網,再落刀」—— H4 test 寫喺任何 hook 之前。**
plan 明文要求 F1 嘅 13 條白名單 test 先綠,先准 F2 郁既有 service。結果係後面每次改 6 個 service 都有一張已驗證嘅安全網;G2 硬紅線由頭到尾冇一刻處於「未驗證」狀態。呢個順序值得成為以後所有觸及 PII / secret 邊界嘅 phase 嘅預設。

**2. R1(最高風險)嘅緩解實際有效,而且成本比預期低。**
改 6 個既有 service 嘅 transaction 邊界,**既有 test 冇一條 assertion 需要改** —— 只需 arity 同 mock setup。關鍵手法係 `$transaction` mock 傳返**同一個** prisma mock,令全部 `prisma.xxx.*` 斷言原封不動。F2a 試出之後,後面五個 service 照搬。分三組逐組跑全 test 嘅節奏(Q3)令「一紅即停」隨時可執行,雖然最終冇需要用。

**3. W28 嘅迴歸網當日就派上用場。**
一加 `AuditController`,permissions snapshot 即刻 fail 並捕捉 `GET /admin/audit → roles [ADMIN]`。上個 phase 起嘅 gate **唔使等三個月**就證實咗價值 —— 同 W28 retro 記低「手寫矩陣同日就被 spike 證錯」同一個 pattern。新 endpoint 自動被拉入 review,唔靠人記得。

**4. 拍板後主動查證連鎖後果(Q2)。**
Chris 揀咗獨立 `/audit` 頁(偏離我原建議)。冇當「owner 話咗算」就直接做,而係即刻 grep prototype → 發現 handoff **完全冇**呢個畫面 → 判定屬 owner-approved 新畫面 → **F4 加咗一項交付物**(補 `design-system.md`)。呢步唔做嘅話,將來 fidelity audit 會把 `/audit` 報成 drift。

### What didn't work / unexpected friction

**1. `design-system.md` 原本冇位放呢種記錄。**
發現 gap 容易,但補嘅時候先知文件冇「prototype 以外畫面」呢個概念 —— §5 只講「加新畫面直接做,唔算 violate」,冇講**要唔要登記**。所以要新開 §6 建表。教訓:H6 一直只防「加新 token / 新 pattern」,冇防「加咗 prototype 冇嘅畫面然後冇人記得佢係批准過嘅」。§6 補咗呢個洞,以後同類情況有位落。

**2. 進程管理再次食時間。**
403 驗證要扮 OPCO_IT 重啟 backend,期間撞到一條 **orphaned backend chain**(parent 已死但仍聽住 3100),而且 `CommandLine` 讀唔到(權限),要靠行 parent chain 逐層 kill。加上兩次 cold start 各 ~30-60s。呢個坑 memory 有記,但每次形態唔同,仍然係固定開銷。

**3. 我自己一次 lint 手震。**
`queries.ts` 一行超長,prettier 報 1 error。無傷但代表我落 code 時冇跑 formatter 就當完成;應該係寫完即跑,唔係等 lint gate 捉。

### Surprises / discoveries

**1. `allocation.import` 用 array-form `$transaction`,逼出一個更好嘅 API。**
原本 `AuditService.log(tx, entry)` 假設 interactive transaction。但 import 批量 upsert 用 array form,改成 interactive 會**破壞既有 batching 語意**(§1.3:唔 refactor 冇 break 嘅嘢)。解法係加 `buildLogArgs()` —— 建 payload 但唔執行。結果係:array-form caller 都可以把 audit row 放入同一個 transaction,而**白名單仍然喺 AuditService 內做,call site 繞唔到**。呢個約束反而令 H4 邊界更硬淨。

**2. `mustChangePassword` 差啲被自己嘅 blacklist 誤殺。**
若 blacklist 用 substring match `password`,就會連合法審計欄位一齊擋。所以規則寫成「精確名 + `*Hash` / `*Secret` 後綴」,並加咗 regression test 鎖住。安全規則寫得太闊會靜靜咁減少 audit 覆蓋 —— 呢種 false positive 冇 test 係睇唔出嘅。

**3. 一次 update 一條 audit row,label 要揀「最有後果」嗰樣。**
`user.update` 同時 demote + deactivate 時,記邊個 action?決定係 **privilege change 蓋過 deactivation**,咁搜 `user.role_change` 就會返回**每一次**權限變更。完整 diff 兩邊照存,所以 labelling 唔會令資訊消失。有 test 鎖住呢個優先次序。

**4. lockout 寫兩條 row 而唔係一條。**
第 N 次失敗同「帳戶變成不可用」係兩件事;夾埋會令「呢個帳戶幾時被鎖」搜唔到。`auth.locked` 獨立一條,`actorType: 'system'`。

### Carry-overs to W30

- 🔴 **BACKLOG R7 同步未做 —— 卡 PR #9**(見下「R7 狀態」)。**呢個係唯一未完成嘅 closeout 項**。
- 🟡 **self-service 改密碼冇 audit**(H3 gap,見下)—— 等 Chris 決定。
- 🟢 **audit retention** —— ADR-0009 Decision 8.3 刻意唔做(避免過早優化),但 Decision 7 連帶義務 ③ 講明將來 retention **必須涵蓋** `AuditLog`。R7 解封後登 BACKLOG 做 candidate。
- 🟢 **FE-activity**(Overview activity feed)由本 phase **解封** —— activity feed = audit 查詢嘅一個 view,`GET /admin/audit` 已提供。屬另一個 candidate,唔喺本 phase。

#### 🟡 發現咗一個 scope gap,冇擅自補(H3)

ADR-0009 Decision 4 個 13 事件清單有 `user.password_reset`(**admin 重設**別人密碼),但**冇 self-service 改密碼**(`AuthService.changePassword`,AUTH-4c-A)。

改自己密碼一樣係安全事件,照計應該審計。但佢**唔喺 approved 清單**,加咗就係擅自擴 scope(H3),所以我冇做。技術上係一行嘅事(`AuditService` 已 @Global,`AUDIT_ACTIONS` 加一個 key)。**畀 Chris 決定**要唔要補;要嘅話建議當 trivial change 做,唔使開 phase。

#### 🔴 R7 狀態 —— 卡 PR #9,唔係漏做

`BACKLOG.md` 嘅 W29 更新**未做**,原因係查證後發現真衝突:

`docs/w28-closeout`(**PR #9,待 Chris review**)嘅 commit `955ddd3` 改嘅正正係同一批行 —— header「最後更新」、新增 W28 row、`AUDIT-2` row、**`AUDIT-3` row**(= W29 要 flip 成完成嗰行)。喺 `feat/audit-log` 改會:

1. 兩個 branch 改同幾行 → **必然 merge conflict**;
2. 中間態自相矛盾 —— BACKLOG 會寫住「W29 完成」但「W28 進行中」。

**建議**:PR #9 merge 之後,一個 commit 同時 sync W28 + W29(`AUDIT-3` → ✅ 完成、W29 入進行中表、header 更新、audit retention 登 candidate、FE-activity 標解封)。呢個順序令 BACKLOG 任何時刻都自洽。

> 呢項喺 checklist 標 🚧 而唔係跳過(PROCESS sacred rule:未勾項唔可刪,要標理由 + target)。

### ADR triggers

- **無新 ADR** —— ADR-0009 已完整涵蓋(H1 觸發嘅 schema 改動事前已 Accepted)。
- **ADR-0009 已補註**(本 closeout):Decision 5 加咗「`metadata` 同樣受固定 key set 約束」實作補註。明文寫住係**收緊唔係推翻**,故唔需新 ADR(CLAUDE.md §6);出處 plan §8。

### Phase Gate result

| # | Criterion | 結果 |
|---|---|---|
| G1 | Migration additive,零 breaking | ✅ `AppUser` 只加 relation field,無新 column;live DB 實查 10 欄 + 3 index |
| G2 | **`passwordHash`/`tokenHash` 永不入 audit** | ✅ **硬紅線過** — 13 條 H4 test(含餵完整 `AppUser` assert 唔含 secret 字串)+ live DB 抽查兩條真 row |
| G3 | 13 個事件全部真係寫低 | ✅ 13/13,每個有「真係寫低」test(唔止唔 crash) |
| G4 | audit 與主操作同一 transaction | ✅ rollback test 證主操作失敗 → audit 唔留低 |
| G5 | 非 ADMIN → 403 | ✅ 三重驗證:`/me` 200 = opco.it.rhk(OPCO_IT)→ `/admin/audit` **403** → 同身分 `/license/ledger` 200 對照 |
| G6 | 前端 light + dark | ✅ browser 實截兩個 theme + 真數據 render + filter + 展開 |
| G7 | build + lint + test 全綠 | ✅ api **263**(31→32 suites)· web **92** · build 0 · lint 0 |
| G8 | 零既有行為改動 | ✅ 既有 test 全綠 + `git diff` 核全 additive(read path 新增 / snapshot +1 行 / sidebar refactor 行為等價) |

**8/8 pass。**

### Effort — actual vs planned

| Deliverable | Planned | Actual | Variance |
|---|---|---|---|
| F1 | 3h | ~2.5h | −0.5h |
| F2 | 6h | ~5h | −1h(R1 緩解成本低過預期) |
| F3 | 2.5h | ~1.5h | −1h(W28 gate 幫手捉到 review 點) |
| F4 | 4h(+0.5 SSOT) | ~3.5h | −1h |

Phase 由 3 日壓到 **2 日**收。

### Phase status

- Closeout commit:_(本 commit)_
- Frontmatter status → `closed`(plan / checklist / progress 三份)
- **BACKLOG R7:🚧 卡 PR #9** —— 見上「R7 狀態」,唔係漏做
- Phase W30 kickoff trigger:**INTEG-1**(connector 狀態 + test connection,rollout item 4)—— 但**建議先處理 PR #9 merge + R7 sync**,再開新 phase

---

**End of W29 progress**
