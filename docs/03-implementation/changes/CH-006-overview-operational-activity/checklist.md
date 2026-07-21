# CH-006 — Implementation Checklist

> 由 `spec.md §3 Acceptance` 推導。每項 atomic;完成即 tick。
> **Sacred rule**:唔可以刪未勾項 —— 只可以 `[x]` 或標 🚧 + 理由 + target。

## F1 — 後端:index + migration

- [x] F1.1 `prisma/schema.prisma` `RequestEvent` 加 `@@index([createdAt])`(保留既有 `[requestId, createdAt]`)
- [x] F1.2 `npx prisma migrate dev --name add_request_event_created_at_index` 實跑 apply(`20260721152629_…`)
- [x] F1.3 **B8** 驗 dev DB 真係有新 index —— `pg_indexes` 查得 `RequestEvent_createdAt_idx`,舊 composite 仍在(3 個 index)

## F2 — 後端:query service

- [x] F2.1 `src/fulfilment/dto/activity-query.dto.ts` —— query DTO(`limit` default 6 / max 50)+ response DTO(白名單欄位)
- [x] F2.2 `src/fulfilment/activity.service.ts` —— `recent(user, limit)`,conditional scope spread
- [x] F2.3 `activity.service.spec.ts`(9 test):
  - [x] **B3** OPCO_IT 查詢 where 帶 `request.opcoId`(fail-closed)
  - [x] **B5** ADMIN / REGIONAL 嘅 where **唔含 `request` 鍵**(`it.each` 兩個 role)
  - [x] **B4** `limit` 上限 —— DTO `@Max(50)` + controller `Math.min` 二重(見 F3.1)
  - [x] **B6** **PII 負面斷言** —— 餵**比 select 更肥**嘅 row,assert 序列化零出現 6 個 PII 標記
  - [x] `orderBy createdAt desc` + `take` + `select` 白名單形狀

## F3 — 後端:controller + 接線

- [x] F3.1 `src/fulfilment/activity.controller.ts` —— `@Controller('fulfilment/activity')`,`@Roles(ADMIN, REGIONAL, OPCO_IT)` + `Math.min` re-clamp
- [x] F3.2 `fulfilment.module.ts` 註冊 controller + service
- [x] F3.3 ~~`activity.controller.spec.ts`~~ → **改用既有 `permissions.spec.ts`**(見下)
- [x] F3.4 `apps/api` test **333/333** · lint 0 · build 0

> **F3.3 偏離原 checklist(非 scope 改動)**:原本諗住寫獨立 controller spec,但 `fulfilment/` **零 controller spec** —— 本項目嘅 role 驗證集中喺 `auth/permissions.spec.ts`(W28,矩陣由 `@Roles` **derived**,唔手寫)。跟既有 pattern 好過另起一層(§13)。
> 新 controller 被 glob **自動發現**,兩處刻意更新:①controller 名單加 `ActivityController` + 理由註釋 ②matrix snapshot。snapshot diff **只得一行**(`GET /fulfilment/activity → roles [ADMIN,REGIONAL,OPCO_IT]`),`access = roles` 非 `unguarded`,其餘零移動 —— 讀完 diff 先 `-u`,冇反射式掃過。

## F4 — 前端:來源切換

- [ ] F4.1 `src/lib/api-types.ts` 加 `ActivityEvent`(`AuditEntry` 保留唔郁)
- [ ] F4.2 `src/lib/activity.ts` 改寫 —— `eventTone` / `eventIcon` / `eventSummary`;`STAGE_CHANGE` 用 `STAGE_LABEL` 砌文字
- [ ] F4.3 **B7** `EVENT_TONE` 抽入 `lib/activity.ts`,`request-detail.tsx` 改 import;grep 驗全 repo **只有一處定義**
- [ ] F4.4 刪 CH-005 遺下嘅 audit 映射 orphan(`ACTION_LABEL` / `ACTION_ICON` / `activityTone`)—— 確認 `/audit` 頁不受影響
- [ ] F4.5 `src/hooks/queries.ts` 加 `useActivity({ limit })`
- [ ] F4.6 `activity-feed.tsx` 換 hook + **B12** EmptyState 改營運措辭
- [ ] F4.7 `overview.tsx` 移除 `canSeeAdminNav` gate;header link → `/requests`;清 orphan import
- [ ] F4.8 `lib/activity.test.ts` 重寫 + feed component test(含空狀態,**用 component test 唔用 live hack**)
- [ ] F4.9 `apps/web` test / lint / build 綠

## F5 — 驗收

- [ ] G-B1 ADMIN live:Overview card ≤6 行真事件 + ref + 相對時間
- [ ] G-B2 **OPCO_IT live 對照**:card 見到,且只有自己 OpCo 事件(vs ADMIN 見跨 OpCo)
- [ ] G-B9 H6 token-only grep(零 hex / rgb / gradient)+ lucide stroke + 零 primary action
- [ ] G-B10 light + dark 都驗;時間 / requestRef mono(DS-5)
- [ ] G-B11 **截圖驗**窄視窗冇內容被切走(W31 教訓 —— DOM 綠唔代表用到)
- [ ] G-B13 api **324 → ≥332** · web **123 → ≥128**
- [ ] G-B14 跑 `ui-design` skill 12 條,逐條記錄

## F6 — 收尾

- [ ] F6.1 `progress.md` 完成摘要 + 教訓
- [ ] F6.2 `spec.md` status → `done`
- [ ] F6.3 BACKLOG `FE-activity-ops` → ✅ 完成(R7)
- [ ] F6.4 `design-system.md §6` 檢查是否需登記(Overview card 改來源,非新畫面)
- [ ] F6.5 commit + push + PR
