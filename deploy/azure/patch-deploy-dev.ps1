# Azure DEV (RG-RAPO-UOP-DEV) deployment via raw ARM PATCH.
#
# WHY NOT aca-dev.json / az deployment group create:
#   The deployment SP has Contributor only on RG-RAPO-UOP-DEV. The shared
#   Container Apps environment acaen-rapo-dev lives in RG-RAPO-ContainerAPP-DEV,
#   and ARM's full PUT always declares environmentId - which triggers a linked
#   authorization check for Microsoft.App/managedEnvironments/join/action that
#   the SP does not have. A PATCH body that omits environmentId does not trigger
#   it. See docs/13-deployment/09-dev-as-built.md (B4).
#
# WHY NOT `az containerapp update` / `az containerapp registry set`:
#   Those do a read-modify-write and send the whole resource back, environmentId
#   included, so they hit the same 403. Only a raw PATCH works.
#
# SIDE BENEFIT: PATCH never unsets properties it doesn't mention. Omitting
# workloadProfileName and the web app's customDomains/external means infra's
# custom domain + SNI binding are structurally untouchable here - safer than the
# declarative template, which unsets anything not written down.
#
# aca-dev.json is still the declarative truth for the topology and becomes usable
# again the moment infra grants join/action.
#
# Usage:  ./patch-deploy-dev.ps1            # dry run - prints masked bodies
#         ./patch-deploy-dev.ps1 -Send      # actually deploys
# Run from the repo root. Reads deploy/azure/aca.params.dev.json (gitignored).

param([switch]$Send)

$ErrorActionPreference = 'Stop'

$paramsPath = 'deploy/azure/aca.params.dev.json'
if (-not (Test-Path $paramsPath)) { throw "missing $paramsPath (gitignored - regenerate it)" }
$p = (Get-Content $paramsPath -Raw | ConvertFrom-Json).parameters

$sub    = '30dac177-6dcb-412e-94f6-da9308fd1d09'
$rg     = 'RG-RAPO-UOP-DEV'
$apiN   = 'aca-rapo-uop-api-dev'
$webN   = 'aca-rapo-uop-web-dev'
$apiVer = '2024-03-01'

function Send-Patch($name, $body) {
  $bodyFile = Join-Path $env:TEMP "uop-$name-patch.json"
  $respFile = Join-Path $env:TEMP "uop-$name-patch-resp.json"
  $body | ConvertTo-Json -Depth 30 -Compress | Set-Content -Path $bodyFile -NoNewline -Encoding utf8
  az rest --method patch `
    --url "https://management.azure.com/subscriptions/$sub/resourceGroups/$rg/providers/Microsoft.App/containerApps/${name}?api-version=$apiVer" `
    --body "@$bodyFile" --headers "Content-Type=application/json" -o json > $respFile 2>&1
  $code = $LASTEXITCODE
  Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue   # body holds secrets
  "$name PATCH exit = $code"
  if ($code -ne 0) { Get-Content $respFile -Raw; throw "$name PATCH failed" }
}

function Show-Masked($label, $body) {
  $c = $body | ConvertTo-Json -Depth 30 | ConvertFrom-Json
  foreach ($s in $c.properties.configuration.secrets) { $s.value = "<len $($s.value.Length)>" }
  "=== $label (secret values masked) ==="
  $c | ConvertTo-Json -Depth 30
  "--- sanity ---"
  "secrets            : $($body.properties.configuration.secrets.Count)"
  "env vars           : $($body.properties.template.containers[0].env.Count)"
  "has environmentId  : $($body.properties.ContainsKey('environmentId'))       # must be False"
  "has workloadProfile: $($body.properties.ContainsKey('workloadProfileName')) # must be False"
  ''
}

# ---------------------------------------------------------------- api --------
$apiBody = @{
  properties = @{
    configuration = @{
      activeRevisionsMode = 'Single'
      # ADR-0027 Option A: internal ingress, single public origin via web.
      # allowInsecure:true + port 3000 - without it the http upstream from
      # nginx gets 301'd to https (UAT lesson, runbook 8.3).
      ingress    = @{ external = $false; targetPort = 3000; transport = 'auto'; allowInsecure = $true }
      registries = @( @{ server = $p.acrServer.value; username = $p.acrUsername.value; passwordSecretRef = 'acr-password' } )
      secrets    = @(
        @{ name = 'acr-password';                 value = $p.acrPassword.value }
        @{ name = 'database-url';                 value = $p.databaseUrl.value }
        @{ name = 'graph-client-secret';          value = $p.graphClientSecret.value }
        @{ name = 'servicenow-password';          value = $p.servicenowPassword.value }
        @{ name = 'intake-api-key';               value = $p.intakeApiKey.value }
        @{ name = 'auth-jwt-secret';              value = $p.authJwtSecret.value }
        @{ name = 'local-admin-initial-password'; value = $p.localAdminInitialPassword.value }
        @{ name = 'acs-connection-string';        value = $p.acsConnectionString.value }
        # ADR-0028 - the SSO client secret. This is the ONE secret Entra SSO
        # needs, and it never leaves the server: the browser holds no token.
        @{ name = 'entra-client-secret';          value = $p.entraClientSecret.value }
      )
    }
    template = @{
      containers = @( @{
        name      = $apiN
        image     = $p.apiImage.value
        resources = @{ cpu = 0.5; memory = '1Gi' }
        env       = @(
          @{ name = 'NODE_ENV';                     value = 'production' }
          @{ name = 'PORT';                         value = '3000' }
          @{ name = 'REQUEST_SUBMISSION_PROVIDER';  value = 'direct' }
          @{ name = 'GRAPH_TENANT_ID';              value = $p.graphTenantId.value }
          @{ name = 'GRAPH_CLIENT_ID';              value = $p.graphClientId.value }
          @{ name = 'SERVICENOW_INSTANCE_URL';      value = $p.servicenowInstanceUrl.value }
          @{ name = 'SERVICENOW_USER';              value = $p.servicenowUser.value }
          @{ name = 'SERVICENOW_DEFAULT_TABLE';     value = $p.servicenowDefaultTable.value }
          # ADR-0025 D2 / BUG-010 - the catalog items the platform orders through.
          # config.get, NOT getOrThrow: leaving these unset still boots, but the
          # first attempt to raise a ticket throws "catalog item is not
          # configured". Instance-specific sys_ids - these are the ricohapdev
          # values, which is the instance SERVICENOW_INSTANCE_URL points at.
          @{ name = 'SERVICENOW_O365_CATALOG_ITEM_SYS_ID'; value = $p.servicenowO365CatalogItemSysId.value }
          @{ name = 'SERVICENOW_D365_CATALOG_ITEM_SYS_ID'; value = $p.servicenowD365CatalogItemSysId.value }
          # The operator cannot reach the private-endpoint DB, so the container
          # self-migrates. NOTE: entrypoint treats failure as non-fatal.
          @{ name = 'RUN_MIGRATIONS_ON_START';      value = 'true' }
          @{ name = 'RUN_SEED_ON_START';            value = 'true' }
          @{ name = 'ACS_SENDER_ADDRESS';           value = $p.acsSenderAddress.value }
          @{ name = 'APP_BASE_URL';                 value = $p.appBaseUrl.value }
          # ADR-0028 - Entra SSO, read at RUNTIME. All four or SSO stays off
          # (/auth/sso/status reports enabled:false and the button greys out).
          # These used to be VITE_* baked into the web image at build time;
          # moving them here is what makes an Entra config change a restart
          # rather than a ~10-minute rebuild.
          @{ name = 'ENTRA_TENANT_ID';              value = $p.entraTenantId.value }
          @{ name = 'ENTRA_CLIENT_ID';              value = $p.entraClientId.value }
          # Must match the app registration's registered redirect URI verbatim.
          @{ name = 'ENTRA_REDIRECT_URI';           value = $p.entraRedirectUri.value }
          @{ name = 'ENTRA_CLIENT_SECRET';          secretRef = 'entra-client-secret' }
          @{ name = 'DATABASE_URL';                 secretRef = 'database-url' }
          @{ name = 'LOCAL_ADMIN_INITIAL_PASSWORD'; secretRef = 'local-admin-initial-password' }
          @{ name = 'GRAPH_CLIENT_SECRET';          secretRef = 'graph-client-secret' }
          @{ name = 'SERVICENOW_PASSWORD';          secretRef = 'servicenow-password' }
          @{ name = 'INTAKE_API_KEY';               secretRef = 'intake-api-key' }
          @{ name = 'AUTH_JWT_SECRET';              secretRef = 'auth-jwt-secret' }
          @{ name = 'ACS_CONNECTION_STRING';        secretRef = 'acs-connection-string' }
        )
      } )
      scale = @{ minReplicas = 1; maxReplicas = 1 }
    }
  }
}

if (-not $Send) { Show-Masked 'api' $apiBody }
else            { Send-Patch $apiN $apiBody }

# ---------------------------------------------------------------- web --------
# Mirrors the template's concat('http://', reference(api).ingress.fqdn) - must be
# read AFTER the api patch, since flipping ingress to internal changes the FQDN.
$apiFqdn = az containerapp show -n $apiN -g $rg --query "properties.configuration.ingress.fqdn" -o tsv
if ([string]::IsNullOrWhiteSpace($apiFqdn)) { throw 'could not resolve api fqdn' }

$webBody = @{
  properties = @{
    configuration = @{
      activeRevisionsMode = 'Single'
      # Deliberately no 'external' and no 'customDomains': PATCH merges nested
      # objects, so infra's custom domain + SNI binding stay untouched.
      ingress    = @{ targetPort = 8080; transport = 'auto' }
      registries = @( @{ server = $p.acrServer.value; username = $p.acrUsername.value; passwordSecretRef = 'acr-password' } )
      secrets    = @( @{ name = 'acr-password'; value = $p.acrPassword.value } )
    }
    template = @{
      containers = @( @{
        name      = $webN
        image     = $p.webImage.value
        resources = @{ cpu = 0.25; memory = '0.5Gi' }
        env       = @( @{ name = 'API_UPSTREAM'; value = "http://$apiFqdn" } )
      } )
      scale = @{ minReplicas = 1; maxReplicas = 2 }
    }
  }
}

if (-not $Send) {
  Show-Masked 'web' $webBody
  "API_UPSTREAM        : http://$apiFqdn"
  "sends external?     : $($webBody.properties.configuration.ingress.ContainsKey('external'))       # must be False"
  "sends customDomains?: $($webBody.properties.configuration.ingress.ContainsKey('customDomains')) # must be False"
  ''
  'DRY RUN - nothing sent. Re-run with -Send to deploy.'
} else {
  Send-Patch $webN $webBody
  ''
  'Deployed. Now verify - and note what Healthy does NOT prove:'
  '  az containerapp revision list -n aca-rapo-uop-api-dev -g RG-RAPO-UOP-DEV -o table'
  '  # docker-entrypoint.sh treats migrate/seed failure as NON-FATAL, so a'
  '  # Healthy revision does not mean the DB is reachable. Confirm over HTTP'
  '  # from inside the corporate network, or read container logs (needs'
  '  # Microsoft.App/managedEnvironments/read on acaen-rapo-dev).'
  ''
  '[!] IF YOU ONLY CHANGED A SECRET VALUE (no image / env change):'
  '  ACA stores secrets under `configuration`, not `template`. Changing one'
  '  therefore creates NO new revision, and the running container keeps the'
  '  OLD value - it was injected at container start. The PATCH says exit 0'
  '  and everything looks done. Force it through:'
  '    az containerapp revision restart -n aca-rapo-uop-api-dev \'
  '      -g RG-RAPO-UOP-DEV --revision <current>'
  '  Then confirm the OLD replica is gone - restart briefly runs both:'
  '    az containerapp replica list -n aca-rapo-uop-api-dev \'
  '      -g RG-RAPO-UOP-DEV --revision <current> \'
  '      --query "[].{c:properties.createdTime,r:properties.runningState}" -o table'
  '  Every Running replica must be newer than the restart. (Learned the hard'
  '  way rotating INTAKE_API_KEY on 2026-08-07.)'
}
