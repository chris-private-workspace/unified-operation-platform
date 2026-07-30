---
name: docgen
description: 喺呢個 Windows 環境生成 / 修改 PDF · Word · PowerPoint · Excel 文件時必讀。上游 document-skills(xlsx/docx/pptx/pdf)係寫畀 Linux 沙箱嘅,佢哋嘅 LibreOffice wrapper、zip 流程、預設編碼喺 Windows 全部會壞,而且部分係「靜靜失敗」——命令回 exit 0 但檔案冇出、或者成頁文字消失。Use when creating, editing, validating, or visually QA-ing any .docx / .xlsx / .pptx / .pdf / .dotx / .potx deliverable on this machine.
---

# docgen — Windows 版文件生成適配層

上游 `document-skills` 嘅**內容指引**(排版原則、openpyxl / pptxgenjs gotchas、QA 清單)照跟,
質量要求以佢為準。呢份 skill 只覆寫**點樣喺呢部機執行** —— 上游嘅執行命令假設 Linux 沙箱,
喺 Windows 有五個會壞,其中三個係靜靜失敗。

> 先讀對應嘅上游 SKILL.md 攞內容指引,再返嚟呢度攞命令。

## 環境實況(已實測,2026-07-29)

齊嘅:Python 3.12 · openpyxl / pandas / python-docx / python-pptx / pdfplumber / pypdf /
reportlab / xlsxwriter / markitdown / defusedxml / lxml · LibreOffice 26.2 · pandoc ·
Poppler(pdftoppm / pdftotext)· Tesseract · Node + npm global `docx@9.7` / `pptxgenjs@4.0`

冇嘅:`zip` / `unzip`(用 `ooxml.py`)· `qpdf`(用 pypdf 頂)· npm `sharp` / `react-icons`
(只影響 pptx 嘅 icon 光柵化,要用先至裝)

## 五個 Windows 坑(每個都有實測 output 為證)

| # | 坑 | 徵狀 | 做法 |
|---|---|---|---|
| 1 | 上游 `office/soffice.py` 用 `socket.AF_UNIX` 探測沙箱 | `Could not prepare the LibreOffice environment: module 'socket' has no attribute 'AF_UNIX'` — recalc / thumbnail / accept_changes 全部未做嘢就死 | 一律經 `skillrun.py` 跑上游 script |
| 2 | `soffice.exe` 唔等轉換完成 | **exit 0 但檔案冇出現** | 用 `soffice.com`;`win_soffice.py` 已鎖死 |
| 3 | app flag `--calc` / `--writer` 撞 `-env:UserInstallation` | soffice crash,`0xC0000409` | 唔好傳 app flag;`--convert-to` 自己識揀 filter |
| 4 | Python 預設 locale 編碼(cp950)讀 UTF-8 XML | `'charmap' codec can't decode byte 0x8f` — **凡文件含中文就爆** | `skillrun.py` 會自動 re-exec 帶 `-X utf8` |
| 5 | `NODE_PATH` 空,搵唔到 npm global 模組 | `require('docx')` → `MODULE_NOT_FOUND`(上游話「preinstalled 直接 require」喺呢度唔成立) | 用 `nodegen.ps1` 跑 node 腳本 |

## 命令對照(上游寫法 → 呢度寫法)

```powershell
$D = ".claude/skills/docgen/scripts"

# 生成(docx-js / pptxgenjs)—— 上游:node build.js
.\$D\nodegen.ps1 build.js out.pptx

# xlsx 公式重算 —— 上游:python scripts/recalc.py out.xlsx
python $D/skillrun.py xlsx recalc.py out.xlsx 90

# 檔案驗證 —— 上游:python scripts/office/validate.py out.pptx
python $D/skillrun.py pptx office/validate.py out.pptx
python $D/skillrun.py pptx office/validate.py out.pptx --original template.pptx

# 版面縮圖(揀 template layout)—— 上游:python scripts/thumbnail.py deck.pptx
python $D/skillrun.py pptx thumbnail.py deck.pptx deck-thumbs

# 追蹤修訂接受 —— 上游:python scripts/accept_changes.py in.docx out.docx
python $D/skillrun.py docx accept_changes.py in.docx out.docx

# 視覺 QA —— 上游:soffice → rm → pdftoppm → ls(四條命令,三條有伏)
python $D/render.py out.pptx --dpi 150      # 印晒絕對路徑,直接餵 Read tool 睇

# 拆包 / 重組 —— 上游:unzip … / (cd unpacked && zip -Xr ../out.docx .)
python $D/ooxml.py unpack in.docx unpacked/
python $D/ooxml.py pack   unpacked/ out.docx
```

`skillrun.py` 只換走壞咗嗰個 `office.soffice` 模組,其餘上游邏輯原封執行 —— 唔改 plugin cache,
所以 plugin 更新唔會蓋走修復,亦唔使維護一份會 drift 嘅分叉。

## 交付前必做

1. **內容 QA** — `markitdown out.pptx` / `pandoc -t markdown out.docx`,check 漏內容、錯字、次序。
2. **檔案 QA** — `validate.py`(pptx / docx)。由 template 出嘅一定要帶 `--original`。
3. **公式 QA** — 有公式嘅 xlsx **必須** `recalc.py`,唔可以喺 `errors_found` 狀態出貨。
   注意:綠只證明公式**計得到**,唔證明**啱**;先寫 2–3 條驗返數啱唔啱,再鋪成個表。
4. **視覺 QA** — `render.py` 出圖,逐頁真係望。第一次 render 通常有真問題(溢出、重疊、對唔齊)。
   最常見同最明顯嘅係**文字溢出 / 被切**,先揾嗰樣。

## 中文專屬注意

- **reportlab 造 PDF 一定要用系統 TTF**,唔可以用 `UnicodeCIDFont`。
  `UnicodeCIDFont("MSung-Light")` 註冊時**唔會拋錯**,但砌出嚟嘅 PDF 引用一個渲染器搵唔到嘅
  字型,結果**成頁文字連英文都唔畫**,而 `extract_text()` 照樣抽到字 —— 淨係睇 exception
  同抽字會直接誤判。實測可用:
  ```python
  pdfmetrics.registerFont(TTFont("MSJhengHei", r"C:\Windows\Fonts\msjh.ttc", subfontIndex=0))
  ```
- 上下標一律用 `<sub>` / `<super>` 標籤,**唔好用 Unicode 上下標字元**(內建字型冇 glyph → 黑框)。
- 想要中文 PDF 而又要靚排版,**行 docx → PDF 呢條路**通常好過直接砌 reportlab:
  `python $D/render.py report.docx` 會順手出 PDF,字型同版面由 LibreOffice 處理,實測質素高。
  reportlab 留返畀需要逐點精確控制座標嗰啲。
- pptx / docx 入面嘅中文字型:揀 **Microsoft JhengHei UI** 或 **Calibri**(西文)。
  上游嗰張 QA-safe 字型表淨係講西文,中文字型喺 LibreOffice 預覽同真 Office 之間
  字寬會有差,所以中文容器**留多 ~10% 鬆動**,唔好貼死邊。

## 項目風格

對外 / 對內正式文件跟項目視覺語言,**唔好即興揀色**:

- Accent 只有 **Ricoh red `#E60027`**(pptxgenjs 寫 `"E60027"`,唔可以有 `#`)。一版 / 一節得一個重點。
- 文字 `#1A1A1A`、次要 `#6B7280`、分隔線 `#E5E7EB`、淺底 `#F9FAFB`。
- **數字 / 識別碼(SKU、GUID、欄位名)一律 mono**(Consolas)。
- 權威來源係 `design_handoff_licenseops/design-system/tokens/*.css` 同
  `docs/02-architecture/design-system.md` —— 要加色或者新 pattern,查嗰度,唔好 eyeball
  (同 CLAUDE.md §5.6 H6 同源)。
- 內容邊界跟 module spec:成本金額唔入平台(只記 `quoteRef` / `poRef`)、SKU 以 `skuId` 為準。

## 唔好做

- ❌ 改 `~/.claude/plugins/cache/...` 入面嘅上游檔 —— plugin 一更新就冇咗。
- ❌ 見到 `soffice` exit 0 就當轉換成功 —— 坑 2,一定要驗產出檔真係存在(`win_soffice.convert()` 已代勞)。
- ❌ 用 `tar` 代替 `zip` 砌 OOXML —— 造出嚟嘅包 Office 開唔到。
- ❌ 對住舊圖做視覺 QA —— 改完一定要重新 `render.py`(佢會自動清走同名舊圖)。
