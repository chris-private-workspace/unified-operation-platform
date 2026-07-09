---
phase: W01-example
plan_ref: ./plan.md
status: complete
last_updated: 2026-01-09
---

# Phase W01 — Checklist

> ⚠️ 範例。Derived from `plan.md` deliverables。

## F1 — Repo skeleton + CI green
- [x] `docs/` 13 層就位
- [x] `ci` workflow 建 + green
- [x] `.gitignore` / `.env.example` / `README.md` 就位

## F2 — Vertical slice
- [x] `GET /health` → 200
- [x] `GET /items` → list
- [x] test 覆蓋兩個 endpoint

## Phase Gate
- [x] G1 — CI green
- [x] G2 — health + items 通(2/2）

## Cross-Cutting
- [x] All deliverables committed to git
- [x] All architectural-adjacent decisions → ADR — N/A(地基,無架構決定）
- [x] `progress.md` retro section written
- [x] `progress.md` frontmatter status flipped to `closed`
- [x] Phase N+1 kickoff trigger noted in retro
