# 03-implementation — 改動 & 修復實例

Hosts active + historical instances of:
- **Changes**(`changes/CH-NNN-*/`)— 改現有 feature 行為
- **Bug fixes**(`bugs/BUG-NNN-*/`)— 修不正確行為

> Phase / sprint work 住喺 `01-planning/W{NN}-*/`(唔喺呢層)。
> Workflow + templates:見 [`../01-planning/PROCESS.md`](../01-planning/PROCESS.md) + [`../01-planning/_templates/`](../01-planning/_templates/)。

## ID Conventions
| Type | Format | Scope |
|---|---|---|
| Change | `CH-NNN`(3-digit zero-pad) | Project-wide monotonic(唔 per-phase restart) |
| Bug | `BUG-NNN`(3-digit zero-pad) | Project-wide monotonic |

## Per-Instance Folder
```
changes/CH-NNN-{kebab}/     bugs/BUG-NNN-{kebab}/
├── spec.md                 ├── report.md
├── checklist.md            ├── checklist.md
└── progress.md             ├── progress.md
                            └── postmortem.md(Sev1/2 mandatory)
```

## 範例實例(睇實際填法)
- [`changes/CH-000-example/`](./changes/CH-000-example/) — 填好嘅 change 實例(list API 加 filter),完整生命週期。
- [`bugs/BUG-000-example/`](./bugs/BUG-000-example/) — 填好嘅 Sev2 bug 實例(含 mandatory postmortem),同 CH-000 呼應。

> 呢兩個係 EXAMPLE,示範模版點填。落新項目可刪走;真實由 CH-001 / BUG-001 開始。

## 其他住客
一次性 implementation memo / investigation note / runbook(唔屬 CH/BUG 但屬實作記錄)可直接放呢層。模版:[`_TEMPLATE-memo.md`](./_TEMPLATE-memo.md)。

## Active / Historical
Closeout 後 folder 留住做 audit trail;`progress.md` status=done/closed 標完成。
