---
phase: W{NN}-{phase-name-kebab}
plan_ref: ./plan.md
status: in-progress    # in-progress | complete
last_updated: YYYY-MM-DD
---

# Phase W{NN} — Checklist

> Atomic checkbox(每 item ≤ 1–2 hour effort)。
> AI tick 完成嘅 item;唔可以 tick 嘅 item 喺 progress Day-N entry 寫原因。

## F1 — {Deliverable name from plan}

- [ ] {Atomic task 1}
- [ ] {Atomic task 2}
- [ ] {Atomic task 3 — verify with `<command / criterion>`}

## F2 — {Deliverable name}

- [ ] {Atomic task}

## F3 — ...

---

## Cross-Cutting

- [ ] All deliverables committed to git
- [ ] All open-question status changes reflected in decision tracker(R4)
- [ ] All architectural-adjacent decisions documented as ADR(per CLAUDE.md §5)
- [ ] Pending / next-candidate changes synced to `BACKLOG.md`(R7)
- [ ] `progress.md` retro section written
- [ ] `progress.md` frontmatter status flipped to `closed`
- [ ] Phase N+1 kickoff trigger noted in retro

---

**Lifecycle reminder**:呢份 checklist 隨 plan deliverables 衍生。新加 deliverable 必須先入 plan + changelog,然後再加 checklist item。
