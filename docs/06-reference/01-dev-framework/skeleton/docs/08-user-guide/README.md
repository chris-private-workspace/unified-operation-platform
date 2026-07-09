# 08-user-guide — 終端用戶手冊(對外)

畀終端用戶睇嘅操作 / 配置 / troubleshooting 手冊。**對外**,同 05-usage(對內開發者)區分。

## 建議住客(按需)
- `01-platform-overview.md` — 平台概覽
- `02-setup-guide.md` — 用戶 setup
- `03-configuration-reference.md` — 配置 / 旋鈕參考(出廠值)
- `04-troubleshooting.md` — 故障排查

## 關鍵維護規則
- **用戶手冊嘅出廠值 / 預設值必須同 code 一致。** 若某 ADR 改咗預設值 → **必須同步更新呢層對應手冊**,否則手冊誤導用戶。
- 呢層係「答用戶操作問題」嘅 first stop —— AI 唔應該憑記憶重新推導旋鈕值,應該查呢層。

## 模版
[`_TEMPLATE-page.md`](./_TEMPLATE-page.md) — 通用手冊頁(overview / config-ref / troubleshooting 都用得),按需入住。
