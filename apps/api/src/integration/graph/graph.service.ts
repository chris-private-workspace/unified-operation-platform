import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';
import { ConnectorConfigService } from '../connector-config.service';

// ── Types (importable by the catalog / reconciliation / fulfilment services) ──

/** One row of the tenant license inventory (from GET /subscribedSkus). */
export interface SubscribedSku {
  skuId: string; // GUID — the source-of-truth key (maps to SkuCatalog.skuId)
  skuPartNumber: string; // e.g. "SPE_E3", "ENTERPRISEPACK"
  prepaidEnabled: number; // prepaidUnits.enabled — total purchased seats
  consumedUnits: number; // total assigned across the whole tenant
  capabilityStatus: string; // "Enabled" | "Warning" | "Suspended" | ...
  appliesTo: string; // "User" | "Company"
}

export interface GraphUser {
  id: string;
  userPrincipalName: string;
  displayName: string | null;
  usageLocation: string | null; // REQUIRED before any license can be assigned
  accountEnabled: boolean;
}

export interface AssignLicenseOptions {
  disabledPlans?: string[]; // servicePlan GUIDs to disable within the SKU
  usageLocation?: string; // if set and the user has none, it is applied before assigning
}

@Injectable()
export class GraphService implements OnModuleInit {
  private readonly logger = new Logger(GraphService.name);
  private client!: Client; // built in onModuleInit (C2, ADR-0013)

  constructor(
    private readonly config: ConfigService,
    private readonly connectorConfig: ConnectorConfigService,
  ) {}

  /**
   * Build the Graph client at boot (C2, ADR-0013). Non-secret tenant/client id
   * come from the connector config (DB-then-env); the secret stays in env only
   * (H4). onModuleInit rather than the constructor because resolving the DB
   * values is async — a missing id still throws here, so a misconfigured
   * connector fails the boot exactly as getOrThrow did before.
   */
  async onModuleInit(): Promise<void> {
    // App-only (client credentials) auth. Application permissions required:
    //   Organization.Read.All  → /subscribedSkus
    //   Directory.Read.All     → /users lookup
    //   User.ReadWrite.All     → assignLicense + set usageLocation
    const tenantId = await this.connectorConfig.resolve(
      'graph',
      'graphTenantId',
    );
    const clientId = await this.connectorConfig.resolve(
      'graph',
      'graphClientId',
    );
    if (!tenantId || !clientId) {
      throw new Error('Graph connector is not configured (tenant/client id)');
    }
    const credential = new ClientSecretCredential(
      tenantId,
      clientId,
      this.config.getOrThrow<string>('GRAPH_CLIENT_SECRET'), // secret: env only (H4)
    );
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    this.client = Client.initWithMiddleware({ authProvider });
  }

  /**
   * Pull the tenant's license inventory.
   * prepaidEnabled = purchased, consumedUnits = assigned.
   * This is the total-level source of truth used for catalog seeding
   * (initialisation) and for drift reconciliation.
   */
  async getSubscribedSkus(): Promise<SubscribedSku[]> {
    const res = await this.client.api('/subscribedSkus').get();
    const rows = (res?.value ?? []) as any[];
    return rows.map((s) => ({
      skuId: s.skuId,
      skuPartNumber: s.skuPartNumber,
      prepaidEnabled: s.prepaidUnits?.enabled ?? 0,
      consumedUnits: s.consumedUnits ?? 0,
      capabilityStatus: s.capabilityStatus,
      appliesTo: s.appliesTo,
    }));
  }

  /**
   * Look up a user by UPN (or object id).
   * Returns null when the user does not exist yet — which doubles as the
   * Phase 1 gate "has the on-prem account synced to Azure AD?".
   */
  async findUser(userIdOrUpn: string): Promise<GraphUser | null> {
    try {
      const u = await this.client
        .api(`/users/${encodeURIComponent(userIdOrUpn)}`)
        .select([
          'id',
          'userPrincipalName',
          'displayName',
          'usageLocation',
          'accountEnabled',
        ])
        .get();
      return {
        id: u.id,
        userPrincipalName: u.userPrincipalName,
        displayName: u.displayName ?? null,
        usageLocation: u.usageLocation ?? null,
        accountEnabled: !!u.accountEnabled,
      };
    } catch (err: any) {
      if (err?.statusCode === 404) return null;
      // H4: do not log the UPN (PII); the error message is enough to triage.
      this.logger.error(`findUser failed: ${err?.message}`);
      throw err;
    }
  }

  /** usageLocation is mandatory before a license can be assigned. */
  async setUsageLocation(userId: string, usageLocation: string): Promise<void> {
    await this.client.api(`/users/${userId}`).patch({ usageLocation });
    this.logger.log(`Set usageLocation=${usageLocation} on ${userId}`);
  }

  /**
   * Assign a single SKU to a user.
   * If options.usageLocation is provided and the user currently has none,
   * it is set first (Graph rejects assignLicense without a usageLocation).
   * Note: assignment fails if there are no available seats for the SKU.
   */
  async assignLicense(
    userIdOrUpn: string,
    skuId: string,
    options: AssignLicenseOptions = {},
  ): Promise<void> {
    if (options.usageLocation) {
      const user = await this.findUser(userIdOrUpn);
      if (user && !user.usageLocation) {
        await this.setUsageLocation(user.id, options.usageLocation);
      }
    }
    await this.client
      .api(`/users/${encodeURIComponent(userIdOrUpn)}/assignLicense`)
      .post({
        addLicenses: [{ skuId, disabledPlans: options.disabledPlans ?? [] }],
        removeLicenses: [],
      });
    // H4: do not log the UPN (PII); who-got-what is tracked via RequestEvent.
    this.logger.log(`Assigned SKU ${skuId}`);
  }
}
