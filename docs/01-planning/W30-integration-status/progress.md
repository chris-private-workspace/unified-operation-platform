---
phase: W30-integration-status
plan_ref: ./plan.md
checklist_ref: ./checklist.md
status: closed         # in-progress | closed
---

# Phase W30 — Progress

> Daily progress + 結尾 retro。
> 每 commit 必須對應一個 Day-N entry mention(R2 binding rule per PROCESS.md §5)。

---

## Day 0 — 2026-07-21: Kickoff

**Action**:Phase W30 kickoff(整合 rollout **item 4** / BACKLOG `INTEG-1`)

- Templates copied from `_templates/phase/`
- `plan.md` filled,status=**`draft`**(**未 active** —— 待 Chris approve §9 三點,R1 gate)
- `checklist.md` derived from plan deliverables(F0 gate + F1 read-model + F2 endpoint + F3 前端 + Verify)
- Branch:待開工時由 `main`(`3b77793`)開出

**前置**:

- **ADR-0010 Accepted**(2026-07-21;OQ-A 容許唯讀主動探針 · OQ-B 派生既有 timestamp · OQ-C item 6 人手 retry)—— PR #12 已 merge
- W29 收官,audit rollout item 1-3 完成;本 phase 係 item 4

**本 phase 定位 —— 風險比 W29 低一級**:

W29 改咗 6 個既有 service 嘅 transaction 邊界。**本 phase 純新增讀取面** —— 新 endpoint + 新 UI panel,零 schema、零 dependency、唔改任何既有寫入路徑。接近 W28 嘅風險等級。

**兩條硬紅線(G1 / G2)**:

1. **回應絕不含 secret / env 值** —— 連 masked 都唔回(ADR-0010 D2)。做法 = DTO **allow-list 明文列欄位,唔用 spread** + 一條餵假 secret 嘅 test 鎖死。
2. **探針零副作用** —— SN 只可 GET(**絕不 `createRecord`**),n8n **絕不打 webhook**(佢會建**真 ticket**)。test 明文斷言兩者從未被呼叫。

**取證確認可重用嘅嘢**(降低風險):`GraphService.getSubscribedSkus()` · `ServiceNowService.query(q, table, 1)` · `graph-unavailable.ts` wrap helper —— **探針零新 vendor 方法**。

**規劃階段已發現一處 ADR 冇預見到嘅嘢**(plan §8):

ADR-0010 D4 個表列咗 n8n inbound 有派生來源,但實際上**派生唔到** —— `Request.origin` 個 default 就係 `'onboarding-intake'`(`schema.prisma:200`),W03 seed 出嚟嘅單同真 n8n intake 完全分唔開。plan 嘅處理係**交白卷**(標「無法從既有資料區分」)而唔係揀個近似值:一個睇落合理但實際錯嘅時間戳,比「唔知」更危險 —— 運維會照住佢判斷 connector 死咗未。屬實作層修正,唔改 ADR 方向,closeout 補註。

**Commit**:`b58e7ce` — `chore(planning): kickoff W30 integration-status (plan status=draft)`

**⏸️ 等 Chris approve plan §9 三點先開 F1**(R1)。

---

## Day 1 — 2026-07-21

### Decisions / Open-Questions Resolved（R4)

Chris 拍板 plan §9 三點(全部照建議)→ plan `draft` → **`active`**,R1 gate 解除。

| # | 決定 | 實作後果 |
|---|---|---|
| **Q1** | n8n inbound **交白卷標「無法區分」** | `lastSuccessNote` 明文寫原因,唔補近似值 |
| **Q2** | 節流 **10s**/connector | 超出 429 |
| **Q3** | **state 唔變,另有「上次探測」結果** | 回應分兩組欄位:`state`(部署形態,恆定)+ `lastProbe`(**in-process,restart 即清**)。溝埋會令 restart 後 error 憑空消失,睇落似自己好返 |

### Done

**F1 read-model + F2 endpoint**(`a73e848`)· **F3 前端**(`d3b589a`)—— 一日做完,plan 原排兩日。

| 項目 | 結果 |
|---|---|
| 三態取代 `configured?` | Graph / SN / intake = `required`(constructor `getOrThrow` fail-fast);n8n outbound 隨 env 切 `active`/`inactive` |
| 派生時間(D4) | Graph = `max(lastSyncedAt, capturedAt)` · SN = 最近有 sysId 嘅 Request · n8n outbound = 最近 `platform-created` 且有 sysId |
| n8n inbound | **交白卷**(Q1) |
| 探針 | 重用 `getSubscribedSkus()` / `query('', table, 1)` —— **零新 vendor 方法** |
| test | api 266 → **286**(+20)· web 93 → **99**(+6) |

**兩條硬紅線 test 先行**:G1 餵六個假 secret → assert 序列化回應一個都唔含(連 `service-now.com` 片段);G2 跑晒四個探針 → assert `createRecord`/`updateRecord`/`addWorkNote` 從未被呼叫。

**Live 驗證全過**:G1(回應 + 頁面都零洩漏)· G3 403 三重(兩條 route 都 403 + 對照 200)· G4 切 provider `inactive`→`active` · G5 第二撳 429 · G6 light+dark · G9 頁面零 DocuWare。

**順手修語意**:探針原返 `201 Created`,但佢乜都冇建立 → `@HttpCode(200)`。

### 三個過程中揪到嘅嘢

**1. ui-design 自檢真係捉到嘢**(唔係行禮如儀):`py-[13px]` 係憑感覺揀(→ `py-[11px]`,§1.3 `--pad-cell-y`)· `gap-[5px]` 唔喺 2px-step scale(→ `gap-[6px]`)· **閃電圖示加 `animate-spin` —— 轉圈嘅閃電讀落似 glitch**(→ pending 換 `RefreshCw`,跟 `drift.tsx` 慣例)。

**2. 追殭屍進程追錯咗方向**:睇到「remaining dev procs: 1」以為有殘留,查落發現**匹配到嘅係我自己嗰句查詢指令**(佢個 command line 含 `start:dev` 字串,regex 自我匹配)。真正問題係另一件事(見下)。

**3. 真正嘅進程坑**:kill 咗 port owner 之後,**舊 watcher 自動重生**霸住 3100,新開嗰個撞 EADDRINUSE 起唔到 → 我以為切咗 env 但其實答緊嘅係**舊 instance 舊 env**(`n8n-outbound` 一直顯示 `inactive`)。線索係「up after ~3s」異常快(正常冷啟動 15-54s)。

### Blockers
- 無

### Commits
- `a73e848` — feat(integration): W30 F1+F2 — connector 狀態 read-model + /admin/integrations
- `d3b589a` — feat(integration): W30 F3 — Integrations tab 真內容 + DocuWare 文案清走

---

## Day 2 — 2026-07-22

**未使用** —— F1-F3 全部喺 Day 1 完成(plan 原排兩日)。

---

## Retro

### What worked

**1. 落地取證改變咗設計,而唔係照抄 rollout 描述。**
原 rollout 寫「已配置 ✓✗」。寫 ADR 前逐個查 code,先發現 Graph / ServiceNow / intake key 全部喺 **constructor** `getOrThrow` —— 缺 config 就 boot 唔起,所以 `configured: true` 對佢哋係**恆真廢話**。改成三態 `required`/`active`/`inactive` 之後,個欄位先真係有資訊量。**呢個發現喺 ADR 階段出現,唔係 code 階段**,所以冇做完再拆。

**2. 「唔可以做」寫成資料而唔係 if-else。**
`PROBEABLE` map 裡面 n8n outbound 嗰行直接寫住原因 +「Do not add a probe here」。將來最易發生嘅事就係有人覺得「淨係驗配置唔夠真」而補個 probe —— 而嗰個 probe 會**開真 ticket**。寫成資料 + 註解 + G2 test 三重擋。

**3. 兩條硬紅線 test 先行,唔係事後補。**
G1(餵六個假 secret assert 唔洩漏)同 G2(跑晒探針 assert 冇 write call)都係喺實作同時寫,唔係 verify 階段先補。呢個係 W29 學到嘅做法,今次照搬。

**4. ui-design 自檢真係捉到嘢。**
三個位:eyeball 咗嘅 `py-[13px]`、off-scale 嘅 `gap-[5px]`、以及**加咗 `animate-spin` 嘅閃電圖示**。第三個尤其係「技術上冇錯但視覺上係 bug」—— 轉圈嘅閃電讀落似 glitch。呢種嘢淨睇 code diff 睇唔出,要逐條問先諗到。

### What didn't work / unexpected friction

**1. 進程管理食咗成半粒鐘,而且我一度追錯方向。**

先係睇到「remaining dev procs: 1」以為有殭屍,查落發現**匹配到嘅係我自己嗰句查詢指令**(command line 含 `start:dev` 字串 → regex 自我匹配)。白追一輪。

真正嘅坑係另一件:kill 咗 port owner 之後**舊 watcher 自動重生**霸住 3100,新開嗰個撞 EADDRINUSE 靜靜起唔到 → 我以為切咗 `REQUEST_SUBMISSION_PROVIDER=n8n`,但其實一直喺問**舊 instance 舊 env**,所以 `n8n-outbound` 死都係 `inactive`。

**線索本來就喺眼前**:「up after ~3s」異常快(正常冷啟動 15-54s)。下次見到啟動時間唔合理就應該即刻起疑,而唔係當佢好彩快。

**2. Browser screenshot API 壞咗**(CDP `params.clip.scale` deserialize error),截圖全程用唔到。靠 memory 記低嘅 fallback(JS DOM 驗)頂上,反而攞到比截圖更硬嘅證據(computed style 實際值)。

### Surprises / discoveries

**🔴 差啲報錯一個唔存在嘅 H6 violation —— dark mode DOM 量度陷阱。**

量到 Test 掣底色 light / dark **兩邊都係白色**,第一反應係「呢個 Button hardcode 咗白」。但逐層查:

1. `.bg-card { background-color: var(--card) }` 規則正確
2. `--card` **喺 button 元素度**確實解析成 `#141417`
3. 同樣用 `bg-card` 但唔係 `background` transition 嘅 Card **正常 swap**
4. **`document.hidden === true`** —— tab 隱藏

決定性一擊:暫時 `transition: none` → button 即刻由 `rgb(255,255,255)` 變 `rgb(20,20,23)`。

**結論:隱藏 tab 唔 paint,令 `transition-[background]` 永遠停喺起始值。** 量到嘅白色係假象,token 用法完全正確。

**教訓**:用 DOM 驗 dark mode 時,凡係**有 `background` transition 嘅元素喺隱藏 tab 都會報假陰性**。要麼揀冇 transition 嘅元素量,要麼臨時關 transition。呢個坑會令人(a)誤報 drift,或者更差 (b)為咗「修」一個唔存在嘅問題而去改 token。

### Carry-overs to W31

- 🟡 **ADR-0010 補註**:D4 個表列咗 n8n inbound 有派生來源,但實際派生唔到(`Request.origin` default 就係 `'onboarding-intake'`)。**屬實作層修正,唔改 ADR 方向** —— 本 closeout 已補註。
- 🟢 **`lastProbe` 唔持久化** 係 D4 嘅直接後果(唔開 health model)。若運維反映「想睇探測歷史」,就係重開 OQ-B 嘅訊號,唔好靜靜加個 model。
- 🟢 **`~$*.docx` Word 鎖檔** 會出現喺 `git status`(Chris 開住 spec 文件時)。今次冇 commit 到,但值得考慮加入 `.gitignore` —— **未做,因為超出本 phase scope**。
- 候選下一個:**INTEG-3** 人手 retry(⚠️ 要新 model = H1)/ **FE-activity**(⚠️ 受 `/admin/audit` ADMIN-only 限制,見 ADR-0009 Decision 7)/ **AUTH-2b**(🔴 卡 IT app reg)/ **DEPLOY**。
- 🔴 **item 5(n8n 回程)仍卡 OQ-D** —— 要 Chris 同 n8n owner 開合約對齊會。

### ADR triggers

- **無新 ADR** —— ADR-0010 已完整涵蓋 item 4。
- ADR-0010 **已補實作補註**(D4):n8n inbound 派生落空 + 點解交白卷。同 W29 補 ADR-0009 一樣,屬**補完既有決定嘅邊界**,唔係推翻。

### Phase Gate result

| # | Criterion | 結果 |
|---|---|---|
| G1 | 回應絕不含 secret / env 值 | ✅ **硬紅線過** — 專門 test(六個假 secret)+ live 回應 / 頁面雙重核 |
| G2 | 探針零副作用 | ✅ **硬紅線過** — test 斷言 `createRecord`/`updateRecord`/`addWorkNote` 從未被呼叫 |
| G3 | 非 ADMIN → 403 | ✅ 三重驗證,**兩條 route 都 403** |
| G4 | 三態正確 | ✅ live 切 `REQUEST_SUBMISSION_PROVIDER` 見 `inactive`→`active` |
| G5 | 節流生效 | ✅ 第二撳 **429** |
| G6 | 前端 light + dark | ✅(過程見「Surprises」嘅量度陷阱) |
| G7 | build + lint + test 全綠 | ✅ api **286** · web **99** · build 0 · lint 0 |
| G8 | 零既有行為改動 | ✅ 純新增;唯一改既有檔 = `settings.tsx` 換 panel + 清 orphan import、`integration.module.ts` 加 controller |
| G9 | DocuWare 文案已清 | ✅ live DOM `hasDocuWare: false` |

**9/9 pass。**

### Effort — actual vs planned

| Deliverable | Planned | Actual | Variance |
|---|---|---|---|
| F1 | 2h | ~1.5h | −0.5h |
| F2 | 3h | ~2.5h | −0.5h |
| F3 | 3h | ~2.5h | −0.5h |
| (未計) | — | ~0.5h | 進程管理 + 追錯方向 |

Phase 由 2 日壓到 **1 日**收。

### Phase status

- Closeout commit:_(本 commit)_
- Frontmatter status → `closed`(plan / checklist / progress 三份)
- BACKLOG synced(R7):INTEG-1 → ✅ 完成
- Phase W31 kickoff trigger:待 Chris 揀(見 Carry-overs)

---

**End of W30 progress**
