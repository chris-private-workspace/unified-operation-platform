# 重啟後驗證:只輪詢 endpoint(冷啟 api ~15-40s / web ~8s),期間絕不碰進程。
# 跑呢個 script 記得畀 timeout >= 180s。
. (Join-Path $PSScriptRoot '_common.ps1')

$checks = @(
  @{ Name = 'api  (NestJS)'; Url = "http://localhost:$ApiPort/docs/api"; Max = 90 },
  @{ Name = 'web  (Vite)'; Url = "http://localhost:$WebPort/"; Max = 60 },
  @{ Name = 'api via proxy'; Url = "http://localhost:$WebPort/api/me"; Max = 30 }
)
foreach ($c in $checks) {
  $ok = $false; $elapsed = 0; $last = ''
  while ($elapsed -lt $c.Max -and -not $ok) {
    try {
      $r = Invoke-WebRequest -Uri $c.Url -TimeoutSec 10 -UseBasicParsing
      Write-Output ("{0,-16} -> HTTP {1}  (after {2}s)  {3}" -f $c.Name, $r.StatusCode, $elapsed, $c.Url)
      $ok = $true
    } catch {
      $code = $_.Exception.Response.StatusCode.value__
      if ($code) {
        # 有 HTTP status 就算 reachable —— /api/me 未認證返 401 都代表服務通
        Write-Output ("{0,-16} -> HTTP {1}  (after {2}s)  {3}" -f $c.Name, $code, $elapsed, $c.Url)
        $ok = $true
      } else {
        $last = $_.Exception.Message
        Start-Sleep -Seconds 3
        $elapsed += 3
      }
    }
  }
  if (-not $ok) { Write-Output ("{0,-16} -> FAILED after {1}s :: {2}" -f $c.Name, $c.Max, $last) }
}

Write-Output ''
Write-Output '=== infra ==='
docker ps --format '{{.Names}} | {{.Status}} | {{.Ports}}'

Write-Output ''
Write-Output '=== listeners(pid 應該同重啟前唔同 = 真係重起過) ==='
foreach ($p in $AppPorts) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($c) { Write-Output ("port {0} LISTEN pid={1}" -f $p, (($c.OwningProcess | Select-Object -Unique) -join ',')) }
  else { Write-Output ("port {0} FREE — 服務未起!" -f $p) }
}

Write-Output ''
Write-Output '=== leak watch ==='
$n = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match $OwnPattern }).Count
Write-Output ("本項目進程 = {0}  (健康值 ~10-16;明顯偏多 = 又洩漏,要再清)" -f $n)

Write-Output ''
Write-Output '⚠️ 提醒:.env 有 AUTH_DEV_BYPASS=true → /api/me 未登入都返 200 屬預期,唔代表 auth 壞。'
Write-Output '   要驗 per-user 行為 → start-detached.ps1 -DisableAuthBypass,之後未認證 /me 應返 401。'
