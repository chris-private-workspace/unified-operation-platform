# 共用座標 + repo root 推導。scripts/ 喺 <repo>\.claude\skills\restart-stack\scripts\ → 上 4 層 = repo root。
$ErrorActionPreference = 'Continue'

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$script:RootLeaf = Split-Path $script:RepoRoot -Leaf

# 本項目進程標記 —— 必須綁死本項目,唔可以只 match 'vite' / 'node'(其他 project 都跑同樣 binary)。
$script:OwnPattern = "$([regex]::Escape($script:RootLeaf))|@uop[\\/](api|web)|start:dev -w @uop"

# Dev-server command token —— kill root set 必須「項目標記 AND dev token」兩者都中。
# 只靠 OwnPattern 會誤收任何「命令行提到 repo 名」嘅無關進程:實測撞過
#   gh.exe(`gh api repos/<owner>/unified-operation-platform/pulls`)同 Claude Code 自己嘅 pwsh。
# 注意 token 要對得住**真實** command line:實際係 `nest.js" start --watch` / `npm-cli.js" run dev`,
# 所以唔可以寫 'nest start' / 'npm run dev' —— 中間隔住路徑同引號。
$script:DevPattern = 'start:dev|nest start|nest\.js|nest build|vite|run dev|apps\\api\\dist\\main|esbuild'

# 永遠唔入 root set 嘅 binary(即使命令行提到本項目)。
$script:NeverRoot = @('gh.exe', 'git.exe', 'code.exe', 'Code.exe', 'docker.exe', 'com.docker.backend.exe',
  'wslrelay.exe', 'Docker Desktop.exe', 'System', 'ssh.exe')

$script:ApiPort = 3100
$script:WebPort = 5173
$script:InfraPorts = @(5433, 6379)
$script:AppPorts = @($script:ApiPort, $script:WebPort)
