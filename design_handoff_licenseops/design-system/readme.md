# LicenseOps Design System

The design system behind the **Unified IT Operations Platform** ("LicenseOps") — the
internal web console for **Ricoh APAC Regional IT** that manages **Microsoft 365 license
fulfilment during user onboarding** across ~24 operating companies (OpCos) sharing one
M365 tenant.

It is a **System of Action / overview console**, deliberately *not* a ticketing system:
request intake, approvals and SLAs live in ServiceNow; cost/quotation lives in DocuWare.
This platform consumes ServiceNow requests and drives the technical fulfilment — checking
license availability, assigning licenses via Microsoft Graph, and keeping the per-OpCo
inventory (the "ledger") honest against the tenant.

> **Source:** extracted from the working prototype `IT Ops Platform.dc.html` in this
> project (and its standalone build `Unified IT Operations Platform.html`). No external
> Figma or codebase was provided; the prototype is the ground truth for every value here.

---

## CONTENT FUNDAMENTALS

- **Voice:** terse, technical, operator-facing. Written for an IT operator who lives in
  the tool all day, not an end user. Labels are short noun phrases ("Open requests",
  "Needs attention", "Ledger sum", "Tenant used").
- **Casing:** Sentence case for headings and buttons ("Run reconciliation now", "Assign
  now"). UPPERCASE + letter-spacing only for tiny structural labels (table column heads,
  nav section headers, category tags: `BASE`, `SECURITY`).
- **Person:** system-neutral / imperative. Actions are verbs ("Advance stage", "Resolve",
  "Sync catalog from tenant"). No "you"/"we" in UI chrome; first person appears only in
  friendly confirmations ("Welcome back, Alex").
- **Status language:** past-tense confirmations in toasts ("License assigned to user",
  "Drift alert resolved", "n8n configuration saved"). Present/gerund for in-flight stages
  ("Quoting", "Awaiting vendor", "Testing connection…").
- **Numbers & identifiers** are always monospace: seat counts, deltas (`+3` / `-2`),
  request ids (`REQ-2041`), UPNs, GUIDs, quote/PO refs (`QT-7781`, `PO-5521`).
- **Emoji:** none in product chrome. Occasional inline check/⏳ glyphs appear only inside
  status affordances, never as decoration.
- **Scope is always explicit:** the role context is stated verbatim in the top bar —
  "Regional — all OpCos" vs "RHK IT — RHK only".

## VISUAL FOUNDATIONS

- **Feel:** calm, precise, data-dense enterprise admin (Linear / Vercel / shadcn-dashboard
  lineage). At-a-glance status and fast operator actions over decoration.
- **Color:** neutral greyscale base with a **single restrained accent — Ricoh red
  `#E60027`** (brightened to `#ff3355` in dark mode). Accent is rationed: primary action
  per view, active nav item, links, focus ring. Everything else communicates through six
  **semantic tints** (ok / warn / info / danger / neutral / purple), each a soft-bg +
  saturated-fg pair. `purple` is reserved for AI-assist and roadmap.
- **Themes:** full light + dark, defined as CSS custom properties on `:root` and `.dark`.
  Light default. Dark is true near-black (`#08080a` bg, `#141417` card).
- **Type:** **Geist** for UI, **Geist Mono** for all numerics/identifiers. Dense scale —
  base UI text 13.5px; big numbers 27px/600 with `-.02em` tracking; column labels 10.5px
  uppercase. Never below 10.5px.
- **Spacing:** tight, largely 2px-stepped rhythm (2/4/6/8/10/12/14/16…). Table cells
  ~11px×18px. Values are literal from the product — not snapped to a 4/8 grid.
- **Corners:** buttons/inputs 7–8px; cards/panels 12px; dialogs 14px; pills 999px.
- **Elevation:** nearly flat. One resting card shadow (`0 1px 2px/1px 3px` at ~5% alpha),
  one heavy overlay shadow for dialogs, one for toasts. Depth is carried by **1px borders
  and surface tint**, not blur. No colored/left-border-only accent cards.
- **Backgrounds:** solid surfaces. The *only* gradient in the system is the login brand
  panel (`150deg` deep-red ramp with a subtle dotted radial texture). No gradients on
  cards, buttons, or headers.
- **Borders:** universal 1px hairlines — `--border` for dividers/default controls,
  `--border-strong` for inputs, steppers, scrollbars.
- **Animation:** restrained. `fadeIn` on view change, `toastIn` (12px rise) for toasts,
  `spin` for in-flight API steps. Transitions are short (~120–150ms). No bounces.
- **Hover / press:** rows and ghost controls hover to `--hover`; primary buttons brighten
  (`filter: brightness(1.08)`); nav active state is a filled `--active` row. No scale/press
  shrink.
- **Cards:** `--card` fill, 1px `--border`, 12px radius, resting shadow, optional header
  with a hairline divider. Tables run edge-to-edge inside an unpadded card.
- **Status as first-class UI:** the `Badge` pill (soft tint + optional dot) is the
  universal state marker across requests, line stages and drift deltas; the `Stepper`
  shows per-line lifecycle.

## ICONOGRAPHY

- **Line icons only**, drawn inline as SVG in the **Lucide** style: 24×24 viewBox,
  `stroke="currentColor"`, `stroke-width` 2 (2.2–2.4 for small emphasis),
  round caps/joins, no fill. Icons inherit text color and sit at 13–17px.
- The only multi-color mark is the **Microsoft four-square logo** on the login SSO button
  (brand-accurate 2×2 squares).
- **No icon font, no emoji, no PNG icons.** Unicode is used sparingly for a couple of
  affordance glyphs (✓, ⏳, ✕) inside components. If you need an icon not already present,
  add a Lucide-style stroke SVG at the same weight — do not mix in filled or duotone sets.
- **No logo file** was provided for LicenseOps; the wordmark is set in plain Geist next to
  a small generic "stacked bars" glyph. Do not fabricate a Ricoh corporate logo.

---

## INDEX / MANIFEST

- **`styles.css`** — global entry point (import this). `@import`s everything below.
- **`tokens/`** — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`,
  `elevation.css`, `base.css`.
- **`components/`** — reusable React primitives (each `.jsx` + `.d.ts` + `.prompt.md`):
  - `forms/` — Button, IconButton, Input, Select, Checkbox, Switch, SegmentedControl
  - `display/` — Card, StatCard, Badge, Avatar
  - `navigation/` — NavItem, Stepper, Tabs, Pagination
  - `overlay/` — Tooltip
  - `feedback/` — Dialog, Toast, EmptyState
- **`ui_kits/licenseops/`** — `index.html` (Overview screen, composed from primitives) +
  `full-console.html` (complete standalone product, all screens).
- **`guidelines/`** — foundation specimen cards (colors, type, spacing, radii, elevation).
- **`SKILL.md`** — Agent-Skills-compatible entry for downloadable use.

## Intentional additions
The prototype defined no formal component library, so this is a from-scratch inventory
authored to match exactly the primitives the console actually uses. Four primitives —
**Tabs, Pagination, Tooltip, EmptyState** — were added on top of that set: they are not
yet wired into the current screens but follow the same visual language and cover states
the console will need as it grows (paged tables, in-page section switching, hover
affordances, all-clear / no-results states). Each notes its intended use in its
`.prompt.md`.

## Caveats
- **Fonts** (Geist / Geist Mono) are loaded from Google Fonts CDN; no local binaries are
  bundled. Add self-hosted `@font-face` files for fully offline consumers.
- Component **preview cards** and the UI-kit `index.html` depend on the compiler-generated
  `_ds_bundle.js`, which appears after the project is registered as a Design System.
  `full-console.html` renders standalone regardless.
