# CH-006 — Progress Log

> Change:Overview 營運活動流(`RequestEvent` 取代 audit feed)
> Spec:`spec.md`(v1.0,approved 2026-07-21)· Checklist:`checklist.md`

---

## Day 1 — 2026-07-21

### Kickoff

CH-005 carry-over。開工前查證,三項落實 + 一項修正:

| # | 決定 | 由 |
|---|---|---|
| D1 | `RequestEvent` **取代** Overview feed;`AuditLog` 留 `/audit` | Chris |
| D2 | `@@index([createdAt])` 當 **H1-lite** —— approval + spec 記錄,唔開 ADR | Chris |
| D3 | 走 **Change** workflow(CH-006) | Chris |
| D4 | `request-detail` raw-enum **唔改**(default out-of-scope) | AI(Chris 未另行指示) |

**D1 嘅實證理由**:曾考慮合併兩個來源(BACKLOG 原本嘅「多加一個來源」)。但 feed limit = 6,而 `auth.login_success` **每次登入寫一條 AuditLog** —— 直接按時間合併,admin 嗰六行大機會全係 sign-in,反而將 assign / stage 推進洗走。即係為咗加營運內容,結果營運內容更加見唔到。

### 開工前查證(改寫咗 spec 兩處)

**① BACKLOG 前置描述唔準確。** 佢寫 `RequestEvent`「只有 write、零 read surface」。實情:`request-detail.tsx:354` **已經 render 緊** per-request timeline(資料嵌喺 `GET /fulfilment/requests/:id`)。真正缺嘅只係**跨 request 全域查詢**。

結論唔變,但多咗約束:前端已有 `EVENT_TONE`(`request-detail.tsx:32`)。另寫一套 = CH-005 刻意避開嘅「兩處真相」→ spec 要求抽出共用 + grep 驗(B7)。

**② 個 feed 實際有咩內容 —— 四個 write site:**

| 來源 | type | actor | message |
|---|---|---|---|
| `assign.service.ts:167` | `ASSIGN` | ✅ | `Assigned {skuPartNumber}` |
| `stage.service.ts:122` | `STAGE_CHANGE` | ✅ | **無** —— 只有 fromStage→toStage |
| `assign.service.ts:56` | `SYNC` | ❌ | `Phase 1 sync confirmed` |
| `request.service.ts:98` | `NOTE` | ❌ | `Line item added: …` |

兩個誠實 gap:`EventType.RECONCILE` enum 有但 **`src/` 零 write site**(唔會喺 UI 宣傳有對帳活動);`STAGE_CHANGE` 冇 message,文字要前端砌。

**③ 一個 PII 位。** `Request` 有 `targetUpn` / `requesterEmail` / `targetDisplayName`(onboarding 對象),而本 endpoint 開畀 OPCO_IT。DTO 順手 `include` 就漏。→ B6 抄 W31 G1:餵齊 PII,assert 序列化結果零出現。

**④ 路由脆弱點。** `fulfilment.controller.ts` 有 `@Get(':id')`;`@Get('events')` 要靠宣告次序先唔會被食。→ 開獨立 `@Controller('fulfilment/activity')`,跟 W31 `outbound-failure.controller.ts` 先例。

### Branch 說明

Branch 由 `feat/w31-outbound-failure-recovery` 出,**唔係 main** —— 本機 dev DB 已 apply W31 migration,由 main 出會令 Prisma 見到 drift 要 reset。

> ⚠️ **CH-006 個 PR stack 喺 PR #16 上面,要 #16 先 merge。**

---

### 實作(F1–F4)

| 組 | 交付 | commit |
|---|---|---|
| F1 | `@@index([createdAt])` + migration `20260721152629_…` | `6751cb2` |
| F2 | `activity.service.ts` + `dto/activity-query.dto.ts` + 9 test | `6751cb2` |
| F3 | `activity.controller.ts`(獨立 controller)+ module 接線 | `6751cb2` |
| F4 | 前端換來源 + `EVENT_TONE` 去重 + 15 test | `d0e2db0` |

**F3.3 偏離**:原定寫獨立 controller spec,但 `fulfilment/` 零 controller spec —— 本項目 role 驗證集中喺 `auth/permissions.spec.ts`(W28,矩陣由 `@Roles` **derived**)。跟既有 pattern。新 controller 被 glob 自動發現,兩處**刻意**更新:controller 名單 + matrix snapshot。snapshot diff **只得一行**(`GET /fulfilment/activity → roles [ADMIN,REGIONAL,OPCO_IT]`,`access = roles` 非 `unguarded`),讀完先 `-u`。

### Live 驗證 —— 三方對照(B2 / B3 / B6)

**先解決一個「證明唔到嘢」嘅陷阱。** DB 原本 16 條事件**全部集中喺 PFU-Asia**,而 active 嘅 OPCO_IT 帳號都係 RHK scope —— 佢會見到 **0 條**。「空」既可以代表 scope 正確,亦可以代表 query 壞咗。所以先插 2 條 RHK probe 事件,令對照變成「**非空但被過濾**」:

| 身份 | 見到 | 判讀 |
|---|---|---|
| ADMIN | **18**(16 PFU-Asia + 2 RHK) | 真跨 OpCo,未被誤 scope |
| OPCO_IT (RHK) | **2**,全部 RHK,**PFU-Asia 洩漏 0** | scope 生效且方向正確 |
| OPCO_IT → `/admin/audit` | **403** | ADR-0009 D7 未被放寬 |

壞掉嘅 scope 會出 18;方向錯會出 16 或 0。**只有正確實作先會啱啱好出嗰 2 條。**

**B6 live**:ADMIN response 欄位 = `id,type,fromStage,toStage,message,createdAt,actorName,requestId,requestRef` —— 剛好九個白名單欄位,零 `targetUpn`/`requesterEmail`/`targetDisplayName`。
**B4 live**:`limit=999`→**400** · `50`→200 · `0`→**400** · 無 limit→預設 ≤6。

測試資料事後刪清(0 probe request / 0 probe event,回到 16 條;`onDelete: Cascade` 正常)。

### UI 驗證

**B1** ADMIN 六行**行齊每條文字分支**:有 message(`CH006 probe note`)/ **stage 對砌**(`Awaiting vendor → ready`,`STAGE_CHANGE` 冇 message)/ 有 actor(`— Chris Lai`)/ **無 actor 且冇拖住破折號**(`Phase 1 sync confirmed …`)/ SN 號(`REQ-2035`)/ **id-tail fallback**(`be-req`)。

**B11 窄視窗截圖驗**:極窄下文字換行、`be-req` 落第二行、時間靠 `shrink-0` 保留喺右邊,**零內容被切走**,body 唔橫向 scroll,`View requests →` 仍撳得到。(W31 嗰個「掣被推出視窗、DOM 全綠」嘅反面。)

**B10 dark**:量度前 wait 900ms 避開 transition 中間幀(W30 假陰性坑)。四個色值**全部** swap ——
`cardBg` 255,255,255→20,20,23 · `chipBg` 238,238,240→28,28,32 · `chipFg` 82,82,91→161,161,170 · `monoFg` 154,154,164→108,108,118;`Geist Mono` 兩邊維持。

### `ui-design` 12 條自檢(B14)

| # | 結果 | 備註 |
|---|---|---|
| DS-1 token-only | ✅ | grep 改動檔零 `#hex`/`rgb(`/`gradient` |
| DS-2 唔 eyeball | ✅ | 版面沿用 CH-005 已對過 token 嘅結構,零新數值 |
| DS-3 單一 accent + 一 primary | ✅ | feed 零 primary action;HeaderLink 唔算 |
| DS-4 light + dark | ✅ | 四色全 swap(見上) |
| DS-5 數字/識別碼 mono | ✅ | `requestRef` + 相對時間 live 量到 `Geist Mono` |
| DS-6 lucide stroke | ✅ | `ArrowRight`/`UserCheck`/`RefreshCw`/`Scale`/`FileText`,全 stroke |
| DS-7 平面美學 | ✅ | 沿用 1px border + surface tint,零新陰影/gradient |
| DS-8 狀態走 semantic tone | ✅ | `EVENT_TONE` 單一來源,同 request-detail 共用 |
| DS-9 motion 克制 | ✅ | 零新 motion |
| DS-10 voice / casing | ✅ | Sentence case;`Awaiting vendor → ready` 句首大寫、其餘跟 `STAGE_LABEL` |
| DS-11 對 prototype | ✅ | 行版面同 CH-005 一致(源自 prototype activity stream);**今次先真正對到 prototype 個語意**(營運事件,唔再係 audit) |
| DS-12 唔捏造 logo | N/A | 冇掂 brand |

### 教訓

**① 「三方對照」要有一方係非空。** 若照原計劃用 RHK OPCO_IT 對住全 PFU-Asia 嘅資料,會見到 0 條然後打勾 —— 但 0 條同「query 壞咗」睇落一模一樣。插兩條 RHK 資料令兩個 scoped 身份**各自見到非空但不相交**嘅集合,先係壞實作扮唔到嘅形態。

**② 殺進程唔可以靠 command line 含 workspace 路徑。** `Start-Process -FilePath "node" -ArgumentList "dist/main"` 起出嚟嘅進程,command line 係 `node dist/main` —— **唔含 workspace 名**,我個 filter miss 咗佢,舊 ADMIN 進程一直霸住 3100,之後每次「重起」都 bind 唔到就死,而我 curl 到嘅一直係舊嗰個。**按 port 揪 listener** 先係可靠做法(機器上有其他專案嘅 node,更加唔可以用闊 filter 掃)。

**③ dev run-as 要順帶檢查 `active`。** `AUTH_DEV_USER_EMAIL` 指向咗一個 `active = f` 嘅殘留帳號,guard 按設計 fallback 落 seed ADMIN —— 表面睇「env 冇生效」,實情係 env 生效咗但用戶唔合格。**guard 自己 log 咗原因**,早啲讀 log 可以慳返兩次錯誤診斷。

### 未達標項(誠實記錄)

**B13 web 測試數 123 → 123,未達 spec 寫嘅 ≥128。** 唔係漏寫 test:`activity.test.ts` 9 + `activity-feed.test.tsx` 6 = **15**,而 CH-005 嗰時係 10 + 5 = **15**。本 Change **換來源**,CH-005 嗰批 audit 措辭 test 連同佢哋守護嘅 audit 映射一齊刪。原數字基於「test 會累加」嘅錯假設 → 已按 R3 記入 spec §7 changelog。

**一個仍靠 live 而非回歸 test 守住嘅行為**:Overview card 對 non-admin 可見(即 gate 移除本身)。已 live 驗(B2),但冇 component test 鎖死 —— 要鎖需要新開 `overview.test.tsx` 並 mock 四個 query hook。**登記為 candidate,唔喺本 Change 做**(避免為咗補數字而擴 scope)。
