# 跑 docx-js / pptxgenjs 生成腳本,自動補 NODE_PATH。
#
# `docx` 同 `pptxgenjs` 係 npm global 裝嘅,但 Node 唔會自動搵 global node_modules
# (NODE_PATH 預設空)。上游 SKILL.md 話「preinstalled,直接 require」——
# 喺呢部機唔成立,唔補 NODE_PATH 就係 MODULE_NOT_FOUND。
#
#   .\nodegen.ps1 build-deck.js out.pptx

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Script,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

if (-not $env:NODE_PATH) {
    # npm root -g 慢(~1s)但唔會過時;搵唔到就用標準 user-install 位置兜底
    $globalRoot = & npm root -g 2>$null
    if (-not $globalRoot -or -not (Test-Path $globalRoot)) {
        $globalRoot = Join-Path $env:APPDATA "npm\node_modules"
    }
    $env:NODE_PATH = $globalRoot
}

if (-not (Test-Path $Script)) {
    Write-Error "script not found: $Script"
    exit 2
}

& node $Script @Rest
exit $LASTEXITCODE
