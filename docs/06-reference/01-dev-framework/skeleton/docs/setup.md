# {PROJECT_NAME} — Local Dev Setup

> 本地開發環境 setup。CLAUDE.md §2 routing 由「setup local dev」指過嚟。

## 前置
- {語言 runtime + 版本,例 Python 3.12 / Node 20}
- {容器 / 服務,例 Docker}
- {套件管理器,例 uv / pnpm}

## 步驟
1. Clone + 入資料夾。
2. Copy env 範本:`cp .env.example .env`,填實際值(**唔好 commit `.env`**)。
3. 裝依賴:`{backend 裝 deps 命令}` / `{frontend 裝 deps 命令}`。
4. 起服務:`{起 infra / backend / frontend 命令}`(或用 `/restart`)。
5. 驗 ready:`/preflight` 或 `{health 檢查命令}`。

## 本機服務清單
| 服務 | port | 起法 |
|---|---|---|
| {backend} | {} | {} |
| {frontend} | {} | {} |
| {DB / storage} | {} | {} |

## 常見坑(踩到就補)
- {填你 stack / 平台特定嘅坑,例:Windows PATH 生效要重開 session / venv mandatory / cache 損壞修復}

## 啟用 git hooks(可選)
```
git config core.hooksPath scripts/hooks
```
