---
phase: W11-auth-opco-scope
status: active
---

# W11（AUTH-3a）— Progress（daily + retro）

## Day 0 — 2026-07-10（kickoff / plan draft）

**做咗**:
- Chris 選推 AUTH-3（OPCO_IT per-OpCo scope)。**Research 摸清現狀**:
  - **H1 查證 = 不觸發**:`Role.OPCO_IT`（schema L28)+ `AppUser.opcoScopeId`（L37,null=全部)+ `Request.opcoId`（L151)+ `@@index([opcoId,status])` 已就緒 → 純 query-layer,無 schema 改動。
  - **Backend 觸點**:`JwtAuthGuard` 已 attach `req.user` + `@CurrentUser()` 可注入;fulfilment `@Roles(ADMIN,REGIONAL)` 現擋晒 OPCO_IT;`listRequests`/`getRequestDetail` 無 opco filter;write（assign/stage/sync）無擁有權檢查;license `@Roles` controller-level;seed 無 OPCO_IT user。
  - **同 AUTH-2 一樣 blocker**:真 OPCO_IT SSO e2e 卡返 IT app reg（dev-bypass 永遠 seed ADMIN)→ 拆 **3a（後端強制,今日驗到)/ 3b（前端+真 e2e,卡 IT)**。
- **OD 敲定（AskUserQuestion）**:OD1=**3a 後端 only** · OD2=**OPCO_IT 亦見 tenant drift**（GET catalog/drift 放行,POST reconcile/sync 唔放)· OD3=**加 dev run-as `AUTH_DEV_USER_EMAIL`** + seed OPCO_IT user。
- 寫 `W11-auth-opco-scope/plan.md`（+ checklist + progress):8 deliverable（/me · scope helper · read scope · write guard · role guards · dev run-as · tests · closeout)+ G1-G8 gate。

**未做 / 待敲**:
- **plan 待 approve**（R1:approve 咗先 code）。
- **OD-A 待確認**:scope 強制 = 套既有 model + ADR-0002 延伸,建議**唔另寫 ADR** → 等 Chris 一句。

**🚩 flag / 誠實限制**:
- 🔴 真 OPCO_IT SSO e2e（真帳戶只見自己 OpCo)卡 IT app reg → 3a 只 unit + dev run-as 驗,真 e2e 留 3b,誠實標未驗。
- role elevation 仍手動（Entra app-role→claim mapping 未做)→ 真 OPCO_IT 用戶要人手 set role+opcoScopeId（3b/IT 對接)。

**紀律自檢**:H1 已查證不觸發（schema 就緒)· H3 只建機制唔對外開放 self-service（DESIGN §10 open)· H4 dev knob 只 dev-bypass 生效 prod 不受影響 · H5 assign/stage scope guard = critical path 要 test · R1 plan-first 未 code。

**下一步**:等 plan approve（+ OD-A 定案)→ Day 1 D1-D3+D5。

---

## Day 1 — 2026-07-10（approve + 全 D1-D8 一日完成）

**approve**:Chris approve plan;OD-A = 無 ADR。status draft→active。

**做咗（D1-D7 一氣呵成,為令 committed 狀態始終 security-consistent[唔會 role 開咗但 write 未 guard],read+write+role guard 一次過落,plan Day-by-Day 本為 rough — R3 記）**:
- **D1 /me**:`auth/me.controller.ts`（`@Get('me')` + `@CurrentUser()`,無 @Roles = 任何 authenticated）+ `dto/me.dto.ts` + 掛 AuthModule `controllers`。PrismaService @Global 直接注入,OPCO_IT 時 resolve opcoScope{code,displayName}。
- **D2 scope helper**:`auth/opco-scope.ts` `scopeWhere`（null→{}/設值→{opcoId}）+ `assertOpcoScope`（null→allow/mismatch→403）。純函數,`opco-scope.spec` unit。
- **D3 read scope**:`request.service` `listRequests(actor)` 加 `where: scopeWhere`;`getRequestDetail(id, actor)` 讀後 `assertOpcoScope`（防 id-guess 洩漏）。
- **D4 write guard**:`intake`（**補入,原 plan 清單漏,同類 create-with-opcoId,R3**）/ `addLineItem` / `advanceStage` / `markSynced` / `assignLineItem` 全部接 `actor` + `assertOpcoScope`;assign scope gate **擺 5 gate 最前**（fail-closed）。**順帶**:`actorId` param 本來 dormant（controller 一直傳 undefined),統一成 `actor: AppUser` 後 advance/assign 事件而家記真 actor（operational timeline 受惠;非 gratuitous — 我改緊 signature 一定要傳 user，順手令本設計好嘅 dormant 欄運作）。
- **D5 role guards**:fulfilment `@Roles(ADMIN,REGIONAL,OPCO_IT)`;license GET catalog/drift method-level `@Roles(+OPCO_IT)`,POST sync/reconcile 維持 controller default（OD2:view vs action）。**已查證** `RolesGuard` `getAllAndOverride([handler,class])` = method 蓋 class（`controllers-guarded.spec` 明證 GET override / POST undefined）。
- **D6 dev run-as**:`jwt-auth.guard.resolveDevUser` 讀 `AUTH_DEV_USER_EMAIL`（設→by email+active;缺/miss→fallback seed ADMIN + warn）;`seed.ts` 加 `opco.it.rhk@rapo.com.hk`（OPCO_IT,scope=RHK,lookup by code）。**H4**:log 只 `role=… id=…` 唔 log email。
- **D7 tests**:新 `opco-scope.spec`（helper 純 unit）+ `me.controller.spec`（/me shape）+ 3 fulfilment spec 加 scope test（in/out-of-scope）+ 更新既有 signature（`actor` param;stage ADMIN.id='actor1' 保事件斷言）+ `controllers-guarded.spec` 改 roles + method-override 驗 + `jwt-auth.guard.spec` 加 run-as 2 test。

**驗（真 tool output）**:
- **G1** nest build 0 error · **G8** eslint exit 0（--fix 清 13 prettier）· **api test 56→81 全綠**（11 suites;+25 scope/run-as/me/helper）。
- **G6 live 對照**（docker postgres 5433 + seed OPCO_IT + setup 7 requests 跨 RHK/RAPO/IT/PFU-Asia;PORT=3100 dist boot）:

| 驗證 | run-as OPCO_IT(RHK) | ADMIN(dev-bypass) |
|---|---|---|
| `GET /me` | role OPCO_IT · opcoScope {RHK} | role ADMIN · scope null |
| `GET /fulfilment/requests` | **count 1（只 RHK）** | **count 7（全部）** |
| RHK req detail | 200 | 200 |
| RAPO/IT req detail（cross-OpCo） | **403** | 200 |

**Phase Gate**:G1-G8 **全過（8/8 可驗嘅)**;🔴 real-SSO e2e = AUTH-3b 卡 IT app reg,標未驗（同 AUTH-2b）。

**Retro（AUTH-3a）**:
- ✅ H1 事前查證 schema 就緒 = 慳返一次 STOP,純 query-layer 落地,零 model 改動。
- ✅ read+write+role 一次過落,committed 狀態始終 security-consistent（無「role 開咗但 write 未 guard」窗口）。
- ✅ dev run-as（OD3）令無 SSO 都端到端 live 驗到 scope,唔淨靠 unit — 補足 H7 誠實（run-as 對照表係真 curl output）。
- ✅ 補 intake guard + activate actorId = 完整化寫入面 scope + operational timeline;皆 trace 得返「thread current user into writes」,非 gratuitous。
- ⚠️ 誠實落差:真 OPCO_IT SSO 用戶端到端留 3b（卡 IT）;role elevation 仍手動（Entra app-role→claim 未做）;BE-ledger-read 未來 endpoint 亦需套 scope helper（記 BACKLOG）。
- **下一步（待 Chris)**:前端 AUTH-3b（consume /me 真 role + 移除假 toggle + My queue 解封 + Overview/Requests 隨 role scope）——卡 IT app reg;或推其他線。**未經指示唔自行開 3b。**
