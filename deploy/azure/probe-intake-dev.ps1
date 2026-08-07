# Zero-write connectivity probes for the DEV intake endpoint (W44 F7).
#
# ASCII ONLY, ON PURPOSE. Windows PowerShell 5.1 reads .ps1 in the system code
# page, not UTF-8, so a non-ASCII character in a string (an em dash was enough)
# comes back mangled and breaks the PARSER before anything runs. This file is
# meant to be handed to an operator on an unknown console, so it stays ASCII.
#
# Runs on Windows PowerShell 5.1 AND PowerShell 7. The first version used
# -SkipHttpErrorCheck, which is pwsh-7-only and failed on 5.1 before testing
# anything. try/catch works on both: 5.1 throws WebException, 7 throws
# HttpResponseException, and the status code is on .Exception.Response either way.
#
# Neither probe writes anything:
#   1. wrong key           -> IntakeKeyGuard rejects before the controller (401)
#   2. right key, mode:2   -> flat DTO rejects @IsIn([1]), no write         (400)
# Passing both separates "the network works" from "the payload is right", so an
# n8n failure afterwards is immediately one or the other.
#
# The key is read from the gitignored params file and is never printed.
#
# [!] MUST RUN FROM A MACHINE ON THE CORPORATE NETWORK.
#     rapo-uop-web-dev.rci-t.com only resolves on the internal DNS. The build
#     host this repo normally lives on sits in an Azure range and cannot resolve
#     it, so running there gives "The remote name could not be resolved" for
#     both probes - a DNS answer, not a verdict on the app. That machine also
#     has no copy of the params file, so if you cannot run it there, use the
#     browser-console equivalent instead (same two probes, no repo needed) from
#     any page of the signed-in site:
#
#       // probe 1 - expect 401. Needs no real key.
#       (await fetch('/api/requests/intake', {method:'POST',
#         headers:{'Content-Type':'application/json','X-Intake-Key':'wrong'},
#         body:'{"mode":1}'})).status
#
#       // probe 2 - expect 400. Replace PASTE_KEY_HERE with the real key.
#       (await fetch('/api/requests/intake', {method:'POST',
#         headers:{'Content-Type':'application/json','X-Intake-Key':'PASTE_KEY_HERE'},
#         body:'{"mode":2,"targetUpn":"probe@example.com","opcoCode":"RHK","requestId":"REQ0000000"}'
#       })).status
#
#     [!] Keep header placeholders ASCII. HTTP headers are ISO-8859-1, so a
#         non-Latin-1 placeholder left in by accident makes fetch throw
#         "String contains non ISO-8859-1 code point" before any request is
#         sent - which reads like a server problem and is not one.
#
# Usage:  ./deploy/azure/probe-intake-dev.ps1        (from the repo root)

$ErrorActionPreference = 'Continue'

$paramsPath = 'deploy/azure/aca.params.dev.json'
if (-not (Test-Path $paramsPath)) { throw "missing $paramsPath (gitignored; regenerate it)" }
$key = (Get-Content $paramsPath -Raw | ConvertFrom-Json).parameters.intakeApiKey.value
if ([string]::IsNullOrWhiteSpace($key)) { throw 'intakeApiKey is empty in the params file' }

$url = 'https://rapo-uop-web-dev.rci-t.com/api/requests/intake'

function Invoke-Probe {
    param([string]$Label, [string]$Key, [string]$Body, [int]$Expect)

    $code = -1
    $content = ''
    try {
        $r = Invoke-WebRequest -Uri $url -Method POST -TimeoutSec 25 -UseBasicParsing `
            -Headers @{ 'X-Intake-Key' = $Key } -ContentType 'application/json' -Body $Body
        $code = [int]$r.StatusCode
        $content = $r.Content
    } catch {
        $resp = $null
        if ($_.Exception.PSObject.Properties['Response']) { $resp = $_.Exception.Response }
        if ($resp) {
            $code = [int]$resp.StatusCode
            # pwsh 7 puts the body here; 5.1 leaves it on the response stream.
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                $content = $_.ErrorDetails.Message
            } else {
                try {
                    $sr = New-Object IO.StreamReader($resp.GetResponseStream())
                    $content = $sr.ReadToEnd()
                    $sr.Close()
                } catch { $content = '' }
            }
        } else {
            # No response at all = DNS / TLS / route. A different class of
            # failure from an HTTP error, and the reason probe 1 exists.
            $content = 'NO HTTP RESPONSE: ' + $_.Exception.Message
        }
    }

    $verdict = if ($code -eq $Expect) { 'OK' } else { 'UNEXPECTED' }
    # Write-Host, NOT bare strings. A PowerShell function returns EVERY
    # uncaptured output, so bare strings would be swallowed into the return
    # value: the caller would get an array instead of a boolean, `-and` would
    # see a non-empty array as $true, and this script would report
    # "BOTH PROBES PASSED" while printing nothing and testing nothing.
    # That is exactly what the first version of this file did.
    Write-Host ("{0,-26} -> {1,-4} (expect {2})  [{3}]" -f $Label, $code, $Expect, $verdict)
    if ($content) { Write-Host ('    body: ' + $content.Trim()) }
    Write-Host ''
    return ($code -eq $Expect)
}

"PowerShell edition : $($PSVersionTable.PSEdition) $($PSVersionTable.PSVersion)"
"target             : $url"
''

# 1 - deliberately wrong key. Proves the request reaches IntakeKeyGuard, i.e.
#     DNS + TLS + nginx proxy + the internal api are all working.
$p1 = Invoke-Probe -Label 'probe 1 (wrong key)' -Key 'deliberately-wrong-key' `
    -Body '{"mode":1}' -Expect 401

# 2 - right key, unsupported mode. Proves the key is correct and the body
#     reached the controller; @IsIn([1]) rejects it with nothing written.
$p2 = Invoke-Probe -Label 'probe 2 (right key, mode 2)' -Key $key `
    -Body '{"mode":2,"targetUpn":"probe@example.com","opcoCode":"RHK","requestId":"REQ0000000"}' `
    -Expect 400

# Guard against the failure this script already had once: if these are not
# genuinely booleans, the verdict below is meaningless. Say so rather than
# printing a green line nobody can trust.
if ($p1 -isnot [bool] -or $p2 -isnot [bool]) {
    Write-Host 'SCRIPT BUG: probe results are not booleans - verdict is unreliable.'
    exit 2
}

if ($p1 -and $p2) {
    Write-Host 'BOTH PROBES PASSED - network + key are good; hand the key to n8n.'
} else {
    Write-Host 'AT LEAST ONE PROBE FAILED - do NOT hand off to n8n yet.'
    Write-Host '  "could not be resolved"      -> WRONG MACHINE, not a real failure.'
    Write-Host '                                  This host cannot see the internal DNS.'
    Write-Host '                                  Re-run from the corporate network.'
    Write-Host '  other no-HTTP-response       -> route / TLS.'
    Write-Host '  probe 1 gave 200/400 not 401 -> the guard is not doing its job.'
    Write-Host '  probe 2 gave 401             -> stale key; re-read the params file.'
}
