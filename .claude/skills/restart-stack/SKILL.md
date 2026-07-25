---
name: restart-stack
description: 本地全 stack 重啟 / 健康檢查 — preflight 盤點 → 清殭屍進程 → detached 起 api+web → poll 真 200 驗。Use when the user asks to restart / start / stop / health-check local services ("重啟服務"、"起服務"、"啟動本地環境"、preflight), or when a dev server behaves erratically and process leakage is suspected.
allowed-tools: PowerShell, Read, Bash
---

# 本地 stack 重啟 SOP(Unified Operation Platform)

> **「重啟服務」永遠指全 stack**,唔係淨係其中一個 —— 只重 backend 會令 frontend 攞到 stale state。
> 本 skill 取代舊 `/restart` + `/preflight`(佢哋寫 port 3000/5432、無 frontend、無清殭屍 = 已過時)。

## 真實座標(唔係模板預設,實測)

| 服務 | Port | 起法 | 驗證 |
|---|---|---|---|
| Postgres | **5433**(容器內 5432) | `docker compose up -d`(容器 `uop-postgres`) | `docker ps` healthy |
| Redis | **6379** | 同上(`uop-redis`) | 同上 |
| Backend NestJS | **3100** | repo root `npm run start:dev` | `GET :3100/docs/api` = 200(冷啟 ~15-40s) |
| Frontend Vite | **5173** | repo root `npm run dev -w @uop/web` | `GET :5173/` = 200(冷啟 ~8s) |

Backend endpoint **冇 `/api` prefix**(`:3100/me` 200、`:3100/api/me` 404);vite proxy 會 **strip `/api`** → 所以前端一律 `:5173/api/me` 通。

## 執行順序(四步,每步驗完先落下一步)

```
1. preflight.ps1        → verify: 睇清 infra / port / 進程 / endpoint 現狀
2. kill-zombies.ps1     → verify: dry-run 核對 kill list,再 -Execute,port 3100+5173 free
3. start-detached.ps1   → verify: 兩個獨立窗口 pid 出現
4. verify.ps1           → verify: 三個 endpoint 真 200 + 新 pid ≠ 舊 pid
```

腳本喺 `scripts/`,全部自行推導 repo root,直接跑:

```powershell
& ".claude\skills\restart-stack\scripts\preflight.ps1"      *> "<scratchpad>\preflight.out.txt"
& ".claude\skills\restart-stack\scripts\kill-zombies.ps1"   *> "<scratchpad>\kill.dryrun.txt"   # dry-run
& ".claude\skills\restart-stack\scripts\kill-zombies.ps1" -Execute *> "<scratchpad>\kill.exec.txt"
& ".claude\skills\restart-stack\scripts\start-detached.ps1" *> "<scratchpad>\start.out.txt"
& ".claude\skills\restart-stack\scripts\verify.ps1"         *> "<scratchpad>\verify.out.txt"    # timeout ≥180s
```

**每個 output 用 Read 工具讀,唔靠 shell stdout 判斷**(CLAUDE.md §5.8 H8)。

## 🔴 硬規則

1. **殺進程前必先 dry-run 核對 kill list。** 同一部機有**其他項目**都跑 vite / vitest / node ——
   只 match `vite` / `node` 會誤殺(實測撞過 `ai-enterprise-knowledge-solution-project` 嘅 vitest)。
   kill 嘅 root set **必須綁本項目標記**(`unified-operation-platform` / `@uop/api` / `@uop/web` /
   `start:dev -w @uop`)+ 佔 3100/5173 嘅 pid,中間層 `cmd.exe /c vite`(無項目標記)只可靠**父子樹**收。
2. **一定用 `Start-Process` detached 起**,唔用 Bash tool background —— Bash tool 起嘅鏈綁 session,
   而且收工留 `bash.exe` 孤兒(實測一次清出 6 條)。
3. **infra 容器 healthy 就唔重啟。** 判斷以 **endpoint reachability** 為準,唔係 container health flag ——
   warmup 期 `(unhealthy)` 但 endpoint 已 200 = timing artifact,唔係 failure。
4. **冷啟動係「慢,唔係 hang」** —— 只輪詢 endpoint(timeout ≥10s / 次),**絕不**因為一兩次 fail 就殺進程。
5. **`.env` 唔改**(§4.4)。要臨時改 auth 行為 → 喺 `Start-Process` 傳 shell env,收工唔加 env 重起還原。

## 進程洩漏(最常踩)

`nest start --watch` / `vite` 重複啟動而冇清乾淨會累積殭屍(曾見 **32 個**、實測一次 **21 個**),
症狀 = backend 行為飄忽、搶 CPU、poll 變慢。健康值:api 鏈 + web 鏈合計 **~10-16 個**;明顯偏多 = 有洩漏。
`verify.ps1` 尾段會出 count 做 leak watch。

## Auth 相關(影響驗證結論,易誤判)

- `apps/api/.env` 已有 `AUTH_DEV_BYPASS=true` → **任何**窗口都起得起(以前靠某 session 嘅 shell env,換窗即 crash)。
- ⚠️ dev-bypass 會令 guard **完全無視 session cookie / Bearer**,直接返 dev user
  → 所以 `:5173/api/me` 未登入都返 **200**(呢個係預期,唔代表 auth 壞)。
- 凡要驗 **per-user 行為**(自助改密碼 / force-change gate / 真 role scope / lockout)**必須關 bypass**:
  起 backend 時加 `$env:AUTH_DEV_BYPASS='false'`(shell env,**唔好改 `.env`**);關咗之後未認證 `/me` 應返 **401**
  = 確認真係關咗。驗完唔加 env 重起還原。
- 一眼確認法:登入後打 `/me`,返嘅 email 唔係你登入嗰個 → bypass 掩蓋緊 session。

## 收尾報告格式

出一個 table:`服務 | port | 狀態 | 備註(pid / 冷啟秒數)`,並列明:清咗幾個殭屍、新舊 pid 對比、
有冇服務未起。**任何一項未驗到真 200 就寫「未驗證」,唔可以寫 pass**(§5.7 H7)。
