---
phase: W24-request-intake
deliverable: D1 協調
status: decided（2026-07-15 Chris 自答 10 條;已回寫 CONTRACT / DESIGN / RISK）
---

# n8n ↔ 平台 Inbound Intake — 對接 Agenda（開會用）

> **目的**:敲定 n8n onboarding workflow → 平台 inbound intake 嘅**前提決定 + 欄位對齊**,令平台可落 D2 code(唔使返工)。
> **背景一句**:onboarding 由 n8n 跑(喺 AD 建帳號)→ workflow 完結前 push request 入平台 → 平台建 mirror + 履行(assign M365/D365 license via Graph)+ 回寫 ServiceNow。
> **參與**:平台(Chris)· **n8n onboarding team**(= DESIGN §4.1 所講「Phase 1」執行團隊,**≠** ADR-0008「Phase 甲乙丙丁」)· (需要時)ServiceNow admin。
> **命名注意**:下文「Phase 1」一律指既有 n8n onboarding 流程/團隊;ADR-0008 嘅開發階段一律叫「Phase 甲/乙/丙/丁」,兩者唔同,勿混。
> **用法**:逐條問,喺「▢ 決定」填答案;★ = 平台傾向(做 anchor,可推翻)。

---

## ✅ 決定總結（Chris 自答,2026-07-15 — n8n workflow 由 Chris 本人管理,無需外部開會)

> Chris = n8n onboarding workflow 管理者本人,10 條即場拍板 / 查證(唔係第三方 blocker)。**全部保守選擇 → Phase 甲 零架構擴張**;尤其 **A2 人手 queue → 唔觸 H1/ADR**。已回寫 `CONTRACT`(lock)· `DESIGN §7`(intake 路徑 + sync 時序)· `RISK_REGISTER`(R3 on-prem 延遲)。

| # | 決定 | 值 | 回寫 |
|---|---|---|---|
| A1 | Intake 來源 | **只 n8n push**(平台唔 poll SN) | CONTRACT §5 |
| A2 | 觸發 assign | **人手 queue**(等 Regional;非全自動)→ **唔觸 H1/ADR** | CONTRACT §5 · DESIGN §7 |
| A3 | Push 位置 | **AD 建好後 non-blocking**(fire-and-forget;失敗只 log,唔中斷 onboarding) | DESIGN §7 |
| A4 | Sync 時序 | **On-prem AD**(AD Connect sync 有延遲)→ assign 要 retry / `findUser` 命中先做 | RISK R3 · CONTRACT §3 |
| B1 | SKU 識別 | **GUID `skuId`**(直接對主鍵) | CONTRACT §3/§5 |
| B2 | OpCo 識別 | **`Opco.code`**(如 "RHK") | CONTRACT §3/§5 |
| B3 | REQ/RITM | **REQ + 每 line RITM 齊**(各 sysId+number)→ two-level 有事實 backing | CONTRACT §4 |
| B4 | 時間戳 | `azureSyncedAt`=n8n 聲稱 synced(≠Graph 見到,配 A4)· `accountCreatedAt`=AD 建立;**ISO 8601** | CONTRACT §3 |
| B5 | Idempotency | **REQ sysId**(`@unique`)做 upsert-or-skip,重推唔 double | CONTRACT §5 |
| B6 | Operator | **unassigned**(`handledById=null`,入 queue) | CONTRACT §4 |

> **推導項(B4/B5 未逐條問,低風險預設,Chris 可 override)**:時間戳格式 = ISO 8601 · idempotency key = REQ sysId。

---

## Part A — 流程 / 架構決定（先傾;呢啲定唔到,code 落唔到)

### A1. Intake 單一來源(n8n push vs ServiceNow poll)
- **問**:onboarding request 入平台,**只有 n8n push 一條路**,定同時仲有平台 poll ServiceNow?
- **點解重要**:若並存,同一張單會被 intake 兩次 → 去重 key 係咩?決定成個 idempotency 設計。
- ★ **平台傾向**:onboarding **只走 n8n push**;poll 唔用於 onboarding。
- ▢ **決定**:

### A2. 邊個觸發 assign —— 自動定人手 queue
- **問**:push 入嚟 + 帳號 synced 之後,license 係**自動 assign**,定入 queue **等 Regional 人手**撳?
- **點解重要**:全自動 = 平台要多起一個 auto-assign orchestration(BullMQ,新一大舊);人手 = 貼現有設計、風險低但 onboarding 冇 touchless。
- ★ **平台傾向**:先**人手 queue**(W24 範圍);全自動列後續 phase 再議。
- ▢ **決定**:

### A3. Push 唔可以 block 現有 onboarding（保護 Phase 1）
- **問**:「push 平台」呢一 step 擺喺 n8n workflow **邊個位**?push 失敗會唔會令 workflow fail(連 AD 都建唔到)?
- **點解重要**:平台只係 downstream mirror,**唔應該**成為 onboarding 嘅 single point of failure。
- ★ **平台傾向**:push 擺喺 **AD 建好之後**、**non-blocking / fire-and-forget**,失敗只記 log 唔中斷 onboarding。
- ▢ **決定**:

### A4. Sync gate 時序真相（「synced」= Graph 真見到?）
- **問**:n8n 建嘅係 **on-prem AD** 定 **cloud-only(Entra)**?push 帶嘅 `azureSyncedAt` 係指真・**Graph-visible**,定只係 AD object created?
- **點解重要**:若 on-prem AD → 經 Azure AD Connect sync,有**幾分鐘~幾十分鐘延遲**。n8n 話「synced」但平台即刻 `findUser(upn)` 好可能仲搵唔到 → assign fail。
- ★ **平台傾向**:確認真 Graph-visible 先當 synced;若有延遲,平台 assign 端做 **retry / 等 findUser 到先 assign**。
- ▢ **決定**:

---

## Part B — 欄位 / 技術對齊（intake payload 合約;對應 CONTRACT §5）

### B1. SKU 點識別
- **問**:push 傳 M365/D365 嘅 **GUID(`skuId`)** 定 part number / 名?
- **點解重要**:平台主鍵係 `skuId` GUID(唔信名);若你哋得名,平台要經 `SkuCatalog.businessAlias`/`skuPartNumber` map。
- ★ **傾向**:傳 GUID 最穩;得名嘅話畀埋 map 對照表。
- ▢ **決定**:

### B2. OpCo 點識別
- **問**:傳 OpCo **code**(如 "RHK"/"RAPO/IT")定其他?確認值格式。
- **點解重要**:平台用 `Opco.code` resolve 成內部 id;code 對唔上就 404。
- ★ **傾向**:傳 `Opco.code`(同平台 seed 一致)。
- ▢ **決定**:

### B3. REQ / RITM 結構
- **問**:onboarding 一定有 `sc_request`(REQ)?每個 license 對一個 `sc_req_item`(RITM)?各自 sysId + number 攞唔攞到?
- **點解重要**:平台 mirror 要對返 SN;方向②平台建 REQ+RITM,inbound 要接返(避免兜圈,見 A1/origin)。
- ★ **傾向**:REQ sysId+number(父)+ 每 line RITM sysId+number。
- ▢ **決定**:

### B4. Sync 時間戳語意（配 A4）
- **問**:push 帶嘅 `azureSyncedAt` / `accountCreatedAt` 分別代表咩時點?ISO 格式?
- **點解重要**:直接餵平台 sync gate;定義唔清 assign 會早放行 → fail。
- ★ **傾向**:`azureSyncedAt` = 真 Graph-visible 時點;ISO 8601。
- ▢ **決定**:

### B5. Idempotency（重推處理）
- **問**:同一 onboarding 重試,平台想用 **REQ sysId**(`@unique`)做 upsert-or-skip;n8n 重試行為係點(會唔會重發)?
- **點解重要**:防 double 建 request / double assign。
- ★ **傾向**:REQ sysId 做 idempotency key;重推 = update-or-skip 唔 double。
- ▢ **決定**:

### B6. Operator（handledById）
- **問**:request 入平台後 **unassigned**(等 Regional pick up)定要指定 default 負責人?
- **點解重要**:影響「My queue」+ 邊個跟進履行。
- ★ **傾向**:unassigned(null),入 queue 等 Regional。
- ▢ **決定**:

---

## 開會後 → 回寫邊度（decision log 去向）

| 決定 | 回寫 |
|---|---|
| A1 / A2 / B1–B6 | `CONTRACT.md`（§2 auth 不變;§3–§5 依實際欄位 lock) |
| A2 若「全自動 assign」成事 | 屬新架構面 → **ADR-0008 補充 / 新 ADR**（H1;auto-assign orchestration) |
| A3 / A4 | `DESIGN §7` 生命週期補「n8n intake」路徑 + sync gate 時序註 |
| A4 / B4 若有 sync 延遲 | 平台 assign 端加 retry —— 記入 D2 approach + `RISK_REGISTER` |

**傾完** → 更新以上 doc → 落 **D2**（据 lock 咗嘅合約寫 DTO + guard + service + migration + H5 test）。
