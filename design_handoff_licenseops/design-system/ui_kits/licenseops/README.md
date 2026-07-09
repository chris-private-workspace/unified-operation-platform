# LicenseOps Console — UI kit

Interactive recreations of the **Unified IT Operations Platform** (a.k.a. LicenseOps):
the Ricoh APAC Regional IT console for Microsoft 365 license fulfilment.

## Screens
- **`index.html`** — the operations **Overview** dashboard, composed entirely from
  this design system's primitives (`StatCard`, `Card`, `Badge`, `NavItem`, `Avatar`,
  `SegmentedControl`, `IconButton`, `Input`, `Toast`). Live theme toggle (light/dark),
  role switch (Regional / RHK IT), and clickable rows that fire toasts.
- **`full-console.html`** — the complete, standalone product (all screens: Overview,
  License Assets, Requests, Request detail, Drift Alerts, SKU Catalog, Settings /
  Integrations, Login, plus the assign-API flow with failure scenarios). Self-contained;
  open directly. This is the source of truth for the visual language.

## Notes
- The console is **desktop-first** and **data-dense**; base UI text is 13.5px.
- Role scope is explicit at all times ("Regional — all OpCos" vs "RHK IT — RHK only").
- Ricoh red (`--accent`) is used only for the single primary action per view and the
  active nav item. Everything else is neutral + semantic status tints.
