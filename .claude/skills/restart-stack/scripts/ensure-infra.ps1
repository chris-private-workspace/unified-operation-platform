# Infra 由「睇一睇」升級做「確保起到」。
#
# 點解要有呢個:start-detached.ps1 以前只係 `docker compose ps` 印出嚟畀人睇,假設
# 容器已經喺度。2026-07-29 實測兩個都唔成立:
#   ① uop-redis 根本冇跑(得 postgres)—— 印咗出嚟都冇人為佢 up
#   ② `up -d` 之後容器 healthy,但 host port **冇 publish**(ports 欄係 `6379/tcp`
#      而唔係 `0.0.0.0:6379->6379`)。個容器係舊 compose 創建嘅,`up -d` 只係
#      start 返佢,唔會套用新 ports → 要 --force-recreate 先得。
#
# 所以判斷一律以 **host port listener** 為準,唔係 container health flag ——
# 個 flag 嗰陣係綠嘅,但 app 連唔到。
. (Join-Path $PSScriptRoot '_common.ps1')

# port → compose service 名(compose 服務名唔等於 container_name)
$svcForPort = @{ 5433 = 'postgres'; 6379 = 'redis' }

function Test-PortListening([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

Write-Output '=== [1] docker compose up -d ==='
docker compose --project-directory $RepoRoot up -d 2>&1 | ForEach-Object { Write-Output $_ }

Write-Output ''
Write-Output '=== [2] host port publish 檢查(唔信 health flag) ==='
foreach ($port in $InfraPorts) {
  $svc = $svcForPort[$port]
  if (Test-PortListening $port) {
    Write-Output ("port {0} ({1}) -> LISTENING" -f $port, $svc)
    continue
  }

  # 容器可能跑緊但係舊設定(冇 publish port)→ 重建先會套用 compose 個 ports
  Write-Output ("port {0} ({1}) -> 冇 listener,--force-recreate 重建套用 compose ports" -f $port, $svc)
  docker compose --project-directory $RepoRoot up -d --force-recreate $svc 2>&1 | ForEach-Object { Write-Output $_ }

  $ok = $false
  foreach ($i in 1..15) {
    Start-Sleep -Seconds 2
    if (Test-PortListening $port) { $ok = $true; break }
  }
  if ($ok) { Write-Output ("port {0} ({1}) -> LISTENING(重建後)" -f $port, $svc) }
  else { Write-Output ("port {0} ({1}) -> ❌ 仍然冇 listener —— 停手睇 compose ports 設定" -f $port, $svc) }
}

Write-Output ''
Write-Output '=== [3] 真連線探測(唔係 ps 狀態) ==='
$pg = docker exec uop-postgres pg_isready -U uop -d platform 2>&1
Write-Output ("postgres : {0}" -f ($pg -join ' '))
$redis = docker exec uop-redis redis-cli ping 2>&1
Write-Output ("redis    : {0}  (PONG = 通)" -f ($redis -join ' '))

Write-Output ''
Write-Output '=== [4] 收尾狀態 ==='
docker compose --project-directory $RepoRoot ps --format '{{.Name}} | {{.Status}} | {{.Ports}}' 2>&1 |
  ForEach-Object { Write-Output $_ }
