---
component: C{NN}
name: {Component Name}
catalog_ref: ../COMPONENT_CATALOG.md#c{nn}--{kebab}
spec_refs: [{spec §}, {spec §}]
status: {v1-active / v2-stable / pending}
last_updated: YYYY-MM-DD
---

# C{NN} — {Component Name} Design Note

> **rolling JIT**:first heavy-touch phase 寫,implementation 過程 enrich。呢度記 **內部設計**(catalog 記 identity + dependency,唔喺呢度重複)。

> **Amendment log**(每次有 ADR / change 改到本 component 內部設計,喺頂加一段,標日期 + ADR/CH ref):
> - _(空)_

> **Owner**:{AI / human}

---

## 1. Internal Architecture

```
{目錄 / 模組結構樹 — 呢個 component 嘅 code 點 organize}
{path}/
├── ...
└── ...
```

### Flow
```
{畫 ASCII flow — 輸入 → 各步驟 → 輸出}
```

## 2. Key Interfaces

- **Inputs**:{接收咩(caller / 上游 component)}
- **Outputs**:{產出咩(下游 component / response shape)}
- **Public API**:{對外 function / endpoint signature}

```
{若有 schema / dataclass,貼 code block}
```

## 3. Critical Design Decisions

| Decision | Rationale | Ref |
|---|---|---|
| {做咗咩選擇} | {點解} | {ADR-NNNN / 若架構級} |

## 4. Edge Cases & Error Handling

| Edge case | Handling |
|---|---|
| {邊界情況 / 異常輸入} | {點處理 — fallback / raise / skip} |

## 5. Performance Characteristics

| Operation | Time / cost | Notes |
|---|---|---|
| {關鍵操作} | {耗時 / 成本} | {bottleneck / 可接受範圍} |

## 6. Test Strategy

| Test type | Scope | Status |
|---|---|---|
| unit | {咩} | ✅ / 🟡 / ⏳ |
| integration | {咩} | |

- **Coverage target**:{若係 critical module}
- **Key test files**:`{path}`

## 7. Future Evolution / Tier Boundary

- {當前限制 / 邊啲屬未來 tier / out-of-scope hooks}

## 8. Open Items / TODO

- [ ] {未完 / 待驗證嘅嘢}

---

**Cross-refs**:Catalog [`../COMPONENT_CATALOG.md`](../COMPONENT_CATALOG.md) · Spec `{§}` · Risks `../../01-planning/RISK_REGISTER.md` · 相關 commits `{hash}`
