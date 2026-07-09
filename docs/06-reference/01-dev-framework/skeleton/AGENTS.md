# AGENTS.md — {PROJECT_NAME} Standing Instructions

> **第二個 AI agent(例 Codex)嘅 standing instructions。** 有啲 agent runtime 讀 `AGENTS.md` 而唔係 `CLAUDE.md` —— 呢個檔就係畀佢哋嘅。
> **內容 = 同 `CLAUDE.md` 一致。** `CLAUDE.md` 係 canonical single source;本檔要同佢**保持同步**(改一份 → 兩份都改)。
>
> **點解有兩份**:唔同 agent 讀唔同檔名。若你只用一個 agent(讀 CLAUDE.md 嗰隻),可以刪走本檔。若你有第二個讀 AGENTS.md 嘅 agent,保留 + 同步。

---

## 落地選擇(揀一)
1. **完整複製(EKP 做法)**:把 `CLAUDE.md` 全文 copy 落嚟,開頭改成 address 第二個 agent。好處 = 第二個 agent 攞到完整指令;代價 = 兩份要人手同步(易 drift)。
2. **薄指針**:本檔只放 §0 身分卡 + §5 hard constraints,其餘寫「full standing instructions 見 CLAUDE.md」。好處 = 少 drift;代價 = 第二個 agent 要肯去讀 CLAUDE.md。

> EKP 揀 1(完整複製)。你按第二個 agent 肯唔肯讀 CLAUDE.md 決定。

---

## 0. Quick Identity Check(最少要有呢段)

| 項目 | Value |
|---|---|
| Project | **{PROJECT_NAME}** — {一句定位} |
| Primary Spec | `docs/architecture.md` |
| Decision Owner(architecture) | {Tech Lead} |
| Strict Mode | **ON** — hard constraints 見 CLAUDE.md §5 |

## 其餘
{按落地選擇:completent copy CLAUDE.md §1-§15,或寫「見 CLAUDE.md」}

---

**Sync reminder**:改 `CLAUDE.md` 嘅 §1 / §5 / §10 → 記得同步本檔(可用 `scripts/check-claude-size.ps1` 順帶提醒,或做一個 sync check)。
