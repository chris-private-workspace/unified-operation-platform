# docx-source —— 部署流程 docx 嘅產生器

`../Azure UAT 部署流程 v1.0.docx` 唔係手寫,係由呢度生成。要改文件內容 = 改 `build.js`
再重新生成,**唔好直接改 .docx** —— 下次重新生成就會蓋走你手改嘅嘢。

## 檔案

| 檔案 | 作用 |
|---|---|
| `build.js` | 文件內容 + 排版(docx-js)。章節、表格、callout、bullet 都喺呢度 |
| `diagrams.py` | 畫 `topology.png` / `pipeline.png`(PIL)。改架構圖改呢個 |
| `topology.png` · `pipeline.png` | `build.js` 會 embed。已 commit,所以唔重畫都 build 得 |

## 重新生成

```powershell
$D = "../../../.claude/skills/docgen/scripts"

python -X utf8 diagrams.py                          # 只喺改過 diagram 時要跑
& $D/nodegen.ps1 build.js "../Azure UAT 部署流程 v1.0.docx"
python $D/skillrun.py docx office/validate.py "../Azure UAT 部署流程 v1.0.docx"
python $D/render.py "../Azure UAT 部署流程 v1.0.docx" --dpi 96    # 出頁圖,逐頁望
```

為何要經 `docgen` skill 而唔係直接 `node` / `soffice`:呢部機上 npm global 模組
require 唔到、LibreOffice wrapper 喺 Windows 會 raise、Python 預設編碼讀 UTF-8 XML
會爆。詳見 `.claude/skills/docgen/SKILL.md`。

## 改嘢時注意(踩過)

- **表格 `columnWidths` 同每格 `width` 必須一致** —— 改一邊唔改另一邊會錯位。
  改完 grep 舊數值確認冇漏。
- **`num()` 要傳 instance** —— 同一個 numbering reference 共用 instance 會令編號
  跨章節累加(第二張列表由 6 開始)。
- **`body()` 收字串或 TextRun array** —— 早期版本只收字串,傳 array 會靜靜產生空段落,
  文字無聲消失。
- **`diagrams.py` 唔好用 `⚠` / `✔`** —— msjh 冇 glyph,PIL 畫成豆腐格。
- 改完一定要 `render.py` 逐頁望。validate 過 ≠ 排版靚。

## 版本

改內容記得同步 `build.js` 入面封面表嘅「文件版本」同頁腳日期,以及檔名嘅 `v{N}`。
