# 12-ai-assistant — AI 協作素材

畀 AI coding agent 用嘅素材:session 起手 prompt、詳版 onboarding、AI 專用 checklist 等。

## 建議住客
```
12-ai-assistant/
└── 01-prompts/
    ├── session-start.md          ← 詳版 onboarding：session 起手載入嘅 SITUATION 快照
    ├── compact-session.md        ← /compact 之前用嘅項目專屬 compact 格式(紀律自檢)
    └── SESSION_SUMMARY.md        ← slim 摘要（若有 SessionStart hook，自動注入每 session）
```

## 三份 prompt 分工
| Prompt | 幾時用 | 模版 |
|---|---|---|
| `session-start.md` | 每 session 開頭(詳版) | `session-start.template.md` |
| `compact-session.md` | `/compact` 之前(結尾) | `compact-session.template.md` |
| `SESSION_SUMMARY.md` | hook 自動注入(slim 即時摘要) | `SESSION_SUMMARY.template.md` |

## `session-start.md` 嘅角色
- CLAUDE.md §10.3 Session Start Protocol 第一步就係讀呢份。
- 佢係「詳版 onboarding」——CLAUDE.md 係精簡憲法,呢份補充 volatile 嘅當前座標(component 清單 / open questions / 當前 phase / 權威排序)。
- Volatile 部分(當前座標)隨 sprint 變,每個 phase closeout doc-sync 時更新。

## 慣例
- CLAUDE.md 保持精簡(index 層);細節 onboarding 落呢層(detail 層)。
- 避免同 CLAUDE.md 重複;呢層補充 CLAUDE.md 冇嘅 volatile 狀態。
