# CH-007 — Progress Log

> Change:Request 建單後可編輯(header inline edit + line item 加減)
> Spec:`spec.md`(v1.0,approved 2026-07-22)· Checklist:`checklist.md`

---

## Day 1 — 2026-07-22

### Kickoff

用戶要求:request 建單後可改 —— header 起碼可改(除同步鍵),line item 發送 SN 前可加減、發送後鎖。

**七項拍板**(D1–D7,見 spec §2)。核心三個問 Chris,全揀保守版:`targetUpn` sync-後鎖 · `opcoId` 鎖 · 加行只限 intake 單。

### 開工前查證(兩個關鍵)

**① 「已發送 ServiceNow」對兩種 origin 意思相反**(spec §1.1)。`platform-created` 建單一刻連每行 RITM 一齊上 SN → **冇「未發送前」窗口**;`onboarding-intake` 嘅行係平台自拆、從未上 SN。故鎖用**每行 `serviceNowSysId`** 做信號,精準區分。

**② detail 頁連「加」都冇。** `POST :id/line-items`(addLineItem)endpoint 存在但**前端零 caller**(grep 證);line item 目前只喺建單一刻決定。故本 Change = 三件全新:header inline edit + 接返 add + 全新 delete。

### Branch

由 `feat/ch-006-overview-operational-activity` 出,stack 喺 PR #17 之後(保持一致;CH-007 本身零 migration)。

---

### 實作(F1–F5)

| 組 | 交付 | commit |
|---|---|---|
| F1 | `update-request.dto.ts` + `updateHeader` + `PATCH :id` + 6 test | `f6b330e` |
| F2 | `removeLineItem` + `DELETE` route + addLineItem origin gate + 6 test | `f6b330e` |
| F4 | `canEditUpn`/`canRemoveLine`/`canAddLine` + 8 test · `apiDelete` · 3 hooks · types | `74bb115` |
| F5 | header inline edit + Add/Remove line UI | `74bb115` |

api 333→**345** · web 123→**131** · lint/build 0 · permissions snapshot +2 route(access=roles)。

**F3.2 偏離**:預期 permissions 不受影響,實際多咗兩條 route(`PATCH :id` + `DELETE …/:lineItemId`)。snapshot diff **只得嗰兩行、access=roles、role 繼承 controller class**,刻意 `-u`。

### Live 驗證 —— 兩個 origin probe(唔郁 seeded)

插 `ch007-intake-probe`(intake、未 sync、REQUESTED 無RITM 行)+ `ch007-plat-probe`(platform-created、已 sync、RITM 行),curl(ADMIN):

| 檢查 | 期望 | 實際 |
|---|---|---|
| **C2** sync 後改 UPN(plat) | 409 | **409** ✅ |
| sync 前改 UPN(intake) | 200 | **200** ✅ |
| **C3** 夾帶 `serviceNowNumber`/`opcoId`/`origin` | 200 但剝走 | **200,三個原值全不變** ✅ |
| **C6** 加 line(platform-created) | 409 | **409** ✅ |
| **C6** 加 line(intake) | 201 | **201** ✅ |
| **C4** 刪有RITM 行 | 409 | **409** ✅ |
| **C4** 刪 REQUESTED 無RITM 行 | 200 | **200** ✅ |

**C3 最硬證據**:夾帶嗰個 PATCH 事後只寫「Header updated: **rawRequestText**」—— 證明 `serviceNowNumber`/`opcoId`/`origin` 根本冇入到 changed set(被 whitelist 剝走),唔係靠人肉檢查,係 event 內容自證。查欄位值:`serviceNowNumber` 仍 null、`origin` 仍 onboarding-intake、`opcoId` 不變。

**C8 ledger 不變**:全程 `sum(allocated)=10358 / sum(assigned)=6049`,插 probe → 加 line → 刪 REQUESTED line → 刪 probe,一個數字都冇郁。證明刪 REQUESTED 行唔掂 ledger(未 allocate)。

**C5 event**:四條 NOTE 全寫(`Header updated: targetUpn` / `Header updated: rawRequestText` / `Line item added: SPE_E3 ×2` / `Line item removed: SPE_E3`)。

### UI 驗證(C10)—— live 對照截圖

| | intake-probe(未 sync) | plat-probe(已 sync, platform-created) |
|---|---|---|
| Add line item | **顯示** | **隱藏** ✅ |
| 行 trash | **1**(REQUESTED 無RITM) | **0**(RITM 行) ✅ |
| Edit → Target UPN | **可編輯(mono)** | **disabled + 「Locked — the account has synced」hint** ✅ |
| ServiceNow 框 | — | **唯讀顯示 REQ-PLATPROBE** ✅ |

鎖住嘅控制係**唔 render**(唔係 disable)—— UI 唔暗示「解到鎖」。

### `ui-design` 12 條(C11)

| # | 結果 | 備註 |
|---|---|---|
| DS-1 token-only | ✅ | 新 UI 用 Input/Select/Button/Card + text-fg-*/border-border/bg-hover,零 hex |
| DS-2 唔 eyeball | ✅ | edit panel 沿用 sync-gate strip 同一組 padding/border token |
| DS-3 單一 primary | ✅ | 加嘅係 ghost(Edit/Add/Cancel)+ secondary(Save)+ danger trash;primary 仍係 Assign/Mark synced |
| DS-4 light+dark | ✅ | dark 截圖:輸入框深底、disabled UPN muted 底、hint 清晰,零硬色(本次零新色) |
| DS-5 識別碼 mono | ✅ | Target UPN input + qty input `font-mono`;SN 框 mono |
| DS-6 lucide stroke | ✅ | Pencil/Plus/Trash2/X/Check 全 stroke |
| DS-7 平面 | ✅ | 零新陰影/gradient;panel = border + bg-hover |
| DS-8 semantic tone | ✅ | 不動既有 stage badge;trash 用 text-danger token |
| DS-9 motion | ✅ | 零新 motion |
| DS-10 voice | ✅ | Edit / Save changes / Add line item / Cancel — 短、Sentence case |
| DS-11 對 prototype | ✅ | edit 係 prototype 冇嘅 pattern,但**只組合既有 primitive + token**,零新 primitive/token(H6 允許) |
| DS-12 logo | N/A | 冇掂 brand |

測試資料事後刪清(0 probe;ledger 10358/6049 不變;cascade 正常)。

### 教訓

**① 「發送」語意兩種 origin 相反,唔問清楚會做錯鎖。** 用戶講「發送前可加減」聽落好清楚,但 platform-created 根本冇「發送前」窗口。若照字面用「時間 / 狀態」做鎖,會令平台自建單可以加本地-only 行。改用**每行 `serviceNowSysId`**(SN 有冇 RITM)做信號,先精準對到兩種 origin。開工前逐個 write site 查證,勝過照 spec 字面做。

**② 鎖住嘅控制唔 render,好過 render 咗再 disable。** disabled 掣仍然叫用戶「呢度應該撳到,但撳唔到」,暗示解到鎖。RITM 行索性唔出 trash、platform-created 單索性唔出 Add —— UI 唔提出一個唔存在嘅可能。唯一例外係 sync 後嘅 UPN:佢喺 edit panel 內用 disabled + hint,因為要**解釋點解**呢個特定欄位鎖(hint 帶資訊),同「成個動作唔存在」唔同。

**③ 加 required type 欄位會靜靜爆既有 fixture typecheck。** 加 `origin` 落 `OnboardingRequest` 令 `requests.mine.test.ts` 個 factory 缺欄位 → build 紅。屬我改動製造嘅 orphan,補返(§1.3 surgical)。
