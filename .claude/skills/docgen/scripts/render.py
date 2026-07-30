"""將文件渲染成逐頁圖片,做視覺 QA。

    python render.py deck.pptx            # -> 每版一張 JPG,印晒絕對路徑
    python render.py report.docx --dpi 150
    python render.py model.xlsx --outdir qa/

點解要有呢個:上游 SKILL.md 教嘅係三條分開嘅命令(soffice → rm → pdftoppm → ls),
喺 Windows 度三條都有伏 ——`soffice` 會解析到唔等轉換完成嘅 `.exe`、`rm` / `ls` 唔存在。
更麻煩嘅係中間嗰步 `rm -f slide-*.jpg`:唔清走上次嘅圖,你就會對住舊圖做 QA,
以為改好咗 —— 呢個係「驗證咗但證明唔到嘢」嘅典型。所以呢度一次過做齊,而且
**每次都先清走 prefix 相同嘅舊圖**。

輸出嘅絕對路徑可以直接餵去 Read tool 睇圖。
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from win_soffice import convert  # noqa: E402

_OFFICE_SUFFIXES = {".docx", ".doc", ".pptx", ".ppt", ".potx", ".xlsx", ".xls", ".xlsm", ".odt", ".odp", ".ods"}


def _require_pdftoppm() -> str:
    found = shutil.which("pdftoppm")
    if not found:
        raise SystemExit(
            "pdftoppm not found on PATH. It ships with Poppler — install it "
            "(winget install oschwartz10612.Poppler) or add its Library\\bin to PATH."
        )
    return found


def render(
    src: str | Path,
    outdir: str | Path | None = None,
    dpi: int = 150,
    fmt: str = "jpeg",
    prefix: str | None = None,
) -> list[Path]:
    src = Path(src).resolve()
    if not src.exists():
        raise SystemExit(f"input does not exist: {src}")

    outdir = Path(outdir).resolve() if outdir else src.parent
    outdir.mkdir(parents=True, exist_ok=True)

    # prefix 預設跟檔名 —— 唔好用一個通用名(例如 "page"),
    # 兩份文件喺同一個目錄render 就會互相覆蓋對方嘅圖,而且靜靜哋。
    prefix = prefix or src.stem
    pdftoppm = _require_pdftoppm()

    if src.suffix.lower() == ".pdf":
        pdf = src
    elif src.suffix.lower() in _OFFICE_SUFFIXES:
        pdf = convert(src, "pdf", outdir)
    else:
        raise SystemExit(f"don't know how to render {src.suffix!r}")

    ext = "jpg" if fmt == "jpeg" else fmt
    # 清走上次嘅圖,否則頁數變少嗰陣舊圖會殘留、扮成今次嘅產出
    stale = sorted(outdir.glob(f"{prefix}-*.{ext}"))
    for old in stale:
        old.unlink()

    result = subprocess.run(
        [pdftoppm, f"-{fmt}", "-r", str(dpi), str(pdf), str(outdir / prefix)],
        capture_output=True,
        text=True,
    )

    pages = sorted(outdir.glob(f"{prefix}-*.{ext}"))
    if not pages:
        detail = (result.stderr or result.stdout or "").strip() or f"exit {result.returncode}"
        raise SystemExit(f"pdftoppm produced no images for {pdf.name}: {detail}")

    return pages


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a document to per-page images for visual QA.")
    parser.add_argument("src", help="pdf / docx / pptx / xlsx / odt ...")
    parser.add_argument("--outdir", default=None, help="where to write images (default: alongside src)")
    parser.add_argument("--dpi", type=int, default=150, help="resolution (default 150)")
    parser.add_argument("--format", default="jpeg", choices=["jpeg", "png"], dest="fmt")
    parser.add_argument("--prefix", default=None, help="image name prefix (default: source stem)")
    args = parser.parse_args()

    pages = render(args.src, args.outdir, args.dpi, args.fmt, args.prefix)
    print(f"{len(pages)} page(s):")
    for page in pages:
        print(page)
    return 0


if __name__ == "__main__":
    sys.exit(main())
