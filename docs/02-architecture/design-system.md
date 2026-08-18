# LicenseOps Design System — 契約 (SSOT)

> **呢份係前端設計系統嘅 single source of truth。** 所有 `apps/web` 嘅 UI 都要跟呢度。
> **分工**:本檔 = 可操作契約 + 規則 + anti-drift;`design_handoff_licenseops/` = **視覺真相**(prototype + tokens);`design_handoff_licenseops/design-system/tokens/*.css` = **token 機器真相**(值以佢為準,本檔同佢有出入以 CSS 為準)。
> **強制**:CLAUDE.md §5 **H6 Design Fidelity** + commit 前跑 `.claude/skills/ui-design`。

**Status**: active · **Owner**: Chris Lai · **視覺真相版本**: `design_handoff_licenseops/`(2026-07-09)

---

## 0. 五條不可妥協 (non-negotiables)

1. **Token-only** —— 唔 hardcode 色 / 字 / 間距 / 半徑 / 陰影;唔 eyeball。一律用 `tokens/*.css` 的 CSS var(經 Tailwind theme)。
2. **單一 accent** —— Ricoh red `#E60027`(dark `#ff3355`)。一個 view **一個** primary action + active nav + link + focus ring + **active segmented-control tab**(view 切換器,非 action button —— prototype `segStyle(active)=var(--accent)`;CH-002 決策 B)。其餘狀態走 6 個 semantic tint。
3. **Light + dark 都要** —— `:root` / `.dark` swap;唔可以淨做一個。
4. **Lucide stroke icon only** —— 無 emoji / icon font / filled set;唯一多色 = login Microsoft 4-square。
5. **數字 / 識別碼一律 Geist Mono** —— seat 數、delta、request id、UPN、GUID、quote/PO ref。

---

## 1. Token 契約

引入方式:`apps/web` 原封 import `design_handoff_licenseops/design-system/styles.css`(佢 `@import` 齊 6 個 token 檔)→ Tailwind theme **引用 CSS var**(唔複製 hex),`darkMode:'class'`。

### 1.1 Colors(`tokens/colors.css` 為準)
- **Surfaces**:`--bg` `--panel` `--card` `--sidebar` `--hover` `--active` · **Borders**:`--border` `--border-strong`
- **Text**:`--fg` `--fg-muted` `--fg-subtle`
- **Accent**:`--accent`(#E60027 / dark #ff3355)`--accent-fg` `--accent-soft` `--accent-line`
- **Semantic(各配 `-soft`)**:`--ok` `--warn` `--info` `--danger` `--neutral` `--purple`
  - `purple` 專供 **AI-assist / roadmap**。

### 1.2 Type(`tokens/typography.css`)
- `--font-sans`(Geist)· `--font-mono`(Geist Mono)。
- Size:`--text-base:13.5px`(預設)· `--text-micro:10.5px`(表頭 / tag,uppercase)· 大數字 `--text-h1:22px` / display 32px · **最細唔低於 10.5px**。
- Weights 400/450/500/550/600/700 · tracking `--tracking-tight:-.02em`(大標題)/ `--tracking-caps:.06em`(uppercase label)。

### 1.3 Spacing / Radii / Layout(`tokens/spacing.css`)
- Spacing:`--space-1..12`(2px-step,2/4/6/8/10/12/14/16/18/22/24/40)· cell padding `--pad-cell-y:11px` / `--pad-cell-x:18px`。
- Radii:`--radius-md:7px`(button/chip)· `--radius-lg:8px`(input)· `--radius-2xl:12px`(card)· `--radius-3xl:14px`(dialog)· `--radius-pill:999px`。
- Layout:`--sidebar-w:248px`(collapsed `--sidebar-w-collapsed:64px`)· `--topbar-h:56px` · control heights 28/32/34/36/42px。

### 1.4 Elevation / Motion(`tokens/elevation.css` + `base.css`)
- 近乎平面 —— 深度靠 **1px border + surface tint**,唔靠 blur。`--shadow`(resting card)· `--shadow-overlay`(dialog)· `--shadow-toast` · `--ring-accent`(stepper active)。
- Motion 克制:`fadeIn`(換 view)· `toastIn`(12px rise)· `spin`(API in-flight);120–150ms;**無 bounce / scale**。
- **Gradient 只此兩處**:① login brand panel(`150deg` 深紅 + dotted radial)· ② Avatar brand variant(`135deg` `--accent`→`--accent-deep`;owner-approved 例外,2026-07-10 — handoff 原生視覺,`--accent-deep` tokenize 咗 handoff 硬寫嘅 `#8a0018`)。card/button/header 一律 solid。

### 1.5 Tailwind 映射範式
```ts
// tailwind.config.ts — 只引 CSS var,唔複製值
theme: { extend: {
  colors: { accent:'var(--accent)', 'accent-fg':'var(--accent-fg)', 'accent-soft':'var(--accent-soft)',
            bg:'var(--bg)', panel:'var(--panel)', card:'var(--card)', sidebar:'var(--sidebar)',
            hover:'var(--hover)', active:'var(--active)', border:'var(--border)', 'border-strong':'var(--border-strong)',
            fg:'var(--fg)', 'fg-muted':'var(--fg-muted)', 'fg-subtle':'var(--fg-subtle)',
            ok:'var(--ok)', 'ok-soft':'var(--ok-soft)', warn:'var(--warn)', 'warn-soft':'var(--warn-soft)',
            info:'var(--info)', 'info-soft':'var(--info-soft)', danger:'var(--danger)', 'danger-soft':'var(--danger-soft)',
            neutral:'var(--neutral)', 'neutral-soft':'var(--neutral-soft)', purple:'var(--purple)', 'purple-soft':'var(--purple-soft)' },
  fontFamily:{ sans:['var(--font-sans)'], mono:['var(--font-mono)'] },
  borderRadius:{ md:'var(--radius-md)', lg:'var(--radius-lg)', '2xl':'var(--radius-2xl)', '3xl':'var(--radius-3xl)', pill:'var(--radius-pill)' },
  boxShadow:{ DEFAULT:'var(--shadow)', overlay:'var(--shadow-overlay)', toast:'var(--shadow-toast)' },
}}
```
shadcn/ui 做底但 re-skin 用上面 token(或 alias `--primary:var(--accent)` 等);唔用 shadcn 預設調色板。

---

## 2. Component inventory

19 個 primitive(視覺真相喺 `design_handoff_licenseops/design-system/components/**`,每個有 `.jsx` + `.d.ts` + `.prompt.md`)。**handoff 的 `.jsx` 係 inline-style spec,唔照抄** —— 用 shadcn+Tailwind 重建到視覺 1:1。

| 類 | Primitives | API 慣例 |
|---|---|---|
| forms | Button · IconButton · Input · **Textarea** · Select · Checkbox · Switch · SegmentedControl | `variant`('primary'/'secondary'/'ghost'/'danger')· `size`('sm'/'md'/'lg')· 一 view 一個 primary。⚠️ **Textarea 唔喺 handoff 19 個入面** —— owner-approved 新增(W47),約束見下 |
| display | Card · StatCard · Badge · Avatar | `Badge tone dot`;`StatCard label value tone icon delta sub`(tone 只 tint icon chip,value 保持中性) |
| navigation | NavItem · Stepper · Tabs · Pagination | `Stepper steps current`(short 3-dot / procurement 6-dot,current 帶 `--ring-accent`) |
| overlay / feedback | Tooltip · Dialog · Toast · EmptyState | Dialog 45% scrim;Toast bottom-center ~2.6s(**帶 action 時要更長**,見下);EmptyState 用於 all-clear/no-results |

**Badge = 全系統通用狀態標記。Stage → tone map(必守)**:
`Ready→ok` · `Quoting / Awaiting vendor→warn` · `Requested→info` · `Blocked→danger` · `Assigned→neutral` · `AI→purple`。

> ⚠️ Tabs / Tooltip 係 handoff 額外加、未 wire 入現有畫面 —— 用嗰陣跟各自 `.prompt.md`。
> ✅ **Pagination 已 wire(CH-024 B,2026-08-12)**:`apps/web/src/components/ui/pagination.tsx`,caller = Requests 列表 + License Assets(By OpCo)。EmptyState 一早已 wire。

**Pagination `«` / `»`(owner-approved primitive 擴充,Chris 2026-08-12 · CH-024)**

Handoff 原版得 `‹` prev / `›` next + 最多 5 個 window 頁碼。**加咗 first / last 兩個掣**,約束:

- **只加呢兩個,唔加「跳去第 N 頁」輸入框 / 每頁筆數選擇** —— 加嗰兩樣就變咗另一件 control,要另外傾
- **window 仍然係 5**(`lib/pagination.ts` `PAGE_WINDOW`)—— 呢個數唔郁
- 🔴 **點解要偏離**:真實 ledger 係 **2283 行 / 10 per page = 229 頁**。handoff 個範例係 8 頁,喺嗰個規模 prev/next 夠用;229 頁之下由頭去尾要撳幾十次,等於「去唔到」
- **icon 用 lucide `ChevronsLeft` / `ChevronsRight`**,唔用 handoff 個 `‹` `›` 文字 glyph —— DS-6(icon = lucide stroke)喺呢個元件一樣成立,而且少一個字體相依嘅字符

⚠️ **改動前 229 頁係全部逐個掣 render 出嚟**(`Array.from({length: pageCount})`)。見到呢個 pattern = 未 wire 新元件。

**`Textarea`(owner-approved **新** primitive,Chris 2026-08-17 · W47 `F5-8`)**

Handoff **由頭到尾冇 textarea**(`design_handoff_licenseops` 同 `apps/web/src/components/ui` 兩邊實測零命中)—— prototype 冇一個畫面需要多行輸入。所以佢係**本系統第一個唔係由 handoff spec 重建出嚟嘅 primitive**,而呢件事本身就係最大嘅 drift 風險:冇 spec 對照,下一個人加嘅時候就會憑感覺揀值。

**⇒ 約束(違反即 drift)**:

- **每一個值都由 `Input` 抄,唔可以自己揀** —— `rounded-lg` · `border-border` · `bg-card` · `text-[12.5px]` · `text-fg` · `placeholder:text-fg-subtle` 逐個一樣。**只有三樣刻意唔同**,而三樣都係單行 field 結構上冇嘅:①`h-[34px]` → `min-h` + `rows`(高度就係佢存在嘅理由)②垂直 padding(`py-[8px]`)③`leading-[1.55]`(12.5px 文字排滿一版,行高唔開就讀唔到)
- 🔴 **`resize-y`,唔可以係 `resize`** —— 水平 resize 係瀏覽器預設,而佢容許用戶由**元件內部**把自己拉闊過個 dialog,即係話成個 console 唯一嗰條 layout 硬規矩(頁面永遠唔可以橫向捲)會被打破,而**冇任何一行 code 改動可以賴**
- **唔加 auto-grow / 字數 badge / markdown 預覽** —— 加咗就唔再係一個 field,係一個 editor,要另外傾。字數提示屬 **caller** 責任(W47 個 prompt field 用 `Field` 個 hint 顯示剩餘字數)
- **一定要有 cap,而 cap 由 caller 傳** —— 一個冇上限嘅多行輸入,喺一個會落 DB 嘅欄後面,就係一個冇人講過嘅 storage 決定

📌 **點解值得開呢個 primitive**:W47 個 `AgentProfile.prompt` 係平台第一個「人手輸入、會改變 agent 行為」嘅欄(RISK `R26`)。冇呢個 field,個 registry 就得一半 —— 而佢三道防線(audit `before`/`after` · tool allow-list 留喺 code · 8000 字 cap)本身就係為咗令呢個欄安全存在而砌。

**Toast `action`(owner-approved primitive 擴充,Chris 2026-07-31 · CH-013)**

`Toast` 可以帶**最多一個** follow-up action。約束(違反即 drift):

- **text link,唔係 button** —— toast 係 transient chrome,擺個真 button 落去會喺底下嗰個 view 讀成第二個 primary action(DS-3)。樣式 = `text-accent` + hover underline
- **最多一個** —— 問兩條問題嘅 toast 係一個扮 toast 嘅 dialog,應該用 Dialog
- 🔴 **caller 必須畀更長時間**(現行 10s vs 平常 5s)。一個未撳得切就消失嘅 action,比冇 action 更差 —— 佢教識用戶「呢個 UI 唔穩陣」
- **action 唔可以係唯一路徑** —— toast 會自動消失,所以佢背後嘅目的地必須另有正常入口(CH-013 個案:request 一樣喺 Requests 列表搵得返)

首個 caller:Settings › Integrations 匯入成功後嘅「Open request」。

---

## 3. Content / Voice(chrome 內)

- Terse、operator-facing、短名詞 label。Sentence case;UPPERCASE + letter-spacing 只用細結構 label(表頭 / nav section / category tag)。
- Toast 過去式("License assigned");in-flight 進行式("Quoting"/"Awaiting vendor")。
- 無 emoji;role context 永遠明寫 top bar("Regional — all OpCos")。
- 冇 LicenseOps/Ricoh logo 檔 —— **唔好捏造**;wordmark 用 Geist + generic stacked-bars glyph。

---

## 4. Anti-drift checklist(commit / 驗收 UI 前跑,對應 `.claude/skills/ui-design`)

- [ ] 冇任何 hardcode 色 / 字 / 間距 / 半徑 / 陰影 hex/px —— 全部經 token / Tailwind theme?
- [ ] accent 只有 Ricoh red?一個 view 只有一個 primary action?
- [ ] Light + dark 都試過(`.dark` swap 冇爆)?
- [ ] 數字 / 識別碼用 mono?
- [ ] icon 全部 lucide stroke(冇 filled / emoji / 第三方 icon set)?
- [ ] 無新 gradient(除 login + Avatar brand)?深度靠 border + tint 而唔係 blur?
- [ ] 新狀態用返 6 semantic tint + Badge,冇自創色?
- [ ] 對住 `design_handoff_licenseops/prototype/full-console.html` 睇過視覺一致?

---

## 5. 點擴充(避免走偏嘅唯一合法路徑)

- **加新畫面 / 組合既有 primitive** → 直接做(用 token),唔算 violate。
- **要加新 primitive / 新 pattern / 改 token 值 / 加新色** → **STOP(H6)**:先同 owner 傾 → 更新本檔(+ 若動到 token 契約 / 架構級 → 寫 ADR)→ 先落 code。
- **token 值有變** → 改 `design_handoff_licenseops/design-system/tokens/*.css`(機器真相),本檔同步摘要。

---

## 6. Prototype 以外嘅 owner-approved 畫面

> Prototype(`full-console.html`)**冇**、但 owner 拍板加嘅畫面 / 導航項。將來 fidelity audit 對照 prototype 見到呢啲差異 = **預期**,唔係 drift。新增畫面必須喺呢度登記(邊個批 / 幾時 / 邊份 plan)。

| 畫面 / 導航 | 內容 | 拍板 |
|---|---|---|
| `/audit` Audit log 頁 + sidebar「Administration → Audit log」項 | 平台 audit trail 唯讀時間序表(action / target 篩選 · 分頁 · before→after 展開 row)。**零 primary action**(唯讀)。ADMIN-only:sidebar 以 `canSeeAdminNav` 隱藏,直開 URL 落 restricted state(後端 403 係真權威)。全部組合既有 primitive(Card / Badge / Select / Button / EmptyState),無新 token / 新色 / 新 pattern;prototype 僅得「only auditor」字眼,無此畫面。 | Chris,2026-07-20(W29 plan §9 Q2;ADR-0009) |
| `/agent` Agent registry 頁 + sidebar「Administration → Agent」項 | AI-Assist 嘅 **profile 表**(名 / model / prompt 有冇 / 狀態 · 建立同編輯 dialog)+ **全域 run 列表**(狀態 · profile 篩選 · cursor 分頁)。**一個 primary**(`New profile`)—— run 表刻意零 action:對一個 run 做得嘅兩件事(批 proposal · 停佢)都住喺嗰張 request 度,即係有 context 落決定嘅地方。ADMIN-only:sidebar 用**自己一個** predicate `canManageAgentProfiles`(唔借 `canSeeAdminNav` —— 跟本檔 `canRepairOutbound` 個先例,「開唔開得admin console」同「改唔改得每個未來 run 用邊個 model」係兩條問題),直開 URL 落 restricted state。全部組合既有 primitive(Card / Badge / Button / IconButton / Select / Input / Dialog / EmptyState),無新 token / 新色 / 新 pattern。狀態走既有 6 個 tone(`runStatusTone`),`prompt = custom` 用 **purple**(= handoff map 個 `AI→purple`)。🔴 **一個明講嘅缺口**:`prompt` 喺呢版**睇得到改唔到** —— 改佢要一個 multi-line 輸入,而 handoff 同 `components/ui` 兩邊都**冇** textarea,加一個係 H6 決定。表入面照顯示「Built-in / Custom」,免得一個靜靜帶住自訂指示嘅 profile 喺全個產品入面都見唔到。 | Chris,2026-08-17(W47 `OQ-B`;Tier 2 `T2-a`)。🟢 **2026-08-18 更正:`textarea` 同日批咗**(見 §2 `Textarea` 段,W47 `F5-8`)—— 呢格寫住「⏳ 未批」carry 咗一日,而 §2 同一份文件同一日已經記低批准。**同一份文件兩處各講各,又一次** |
| `/assistant` Assistant 頁 + sidebar「Operations → Assistant」項 | 同 AI-Assist 傾偈(**thread 列表 · transcript · 輸入**)。**一個 primary**(`Send`)—— `New conversation` 刻意 secondary:呢個畫面存在係為咗傾,而啱啱打開嗰個人多數係續傾而唔係重新開始。🔴 **全個畫面冇任何 approve 掣**(`ADR-0041 D8`):run 泊喺 proposal 嗰陣,thread **link 去嗰張 request**,決定喺嗰度落 —— chat 令「叫佢做嘢」感覺輕,而 human-in-the-loop 就係 Tier 1 成個安全論據,**因為 UI 順手啲而軟化佢正正係 D8 明文禁止嗰樣**(有 test 釘住:behavioural 一條 + source-scan 一條,因為「冇一個叫 Approve 嘅掣」擋唔到將來一個叫 `Accept` 嘅)。🔴 **冇 request context 嘅 thread 會出聲講**(`D3`)—— 「agent 睇唔到你啲 request」同「agent 揾唔到嘢」喺答案上面一模一樣,而只有前者係一個人可以處理嘅結構事實。**ADMIN + REGIONAL**,sidebar 用**既有** `canUseAgent`(W46 F8 就有,`D6` 明文唔加新 predicate)⇒ **OPERATIONS section 第一次帶 role predicate**(之前只有 ADMIN section 有);⚠️ 但佢**表達唔到邊條 thread 睇得** —— 對話屬於開佢嗰個人,呢個係 row-level,伺服器 403 先係權威。全部組合既有 primitive(Card / Badge / Button / IconButton / **Textarea** / EmptyState),**無新 primitive**:chat 氣泡由 `Card` 層 token 砌(1px border + surface tint,DS-7),而 **streaming 游標唔存在** —— `F4` 揀咗 turn-level notify,冇 token 流就冇游標。prototype 冇此畫面。 | Chris,2026-08-18(W48 `F5`;Tier 2 `T2-c`) |
| `/outbound-failures` Delivery failures 頁 + sidebar「Administration → Delivery failures」項 | Outbound 交付失敗嘅**營運工作佇列**(status / kind 篩選 · 展開睇 payload + 已發生嘅 SN 副作用 · 逐行補救)。**零 view-level primary** —— 所有補救掣係 per-row secondary(頁面職責係展示佇列,唔係推一個動作)。**ADMIN + REGIONAL**(闊過其餘 admin 項)→ sidebar 嘅 Administration 區由「整區 ADMIN gate」改為**逐 entry 帶 role predicate**,令 REGIONAL 有入口但仍然入唔到 Users & roles。非授權者落 **restricted state**(唔似 Overview activity feed 嘅隱藏 —— 呢個係專程去嘅畫面,值得一個解釋)。🔴 **補救掣文案唔可以係 generic「Retry」**:`request.mirror` 個掣必須讀成「Record locally」而唔係「Resubmit」,否則操作員會以為會再開一張 SN ticket(ADR-0011 D3 喺 UI 層嘅延伸,有 test guard)。組合既有 primitive,無新 token / 新色。 | Chris,2026-07-21(W31;ADR-0011 D2/D3/D4) |
