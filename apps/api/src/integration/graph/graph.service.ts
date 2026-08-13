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
  // ── prepaidUnits, all four of them (ADR-0033) ──
  // Reading only `enabled` was the original defect: on the live tenant it made
  // 27 SKUs look seatless while the tenant still had seats, `SPE_E3` among them
  // (enabled 21, warning 4477). The other three are not new data — Graph has
  // been sending them since day one.
  prepaidEnabled: number; // .enabled   — assignable now
  suspendedUnits: number; // .suspended — subscription cancelled, in retention
  warningUnits: number; // .warning   — expired but inside the grace period
  lockedOutUnits: number; // .lockedOut — locked, no longer usable
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
   * consumedUnits = assigned; the four prepaidUnits buckets say what the tenant
   * is entitled to and in what state (ADR-0033). This is the total-level source
   * of truth used for catalog seeding (initialisation) and for drift
   * reconciliation.
   *
   * 🔴 All four buckets are carried, but this method does NOT combine them —
   * "which of these count as assignable" is a decision (ADR-0033 D4), and it
   * belongs to the seam implementation and the read-model, not to the vendor
   * client.
   */
  async getSubscribedSkus(): Promise<SubscribedSku[]> {
    const res = await this.client.api('/subscribedSkus').get();
    const rows = (res?.value ?? []) as any[];
    return rows.map((s) => ({
      skuId: s.skuId,
      skuPartNumber: s.skuPartNumber,
      prepaidEnabled: s.prepaidUnits?.enabled ?? 0,
      suspendedUnits: s.prepaidUnits?.suspended ?? 0,
      warningUnits: s.prepaidUnits?.warning ?? 0,
      lockedOutUnits: s.prepaidUnits?.lockedOut ?? 0,
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

  /**
   * Which SKUs this user currently holds, as GUIDs.
   *
   * CH-029 / ADR-0034 D1 — read-only, and deliberately its own call rather than
   * an extra `$select` on `findUser`: on the assign path `findUser` runs through
   * the LicenseOperationsProvider seam, and D1 is explicit that this fact must
   * NOT come from a switchable provider. Riding along on the seam's lookup would
   * make the answer depend on which provider is configured, which is the exact
   * thing ADR-0017 D0 keeps on the platform.
   *
   * Throws on a missing user rather than returning [] — "has no licences" and
   * "does not exist" are different facts, and the caller (holding-check) treats
   * an unanswerable read as unknown, not as a clean no.
   */
  async getUserAssignedSkuIds(userIdOrUpn: string): Promise<string[]> {
    const u = await this.client
      .api(`/users/${encodeURIComponent(userIdOrUpn)}`)
      .select(['assignedLicenses'])
      .get();
    const rows = (u?.assignedLicenses ?? []) as { skuId?: string }[];
    return rows.map((r) => r.skuId).filter((id): id is string => !!id);
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
