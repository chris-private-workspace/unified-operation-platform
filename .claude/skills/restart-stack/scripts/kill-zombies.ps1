# 清本項目殭屍 / 孤兒進程。**預設 dry-run**;核對過 kill list 先加 -Execute。
# 🔴 root set 綁死本項目標記 —— 同一部機其他 project 都跑 vite/vitest/node,只 match 'vite' 會誤殺。
param([switch]$Execute)
. (Join-Path $PSScriptRoot '_common.ps1')

$all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue

# --- root set (1):CommandLine 要「本項目標記 AND dev-server token」兩者都中 ---
# 只靠項目標記會誤收 `gh api repos/<owner>/<repo>/...`、Claude Code 自己嘅 pwsh 等無關進程(實測撞過)。
$roots = @($all | Where-Object {
    $_.CommandLine -and $_.CommandLine -match $OwnPattern -and $_.CommandLine -match $DevPattern -and
    $_.Name -notin $NeverRoot
  })

# --- root set (2):佔住本項目 port 嘅 pid(cmd.exe wrapper 無項目標記,靠 port 兜返) ---
foreach ($p in $AppPorts) {
  foreach ($c in (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) {
    $op = $all | Where-Object { $_.ProcessId -eq $c.OwningProcess }
    if ($op) { $roots += $op }
  }
}

# --- 遞歸收 descendants:中間層(cmd.exe /c vite、conhost、esbuild)冇項目標記,只能靠父子樹 ---
$targets = @{}
function Add-Tree([int]$procId) {
  if ($targets.ContainsKey($procId)) { return }
  $proc = $all | Where-Object { $_.ProcessId -eq $procId }
  if (-not $proc) { return }
  $targets[$procId] = $proc
  foreach ($child in ($all | Where-Object { $_.ParentProcessId -eq $procId })) { Add-Tree $child.ProcessId }
}
foreach ($r in $roots) { Add-Tree $r.ProcessId }

# --- 安全網:排除自己同祖先(唔好自殺),排除 docker/wsl infra ---
$selfChain = @()
$cur = $PID
while ($cur) {
  $selfChain += $cur
  $pp = ($all | Where-Object { $_.ProcessId -eq $cur }).ParentProcessId
  if (-not $pp -or $pp -eq 0 -or $selfChain -contains $pp) { break }
  $cur = $pp
}

$final = @()
foreach ($k in $targets.Keys) {
  $p = $targets[$k]
  if ($selfChain -contains $p.ProcessId) { Write-Output ("SKIP (self/ancestor) pid={0}" -f $p.ProcessId); continue }
  if ($p.Name -in $NeverRoot) {
    Write-Output ("SKIP (infra/tool) pid={0} {1}" -f $p.ProcessId, $p.Name); continue
  }
  $final += $p
}

Write-Output ("=== KILL LIST ({0}) — Execute={1} ===" -f $final.Count, $Execute)
foreach ($p in ($final | Sort-Object ProcessId)) {
  $cl = if ($p.CommandLine) { $p.CommandLine } else { '(no cmdline)' }
  if ($cl.Length -gt 140) { $cl = $cl.Substring(0, 140) + '...' }
  Write-Output ("pid={0}  ppid={1}  {2}  :: {3}" -f $p.ProcessId, $p.ParentProcessId, $p.Name, $cl)
}
if (-not $Execute) {
  Write-Output ''
  Write-Output '(dry-run — 核對上面每一行都 trace 得返本項目,再加 -Execute)'
  return
}

Write-Output ''
Write-Output '=== KILLING (leaf-first) ==='
# 高 pid 先殺 ≈ leaf-first;殺父會順帶帶走子,所以「already gone」屬預期,唔係 error。
foreach ($p in ($final | Sort-Object ProcessId -Descending)) {
  try {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    Write-Output ("killed pid={0} {1}" -f $p.ProcessId, $p.Name)
  } catch {
    Write-Output ("already gone (父被殺帶走,預期) pid={0}" -f $p.ProcessId)
  }
}

Start-Sleep -Seconds 3
Write-Output ''
Write-Output '=== POST-KILL PORT CHECK(必須全 free 先可以重起) ==='
foreach ($p in $AppPorts) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($c) { Write-Output ("port {0} STILL LISTEN pid={1}" -f $p, (($c.OwningProcess | Select-Object -Unique) -join ',')) }
  else { Write-Output ("port {0} free" -f $p) }
}
