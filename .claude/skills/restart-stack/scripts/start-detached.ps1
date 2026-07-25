# Detached 起 api + web:各開一個獨立 powershell 窗口 → Claude Code session 結束都繼續跑。
# 唔用 Bash tool background —— 佢綁 session,而且收工留 bash.exe 孤兒。
# -DisableAuthBypass:驗 per-user 行為(改密碼 / role scope / lockout)時用,只傳 shell env,唔改 .env(§4.4)。
param(
  [switch]$ApiOnly,
  [switch]$WebOnly,
  [switch]$DisableAuthBypass
)
. (Join-Path $PSScriptRoot '_common.ps1')

# infra 先確認(healthy 就唔動 —— 唔做無謂 destructive)
Write-Output '=== infra check ==='
docker compose --project-directory $RepoRoot ps --format '{{.Name}} | {{.Status}}'

$jobs = @()
if (-not $WebOnly) { $jobs += @{ Name = 'api'; Cmd = 'npm run start:dev' } }
if (-not $ApiOnly) { $jobs += @{ Name = 'web'; Cmd = 'npm run dev -w @uop/web' } }

Write-Output ''
Write-Output '=== starting (detached) ==='
foreach ($j in $jobs) {
  $prefix = ''
  if ($DisableAuthBypass -and $j.Name -eq 'api') { $prefix = "`$env:AUTH_DEV_BYPASS='false'; " }
  $p = Start-Process powershell `
    -ArgumentList '-NoExit', '-Command', "Set-Location '$RepoRoot'; $prefix$($j.Cmd)" `
    -WindowStyle Normal -PassThru
  Write-Output ("started {0}: window pid={1}  cmd={2}{3}" -f $j.Name, $p.Id, $prefix, $j.Cmd)
}
Write-Output ''
Write-Output '下一步:跑 verify.ps1(冷啟動係慢唔係 hang,絕不因一兩次 fail 就殺進程)'
