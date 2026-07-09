# {PROJECT_NAME} — Architecture Spec

> **主 spec(source of truth for WHAT + WHY)。** CLAUDE.md / COMPONENT_CATALOG / 各 phase plan 都 cite 返呢度。
> **Frozen 慣例**:核心 section 一旦 lock,只有 owner approve 後先 increment version(CLAUDE.md §4.4)。改架構要經 ADR。
> **同其他 doc 分工**:本檔 = WHAT/WHY;`01-planning/PROCESS.md` = HOW we work;`02-architecture/COMPONENT_CATALOG.md` = STRUCTURE。

**Version**: 0.1(draft) · **Status**: {draft / frozen} · **Owner**: {Tech Lead} · **Last Updated**: YYYY-MM-DD

---

## 1. Overview / Goals
{系統做咩、解咩問題、核心 use case}

## 2. Scope & Tiers
- **In scope(當前 Tier)**:{}
- **Out of scope / 未來 Tier**:{明確唔做嘅 —— 對應 CLAUDE.md §5 scope constraint}

## 3. Core Architecture
{核心設計 —— 按你系統分 section。例:資料流 / 主要 pipeline / 演算法}
### 3.x {子系統}
{...}

## 4. Application Architecture
{API / 服務 / 前後端分工 / storage layout}

## 5. UI / Views(若有前端)
{各 view + layout philosophy —— 呢個受 CLAUDE.md §5 design constraint 保護}

## 6. Delivery Plan
### 6.1 Sprint / Phase Plan
{逐 phase 目標 —— phase folder plan.md 由呢度 cite}

## 7. Vendor / Tech Stack(locked)
{對應 CLAUDE.md §5 H-vendor 嘅 locked 清單}

## 8. Risks(frozen baseline)
{frozen 風險 baseline —— living 追蹤喺 01-planning/RISK_REGISTER.md}

## 9. {其他,例 Auth / Security / Infra}

## 10. Open Questions
{未定決策點 —— 詳見 decision-form.md}

## 11. Tier 2 / Future Trigger Matrix
{幾時先做未來 tier feature —— 對應 CLAUDE.md §5 scope constraint}

---

## 12+. {按項目加}

## Decision Log
{重大決定 —— 促成後 promote 做 ADR(見 adr/)}

---

**Change protocol**:呢份 spec 嘅 frozen section 改動 = 架構級 → 觸發 CLAUDE.md §5 hard constraint → STOP+ask + ADR。
