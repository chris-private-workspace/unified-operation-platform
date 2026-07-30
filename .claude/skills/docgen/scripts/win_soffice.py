"""Windows 版 LibreOffice runner —— 取代 document-skills 自帶嘅 Linux-only wrapper。

點解要呢個檔:
  上游 `scripts/office/soffice.py` 開頭用 `socket.AF_UNIX` 探測沙箱限制,再喺需要時
  用 `gcc` 編一個 `LD_PRELOAD` shim。Windows Python 冇 `socket.AF_UNIX` 屬性,
  `get_soffice_env()` 即刻 raise AttributeError,於是 recalc.py / accept_changes.py /
  thumbnail.py 全部未開始做嘢就死 ——
  `{"error": "Could not prepare the LibreOffice environment: module 'socket' has no attribute 'AF_UNIX'"}`

本模組提供同名、同 signature 嘅 `get_soffice_env()` / `run_soffice()`,由 `skillrun.py`
注入 `sys.modules["office.soffice"]`,令上游 script 原封不動咁跑得。**唔改 plugin cache**,
所以 plugin 更新唔會覆蓋呢個修復。

Windows 三個實測坑(全部有真 output 為證,見 SKILL.md「實測基準」):
  1. 必須用 `soffice.com`,唔可以 `soffice.exe`。`.exe` 會即刻 return exit 0 但唔等轉換
     完成,結果係「命令成功但檔案唔存在」。Python subprocess 行 CreateProcess,只自動補
     `.exe`,所以淨係寫 "soffice" 會中伏 —— 下面顯式解析到 `.com`。
  2. 唔可以傳 app flag(`--calc` / `--writer` / `--impress`)。`--calc` 撞 `-env:UserInstallation`
     會令 soffice 直接 crash(0xC0000409 STATUS_STACK_BUFFER_OVERRUN)。
  3. 冇 `SAL_USE_VCLPLUGIN=svp`、冇 LD_PRELOAD —— 嗰兩樣係 Linux headless 專用。
"""

from __future__ import annotations

import contextlib
import os
import shutil
import subprocess
import tempfile
from collections.abc import Iterable
from pathlib import Path

# soffice.exe 唔等轉換完成就 return,所以整個模組只認 .com
_CONSOLE_BINARY = "soffice.com"

_FALLBACK_DIRS = (
    r"C:\Program Files\LibreOffice\program",
    r"C:\Program Files (x86)\LibreOffice\program",
)

# 傳呢啲 flag 落去會 crash(見上面坑 2),run_soffice 會靜靜隔走
_CRASHING_APP_FLAGS = frozenset({"--calc", "--writer", "--impress", "--draw", "--base", "--math"})


class SofficeNotFound(FileNotFoundError):
    """LibreOffice 搵唔到 —— 同上游一樣用 FileNotFoundError 家族,好等 caller 嘅 except 接得住。"""


def find_soffice() -> str:
    """返回 soffice.com 嘅絕對路徑。

    刻意唔返回 "soffice" 呢個裸名:Windows CreateProcess 只會自動補 `.exe`,
    而 `.exe` 唔等轉換完成(坑 1)。
    """
    found = shutil.which(_CONSOLE_BINARY)
    if found:
        return found

    for directory in _FALLBACK_DIRS:
        candidate = Path(directory) / _CONSOLE_BINARY
        if candidate.exists():
            return str(candidate)

    # PATH 上可能淨係有 soffice.exe —— 同一個資料夾通常擺埋 .com
    generic = shutil.which("soffice")
    if generic:
        sibling = Path(generic).with_name(_CONSOLE_BINARY)
        if sibling.exists():
            return str(sibling)

    raise SofficeNotFound(
        "soffice.com not found. Install LibreOffice, or add its program\\ directory to PATH."
    )


def get_soffice_env() -> dict:
    """上游 signature 相容。

    Windows 唔需要上游嗰兩個 Linux-only 設定(`SAL_USE_VCLPLUGIN=svp` 同 `LD_PRELOAD` shim),
    所以呢度只係原封返回 environment。保留呢個 function 係因為 recalc.py 會直接攞佢
    嚟做 `subprocess.run(env=...)`,同埋當作「環境準備得成唔成功」嘅前置探測。
    """
    return os.environ.copy()


def run_soffice(args: Iterable[str], **kwargs) -> subprocess.CompletedProcess:
    """跑 LibreOffice,行為對齊上游 `run_soffice`。

    同上游一致:caller 冇自己指定 `-env:UserInstallation` 嘅話,就開一個 temp profile。
    隔離 profile 喺 Windows 特別重要 —— 用戶隨時開緊 LibreOffice GUI,共用預設 profile
    會令 headless 轉換靜靜失敗。
    """
    args = [str(a) for a in args]

    dropped = [a for a in args if a in _CRASHING_APP_FLAGS]
    if dropped:
        # 靜靜隔走會 crash 嘅 app flag(坑 2)。--convert-to 本身已經識揀 filter。
        args = [a for a in args if a not in _CRASHING_APP_FLAGS]

    binary = find_soffice()

    with contextlib.ExitStack() as stack:
        if not any(a.startswith("-env:UserInstallation") for a in args):
            profile = stack.enter_context(
                tempfile.TemporaryDirectory(prefix="lo_profile_", ignore_cleanup_errors=True)
            )
            args = [f"-env:UserInstallation={Path(profile).as_uri()}"] + args
        return subprocess.run([binary] + args, env=get_soffice_env(), **kwargs)


def convert(
    src: str | Path,
    fmt: str = "pdf",
    outdir: str | Path | None = None,
    timeout: int = 180,
) -> Path:
    """轉一個檔,返回真實產出路徑;唔成功就 raise。

    上游 SKILL.md 教你睇 exit code,但 Windows 上 exit 0 唔代表出到檔(坑 1),
    所以呢度一律驗產出檔真係存在先返回。
    """
    src = Path(src).resolve()
    if not src.exists():
        raise FileNotFoundError(f"input does not exist: {src}")

    outdir = Path(outdir).resolve() if outdir else src.parent
    outdir.mkdir(parents=True, exist_ok=True)

    # 目標副檔名係 fmt 第一段(`--convert-to "html:XHTML Writer File"` 呢種寫法都食得住)
    ext = fmt.split(":", 1)[0].strip()
    expected = outdir / f"{src.stem}.{ext}"

    before = expected.stat().st_mtime_ns if expected.exists() else None

    result = run_soffice(
        ["--headless", "--norestore", "--convert-to", fmt, "--outdir", str(outdir), str(src)],
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    if not expected.exists():
        detail = (result.stderr or result.stdout or "").strip() or f"exit {result.returncode}"
        raise RuntimeError(f"LibreOffice produced no output for {src.name}: {detail}")

    if before is not None and expected.stat().st_mtime_ns == before:
        raise RuntimeError(
            f"LibreOffice left a stale {expected.name} untouched — nothing was converted. "
            "Close any running LibreOffice window and retry."
        )

    return expected


if __name__ == "__main__":
    import sys

    # 同上游 `python scripts/office/soffice.py <args>` 一樣可以當 CLI 用
    sys.exit(run_soffice(sys.argv[1:]).returncode)
