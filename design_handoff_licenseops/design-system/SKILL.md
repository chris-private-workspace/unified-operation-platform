---
name: licenseops-design
description: Use this skill to generate well-branded interfaces and assets for LicenseOps / the Ricoh APAC Unified IT Operations Platform, either for production or throwaway prototypes/mocks. Contains design guidelines, colors, type, fonts, assets, and UI kit components for prototyping data-dense enterprise admin consoles.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files
(`styles.css` + `tokens/` for foundations, `components/` for primitives, `ui_kits/` for
full screens, `guidelines/` for specimen cards).

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and
create static HTML files for the user to view — link `styles.css` and use the CSS custom
properties for all color/type/spacing. If working on production code, copy assets and read
the rules here to become an expert in designing with this brand.

Core rules to honor:
- Neutral greyscale base; **Ricoh red `#E60027`** is the single accent — one primary action
  per view, plus active nav and links. Everything else uses the six semantic tints.
- Support light and dark (`:root` / `.dark`). Desktop-first, data-dense; base text 13.5px.
- Geist for UI, Geist Mono for every number and identifier.
- Nearly flat: 1px borders + surface tint for depth, not shadows or gradients. The only
  gradient is the login brand panel.
- Lucide-style stroke SVG icons only; no emoji in chrome.

If the user invokes this skill without other guidance, ask what they want to build, ask a
few questions, and act as an expert designer who outputs HTML artifacts _or_ production
code depending on the need.
