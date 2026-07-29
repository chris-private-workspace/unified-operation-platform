# 切 branch / pull 之後,起服務之前要對齊嘅嘢。預設淨係報告;加 -Fix 至真係做。
#
# 點解要有呢個:2026-07-29 由 feat/ch-008 切返 main(+50 commits),表面上
# 「restart 就得」,實際 schema.prisma 喺期間畀 4 個 commit 改過(最近 W40 F4),
# 而 node_modules 入面嘅 Prisma client 仲係 07-22 生成 → W38-W40 嘅 code 對住舊
# client type-check 唔過,backend 起唔到。呢類 drift 喺 preflight 嗰四項(容器 /
# port / 進程 / endpoint)入面**完全睇唔到**,因為佢哋全部都係綠嘅。
#
# 判斷用 mtime 比較,唔用 git diff —— 簡單、無需網絡,而且錯嘅方向係安全嗰邊:
# checkout 令 mtime 更新但內容冇變 = 白做一次 generate(451ms),唔會漏做。
param([switch]$Fix)

. (Join-Path $PSScriptRoot '_common.ps1')

$needAction = @()

function Get-Mtime([string]$Path) {
  if (Test-Path $Path) { return (Get-Item $Path).LastWriteTime }
  return $null
}

Write-Output '--- npm 依賴 vs lockfile ---'
$lock = Join-Path $RepoRoot 'package-lock.json'
$installed = Join-Path $RepoRoot 'node_modules\.package-lock.json'
$lockT = Get-Mtime $lock
$instT = Get-Mtime $installed
if (-not $instT) {
  Write-Output 'node_modules 未安裝 → 要 npm install'
  $needAction += 'npm-install'
} elseif ($lockT -gt $instT) {
  Write-Output ("lockfile ({0}) 新過已安裝 ({1}) → 要 npm install" -f $lockT, $instT)
  $needAction += 'npm-install'
} else {
  Write-Output ("同步(installed {0} >= lock {1})" -f $instT, $lockT)
}

Write-Output ''
Write-Output '--- Prisma client vs schema ---'
$schema = Join-Path $RepoRoot 'apps\api\prisma\schema.prisma'
$client = Join-Path $RepoRoot 'node_modules\.prisma\client\index.d.ts'
$schemaT = Get-Mtime $schema
$clientT = Get-Mtime $client
if (-not $clientT) {
  Write-Output 'Prisma client 未生成 → 要 prisma generate'
  $needAction += 'prisma-generate'
} elseif ($schemaT -gt $clientT) {
  Write-Output ("schema ({0}) 新過 client ({1}) → 要 prisma generate" -f $schemaT, $clientT)
  $needAction += 'prisma-generate'
} else {
  Write-Output ("同步(client {0} >= schema {1})" -f $clientT, $schemaT)
}

Write-Output ''
Write-Output '--- DB migration(只報告,絕不自動 migrate)---'
$migDir = Join-Path $RepoRoot 'apps\api\prisma\migrations'
$onDisk = @(Get-ChildItem -Path $migDir -Directory -ErrorAction SilentlyContinue).Count
$appliedRaw = docker exec uop-postgres psql -U uop -d platform -t -A `
  -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;' 2>&1
$applied = ($appliedRaw | Select-Object -First 1).ToString().Trim()
Write-Output ("migration 資料夾 = {0} · DB 已套用 = {1}" -f $onDisk, $applied)
if ("$onDisk" -ne "$applied") {
  Write-Output '⚠️ 對唔上 —— 要人手決定(`npm run prisma:deploy -w @uop/api`)。本腳本唔會自動改 DB。'
}

Write-Output ''
if ($needAction.Count -eq 0) {
  Write-Output '=== 結論:code 側已對齊,可以起服務 ==='
  return
}

if (-not $Fix) {
  Write-Output ("=== 結論:要處理 [{0}] —— 加 -Fix 執行 ===" -f ($needAction -join ', '))
  return
}

Write-Output '=== 執行修復(-Fix) ==='
Push-Location $RepoRoot
try {
  if ($needAction -contains 'npm-install') {
    Write-Output '--- npm install ---'
    npm install 2>&1 | Select-Object -Last 15 | ForEach-Object { Write-Output $_ }
  }
  if ($needAction -contains 'prisma-generate') {
    Write-Output '--- prisma generate ---'
    # 公司 proxy 會斷 TLS chain;--use-system-ca 係永久解(memory: prisma-generate-proxy-block)。
    # engine 已 cache 就唔會再下載 .dll(嗰個先係畀 DLP 擋嗰步)。
    $env:NODE_OPTIONS = '--use-system-ca'
    npm run prisma:generate -w @uop/api 2>&1 | ForEach-Object { Write-Output $_ }
    Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
  }
} finally {
  Pop-Location
}
