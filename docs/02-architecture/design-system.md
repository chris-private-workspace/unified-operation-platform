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
| forms | Button · IconButton · Input · Select · Checkbox · Switch · SegmentedControl | `variant`('primary'/'secondary'/'ghost'/'danger')· `size`('sm'/'md'/'lg')· 一 view 一個 primary |
| display | Card · StatCard · Badge · Avatar | `Badge tone dot`;`StatCard label value tone icon delta sub`(tone 只 tint icon chip,value 保持中性) |
| navigation | NavItem · Stepper · Tabs · Pagination | `Stepper steps current`(short 3-dot / procurement 6-dot,current 帶 `--ring-accent`) |
| overlay / feedback | Tooltip · Dialog · Toast · EmptyState | Dialog 45% scrim;Toast bottom-center ~2.6s(**帶 action 時要更長**,見下);EmptyState 用於 all-clear/no-results |

**Badge = 全系統通用狀態標記。Stage → tone map(必守)**:
`Ready→ok` · `Quoting / Awaiting vendor→warn` · `Requested→info` · `Blocked→danger` · `Assigned→neutral` · `AI→purple`。

> ⚠️ Tabs / Pagination / Tooltip / EmptyState 係 handoff 額外加、未 wire 入現有畫面 —— 用嗰陣跟各自 `.prompt.md`。

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
| `/outbound-failures` Delivery failures 頁 + sidebar「Administration → Delivery failures」項 | Outbound 交付失敗嘅**營運工作佇列**(status / kind 篩選 · 展開睇 payload + 已發生嘅 SN 副作用 · 逐行補救)。**零 view-level primary** —— 所有補救掣係 per-row secondary(頁面職責係展示佇列,唔係推一個動作)。**ADMIN + REGIONAL**(闊過其餘 admin 項)→ sidebar 嘅 Administration 區由「整區 ADMIN gate」改為**逐 entry 帶 role predicate**,令 REGIONAL 有入口但仍然入唔到 Users & roles。非授權者落 **restricted state**(唔似 Overview activity feed 嘅隱藏 —— 呢個係專程去嘅畫面,值得一個解釋)。🔴 **補救掣文案唔可以係 generic「Retry」**:`request.mirror` 個掣必須讀成「Record locally」而唔係「Resubmit」,否則操作員會以為會再開一張 SN ticket(ADR-0011 D3 喺 UI 層嘅延伸,有 test guard)。組合既有 primitive,無新 token / 新色。 | Chris,2026-07-21(W31;ADR-0011 D2/D3/D4) |
