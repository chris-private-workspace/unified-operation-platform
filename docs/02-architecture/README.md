# 02-architecture — 架構真理

持久嘅架構真理層。呢度嘅嘢改動慢、影響大,受 hard constraint(CLAUDE.md §5)保護。

## 建議住客

| 檔案 | 作用 |
|---|---|
| (主 spec 喺 `docs/architecture.md`,**唔喺呢層**) | 呢層放 catalog + component notes + audit,唔放主 spec |
| `COMPONENT_CATALOG.md` | 所有 component 一覽(id / 職責 / 依賴 / 技術 / 狀態) |
| `components/{Cn-name}.md` | 逐 component 細節(若項目大到需要) |
| `*-design.md` / `audit-*.md` | 設計文檔 / 對 spec 嘅 audit |

## 模版落位(鏡射 EKP:直接檔 / `_TEMPLATE-*.md`,唔用 `_templates/` 抽屜)
| 模版 | 位置 |
|---|---|
| Component catalog(singleton) | `COMPONENT_CATALOG.md`(直接填) |
| Component design note(repeated) | `components/_TEMPLATE-component-note.md` |
| Design doc | `_TEMPLATE-design-doc.md` |
| Audit | `_TEMPLATE-audit.md` |

## 慣例
- 主 spec 嘅 frozen section **只有 owner approve 後先 increment version**(CLAUDE.md §4.4)。
- 架構改動一定經 ADR(`adr/`)先落到呢層。
- Component catalog 係 change / bug 標 `affects_components` 嘅權威來源。
- Component design note **rolling JIT**:first heavy-touch phase 先寫,見 `components/README.md`。
