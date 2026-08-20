# CH-032 — checklist

> 由 `spec.md` §4 deliverable + §5 acceptance 推導。全部 2026-08-20 一日內做完。

## 落地

- [x] `A` — 兩句分開(`profiles.isError` / `agents.length === 0` 兩個分支)
      · `apps/web/src/pages/assistant.tsx`
- [x] `B` — disconnected banner + `Reconnect`(`WifiOff`,零新 icon)
      · 同上,**擺喺 conversation header 之下、transcript 之上**(`D3`)
- [x] `C` — `forbidden` 加 `profiles.error`(`D1`)
      · 同上
- [x] `D` — test(**+8 條**)· `apps/web/src/pages/assistant.test.tsx`
- [x] 改返一條被本單文案改動整紅嘅既有 test
      (`will not open a thread when no agent is switched on` 原本對住半截句)

## Acceptance

- [x] `G1` 「攞唔到列表」同「冇 agent」分開 — 3 條 test(error / empty / **loading 兩句都唔出**)
- [x] `G2` 兩邊文案逐字一致 — 跨檔 source scan,三句 × 兩個檔
- [x] `G3` disconnected banner — 出現 + 撳 `Reconnect` 真 call `events.reconnect` + 健康時唔出
- [x] `G4` profiles 403 出 `Access required`,唔跌落 ① 嗰句
- [x] `G5` H6 light + dark — **banner 真 render 過**(SSE route abort 逼出 `disconnected`)
      · `overflowsX: false` 兩邊 · `accentButtons: ["Send"]` 兩邊
- [x] `G6` root gate — api **1491 / 98 suites** · web **555 / 49** · lint 0 · build 0
- [x] `G7` falsification — 四道逐道拆,**零誤傷**(實際紅數見 `spec.md` §6)

## 收尾

- [x] `spec.md` §3 記低 D1/D2/D3 已批 + `status: approved`
- [x] `spec.md` §6 補實際 falsification 結果(同預期唔同,連原因一齊寫)
- [x] `progress.md` 完成摘要
- [x] `RISK_REGISTER` `R35` → 🟢(本單係佢最後一個未完項)
- [x] `BACKLOG` `ASSISTANT-HONESTY` → done
- [ ] 🚧 **DEV live 驗** — 唔喺本單 acceptance(`G1`–`G7` 冇一條要 DEV)。
      target = 下一次部署,順手確認兩句同 banner 喺真環境出到。
      ⚠️ **banner 喺 DEV 好可能出唔到** — 部署 #12 實測 DEV 斷線會 fire `error`
      兼 3.2 秒自動重連,所以要 api 真係返唔到嚟先見到(見 `BACKLOG` 嗰條 🚧)。
