---
change_id: CH-{NNN}
spec_ref: ./spec.md
status: in-progress     # in-progress | done
last_updated: YYYY-MM-DD
---

# CH-{NNN} — Checklist

> Atomic checkbox items derived from `spec.md §3` acceptance criteria。每 item ≤ 1-2h effort。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## Implementation

- [ ] {Atomic task 1}
- [ ] {Atomic task 2}
- [ ] {Atomic task 3 — verify with `<command / criterion>`}

## Verification

- [ ] Run all acceptance criteria from `spec.md §3`
- [ ] Smoke test in dev env
- [ ] (if user-facing)manual verify per spec scenario

## Cross-Cutting

- [ ] Each commit references `progress.md` Day-N entry(R2)
- [ ] Commit message 標對應 component tag(`feat(scope): description (Cn)`)
- [ ] (if architectural)ADR written + tag affected component(s)(R5)
- [ ] (if affects component)Update `02-architecture/components/Cn-*.md` design note + bump status
- [ ] Open-question status sync(if applicable)(R4)
- [ ] Pending changes synced to `BACKLOG.md`(R7)
- [ ] `progress.md` closeout summary written
- [ ] `progress.md` frontmatter status flipped to `done`

---

**Lifecycle reminder**:呢份 checklist 隨 spec acceptance criteria 衍生。新加 item 必須先入 spec + changelog,然後再加 checklist。
