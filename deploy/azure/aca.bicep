// Azure Container Apps — uop-api (internal) + uop-web (external, single origin).
// Deployed via `az deployment group create` (core CLI) because the `containerapp`
// az extension can't install behind the corporate proxy (aka.ms SSL MITM) — see
// docs/01-planning/W33-deploy-exec/progress.md. Topology = ADR-0012.
//
// First bring-up = break-glass local admin + placeholder Graph/ServiceNow (owner
// decisions 2026-07-22). Secrets are passed as ACA native secrets (securestring,
// encrypted at rest, never in git); moving to Key Vault references is a hardening
// follow-up (docs/13-deployment/06-prod-hardening-checklist.md).

@description('Location, e.g. eastasia')
param location string = resourceGroup().location

@description('Log Analytics workspace customerId (GUID) for the ACA environment')
param lawCustomerId string
@secure()
@description('Log Analytics workspace shared key')
param lawSharedKey string

@description('ACR login server, e.g. acruopuat.azurecr.io')
param acrServer string
@description('ACR admin username')
param acrUsername string
@secure()
@description('ACR admin password')
param acrPassword string

param apiImage string   // e.g. acruopuat.azurecr.io/uop-api:uat-b1b737f
param webImage string   // e.g. acruopuat.azurecr.io/uop-web:uat-b1b737f

// --- api non-secret env (placeholders acceptable for first boot) ---
param graphTenantId string
param graphClientId string
param servicenowInstanceUrl string
param servicenowUser string
param servicenowDefaultTable string = 'sc_req_item'

// --- api secrets (break-glass + integrations; placeholders ok to boot) ---
@secure()
param databaseUrl string
@secure()
param graphClientSecret string
@secure()
param servicenowPassword string
@secure()
param intakeApiKey string
@secure()
param authJwtSecret string
@secure()
@description('break-glass local admin initial password (seed sets it; force-change on first login)')
param localAdminInitialPassword string

var envName = 'cae-uop-uat'
var apiName = 'ca-uop-api'
var webName = 'ca-uop-web'

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: lawCustomerId
        sharedKey: lawSharedKey
      }
    }
  }
}

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      // internal ingress: reachable only inside the ACA environment (by uop-web).
      ingress: {
        external: false
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: acrServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acrPassword }
        { name: 'database-url', value: databaseUrl }
        { name: 'graph-client-secret', value: graphClientSecret }
        { name: 'servicenow-password', value: servicenowPassword }
        { name: 'intake-api-key', value: intakeApiKey }
        { name: 'auth-jwt-secret', value: authJwtSecret }
        { name: 'local-admin-initial-password', value: localAdminInitialPassword }
      ]
    }
    template: {
      containers: [
        {
          name: apiName
          image: apiImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'REQUEST_SUBMISSION_PROVIDER', value: 'direct' }
            { name: 'GRAPH_TENANT_ID', value: graphTenantId }
            { name: 'GRAPH_CLIENT_ID', value: graphClientId }
            { name: 'SERVICENOW_INSTANCE_URL', value: servicenowInstanceUrl }
            { name: 'SERVICENOW_USER', value: servicenowUser }
            { name: 'SERVICENOW_DEFAULT_TABLE', value: servicenowDefaultTable }
            // break-glass local admin (no ENTRA_* → SSO off until IT app reg)
            // Self-migrate + seed on start (operator can't reach the DB from the
            // corporate network — W33). Both are idempotent; api is single-replica.
            { name: 'RUN_MIGRATIONS_ON_START', value: 'true' }
            { name: 'RUN_SEED_ON_START', value: 'true' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'LOCAL_ADMIN_INITIAL_PASSWORD', secretRef: 'local-admin-initial-password' }
            { name: 'GRAPH_CLIENT_SECRET', secretRef: 'graph-client-secret' }
            { name: 'SERVICENOW_PASSWORD', secretRef: 'servicenow-password' }
            { name: 'INTAKE_API_KEY', secretRef: 'intake-api-key' }
            { name: 'AUTH_JWT_SECRET', secretRef: 'auth-jwt-secret' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: webName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      // external ingress: the single public hostname; nginx proxies /api to the
      // api app's internal FQDN.
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: [
        {
          server: acrServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acrPassword }
      ]
    }
    template: {
      containers: [
        {
          name: webName
          image: webImage
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            // internal FQDN of the api app (single ACA env → reachable by name).
            { name: 'API_UPSTREAM', value: 'http://${api.name}' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

output webFqdn string = web.properties.configuration.ingress.fqdn
output apiInternalFqdn string = api.properties.configuration.ingress.fqdn
