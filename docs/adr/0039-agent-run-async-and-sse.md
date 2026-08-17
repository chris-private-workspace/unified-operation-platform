# ADR-0039: Agent run 轉背景執行 + SSE —— 兼還 ADR-0029 A2 嗰筆基建債

**Date**: 2026-08-16
**Status**: **Accepted**
**Approver**: Chris Lai(方向 2026-08-16 批「要併埋一齊做」;**五條後果同日過目 ⇒ Accepted**)

> 🚧 同 ADR-0036 / 0037 / 0038 一樣,本文件住喺 branch `feat/w46-agent-runtime`,**未 merge 落 `main`**。
>
> **批准路徑**(留低係因為佢同 ADR-0037 / 0038 係同一條):Chris 先批方向「G5-B 同 G6 併埋一齊做」,
> 佢批嗰陣見到嘅係「BullMQ + SSE 一齊做」;查證之後浮出五條佢未見過嘅後果(**F2** 契約其實唔使
> break · **F4** SSE 同多 replica 令 **Redis 由「BullMQ 要」升級成「SSE 都要」** · **F5** 🔴 **DEV
> 根本冇 Redis,又一個 infra 依賴** · **F6** nginx 住喺 web container 要改 · **F7** ACA 支唔支援
> SSE **未驗證**)⇒ 補一輪過目先 `Accepted`。

---

## Context

### 觸發

**W46 期二 `G5-B` + `G6`**。兩件事本來喺 plan 入面係兩行,而開工前拆 G5 嗰陣先睇清楚佢哋係**同一件事嘅兩半**:

- `POST /agent/runs` 今日**同步等 LLM 返 `AgentRunDto`** ⇒ 推去 worker,前端就要有辦法知「幾時完」
- 而「前端點知幾時完」**就係 G6**

⇒ 只做 G5-B 就要 polling,而 polling **唔係過渡,係一個會留低嘅設計**。

### 觸發嘅 hard constraint —— **兩個 H1**

| | |
|---|---|
| **G5-B** | 改 `POST /agent/runs` 嘅回應語義。**ADR-0029 就係為咗同一種改動而寫**(改 assign 回傳形狀) |
| **G6** | 🔴 **ADR-0029 `A2` 明文否決咗 SSE**(「暫時」)⇒ 還呢筆債 = **推翻一個 `Accepted` ADR 嘅決定** |

**H2 唔觸發**:`bullmq` / Redis **已經喺 locked stack**(§5.2「背景工作:Redis + BullMQ」)。
⚠️ 但仍然係 `npm i` + **一個從來未存在過嘅 runtime 連線**(見 F5)。

### ADR-0029 A2 當時否決 SSE 嘅理由,同今日仲成唔成立

原文理由:「要 NestJS + nginx `proxy_buffering off` + ACA ingress 三層配合,而 DEV 部署先一個禮拜」。

- 🟢 **「DEV 部署先一個禮拜」唔再成立** —— 而家一個月,`B8` 解封,`/api/docs/api` 200 實測過
- 🔴 **「三層要配合」逐字仍然成立**,而且本 ADR 查證之後**比當時講嘅更具體**(F6 / F7)

⇒ 本 ADR **唔係話 A2 當時判錯**,係話**佢個前提之一過期咗,而另一個仍然要真做**。

### 五個查證過嘅事實(2026-08-16,對 repo 實查)

🟢 **① 本機有 Redis。** `docker-compose.yml:23-32` —— `uop-redis`,`redis:7-alpine`,`6379:6379`。

🔴 **② 但 API 從來冇連過佢。** `apps/api/.env.example` grep `REDIS` = **零命中**;
`apps/api/src` grep `bullmq|ioredis|@nestjs/bull` = **零命中**(plan §2.2 早就記低「locked 但零實作」)。

🔴 **③ `deploy/` 零 Redis。** ⇒ **DEV 環境冇 Redis**,而 ACA 側亦冇任何 Redis 資源宣告。

🟢 **④ nginx 喺 web container,唔喺 infra 手上。** `apps/web/Dockerfile:45-49` —— `nginx:1.27-alpine`,
config 由 **`apps/web/nginx.conf.template`** envsubst 渲染。⇒ **`proxy_buffering off` 係我哋自己改得到嘅**,
唔使等 infra。

🔴 **⑤ 但 ACA ingress 嗰層我哋改唔到,亦未驗證過佢對 SSE 嘅行為。**

---

## Decision

### F1 —— `POST /agent/runs` 只 enqueue,唔再等 LLM

Controller 建 `AgentRun`(`status: 'running'` + 一個 `start` step)→ 入 queue → 即刻返。

### F2 —— 🟢 **回應 shape 一個字唔改,而呢個係查證返嚟嘅,唔係設計出嚟嘅**

原本以為要 break 契約(「返結果」→「返 job id」)。實際上 **`AgentRunDto` 照返得**,只係
`status` 係 `running`、`steps` 得一個、`proposals` 空。

⇒ **前端已經識處理呢個狀態**:`ai-assist-card.tsx` 個 `RUN_TONE.running = 'info'`、
`RUN_LABEL.running = 'Running'` 一早就喺度(F8 寫嗰陣就預咗)。

📌 **所以呢個唔係 breaking change,係「返嘅嘢無咁完整」** —— 而個 DTO 由第一日起就容得落。
**H1 仍然觸發**(語義變咗:回應唔再代表「做完咗」),但代價比預期細一個數量級。

### F3 —— BullMQ 行 **in-process worker**,唔開第三個 container

同一個 Nest app 起 `Worker`。否決獨立 worker container:§5.2 locked stack 寫嘅係
**「Docker Compose(app + postgres + redis)」** —— 冇 worker;加一個 = 部署基建改動,
而本 phase 已經有一個外部依賴等緊(ADR-0037)。

⚠️ 代價明寫:一個長 run 佔住 api process 嘅 event loop 份額。可接受,因為 LLM call 係 **I/O-bound**。

### F4 —— 🔴 Redis 唔止 BullMQ 要,**SSE 都要**,而呢點改變咗佢嘅性質

ACA 可以行多過一個 replica。之下:

- **worker** 喺 replica A 跑緊個 run
- **瀏覽器** 條 SSE 連線可能落喺 replica B

⇒ **replica B 冇嘢可以 stream**。解法係 **Redis pub/sub**:worker 發布進度,每個 replica 訂閱。

📌 **所以「唔用 BullMQ,用 `setImmediate` 喺同一個 process 背景行」呢條捷徑係假嘅** ——
佢慳到 queue,慳唔到 Redis,而且仲多咗一個「process 死咗個 run 永遠 `running`」嘅缺口
(⚠️ 而 **`G5-A` 個 sweep 刻意唔掃 `running`**,所以嗰個缺口冇人執)。

### F5 —— 🔴🔴 **DEV 冇 Redis ⇒ 本 ADR 製造第二個 infra 依賴**

事實③。要 infra 開一個 **Azure Cache for Redis**(或者等價物)並開通 VNet 存取。

🟢 **而佢應該即刻併入嗰封仲未發出嘅 infra 信**(`docs/13-deployment/11-azure-openai-infra-request.md`)——
發完先追加,喺本項目歷史上就係多等一輪(B1 / B4 / B7 / B8 / B9 每次都要等)。

⚠️ **本機唔受影響**(事實①),所以 code + test 做得晒;**卡住嘅只係部署同 live 驗**,
同 `A14` 完全同一個形狀。

### F6 —— nginx 我哋自己改,`proxy_buffering off` 等四行

事實④ ⇒ `apps/web/nginx.conf.template` 加一個 `location /api/agent/runs/` 專用 block:
`proxy_buffering off` · `proxy_cache off` · `proxy_read_timeout` 拉長 · `proxy_set_header Connection ''`。

🔴 **只加喺 SSE 嗰條路,唔改成個 `/api/`** —— 關掉全站 buffering 係一個為咗一條 endpoint
而付嘅全域代價,而 nginx 個 location 匹配本來就容得落一條更精確嘅路徑。

### F7 —— 🟡 **ACA ingress 對 SSE 嘅行為未驗證,而佢係唯一改唔到嗰層**

事實⑤。**本 ADR 唔假設佢得**,亦唔假設佢唔得。

⇒ `B6` acceptance(「SSE 喺 DEV 真通」)**維持係一條 live 驗**,而佢**要部署 + Redis 先做得到**。
**若果 ACA 真係唔支援**,回退路 = 前端 polling(見 Alternatives B),而**契約唔使再改**(F2)。

### F8 —— SSE 靠既有 cookie 認證,唔開第二條 auth 路

`EventSource` **唔送 Authorization header**,只送 cookie。而平台由 ADR-0028 起發嘅就係
**httpOnly cookie** ⇒ 現有 guard 原封適用。

⚠️ **代價講白**:Bearer-token 呢條路(ADR-0002,保留住)**用唔到 SSE**。今日冇 caller 需要。

### F9 —— pub/sub 行 BullMQ 自己個 `QueueEvents`,**唔加 `ioredis`**

> 📌 **F9 / F10 係實作查證嗰陣加嘅兩格,Chris 冇單獨批過**。兩格都係**收窄**唔係擴大
> (F9 少一個 dependency,F10 少一條資料路),形狀跟 **ADR-0035**(收窄原決定範圍)。

F4 要 pub/sub。直覺做法係 `npm i ioredis` 自己開一條 subscriber 連線 —— 而 **BullMQ 已經有**:
worker 側 `job.updateProgress(payload)`,觀察側 `new QueueEvents(name)` 收 `progress`,
**行 Redis stream,每個 replica 各自收到自己嗰份**。

三個理由揀佢:

1. 🟢 **零新 dependency。** `ioredis` 今日只係 `bullmq` 嘅 transitive dep —— 直接 import 一個
   transitive dep,係一個「上游換 client 就靜靜爆」嘅寫法。
2. 🟢 **連線生命週期唔使我哋管。** Redis pub/sub 嗰條 subscriber 連線入咗 subscribe mode
   就唔可以再發其他 command ⇒ 自己做就一定係第二條連線 + 自己 reconnect。
3. 🟢 **stream 有 buffer,pub/sub 冇。** pub/sub 係 fire-and-forget:訂閱者遲一格就永遠收唔到。

⚠️ **代價**:`progress` 呢個名係借嚟用嘅 —— 我哋送嘅唔係百分比,係「有嘢變咗」(F10)。
**寫咗落 code 註釋,唔靠讀者估。**

### F10 —— SSE 只送「**邊個 run 有嘢變咗**」,唔送內容

event payload = `{ runId }`。前端收到就 refetch `GET /agent/runs/:id`。

🔴 **點解唔直接 stream step / status**(三個理由,由重到輕):

1. **唔養第二個真相。** stream 出去嘅 step 同 refetch 返嚟嘅 step 一旦有任何差,畫面就會有兩個
   版本 —— 而 **CH-028 刻意唔喺 Platform view 計 delta,講嘅就係同一件事**(兩邊唔同源 = 養一個
   對唔上嘅第二真相)。
2. 🔴 **H4。** `AgentStep.detail` 入面可以有 vendor error,而 vendor error 引用嘅 path 帶 UPN
   (BUG-004)。今日佢**入表之前**經 `scrubPii`;把佢再放上一條**新** transport,就係開多一條
   要記住去 scrub 嘅路。**唔開嗰條路,就冇嘢要記住。**
3. **回退去 polling 唔使改契約**(F2)—— 一個只送「變咗」嘅 SSE,同 polling 係同一個 read path。

⚠️ **一個 race 要明寫**:run 喺瀏覽器連上 SSE **之前**就完咗 ⇒ 冇 event 可收,畫面等到天光。
⇒ **連上嗰刻即刻發一個 tick**,前端 refetch 見到終態就自己收線。

---

## Alternatives Considered

- **A:只做 G5-B,前端 polling** — **rejected**(Chris 2026-08-16 揀咗併埋)。理由不只係佢揀:
  polling 一旦落地就係一個**會留低**嘅設計,而 `ADR-0029 A2` 當初寫「將來加串流只係換 transport」
  嗰句,前提就係中間唔會先加一層 polling。
- **B:SSE 唔得就 polling** — **唔係 alternative,係回退路**(F7)。因為 F2 令契約唔使再改,
  所以呢條路隨時行得,唔使預先建。
- **C:獨立 worker container** — **rejected**(F3):locked stack 冇佢,而本 phase 已經有一個
  外部依賴等緊。
- **D:唔用 Redis,`setImmediate` 背景跑** — **rejected**(F4):慳唔到 Redis(多 replica 之下
  SSE 仍然要 pub/sub),兼且多一個「process 死咗個 run 永遠 `running`」嘅缺口,而 G5-A 個 sweep
  刻意唔掃 `running`。
- **E:WebSocket** — **rejected**:雙向而我哋只需要單向;而且要多一層 ACA / nginx 配置,
  正正係 A2 當初想避開嗰樣。

---

## Consequences

### Positive

- 🟢 **API 唔再喺一個 HTTP request 入面等 LLM** —— 今日冇 timeout 出事只係因為 run 短
- 🟢 **契約 shape 唔變**(F2)⇒ 前端改動細,回退去 polling 亦唔使再改契約
- 🟢 **還咗 ADR-0029 A2 嗰筆債**,而 assign 側將來想加串流時,transport 已經喺度
- 🟢 **nginx 喺我哋手上**(F6)—— 三層入面有兩層唔使等人

### Negative

- 🔴🔴 **第二個 infra 依賴**(F5)—— DEV 要 Redis。本項目 infra 依賴**每次都要等**
- 🔴 **ACA ingress 對 SSE 嘅行為係一個未知數**(F7),而佢係唯一改唔到嗰層
- 🔴 **`running` run 死咗仍然冇人執** —— G5-A 刻意留低嘅缺口,而本 ADR **令佢更容易發生**
  (run 而家真係喺背景跑)。⚠️ 明寫:本 ADR **唔解決**佢
- ⚠️ Bearer-token 路徑用唔到 SSE(F8)

### Neutral

- `AgentToolRegistry` / seam ⑤ / 兩個 provider / D0–D11 **一個字唔郁**
- `G5-A` 個 expiry sweep 唔受影響
- ADR-0029 其餘部分(steps 契約、`whoFixes`、dialog)**唔郁** —— 本 ADR **只推翻 `A2` 一格**

### 殘留風險

| ID | Risk |
|---|---|
| **R22** | 🔴 **ACA ingress buffer 住 SSE** ⇒ 畫面一路空白然後一次過跳完。**本機測唔到**,只有 DEV 答得到 |
| **R23** | Redis 一冇,**agent 功能整個停**(queue + pub/sub 都靠佢)。⚠️ 而 ADR-0036 D2 嗰個 kill switch 係**故意**要人撳嘅 —— 一個因為 Redis 掛咗而靜靜停晒嘅 agent,同一個被人閂咗嘅 agent,喺畫面上要分得出 |
| **R24** | in-process worker 令一個長 run 佔住 api 嘅 event loop 份額(F3)。I/O-bound 所以可接受,但**唔係零** |

---

## References

- **ADR-0029 `A2`** —— 本 ADR **只推翻嗰一格**,其餘不動
- **ADR-0036** —— seam ⑤ / D0–D11 全部不受影響
- **ADR-0037** —— 第一個 infra 依賴;F5 係第二個,**應該併入同一封未發出嘅信**
- **ADR-0001**(monorepo 兩個 app)· **ADR-0012**(same-origin,nginx 存在嘅理由)· **ADR-0028**(cookie ⇒ F8)
- `docs/01-planning/W46-agent-runtime/plan.md §2.2 G5/G6` · `§5 B6`
- **查證(2026-08-16)**:`docker-compose.yml:23-32`(本機 Redis)· `apps/api/.env.example` 零 `REDIS` ·
  `apps/web/Dockerfile:45-49` + `apps/web/nginx.conf.template`(nginx 喺 web container)· `deploy/` 零 Redis
