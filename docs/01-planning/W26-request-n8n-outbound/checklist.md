---
phase: W26-request-n8n-outbound
---

# W26 Phase 丙 — Checklist(daily tick)

## D0 — kickoff + ground + Fork 拍板
- [x] plan/checklist/progress 建立(draft)
- [x] ground:抽象 provider / DirectServiceNowProvider / module binding / servicenow fetch pattern / 甲 CONTRACT
- [x] Fork 拍板(AskUserQuestion:F1 代表性 mock / F2 同步回 / F3 config 單選)+ Chris approve → plan draft→active

## D1 — webhook 合約
- [x] `CONTRACT-OUTBOUND.md`:方向 / auth(N8N_OUTBOUND_WEBHOOK_KEY)/ request payload / **expected response shape**(REQ+RITM sysId/number)/ 代表性 or 真(Fork 1)

## D2 — N8nWorkflowProvider
- [x] `N8nWorkflowProvider.submit(payload)` → POST webhook → parse response → SubmittedRequest
- [x] config:`N8N_OUTBOUND_WEBHOOK_URL` / `N8N_OUTBOUND_WEBHOOK_KEY`(ConfigService.getOrThrow;無新 dep)
- [x] fail-closed:webhook 非 2xx / response 缺 REQ/RITM ID → throw
- [x] unit test(mock fetch:POST body + auth header + response→SubmittedRequest 組裝)

## D3 — 選路 binding
- [x] `fulfilment.module.ts`:`{ useClass }` → `useFactory`(讀 `REQUEST_SUBMISSION_PROVIDER` env,default `direct`;抽 exported `requestSubmissionProviderFactory` 令可測)
- [x] factory test(env unset/direct→Direct / env=n8n→N8n / n8n 缺 env fail-fast)
- [x] `.env.example` 加三個 env(placeholder)。**本地 `.env` 唔 touch**(§4.4 絕不改 secret 檔;default=direct 唔需 n8n 值;要行 n8n mode 由用戶填)

## D4 — H5 tests + regression
- [x] provider happy(webhook 200 + response → SubmittedRequest)
- [x] webhook 非 2xx → throw fail-closed
- [x] response 缺 REQ/RITM ID → throw(missing sysId + line count mismatch + skuId mismatch 共 3 case)
- [x] payload/auth header 正確(mock fetch body 驗)
- [x] 選路 factory(env 綁對 class)
- [x] regression:乙 direct path / 甲 intake / dev-bypass 不破(全 suite 197 綠 + live default-direct boot POST /requests 400)

## D5 — verify + closeout
- [x] build / lint / test 全綠(api 197;丙 backend-only 無 web)
- [x] live boot smoke(n8n 選路 fail-fast crash[stack trace 證 factory→N8n→getOrThrow]/ default direct boot 200 + POST /requests 400;3100 用戶 instance 未掂)
- [x] BACKLOG / memory 同步 + progress retro + plan closed + Phase 丁 carry
