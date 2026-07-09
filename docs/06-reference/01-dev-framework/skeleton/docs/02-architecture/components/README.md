# components/ — 逐 Component Design Notes

每個 component 一份 design note(`C{NN}-{kebab}.md`),記**內部設計**(catalog 記 identity + dependency,呢度唔重複)。

## 慣例
- 命名 `C{NN}-{kebab}.md`,對齊 `../COMPONENT_CATALOG.md` 嘅 `Cn` ID。
- **Rolling JIT**:唔使一開始每個 component 都寫 design note;first heavy-touch 嗰個 phase 先寫,implementation 過程 enrich。
- 每次有 ADR / change 改到某 component 內部設計 → 喺該 note 頂加 amendment log(標日期 + ADR/CH ref)。
- 模版:[`_TEMPLATE-component-note.md`](_TEMPLATE-component-note.md)。

## Index
| Component | Design note | Status |
|---|---|---|
| _(空 — first component design note 落地時加)_ | | |
