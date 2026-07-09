# 11-env-resources-detail — 環境資源細節

雲端 / 基礎設施資源嘅清單同位置。**唔含 secret**(secret 入 `.env` / vault,唔入 git)。

## 建議住客
- 雲端資源清單(resource 名 / region / tier / 用途)
- 服務 endpoint(非機密)
- 憑證**位置**(存喺邊,唔係憑證本身)
- 環境對照(local / staging / production 各自嘅資源)

## 安全紅線(對應 CLAUDE.md §5 安全 constraint)
- **絕不** 喺呢層寫 connection string / API key / password / token。
- 只寫「資源叫咩、喺邊、點攞」,實際憑證由 env var / vault 提供。

## 模版
[`_TEMPLATE-resources.md`](./_TEMPLATE-resources.md) — 就緒,有雲端資源先入住。
