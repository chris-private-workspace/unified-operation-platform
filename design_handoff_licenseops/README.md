# Handoff: Unified IT Operations Platform (“LicenseOps”)

## Overview
LicenseOps is an internal, **desktop-first web admin console** for **Ricoh APAC Regional IT**.
Its phase-1 job is to manage **Microsoft 365 license fulfilment during user onboarding** across
~24 operating companies (OpCos) that share one M365 tenant. It is a **System of Action / overview
console**, deliberately **not** a ticketing system:

- Request intake, approvals and SLAs live in **ServiceNow** — LicenseOps *consumes* those requests.
- License cost / quotation / invoice amounts live in **DocuWare** — LicenseOps tracks only quote/PO
  **references**, never money.
- LicenseOps drives the technical fulfilment: check availability → assign via Microsoft Graph →
  keep the per-OpCo inventory (the “ledger”) honest against the tenant, and surface **drift**.

Roles (same screens, scoped):
- **Regional IT operator** — sees all OpCos; runs day-to-day fulfilment + reconciliation.
- **OpCo IT admin** — sees/manages only their own OpCo (future self-service).

---

## About the Design Files
Everything in this bundle is a **design reference created in HTML** — a working prototype that shows
the intended look, layout, and behavior. **It is not production code to copy directly.**

The prototype is authored as a “Design Component” (a small custom runtime: `*.dc.html` + `support.js`).
**Do not port that runtime.** Your task is to **recreate these designs in the target codebase**. The
intended production stack (per the original brief) is **React + Tailwind + shadcn/ui**; if the target
repo already has an environment, follow its established patterns instead.

Two things are provided and they overlap intentionally:
1. **`design-system/`** — a framework-agnostic design system extracted from the prototype: CSS design
   tokens (the source of truth for color/type/spacing) + a set of clean React component references
   (`.jsx` + `.d.ts` + usage `.prompt.md`). **Start here** — build the app from these primitives.
2. **`prototype/`** — the full interactive product (all screens) as a single self-contained HTML file
   plus the readable source. Use it to see exact composition, states, and flows in motion.

> Tip for Claude Code: read `design-system/readme.md` first (full brand/voice/visual guide), then
> `design-system/styles.css` + `design-system/tokens/*` for the exact `--token` names, then open
> `prototype/full-console.html` in a browser to interact with the real thing while you build.

---

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, component design, dark mode, and
interactions are all intentional. Recreate the UI faithfully using the target codebase’s libraries.
Exact token values are in `design-system/tokens/`; don’t eyeball them.

---

## Screens / Views

All screens share an **app shell**: fixed left sidebar (collapsible), top bar, scrolling content.
The signed-in role context is always shown verbatim in the top bar (“Regional — all OpCos” vs
“RHK IT — RHK only”).

### 0. Login
- **Purpose:** SSO sign-in gate.
- **Layout:** two panels. Left ~52% is the brand panel — the *only* gradient in the system
  (`linear-gradient(150deg, #c30021, #8a0018 55%, #4d000d)`) with a subtle dotted radial texture,
  wordmark, headline, and 3 stat figures. Right panel is the form: “Continue with Microsoft Entra ID”
  (Microsoft 4-color logo), email + password, “Keep me signed in”, primary Sign in, SSO footnote.
- Sign-in transitions to the app shell (Overview).

### 1. App shell
- **Sidebar (248px, collapsible to 64px icon rail):** brand lockup; grouped nav —
  *Operations* (Overview, Requests [count badge], License Assets, Drift Alerts [danger count badge]),
  *Catalog* (SKU Catalog), *Administration* (Users & roles, Integrations), *Roadmap* (Offboarding,
  Cost Insights, D365 Licenses — all disabled with a “Soon” tag). Footer: current-user card.
- **Top bar (56px):** page title + role sub-line; centered global search with ⌘K hint; role switch
  (Regional / RHK IT segmented control); light/dark toggle; tenant chip. A user menu (avatar) opens
  Profile / Preferences / Users & roles / Integrations / Sign out.

### 2. Overview dashboard
- Underline **Tabs**: Summary / Analytics.
- **4 KPI StatCards:** Open requests, In procurement, Open drift alerts, Licenses assigned (with a
  “+N free” headroom pill).
- **Needs attention** list (blocked-on-sync / ready-to-assign / stuck-in-procurement), each row → request.
- **Drift summary** (count + worst offenders) and **On the roadmap** cards.
- **Recent activity** feed.

### 3. License Assets — the core screen (three levels)
A segmented switch chooses the level:
- **Platform (tenant / M365):** 3 reconciliation tiles (Tenant licenses owned / Allocated to OpCos /
  Assigned to users) + an over-allocation warning pill. A per-SKU table (grouped by category) with
  **Owned · Allocated · Assigned · Unallocated · Status**, a stacked assigned/allocated mini-bar, and
  row actions **Manage** (allocation manager) and **Adjust** (tenant count). A grand-total row sits
  directly under the header; each category ends in a subtotal row.
- **By OpCo:** OpCo picker chips; per-SKU table with **Allocated · Assigned · Available · Utilization**
  and a per-row **Edit record** (edits *both* allocated and assigned, with live Available + over-assign
  warning). Same grand-total-under-header + per-category subtotal pattern.
- **Compare:** SKU × OpCo matrix; each cell is the **available** count, color-tiered (≤0 danger,
  1–2 warn, headroom ok). Horizontally scrolls; sticky first column.
- **Operations (all mutate live and cascade to every level + Overview):**
  - **Manage allocations** dialog — distribute tenant licenses across all OpCos with a live meter
    (“Allocated N of M”), red over-allocation banner when the sum exceeds owned, per-OpCo −/＋ steppers
    + numeric input, live available.
  - **Adjust tenant licenses** dialog — set the M365-owned count for a SKU; warns if below current
    allocation.
  - **Edit record** dialog — edit a single OpCo×SKU’s allocated **and** assigned; live Available;
    warns if assigned exceeds allocated.

### 4. Requests console (list)
- Filter chips: All / Needs attention / My queue / Procurement / Blocked (each with a live count).
- Table: request #, target user (+ UPN mono), OpCo, compact per-line-item stage chips
  (e.g. “2 assigned · 1 in procurement”), overall status badge, handler, age.
- **Pagination** footer (range summary + numbered pages). Row → request detail.

### 5. Request detail — the key interaction screen
- **Header:** target user (UPN + name), OpCo, handler, request id, read-only **ServiceNow** link-out,
  overall status badge.
- **Phase-1 gate indicator:** “Account created ✓ / Synced to Azure AD ⏳” — assignment is **blocked
  until synced**.
- **Request remark** (raw free-text the operator interprets).
- **Line items:** one row per requested SKU, each with its **own stage** and a compact **Stepper**
  (short path: Requested→Ready→Assigned; procurement path: Requested→Quoting→OpCo approved→Awaiting
  vendor→Ready→Assigned). Per-line actions: **Advance stage**, **Assign now** (enabled only once synced
  **and** a seat is available), cancel.
- **Assign flow:** clicking Assign opens a modal that simulates the backend API sequence
  (precheck → sync check → Graph assignLicense → ledger write) with per-step status. Includes a demo
  switcher for failure scenarios: No seats, Sync race, Graph 429, Graph 503, usageLocation null, and
  **Ledger conflict** (Graph succeeds but ledger write fails → **auto-opens a drift alert**).
- **AI Assist (preview):** parses the free-text remark into structured SKUs with confidence — a vision
  placeholder, non-functional.
- **Operational history** timeline (platform’s own log, separate from ServiceNow’s audit trail).

### 6. Drift alerts / reconciliation
- **Run reconciliation now** + last-run summary.
- Table: SKU, scope, **ledger sum** (platform belief), **tenant consumed** (actual), **delta**
  (positive vs negative visually distinct), detected date, **Resolve** (with toast).
- When empty: a full **EmptyState** (green check, “No open drift alerts”, description, re-run action).

### 7. SKU Catalog
- Table: display name, part number, skuId (GUID, mono), business alias, category, base-flag, active,
  last-synced. **Pagination** footer. **Sync catalog from tenant** action.
- **Edit dialog:** curate **alias + category + base flag** only — part number & skuId are system-owned,
  read-only.

### 8. Settings (Account / Preferences / Users & roles / Integrations)
- **Account:** profile fields (email is SSO-managed/disabled), role & access (SSO, MFA).
- **Preferences:** theme segmented control, reduce-motion, localization, notification toggles.
- **Users & roles (admin):** user table with role badges (Regional operator / OpCo admin / Read-only
  auditor), scope, status, invite.
- **Integrations:** connector cards (Microsoft Graph, Entra ID, ServiceNow, DocuWare, Teams[error]) each
  with status + **Test connection**; a full **n8n** configuration block (base URL, API key, webhook,
  event toggles, Test connection, Save).

---

## Interactions & Behavior
- **Navigation:** SPA-style view switching; no full reloads. Sidebar item → view; user menu items →
  Settings tabs.
- **Theme:** light default; `.dark` class on the root swaps every token. Toggle in top bar + Preferences.
- **Role switch:** Regional ↔ RHK IT re-scopes all data (requests, assets, drift) and the context labels;
  Platform/Compare levels are Regional-only.
- **Toasts:** bottom-center dark chip, ~2.6s auto-dismiss, fired after every operator action.
- **Dialogs:** centered over a 45% scrim; click-scrim or ✕ closes.
- **Live recompute:** every asset mutation updates subtotals/totals, all three asset levels, and the
  Overview KPIs immediately. Ledger-conflict assign auto-creates a drift row.
- **Animations:** restrained — `fadeIn` on view change, `toastIn` (12px rise), `spin` for in-flight API
  steps; transitions ~120–150ms; no bounces/scale.
- **Gating:** Assign now is disabled until (synced === true) AND (available > 0).

## State Management
Core state the app needs (names illustrative):
- `theme` (light|dark), `role` (regional|opco), `view`, `authed`, `sidebarCollapsed`, `userMenu`.
- `assetsMode` (platform|single|compare), `selectedOpco`, `reqFilter`, `reqPage`, `catPage`,
  `overviewTab`, `settingsTab`.
- Data: `requests[]` (each with `lines[]` carrying per-line `stage`, `path`, `ref`, `synced`),
  `drift[]`, `skuMatrix` (per-SKU × per-OpCo `[allocated, assigned]`), `skuTenant[]` (M365-owned per
  SKU), `catalog[]`, connector/n8n config, and transient `toast` / `dialog` / `assignModal` /
  `assetDialog`.
- Lifecycle stages per line item drive both the Stepper and the status badges (see below).
- Data fetching in production: Microsoft Graph (tenant SKUs, users, assignLicense), ServiceNow (poll
  RITM requests, read-only), Entra sync state, DocuWare (doc refs), n8n (event webhooks). The prototype
  fakes all of these in memory.

## Design Tokens
The **authoritative token definitions** are in `design-system/tokens/` (`colors.css`, `typography.css`,
`spacing.css`, `elevation.css`, `fonts.css`) with `design-system/styles.css` as the single import entry.
Highlights (light theme):
- **Accent (Ricoh red):** `--accent: #E60027` (dark: `#ff3355`), soft `#fdecef`, line `#f6c9d2`.
- **Surfaces:** bg `#f5f5f6`, card/panel `#ffffff`, hover `#efeff1`, border `#e9e9ec`, border-strong `#d7d7dc`.
- **Text:** fg `#131317`, muted `#63636c`, subtle `#9a9aa4`.
- **Semantic (fg / soft-bg):** ok `#15803d`/`#e7f4ec`, warn `#b45309`/`#fbf0e0`, info `#1d4ed8`/`#e8eefc`,
  danger `#c81e1e`/`#fceaea`, neutral `#52525b`/`#eeeef0`, purple (AI) `#6d28d9`/`#f0eafb`.
- **Type:** Geist (UI), Geist Mono (all numbers/identifiers). Base UI text 13.5px; big numbers 27px/600
  at `-0.02em`; column labels 10.5px uppercase. Never below 10.5px.
- **Spacing:** tight 2px-stepped (2/4/6/8/10/12/14/16…). Table cells ~11px×18px.
- **Radii:** buttons/inputs 7–8px; cards 12px; dialogs 14px; pills 999px.
- **Elevation:** nearly flat — one resting card shadow, one overlay shadow; depth via 1px borders +
  surface tint, not blur.
- **Stage → badge tone map:** Ready→ok, Quoting/Awaiting vendor→warn, Requested→info, Blocked→danger,
  Assigned→neutral, AI→purple.

## Assets
- **Fonts:** Geist + Geist Mono via Google Fonts CDN (`design-system/tokens/fonts.css`). No local
  binaries bundled — self-host `@font-face` for fully offline builds.
- **Icons:** inline **Lucide-style** stroke SVGs (24×24, `currentColor`, stroke-width 2, round caps),
  drawn directly in markup — no icon font. Reuse `lucide-react` in production.
- **Microsoft logo:** the 2×2 four-color square on the SSO button is the only multicolor mark.
- **No LicenseOps/Ricoh logo file** was provided; the wordmark is plain Geist next to a small generic
  “stacked bars” glyph. Do not fabricate a Ricoh corporate logo — swap in the real asset if available.

## Files
- `prototype/full-console.html` — the complete product, self-contained, open in any browser.
- `prototype/IT Ops Platform.dc.html` — readable source of the prototype (Design Component template +
  logic class). Reference for exact composition/logic; do not port the runtime.
- `design-system/` — tokens, components (`components/**/*.jsx|d.ts|prompt.md`), UI-kit recreations,
  guideline specimen cards, and `readme.md` (full brand + visual guide) + `SKILL.md`.

## Suggested build order
App shell → tokens/theme → Overview → License Assets (all 3 levels + operations) → Requests console →
Request detail (incl. assign flow) → Drift alerts → SKU Catalog → Settings/Integrations → Login.
