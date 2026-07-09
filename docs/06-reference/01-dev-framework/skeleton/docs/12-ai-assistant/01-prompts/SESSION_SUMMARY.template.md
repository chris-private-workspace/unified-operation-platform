# {PROJECT_NAME} — Session Summary(SessionStart hook 自動注入 · slim)

> **角色**:呢份係「精簡即時摘要」,由 SessionStart hook 自動注入每個 session(唔使人手貼)。
> 詳版 onboarding → `session-start.md`;憲法 → `CLAUDE.md`(常駐 context)。
> 此處只補 CLAUDE.md §9 可能 stale 嘅**當前座標** + **runtime 實況**(CLAUDE.md 冇嘅避坑資訊)。
>
> **維護**:volatile 部分(當前座標)隨 sprint 變,每個 phase closeout retro 嘅 doc-sync 步驟一併更新。

**身份**:{PROJECT_NAME},spec `{路徑}`,{一句定位}。

**當前座標({YYYY-MM-DD})**:最近 phase **{W{NN}-{name}}**({closed / active} — {一句成果})。
{2-4 句最近主線 track 摘要 + link 相關 memory}。
**剩餘候選**:{幾個 next-candidate,多 blocked 嘅標明};詳見 `BACKLOG.md`。
**Gates**:{G1/G2/G3 狀態}。

**提醒(完整見 CLAUDE.md)**:{hard constraints 一句 recap — 例 H-架構/H-vendor 觸發即 STOP+ask}。
{回覆語言紀律 recap}。

**Runtime 實況(避免重複踩坑,CLAUDE.md 冇)**:
- {backend 點啟動 / 用邊個 python / port}
- {mock auth token / 測試資料集名}
- {常撞嘅 dev 陷阱 + 繞法}
- {restart / eval 前 pre-flight check}

**Detail on-demand**:active phase 由 hook 自動偵測注入;{某主線弧嘅 phase folder 路徑};memory `MEMORY.md`。

---

<!-- 維護指引(落地時刪走呢段):
- 呢份要「slim」——目標畀 hook 每次注入,唔可以太長(EKP 版 ~40 行 slim)。
- Volatile = 當前座標 + gates + 最近 phase;stable = runtime 避坑。
- 若你有 SessionStart hook 機制,configure 佢注入呢份 file。冇 hook 就當普通 onboarding 摘要,session 開始手動讀。
-->
