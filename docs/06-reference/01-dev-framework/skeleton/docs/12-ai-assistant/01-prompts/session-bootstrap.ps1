# session-bootstrap.ps1
# SessionStart hook context injector - fires on startup|compact (see .claude/settings.json).
#
# Prints to stdout (ALL stdout is injected into the model's context at session start):
#   1. Slim session summary       - SESSION_SUMMARY.md
#   2. Auto-detected active phase - newest-modified W*/ folder: plan + checklist + progress tail
#   3. Git working-tree state     - status --short + log --oneline -8
#
# Automates CLAUDE.md section 10.3 (AI Session Start Protocol) steps 2-5 so active-phase context
# survives /compact (where standing-instruction retention drops).
#
# Design notes:
#   - All literal strings here are ASCII: Windows PowerShell 5.1 reads UTF-8 scripts as ANSI and
#     mangles non-ASCII into a parse error. Injected non-ASCII FILE CONTENT comes from
#     Get-Content -Encoding utf8, not from this script's own strings.
#   - Each section is fault-isolated in try/catch: one failure never blocks the rest.
#   - Active phase is auto-detected, so it never goes stale like a hand-maintained coordinate would.
#   - Windows PowerShell 5.1 compatible (no ternary / ?? / ?.).

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$root = $env:CLAUDE_PROJECT_DIR
if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }

# --- 1. Slim session summary ---
try {
    $summary = Join-Path $root 'docs\12-ai-assistant\01-prompts\SESSION_SUMMARY.md'
    if (Test-Path -LiteralPath $summary) { Get-Content -Raw -Encoding utf8 -LiteralPath $summary }
} catch { "(session summary injection failed: $($_.Exception.Message))" }

# --- 2. Auto-detected active phase (newest W*/ by LastWriteTime) ---
try {
    $planning = Join-Path $root 'docs\01-planning'
    $active = $null
    if (Test-Path -LiteralPath $planning) {
        $active = Get-ChildItem -LiteralPath $planning -Directory -Filter 'W*' |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
    }
    "`n---`n## Active phase (auto-detected: newest-modified W*/ folder)"
    if ($active) {
        "Folder: docs/01-planning/$($active.Name)/"
        $plan = Join-Path $active.FullName 'plan.md'
        if (Test-Path -LiteralPath $plan) { "`n### plan.md"; Get-Content -Raw -Encoding utf8 -LiteralPath $plan }
        $check = Join-Path $active.FullName 'checklist.md'
        if (Test-Path -LiteralPath $check) { "`n### checklist.md (find next unchecked)"; Get-Content -Raw -Encoding utf8 -LiteralPath $check }
        $prog = Join-Path $active.FullName 'progress.md'
        if (Test-Path -LiteralPath $prog) { "`n### progress.md (last ~30 lines)"; (Get-Content -Encoding utf8 -LiteralPath $prog -Tail 30) -join "`n" }
    } else { "(no W*/ phase folder found under docs/01-planning/)" }
} catch { "(active phase injection failed: $($_.Exception.Message))" }

# --- 3. Git state ---
try {
    "`n---`n## Git state"
    Push-Location -LiteralPath $root
    "### git status --short"
    $st = (& git status --short) 2>$null
    if ($st) { ($st -join "`n") } else { "(working tree clean)" }
    "`n### git log --oneline -8"
    ((& git log --oneline -8) 2>$null) -join "`n"
    Pop-Location
} catch { "(git state injection failed: $($_.Exception.Message))" }

"`n---`n(Auto-injected by SessionStart hook. Still follow CLAUDE.md 10.3 before implementing.)"
