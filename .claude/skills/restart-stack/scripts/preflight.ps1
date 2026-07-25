# Read-only 盤點:infra / port / 進程 / endpoint。落任何 destructive op 之前必跑。
. (Join-Path $PSScriptRoot '_common.ps1')

Write-Output ("repo root = {0}" -f $RepoRoot)
Write-Output ''
Write-Output '=== [1] docker containers ==='
try { docker ps --format '{{.Names}} | {{.Status}} | {{.Ports}}' } catch { Write-Output "docker error: $_" }

Write-Output ''
Write-Output '=== [2] port listeners (5433 postgres / 6379 redis / 3100 api / 5173 web) ==='
foreach ($p in ($InfraPorts + $AppPorts)) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($c) {
    foreach ($x in ($c | Select-Object -Unique OwningProcess)) {
      $proc = Get-Process -Id $x.OwningProcess -ErrorAction SilentlyContinue
      Write-Output ("port {0} LISTEN  pid={1}  name={2}" -f $p, $x.OwningProcess, $proc.ProcessName)
    }
  } else {
    Write-Output ("port {0} free" -f $p)
  }
}

Write-Output ''
Write-Output '=== [3] 本項目進程(洩漏盤點) ==='
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match $OwnPattern }
if ($procs) {
  foreach ($p in ($procs | Sort-Object ProcessId)) {
    $cl = $p.CommandLine
    if ($cl.Length -gt 160) { $cl = $cl.Substring(0, 160) + '...' }
    # [dev] = kill 候選(項目標記 + dev token);[other] = 只係命令行提到 repo 名(例 gh api / 編輯器),唔會被清
    $tag = if ($p.CommandLine -match $DevPattern -and $p.Name -notin $NeverRoot) { '[dev]  ' } else { '[other]' }
    Write-Output ("{0} pid={1}  ppid={2}  {3}  :: {4}" -f $tag, $p.ProcessId, $p.ParentProcessId, $p.Name, $cl)
  }
  $devCount = @($procs | Where-Object { $_.CommandLine -match $DevPattern -and $_.Name -notin $NeverRoot }).Count
  Write-Output ("TOTAL = {0}  (其中 [dev] = {1};健康值 ~10-16,明顯偏多 = 有洩漏)" -f @($procs).Count, $devCount)
} else {
  Write-Output 'none (stack 未起 或 已清乾淨)'
}

Write-Output ''
Write-Output '=== [4] endpoint reachability(以此為準,唔係 container health flag) ==='
foreach ($u in "http://localhost:$ApiPort/docs/api", "http://localhost:$WebPort/") {
  try {
    $r = Invoke-WebRequest -Uri $u -TimeoutSec 10 -UseBasicParsing
    Write-Output ("{0} -> HTTP {1}" -f $u, $r.StatusCode)
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code) { Write-Output ("{0} -> HTTP {1}" -f $u, $code) }
    else { Write-Output ("{0} -> UNREACHABLE ({1})" -f $u, $_.Exception.Message) }
  }
}
