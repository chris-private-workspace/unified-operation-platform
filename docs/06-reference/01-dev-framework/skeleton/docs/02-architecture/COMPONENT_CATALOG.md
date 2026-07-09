---
artifact: component-catalog
version: 1.0
status: active
last_updated: YYYY-MM-DD
spec_anchor: {主 spec 路徑}
process_anchor: docs/01-planning/PROCESS.md
---

# {PROJECT_NAME} Component Catalog

> **Purpose**:source of truth for **模組分解(module decomposition)**。
>
> 三層 doc 分工:
> - **主 spec** — `WHAT` + `WHY`,full system spec
> - **`PROCESS.md`** — `HOW we work`,workflow framework
> - **THIS file** — `STRUCTURE`,component spine + dependency + phase mapping
>
> 每個 component 有:stable identity(`Cn` ID + name + scope)、citation 返 spec(不重複內容)、tracked dependency / risk / phase / owner / status。
> Per-component **design note** 喺 `components/Cn-{kebab}.md`,**rolling JIT**(first heavy-touch phase 寫,implementation enrich)。

---

## 1. Catalog Index(at-a-glance)

| ID | Component | Spec ref | Tech(locked) | First touch | Status |
|---|---|---|---|---|---|
| **[C01](#c01--name)** | {Component 名} | `{spec §}` | {技術} | {W{NN}} | {status emoji} |
| **[C02](#c02--name)** | | | | | |

**Legend**:🟢 active progressing | 🟡 partially blocked | 🚫 hard blocked | ⏳ not started(planned) | ⚪ deferred

---

## 2. Dependency Graph

```
{ASCII 依賴圖 — foundational component 喺頂}
```

### Dependency Matrix(machine-readable)

| Component | Hard depends on | Soft depends on |
|---|---|---|
| C01 | {Cn, Cn} | {Cn} |
| C02 | | |

---

## 3. Phase × Component Map

> 邊個 component 喺邊個 phase 被 touch(擴充 / 修改)。追蹤演化熱點。

| Component | First touch | Later heavy-touch phases |
|---|---|---|
| C01 | W{NN} | W{NN}, W{NN} |
| C02 | | |

---

## 4. Per-Component Detail

### C01 — {Name}

| Field | Value |
|---|---|
| **Scope** | {負責咩、唔負責咩} |
| **Spec ref** | `{§}`(cite,唔重複) |
| **Tech** | {locked vendor / library} |
| **Depends on** | {C0x(hard) / C0y(soft)} |
| **Interface** | Input: {} · Output: {} · Side effects: {} |
| **Open Questions** | {未定嘅決策點,若有} |
| **Risks** | {link RISK_REGISTER R-n} |
| **Phase history** | {W{NN} first → 之後 enrich} |
| **Owner** | {AI / human} |
| **Status** | {emoji + 一句} |
| **Design note** | [`components/C01-{kebab}.md`](./components/C01-{kebab}.md) |

### C02 — {Name}
(same table structure)

---

## 5. Maintenance
- 加 / 改 / 刪 component = 架構級改動 → 觸發 `CLAUDE.md §5` hard constraint → ADR。
- Change / bug 標 `affects_components: [Cn]` 嘅權威來源就係本表。
- 每 phase closeout:掃一次 status / dependency / phase map 有冇變。

**Last Updated**:YYYY-MM-DD · **Maintainer**:{owner}
