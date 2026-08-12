---
change_id: CH-024
spec_ref: ./spec.md
checklist_ref: ./checklist.md
status: closed          # in-progress | closed
---

# CH-024 — Progress

> Day-N entries + closeout summary。每 commit 對應一個 Day-N entry(R2)。

---

## Day 0 — 2026-08-12(spec + kickoff)

### Done

- Chris 一次過提五點 review → 逐點 trace 落 code 查證,**五點全部成立**
- 三個決定經 Chris 拍板:pagination 加 `«` `»` first/last · requests 頁一齊修 · badge `Headroom` → `Available`
- `spec.md` 寫好 → Chris **approve**(scope + acceptance 原樣,零 deviation)→ status `approved`
- `checklist.md` 由 spec §3 衍生
- Branch `feat/ch-024-requests-assets-ui` 由 `main`(`14dc0ee`)開出

### Decisions

- **五點合一個 CH,唔拆五個** —— 同一批 review、同一次驗證、加埋 < 1 日。拆開係官僚,而且 B / D / E 三項會撞同一批 test 檔
- **A 用 flag 唔刪 code** —— Chris 明講「暫時」;刪咗將來要靠 git history 撈返
- **C 條 event 順帶記低平台個父 REQ 號** —— 查證揭到 `schema.prisma:296-297` 刻意冇欄畀佢住(避免第二個 idempotency key 候選)⇒ 呢條 event 會係全系統唯一保存到佢嘅地方
- **outbound 路唔加同款 event** —— 佢個入口正正就係 A 要 disable 嘅 New request,加咗冇路驗。明知留低,寫入 spec §2.2 而唔係靜靜略過

### 查證過程揭到（值得記低）

1. **問題 3 唔係 UI 美化,係畫面同 schema 打對台** —— `schema.prisma:286-300` 自己寫住「mixing them up is the easiest mistake to make here」,而現行 UI **令人一定會 mix up**(只顯示 onboarding 個號,仲要出兩次)
2. **問題 4 後半係真 bug 兼自相矛盾** —— `assignable` 唔睇 line stage,而同一屏頂部 `deriveStatus` 一早啱 ⇒ 派完之後上面 `Completed`、下面 `Ready to assign`
3. **`raiseLicenceRequest` 只喺 `intakeFlat` 一條路** —— `intakeNative` / `intakeCanonical` 完全冇 call(grep 全檔確認)。⇒ 新 event 覆蓋面係「n8n 真實生產路」,唔係「所有 intake」
4. **問題 5 真正嘅落差唔係個名** —— 係 `Assigned` = 平台帳面數而唔係 M365 真實用量(`consumedUnits` 有,但表冇顯示)。呢個係 Drift 頁存在嘅理由。已寫入 spec §6,改動未批

### Blockers

- 無

### Effort

- Planned:4–6h(全單);Actual(Day 0 spec + kickoff):≈ 1h

### Commits

| Hash | Subject |
|---|---|
| _(pending)_ | `docs(planning): CH-024 spec approved + checklist` |

---

## Day 1 — 2026-08-12(實作 A–E 全部)

### Done

Checklist **A-1..4 · B-1..7 · C-1..9 · D-1..6 · E-1..2 · V-1..5** 全部 tick。V-6 / V-7 未做(見 Blockers)。

**Code(前端)**
- **新** `lib/features.ts`(`NEW_REQUEST_ENABLED = false`)· `lib/pagination.ts`(`pageWindow` / `pageRangeLabel`)· `components/ui/pagination.tsx`
- `requests.tsx`:掣 conditional + 換 pager · `router.tsx`:`requests/new` → `<Navigate replace>` · `by-opco-view.tsx`:換 pager(保留 `setEditingId(null)`)
- `lib/ledger.ts`:badge `Headroom` → `Available` · `lib/requests.ts`:新 `allLinesAssigned` + `licenceRequestNumbers`,`deriveStatus` 改用前者
- `request-detail.tsx`:三個檢查點文案 · sync row 加 `License assigned` 分支 · 新 `ServiceNowTickets` / `TicketRef` · meta row `Request` → `Ref #id` · line item 卡出 RITM · 刪 orphan `ExternalLink` import

**Code(後端)**
- `intake-adapter.service.ts`:新 private `recordLicenceRequestEvent`,喺 `raiseLicenceRequest` 最尾 call。零 schema、零 migration、零 API 契約改動

**Test**:新 `lib/pagination.test.ts`(11)· `pages/requests.new-request-flag.test.tsx`(4)· `pages/request-detail.tickets.test.tsx`(5);加落既有 `requests.gates.test.ts`(+11)· `sn-gate.test.tsx`(+2)· `intake-adapter.service.spec.ts`(+5)。改既有:`ledger.test.ts` 3 條 · `sn-gate.test.tsx` 文案 2 行。

**Doc**:`design-system.md` navigation 段(B-7 · owner-approved `«` `»` 記低)。

### ui-design skill 自檢(V-5)

| # | 結果 | 備註 |
|---|---|---|
| DS-1 token-only | ✅ | 色全部走 token(`bg-accent`/`text-accent-fg`/`border-border`/`bg-card`/`bg-hover`/`text-fg-muted`);尺寸 arbitrary px 係**照 handoff `Pagination.jsx` 實際值**(28/28/8/12)兼同既有 pager 一致,唔係 eyeball |
| DS-2 唔 eyeball | ✅ | 每個數都有出處(handoff jsx 或原 pager) |
| DS-3 單一 accent + 一 primary | ✅ | pager active 用 `bg-accent` = **handoff 原版就係咁**,而且佢係**狀態指示唔係 action**。⚠️ 留意:License Assets 進入 row edit 時會同時有 `Save`(primary)+ pager active —— **呢個係改動前一模一樣嘅情況**,本單冇令佢惡化 |
| DS-4 light + dark | ⚠️ **未驗** | 見 Blockers。零硬色值 ⇒ 結構上應該冇問題,但**冇 render 過就唔可以話驗咗**(H7) |
| DS-5 數字 mono | ✅ **修正咗一個既有缺失** —— 舊 pager 個頁碼**唔係** mono,handoff `.prompt.md` 明寫 "numbers are monospace" |
| DS-6 lucide stroke | ✅ | 用 `ChevronsLeft/Left/Right/ChevronsRight`,**冇用** handoff 個 `‹` `›` 文字 glyph(理由寫咗喺元件 comment + design-system.md) |
| DS-7 平面美學 | ✅ | 零 blur / 零 gradient / 零 colored-left-border |
| DS-8 Badge + semantic | ✅ | E 只改 label 字,`tone: 'ok'` 一個字冇郁;四個 branch 次序(CH-008 守住嗰個)完全冇碰 |
| DS-9 motion 克制 | ✅ | 只有 `transition-colors` |
| DS-10 voice / casing | ✅ | Sentence case;`Onboarding request` / `Licence request` / `AD account created` / `Synced to ServiceNow` / `License assigned` 全部短名詞 |
| DS-11 對 prototype | ⚠️ **未做** | 同 DS-4 一齊,見 Blockers |
| DS-12 唔捏造 logo | N/A | |

### Decisions

- **`«` `»` 用 lucide `ChevronsLeft/Right`,唔用 handoff 個文字 glyph** —— DS-6 喺呢個元件一樣成立,而且少一個字體相依字符。已寫入 design-system.md,免得下個 session 當佢係 drift
- **pager 收 1-based,caller 轉** —— 跟 handoff prop 契約同畫面上嘅數字一致;兩個 caller 各自喺邊界 `+1` / `-1`。喺元件入面收 0-based 會令一個元件有兩套慣例
- **`deriveStatus` 改用 `allLinesAssigned`** —— 本來可以淨係喺 detail 頁加個新判斷,但咁就係**第二份清單**(本 repo 數到第七次嘅族)。而家兩處同一個答案
- **`recordLicenceRequestEvent` 參數用既有 `SubmittedRequest` 型別**,唔手寫 inline 結構(順帶解咗 prettier)
- **meta row `Request` 改成 `Ref #id`** —— spec 冇明寫,但佢原本係 `serviceNowNumber ?? #id`,即係**同右邊 panel 印同一個號**。唔改嘅話「兩張單分開」呢個目標喺同一屏被自己推翻

### 揭到（值得記低）

1. 🔴 **spec R3 自己有個未實跑嘅推論** —— 寫住 `sn-gate:213` 會由 2 變 1。實跑**冇紅**(嗰個 fixture 係 `READY` line);真正紅嘅 `:147` / `:149` 原文冇提。**同 §9 記低嗰族(B8 / CH-023 G9)同源**,已喺 spec §4 + §7 明文更正
2. **root `npm run lint` 只跑 api** ⇒ web lint 從來未入過 gate,今日數到 **15 條 pre-existing prettier 錯**。⚠️ **呢個唔係新發現** —— BACKLOG **一早有 `LINT-web`**(CH-019 2026-08-03 揭)。我第一版落 BACKLOG 開咗條新 `TD-3` 講同一件事,**即刻自己捉返兼刪咗**,改為更新既有嗰條。📌 **三次計數 25 → 16 → 15**,每次都係「只 `--fix` 自己掂過嗰幾個檔」順帶減少 —— **真正嘅代價唔係嗰 15 條,係「root lint exit 0」一直被每份 closeout 寫成「全 repo lint 綠」**。本單一樣冇順手修(§1.3),但逐檔 lint 過本單掂到嘅 15 個檔 = exit 0
3. **兩個 falsification 都真紅**,其中 `not.toHaveBeenCalled()` 嗰條**本身就係 §9 點名嘅 vacuous 陷阱形狀** —— 拆走早退真係紅,證明佢有守住嘢
4. **`requests.new-request-flag.test.tsx` 第一版超時** —— 因為 `withFlag` 順手連 `@/router`(拉晒全部畫面)都 import 埋落 button test。單獨跑 3941ms 綠,全 suite 並行就爆 5s。拆成兩個 loader 之後 **545ms**。⚠️ **形狀值得記**:一條「單獨跑先綠」嘅 test 係最難查嗰種

### Blockers

- 🔴 **V-6 / V-7(light + dark 真 render · pager 邊界人手驗)未做** —— 要起本地 stack,而 **5433 同 `ai-doc-extraction-db` 硬衝突**(§9),要 Chris 批先 `docker stop` 佢。**H6 未收,所以本單未 done**

### Effort

- Planned:4–6h;Actual(Day 1):≈ 3.5h(未計 V-6/V-7)

### Commits

| Hash | Subject |
|---|---|
| `519a47b` | `docs(planning): CH-024 spec approved + checklist` |
| _(下一個)_ | `feat(web,fulfilment): CH-024 A-E` |

---

## Day 2 — 2026-08-12(H6 render 驗證)

### Done

**V-6 / V-7 全收**,`checklist.md` 全部 tick,status → `done`。

**驗到嘅嘢**(六張截圖喺 scratchpad `ch024-screenshots/`):

| 項 | 實測 |
|---|---|
| **A** | Requests toolbar **冇** `New request` 掣(light + dark 都係),打 `/requests/new` 個 URL **真係變咗** `/requests` |
| **B** | 第 1 頁 `« ‹` **disabled** + window `1-5`;最後一頁(7)window 移去 `3-7` + `› »` **disabled**;summary **`61–64 of 64`**(短尾頁 4 行計啱);active 掣 `font-family` 實測 **`Geist Mono`** |
| **C** | 頭部兩塊分開:`Onboarding request REQ0044200 / raised in ServiceNow — the source of this onboarding` 同 `Licence request RITM0055123 / raised by this platform, closed on assign`;meta row 變 `Ref #nazgs2`(唔再重複 REQ 號);line item 卡出 `· RITM0055123` |
| **D** | 三個檢查點 `AD account created → Synced to Azure AD → Synced to ServiceNow`;全 assigned 嗰張:頂部 badge `Completed` **同時** sync row `License assigned` ⇒ **兩者終於一致**;仲有一條 READY 嗰張維持 `Ready to assign` |
| **E** | badge `Available` 同表頭 `AVAILABLE` 欄對得返;`Fully allocated` / `Over-allocated` 一個字冇改 |
| **H6** | 三頁 light + dark 都行過,零硬色值爆,dark 對比正常 |

### 🔴 起 stack 撞咗三個坑,每個都值得記

1. **`ai-doc-extraction-db` 停咗之後自己起返** —— 10:34 `docker stop`、**10:41 又 Up**。佢係 `restart=unless-stopped`,而呢個 policy 嘅語意**就係手動停之後唔應該返嚟**。**我唔知邊個起佢**(冇亂猜),但後果係 `uop-postgres` 撞 `port is already allocated` 起唔到。⇒ **下次起 stack 之前,要驗嘅唔係「我停咗未」,係「而家邊個佔住 5433」**
2. 🔴 **`ensure-infra.ps1` 個 `[2]` 檢查有假綠燈** —— 佢報 `port 5433 (postgres) -> LISTENING`,**但嗰個 listener 係 `ai-doc-extraction-db`**。佢只問「個 port 有冇人聽」,冇問「係咪我個 container」。係 `[3]` 真連線探測(`container ... is not running`)先揭穿。**同 §9「有設定 ≠ 設定啱」、「revision Healthy ≠ DB 通」完全同源**
3. 🔴 **`Found 0 errors` + `MODULE_NOT_FOUND` 出現咗兩次,而第二次唔係 build cache** —— 真兇係**我自己開咗兩條 `nest start --watch`**(未清 `20528` 就起 `1508`)。第二條起身**清 `dist/`** → tsc 讀第一條啱啱寫低嘅 `tsbuildinfo` → 判斷「已最新」→ **skip emit** → `dist` 空。⇒ **同一個症狀,兩個唔同成因**;`kill-zombies` dry-run 印出**兩條 watch 並排**先係決定性證據,唔係再刪多次 cache

### Decisions

- **本機造 fixture 驗 pager** —— 本機 ledger 係**空**(`No allocations tracked yet`),Chris 截圖嗰 2283 行係另一個環境。造 64 行(7 頁)+ 兩張 request,**驗完即清**(`ledger_rows` 1 / `requests` 2 / leftover 0,同造之前逐個對返)。三個 SQL 檔留喺 scratchpad
- **截圖唔入 repo** —— `.playwright-mcp/` 有 gitignore,但我指定咗 filename 所以跌咗喺 repo root,移咗去 scratchpad

### Blockers

- 無 —— **CH-024 全部 acceptance 收齊**

### Effort

- Day 2:≈ 1h(其中約一半係上面三個坑)

### Commits

| Hash | Subject |
|---|---|
| `1e0d5f9` | `feat(web,fulfilment): CH-024 A-E` |
| `b7f409e` | `docs(planning): CH-024 落 BACKLOG` |
| _(下一個)_ | `docs(planning): CH-024 ✅ closed` |

---

## Closeout

### Acceptance verification

**spec §3 全部 21 條 ✅**(A1-A2 · B1-B3 · C1-C5 · D1-D3 · E1 · T1-T4 · H6)。零 partial、零 failed。

### Effort summary

| Day | Planned (h) | Actual (h) | Variance |
|---|---|---|---|
| 0(spec) | — | 1.0 | — |
| 1(實作) | 4–6 | 3.5 | −0.5 ~ −2.5 |
| 2(H6) | — | 1.0 | — |
| **合計** | **4–6** | **5.5** | 喺範圍內 |

### Lessons

**work**
- **五點合一個 CH** 係啱嘅 —— B / D / E 撞同一批 test 檔,拆五個單會重複改三次
- **兩個 falsification 都真跑** —— 尤其 `not.toHaveBeenCalled()` 嗰條,佢正正係 §9 點名「no-op 之下仍然綠」嘅形狀,唔拆走實作根本唔知佢守唔守到嘢
- **改動嗰刻抽 pure function**(`allLinesAssigned` / `pageWindow` / `licenceRequestNumbers`)—— 229 頁嘅邊界、四種 line 組合,component test 到唔到,pure test 一句就到

**didn't**
- 🔴 **spec §4 R3 寫咗一句未實跑嘅推論**(`sn-gate:213` 會由 2 變 1),而佢喺 spec 入面**讀落同已驗證嘅事實一模一樣**。實跑先知冇紅,而真正紅嗰兩行原文冇提。**同 §9 記低嗰族(B8「兩個 hostname 都打唔到」· CH-023 G9「卡 B8」)同源** ⇒ 寫 spec 嗰陣「呢條 test 會紅」呢種話,**要嘛先跑,要嘛標明係推論**
- **落 BACKLOG 開咗條重複 entry** —— `TD-3` 講嘅嘢 `LINT-web` 一早有(CH-019 就揭過)。自己捉返,但**應該落筆之前先搜**
- **一條「單獨跑先綠」嘅 test** —— `withFlag` 順手把成個 router 樹拉入 button test,單獨 3941ms 綠、全 suite 並行爆 5s。拆開之後 545ms。⚠️ 呢種 test **最難查**,因為重跑一次佢又綠

**carry-over**
- `LINT-web`(BACKLOG)—— 本單第三次數到佢,今次 15 條
- `ASSETS-IN-M365`(BACKLOG)—— 候選,未批

---

**End of CH-024 progress**
