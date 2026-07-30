"""OOXML 拆包 / 重組 —— 代替 Windows 冇嘅 `unzip` / `zip`。

上游 docx / pptx SKILL.md 嘅編輯流程係:
    unzip -q doc.docx -d unpacked/
    find unpacked -type l -delete
    ... 改 word/document.xml ...
    (cd unpacked && rm -f ../out.docx && zip -Xr ../out.docx .)

呢部機冇 `zip` 亦冇 `unzip`(只有 `tar`,而 `tar` 造唔到 OOXML 要嘅 zip 結構)。
本模組用 Python `zipfile` 做同等嘢,並且保留原流程幾個唔顯眼但要命嘅語義:

  * `zip -X`  —— 唔寫 extra field(時間戳 / UID 呢啲),包細啲亦 reproducible。
  * `rm -f ../out.docx` 先至 zip —— 唔刪嘅話,舊包裡面已刪走嘅 part 會殘留落新檔。
    `pack()` 一律當覆寫處理,行為對齊。
  * `find -type l -delete` —— 外來 .docx 唔可信,zip 入面嘅 symlink entry 可以指去
    package 以外。`unpack()` 直接拒收 symlink 同任何路徑穿越(zip-slip)。
"""

from __future__ import annotations

import shutil
import stat
import sys
import zipfile
from pathlib import Path

# zip 檔可以聲明 Unix mode;高 4 bit 係檔案類型,0xA000 = symlink
_S_IFLNK = 0xA000


def _is_symlink(info: zipfile.ZipInfo) -> bool:
    if info.create_system != 3:  # 3 = Unix;Windows 造嘅包唔會有 symlink
        return False
    return stat.S_ISLNK(info.external_attr >> 16)


def unpack(archive: str | Path, dest: str | Path | None = None, *, clean: bool = True) -> Path:
    """拆一個 OOXML 檔去目錄,返回該目錄。

    預設 `clean=True` 會清空目標目錄 —— 上一次拆嘅殘留 part 好易被誤當成今次嘅內容。
    """
    archive = Path(archive).resolve()
    dest = Path(dest).resolve() if dest else archive.with_suffix("")

    if clean and dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)

    skipped: list[str] = []
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            if _is_symlink(info):
                skipped.append(info.filename)
                continue

            # zip-slip 防護:解壓後嘅路徑必須留喺 dest 之內
            target = (dest / info.filename).resolve()
            if not target.is_relative_to(dest):
                skipped.append(info.filename)
                continue

            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)

    if skipped:
        print(f"skipped {len(skipped)} unsafe entr{'y' if len(skipped) == 1 else 'ies'}: "
              + ", ".join(skipped[:5]), file=sys.stderr)

    return dest


def pack(source: str | Path, archive: str | Path) -> Path:
    """將目錄砌返做 OOXML 檔,返回該檔路徑。

    一律覆寫目標(對齊上游 `rm -f ../out.docx` 嗰步):就地更新一個舊包嘅話,
    你喺目錄度刪咗嘅 part 會喺舊包裡面存活,砌出嚟嘅檔就會帶住幽靈內容。
    """
    source = Path(source).resolve()
    archive = Path(archive).resolve()

    if not source.is_dir():
        raise NotADirectoryError(f"not a directory: {source}")

    content_types = source / "[Content_Types].xml"
    if not content_types.exists():
        raise FileNotFoundError(
            f"{source} has no [Content_Types].xml — that is not an unpacked OOXML package. "
            "Point at the directory you unpacked into, not its parent."
        )

    if archive.exists():
        archive.unlink()
    archive.parent.mkdir(parents=True, exist_ok=True)

    files = sorted(p for p in source.rglob("*") if p.is_file())
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            # ZipInfo 手動造 —— zipfile.write() 會連 mtime extra field 一齊寫,
            # 而 `zip -X` 嘅語義係唔要嗰啲。
            info = zipfile.ZipInfo(path.relative_to(source).as_posix())
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, path.read_bytes())

    return archive


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python ooxml.py unpack <file.docx|pptx|xlsx> [dest_dir]")
        print("  python ooxml.py pack   <dir> <out.docx|pptx|xlsx>")
        return 2

    action, rest = sys.argv[1], sys.argv[2:]

    if action == "unpack":
        dest = unpack(rest[0], rest[1] if len(rest) > 1 else None)
        print(f"unpacked -> {dest}")
    elif action == "pack":
        if len(rest) < 2:
            print("pack needs both <dir> and <out file>")
            return 2
        out = pack(rest[0], rest[1])
        print(f"packed -> {out} ({out.stat().st_size} bytes)")
    else:
        print(f"unknown action {action!r}; expected 'unpack' or 'pack'")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
