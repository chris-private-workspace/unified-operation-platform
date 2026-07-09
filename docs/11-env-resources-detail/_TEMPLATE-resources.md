---
artifact: env-resources
environment: {local / staging / production}
last_updated: YYYY-MM-DD
---

# {Environment} — 資源清單

> 雲端 / 基礎設施資源嘅清單同位置。**絕不寫 secret**(secret 入 `.env` / vault)。
> 呢層只寫「資源叫咩、喺邊、點攞」,實際憑證由 env var / vault 提供。

## 資源一覽

| 資源 | 類型 | 用途 | 位置 / endpoint(非機密) | 憑證來源 |
|---|---|---|---|---|
| {resource 名} | {DB / storage / compute / API} | {用途} | {region / host} | `env: {VAR_NAME}` / vault path |

## 環境對照(若多環境)
| 資源 | local | staging | production |
|---|---|---|---|
| {resource} | {local 值} | {staging} | {prod} |

## 存取步驟
{點連 / 點攞權限(指向 vault / IT 流程,唔寫實際 secret)}

## 安全紅線
- ❌ connection string / API key / password / token 一律唔入呢層。
- ✅ 只記 resource identity + 憑證**來源指針**。
