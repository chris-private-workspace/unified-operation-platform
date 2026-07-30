"""跑 document-skills 上游 script,途中換走 Linux-only 嘅 LibreOffice wrapper。

用法:
    python .claude/skills/docgen/scripts/skillrun.py xlsx recalc.py out.xlsx 60
    python .claude/skills/docgen/scripts/skillrun.py pptx thumbnail.py deck.pptx deck-thumbs
    python .claude/skills/docgen/scripts/skillrun.py pptx office/validate.py out.pptx
    python .claude/skills/docgen/scripts/skillrun.py docx accept_changes.py in.docx out.docx

點解要 launcher 而唔係複製一份 script 出嚟改:
    上游 script 入面有用嘅嘢好多(recalc.py 嘅 LibreOffice Basic macro、external-link
    保護、錯誤掃描;thumbnail.py 嘅版面網格)—— 全部係平台無關嘅。真正壞嘅只有
    `office.soffice` 一個模組。所以呢度只換嗰一個模組,其餘原封執行:
    上游更新照樣受惠,我哋亦唔使維護一份會 drift 嘅分叉。

做法:喺載入目標 script 之前,先將 `win_soffice` 註冊做 `sys.modules["office.soffice"]`。
Python 唔會重新載入已經喺 sys.modules 嘅模組,所以上游嗰句
`from office.soffice import get_soffice_env, run_soffice` 攞到嘅係 Windows 版。
`office` package 本身保留真實 `__path__`,所以 `office.validators` 等其他子模組照常載入。
"""

from __future__ import annotations

import os
import runpy
import subprocess
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import win_soffice  # noqa: E402

_ENV_OVERRIDE = "DOCUMENT_SKILLS_DIR"
_DEFAULT_CACHE = (
    Path.home() / ".claude" / "plugins" / "cache" / "anthropic-agent-skills" / "document-skills"
)


def find_skills_root() -> Path:
    """搵 document-skills 嘅 `skills/` 目錄。

    Plugin cache 目錄名係一個 content hash,更新之後會變,而且舊 hash 唔會即刻消失。
    所以唔可以寫死 —— 呢度揀「有齊四個 skill 而 mtime 最新」嗰個。
    """
    override = os.environ.get(_ENV_OVERRIDE)
    if override:
        root = Path(override)
        if not root.exists():
            raise SystemExit(f"{_ENV_OVERRIDE} points at a missing directory: {root}")
        return root / "skills" if (root / "skills").is_dir() else root

    if not _DEFAULT_CACHE.is_dir():
        raise SystemExit(
            f"document-skills plugin not found at {_DEFAULT_CACHE}.\n"
            "Install it with /plugin, or set "
            f"{_ENV_OVERRIDE} to the directory that contains skills/."
        )

    candidates = [
        p for p in _DEFAULT_CACHE.glob("*/skills") if p.is_dir() and (p / "xlsx").is_dir()
    ]
    if not candidates:
        raise SystemExit(f"No usable skills/ directory under {_DEFAULT_CACHE}")

    return max(candidates, key=lambda p: p.stat().st_mtime)


def install_shim(scripts_dir: Path) -> None:
    """用 Windows 版換走 `office.soffice`,其餘 `office.*` 保持真身。"""
    office_dir = scripts_dir / "office"

    package = types.ModuleType("office")
    # 保留真實 __path__,office.validators / office.helpers 先至 import 得返
    package.__path__ = [str(office_dir)]
    sys.modules["office"] = package
    sys.modules["office.soffice"] = win_soffice
    package.soffice = win_soffice


def ensure_utf8_mode() -> None:
    """未開 UTF-8 mode 就帶住 `-X utf8` re-exec 自己。

    上游 script 用裸 `open()` 讀 OOXML 入面嘅 XML。Windows Python 嘅預設 encoding
    係 locale(呢部機 cp950),但 OOXML 一律 UTF-8 —— 於是任何含中文嘅文件都會炸:
        'charmap' codec can't decode byte 0x8f ... character maps to <undefined>
    UTF-8 mode 必須喺解譯器啟動嗰刻生效,喺呢度改 os.environ 已經太遲,所以要 re-exec。
    """
    if sys.flags.utf8_mode:
        return
    os.environ["PYTHONUTF8"] = "1"
    # 唔用 os.execv —— Windows 冇真正嘅 exec,Python 要自己將 argv 拼成一條命令列,
    # 而佢唔會幫帶空格嘅參數加引號。結果「Azure UAT 部署流程.docx」會散成四個參數,
    # 目標 script 就收到一個唔存在嘅檔名。subprocess 會經 list2cmdline 正確 quote。
    completed = subprocess.run(
        [sys.executable, "-X", "utf8", str(Path(__file__).resolve()), *sys.argv[1:]]
    )
    sys.exit(completed.returncode)


def main() -> int:
    ensure_utf8_mode()

    if len(sys.argv) < 3:
        print(__doc__)
        print("\nUsage: skillrun.py <skill> <script.py> [args...]")
        print("  <skill>   one of: xlsx | docx | pptx | pdf")
        print("  <script>  path relative to that skill's scripts/ dir")
        return 2

    skill, script = sys.argv[1], sys.argv[2]
    forwarded = sys.argv[3:]

    scripts_dir = find_skills_root() / skill / "scripts"
    if not scripts_dir.is_dir():
        raise SystemExit(f"No scripts/ directory for skill {skill!r}: {scripts_dir}")

    target = scripts_dir / script
    if not target.exists():
        available = sorted(p.name for p in scripts_dir.glob("*.py"))
        raise SystemExit(f"{script!r} not found in {scripts_dir}\nAvailable: {', '.join(available)}")

    install_shim(scripts_dir)
    sys.path.insert(0, str(scripts_dir))
    # Python 直接跑一個 script 嗰陣,sys.path[0] 係嗰個 script 自己所在嘅目錄。
    # 要照做,否則子目錄入面嘅 script 會 import 唔到隔籬嘅模組 ——
    # 例如 office/validate.py 嗰句 `from helpers import ...` 就要 office/ 喺 path 度。
    sys.path.insert(0, str(target.parent))
    sys.argv = [str(target)] + forwarded

    # 上游 script 靠 sys.exit() 表達成敗;照原樣傳返出去
    try:
        runpy.run_path(str(target), run_name="__main__")
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else (0 if exc.code is None else 1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
