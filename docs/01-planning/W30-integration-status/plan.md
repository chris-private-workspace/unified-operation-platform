---
phase: W30-integration-status
name: "Integration 狀態 + Test connection(ADR-0010 item 4 / INTEG-1)"
sprint_week: W30
start_date: 2026-07-21
end_date: 2026-07-22          # planned, may slip with changelog log
status: closed                # draft | active | closed — G1-G9 全 pass,2026-07-21 closeout
spec_refs:
  - docs/adr/0010-integration-observability-delivery.md（D2/D3/D4/D5/D6 — 全部本 phase 落地）
  - docs/02-architecture/audit-and-integration-observability.md §2.4（整合現況）· §6 item 4
prior_phase: W29-audit-log
---

# Phase W30 — Integration 狀態 + Test connection

> **Plan version**:1.0(initial)
> **Owner**:AI(執行)/ Chris Lai(decision)
> **Approved by**:**Chris Lai(2026-07-21)** —— §9 三點拍板(Q1/Q2/Q3,全部照建議)

## 1. Scope

ADR-0010 **Accepted**,本 phase 落實 rollout **item 4**:令 Integrations tab 由一個自認「coming soon」嘅 EmptyState,變成有真內容 —— **connector 部署形態 + 最後成功時間 + 可撳嘅唯讀 Test connection**。

**同 W29 嘅風險對比**:W29 改咗 6 個既有 service 嘅 transaction 邊界(高風險)。**本 phase 相反 —— 純新增讀取面**:新 endpoint、新 UI panel,唔改任何既有寫入路徑、唔加 schema、唔加 dependency。風險等級明顯低一級,接近 W28。

**唔喺本 phase**(ADR-0010 D1):item 5 n8n 回程 webhook(卡 OQ-D 外部合約會)· item 6 outbound retry(路線已定但要新 model,另開)。

## 2. Deliverables

### F1 — Connector 狀態 read-model（後端服務層）

- **Spec ref**:ADR-0010 **D3**(三態)+ **D4**(派生時間戳)
- **內容**:`integration-status.service.ts` —— 純 query layer,砌出每個 connector 一行。

| connector | state(D3) | 最後成功時間來源(D4) |
|---|---|---|
| Microsoft Graph | `required` | `max(SkuCatalog.lastSyncedAt)` · `max(TenantSkuSnapshot.capturedAt)` 取較新 |
| ServiceNow | `required` | 最近一張 `serviceNowSysId` 非 null 嘅 `Request` |
| n8n outbound | `active` / `inactive`(睇 `REQUEST_SUBMISSION_PROVIDER`) | 最近一張 `origin='platform-created'` **且** `serviceNowSysId` 非 null 嘅 `Request` |
| n8n inbound(intake) | `required`(`INTAKE_API_KEY` boot fail-fast) | ⚠️ 見下「誠實邊界」 |

- **🔴 誠實邊界(唔可以扮準)**:`Request.origin` 嘅 **default 就係 `'onboarding-intake'`**(`schema.prisma:200`),所以 W03 seed 出嚟嘅單同真 n8n intake **分唔開**。→ n8n inbound 一行**唔顯示派生時間**,標「無法從既有資料區分」。**寧可交白卷都唔畀一個錯嘅時間** —— 呢個 gap 由 item 5(回程 webhook)或將來獨立 health 記錄解決。
- **Acceptance criteria**:
  - 每行只回 allow-list 欄位(D2),**任何 env 值 / secret / 遮罩值都唔會出現**
  - Graph / ServiceNow / intake 一律 `required`(因 constructor `getOrThrow` fail-fast),**唔會出現 `configured: false` 呢種恆真廢話**
  - n8n outbound 隨 `REQUEST_SUBMISSION_PROVIDER` 正確切 `active` / `inactive`
  - 冇任何成功紀錄時 → `lastSuccessAt: null`(唔可以 fallback 做「而家」或者亂估)
- **Effort estimate**:2h

### F2 — `GET /admin/integrations` + `POST /admin/integrations/:key/test`

- **Spec ref**:ADR-0010 **D2**(絕不回 secret)+ **D5**(唯讀探針 / ADMIN-only / 節流)
- **內容**:
  - `GET /admin/integrations` → F1 個 read-model,`@Roles(ADMIN)`
  - `POST /admin/integrations/:key/test` → 唯讀探針,`@Roles(ADMIN)`

| key | 探針 | 重用既有方法 |
|---|---|---|
| `graph` | `getSubscribedSkus()` | ✅ 既有,唯讀 |
| `servicenow` | `query('', <defaultTable>, 1)` | ✅ 既有,GET + `sysparm_limit=1` |
| `n8n-outbound` | **只驗配置存在,唔打 webhook** | — |
| `n8n-inbound` | **不適用**(方向係外部推入) | — |

- **🔴 三條硬規**:
  1. **絕不 `createRecord`** —— SN 探針只可 GET
  2. **絕不打 n8n webhook** —— 佢會建真 ticket(ADR-0008 乙/丙)
  3. **vendor 原始 error 唔可直吐前端** —— 可能含 instance URL / 帳號提示;沿用既有 `graph-unavailable.ts` wrap 手法轉成結構化結果
- **節流(D5 連帶義務)**:同一 connector 最短間隔(建議 10s),超出回 429。**唔可以做成 `@Cron`** —— 探針只可用戶觸發。
- **Acceptance criteria**:
  - 非 ADMIN → **403**(live 三重驗證,同 W28/W29 做法)
  - 探針失敗 → 結構化 `{ ok: false, message }`,**message 唔含 URL / 帳號 / secret**
  - 連撳兩次 → 第二次 429
  - W28 `permissions.spec.ts` 會自動捕捉新 route(預期 snapshot + controller 名單兩重紅 → deliberate update)
- **Effort estimate**:3h

### F3 — 前端 Integrations tab 真內容

- **Spec ref**:ADR-0010 **D6** · `design-system.md`(H6)
- **內容**:`components/settings/integrations-panel.tsx` 取代 `settings.tsx:240-246` 個 EmptyState —— 每個 connector 一行:名 · state badge · 最後成功時間 · Test connection 掣 + 結果。
- **🔴 D6:刪走文案入面嘅 DocuWare** —— 後端零實作 + H3 明文排除,唔可以繼續向用戶承諾一個刻意唔做嘅整合。
- **Acceptance criteria**:
  - token-only · lucide-only · light + dark(H6)
  - **一個 view 一個 primary**:Test connection 掣一律 `secondary`(allocation import 個 upload 已經係呢個 tab 嘅 primary)
  - 時間 / 識別碼用 **mono**(DS-5)
  - n8n inbound 一行誠實顯示「無法從既有資料區分」,**唔留白扮正常**
  - 403 → restricted state(後端先係真權威)
- **Effort estimate**:3h

### F4 — Test

- **H5**:F1 read-model(三態 / 派生時間 / 冇紀錄 → null)· F2(403 / 節流 429 / 探針失敗 wrap / **`createRecord` 同 webhook 從未被呼叫**嘅斷言)· F3 純函數(state → badge tone / 時間格式)
- **🔴 最重要嗰條**:一條 test **斷言 status 回應序列化之後唔含任何 env 值**(餵一個含假 secret 嘅 config,assert 回應唔含該字串)—— 同 W29 H4 test 同一思路,係 D2 嘅唯一自動化保證
- **Effort estimate**:含喺 F1-F3 內

## 3. Success Criteria(Phase Gate)

| # | Criterion | Target | Measure | Block closeout? |
|---|---|---|---|---|
| G1 | **回應絕不含 secret / env 值** | 0 | 專門 test(餵假 secret assert 唔出現)+ live 回應肉眼核 | **Yes(硬紅線)** |
| G2 | 探針零副作用 | 0 | test 斷言 `createRecord` / webhook **從未被呼叫** | **Yes(硬紅線)** |
| G3 | 非 ADMIN → 403 | 403 | live 三重驗證(`/me` 確認身分 → 403 → 對照 endpoint 200) | Yes |
| G4 | 三態正確 | 4/4 connector | test + live 切 `REQUEST_SUBMISSION_PROVIDER` 對照 | Yes |
| G5 | 節流生效 | 第二次 429 | live 連撳 | Yes |
| G6 | 前端 light + dark | 兩個 theme | browser 實截 | Yes |
| G7 | build + lint + test 全綠 | api ≥266 · web ≥93 | 三個 command | Yes |
| G8 | **零既有行為改動** | 既有 API / 權限 / 對帳不變 | 既有 test 全綠 + `git diff` 核 | Yes |
| G9 | DocuWare 文案已清 | 0 提及 | grep `settings.tsx` | Yes |

## 4. Risks(Phase-Specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | **探針意外有副作用**(手滑用咗 `createRecord`,或者為咗「測真啲」而打 n8n webhook → 開咗張真單) | Low | **Critical** | G2 硬紅線;test 明文斷言兩者從未被呼叫;code review 睇死呢兩個 call site |
| **R2** | **回應洩漏 env 值**(為咗 debug 方便回埋 URL / 帳號) | Med | **High** | G1 硬紅線;DTO 採 allow-list(唔用 spread);專門 test |
| R3 | 派生時間戳被誤解成 health check | Med | Med | UI 文案明寫係「最後成功使用」唔係「最後檢查」;n8n inbound 直接交白卷 |
| R4 | 探針打真 tenant 造成無謂流量 | Low | Low | 節流 + 只准用戶觸發(D5 連帶義務),**唔可 cron 化** |

## 5. Day-by-Day Breakdown(rough)

| Day | Date | Focus | Deliverables |
|---|---|---|---|
| D1 | 2026-07-21 | F1 read-model + F2 endpoint + test | F1, F2 |
| D2 | 2026-07-22 | F3 前端 + live 驗 + closeout | F3, F4 |

## 6. Dependencies on Prior Phase

- **ADR-0010 Accepted**(OQ-A 容許唯讀主動探針 · OQ-B 派生既有 timestamp · OQ-C item 6 人手 retry)→ 本 phase 全部設計依據。
- W29 carry-over:W28 個 `permissions.spec.ts` **會自動捕捉本 phase 新 endpoint**(兩重 gate:snapshot + controller 名單)—— 免費迴歸網,預期兩條都紅,審視後 deliberate update。
- 既有可重用:`GraphService.getSubscribedSkus()` · `ServiceNowService.query()` · `graph-unavailable.ts` wrap helper —— **探針零新 vendor 方法**。

## 7. Plan Changelog

| Date | Change | Reason | Approver |
|---|---|---|---|
| 2026-07-21 | Initial plan,status=**draft** | 待 Chris approve §9 三點 | — |
| 2026-07-21 | **§9 三點拍板 → status `draft` → `active`** | Q1 交白卷 · Q2 節流 10s · Q3 state 與探測結果分開兩個欄位(避免 restart 後 error 憑空消失) | Chris Lai |

## 8. 一個實作面要留意嘅位

ADR-0010 D4 講「派生既有 domain timestamp」,但**四個 connector 入面有一個派生唔到** —— n8n inbound。因為 `Request.origin` 個 default 就係 `'onboarding-intake'`(`schema.prisma:200`),seed 出嚟嘅單同真 intake 完全分唔開。

本 plan 嘅處理係 **交白卷**(標「無法從既有資料區分」)而唔係揀個近似值。理由:一個睇落合理但實際錯嘅時間戳,比「唔知」更危險 —— 運維會照住佢判斷 connector 死咗未。

呢點 ADR-0010 冇預見到(佢個表列咗 n8n inbound 有派生來源)。**屬實作層修正,唔改 ADR 決定方向**,closeout 時喺 ADR References 補一句註。

## 9. 拍板結果（Chris,2026-07-21 — 三點全部照建議)

| # | 問題 | 決定 |
|---|---|---|
| **Q1** | n8n inbound 一行點處理 | ✅ **交白卷,標「無法從既有資料區分」** —— 誠實 gap 好過隱藏或者呃人。**唔可以**因為一行留空「唔靚」而補個近似值 |
| **Q2** | 節流間隔 | ✅ **10s**(同一 connector);超出回 **429** |
| **Q3** | 探針失敗時 state 點顯示 | ✅ **state 唔變,另有「上次探測」結果** —— `state` 講**部署形態**(由 config 算出),探測結果係另一件事。溝埋會令 restart 之後個 error **憑空消失**(state 重算返 `required`),睇落似「自己好返」,實際上乜都冇修好 |

**Q3 嘅實作後果**:回應要有兩組獨立欄位 —— `state`(部署形態,恆定)+ `lastProbe`(nullable,只喺本次 process 撳過 Test 先有值)。`lastProbe` **唔持久化**(D4 已決唔開 model),所以要明講佢係 in-process、restart 即清 —— UI 唔可以令人以為佢係歷史紀錄。

---

**Lifecycle reminder**:呢份 plan **status=draft**,**未 approve 唔開工**(PROCESS R1)。approve 後 flip `active`,重大 deviation 入 §7 changelog。
