# check-claude-size.ps1
# 檢查 CLAUDE.md / AGENTS.md 體積 —— standing instructions 太大 = AI 失焦 + 每 session 燒 context。
# 用法: powershell -NoProfile -File scripts/check-claude-size.ps1

$ErrorActionPreference = 'Continue'
$root = $env:CLAUDE_PROJECT_DIR
if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }

# 軟上限(字元)—— 超過就考慮把細節 route 去 docs,CLAUDE.md 只留 index。
$softCap = 60000

$files = @('CLAUDE.md', 'AGENTS.md')
"`n== Standing instructions size check =="
foreach ($f in $files) {
    $path = Join-Path $root $f
    if (Test-Path -LiteralPath $path) {
        $chars = (Get-Content -Raw -LiteralPath $path).Length
        $flag = if ($chars -gt $softCap) { "OVER (route detail to docs/)" } else { "ok" }
        "{0,-12} {1,8} chars  [{2}]" -f $f, $chars, $flag
    }
}
"(soft cap: $softCap chars. CLAUDE.md 應只做 routing + 紅線,唔重複 spec。)"
