import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectorConfigService } from '../connector-config.service';
import { N8N_LICENSE_PATHS } from '../connectors';
import { scrubPii } from '../scrub-pii';
import {
  AssignOptions,
  AssignOutcome,
  DirectoryUser,
  LicenseOperationsProvider,
  TenantSkuSeats,
} from './license-ops.provider';

/**
 * The n8n implementation of seam ② (ADR-0017 D2, 庚 / W39).
 *
 * Talks to three workflows the n8n side already ships:
 *   2002 mode 1  wf2-license-check  tenant SKU seats
 *   2003         wf3-assign-license assign one licence
 *   2005         wf5-sync-check     does this user exist in Entra yet
 *
 * Every shape below was read out of the workflow JSON, NOT out of the ADR
 * prose — the two disagreed in four places (W39 plan §2). Where they differ,
 * the workflow wins, because that is what will actually answer at runtime.
 *
 * D0 still holds: this class executes, it never decides. The seat check, the
 * OpCo budget gate, the stage machine and the ledger all stay in the platform,
 * and 2003 helpfully does not check seats either.
 */
@Injectable()
export class N8nLicenseProvider extends LicenseOperationsProvider {
  private readonly logger = new Logger(N8nLicenseProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connectorConfig: ConnectorConfigService,
  ) {
    super();
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  /**
   * Resolved per call rather than cached at boot. An assign is not a hot path,
   * a lookup by unique key is cheap, and caching would add a staleness question
   * nobody has asked for (§1.2). If this ever shows up in a profile, cache it
   * then — with the ADR-0013 C2 restart semantics written down.
   */
  private async baseUrl(): Promise<string> {
    const url = await this.connectorConfig.resolve(
      'n8n-license',
      'n8nLicenseBaseUrl',
    );
    if (!url) {
      // Not a vendor outage — the operator selected the n8n provider without
      // finishing its configuration. Say so plainly instead of letting an
      // undefined URL turn into a confusing fetch error.
      throw new ServiceUnavailableException(
        'The n8n license provider is selected but its webhook base URL is not configured.',
      );
    }
    return url.replace(/\/+$/, '');
  }

  private secret(): string {
    const key = this.config.get<string>('N8N_LICENSE_WEBHOOK_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        'The n8n license provider is selected but N8N_LICENSE_WEBHOOK_KEY is not set.',
      );
    }
    return key;
  }

  /**
   * One POST to a workflow. A transport failure THROWS a 503 — same error
   * contract as GraphLicenseProvider (W38 plan §7 D1): "the vendor is down" is
   * the absence of an outcome, not one of its values.
   *
   * H4: the shared key goes in a header and is never logged; `action` is a
   * fixed string, never interpolated with a UPN.
   */
  private async call(
    path: string,
    body: Record<string, unknown>,
    action: string,
  ): Promise<Record<string, any>> {
    const url = `${await this.baseUrl()}/${path}`;
    // Resolved BEFORE the try, deliberately. Inline in the fetch() arguments it
    // would be evaluated inside the try, so "you never set the key" would come
    // back as "n8n is unavailable" — sending whoever is on call to check a
    // third party for a mistake that is entirely ours.
    const secret = this.secret();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-uop-secret': secret,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // BUG-004: n8n relays Graph's text, so the same UPN can arrive this way.
      this.logger.error(
        `n8n unreachable while trying to ${action}: ${scrubPii(
          (err as Error)?.message,
        )}`,
      );
      throw new ServiceUnavailableException(
        `n8n is unavailable — could not ${action}. Please retry.`,
      );
    }
    // 400 from these workflows means "bad secret / bad input" — a wiring
    // mistake on our side, not a per-request outcome, so it fails the same way
    // an outage does rather than masquerading as a business answer.
    if (!res.ok) {
      this.logger.error(
        `n8n returned HTTP ${res.status} while trying to ${action}`,
      );
      throw new ServiceUnavailableException(
        `n8n rejected the request — could not ${action}. Please retry.`,
      );
    }
    try {
      return (await res.json()) as Record<string, any>;
    } catch {
      throw new ServiceUnavailableException(
        `n8n returned a malformed response — could not ${action}. Please retry.`,
      );
    }
  }

  // ── seam methods ──────────────────────────────────────────────────────────

  /** 2002 mode 1. Mode 2 (users by SKU) is deliberately unused — W38 OQ-3. */
  async listTenantSkus(): Promise<TenantSkuSeats[]> {
    const body = await this.call(
      N8N_LICENSE_PATHS.licenseCheck,
      { mode: 1 },
      'read the tenant license inventory',
    );
    const skus = Array.isArray(body.skus) ? body.skus : [];
    return skus.map((s: Record<string, any>) => ({
      skuId: String(s.skuId),
      prepaidEnabled: Number(s.prepaidEnabled ?? 0),
      consumedUnits: Number(s.consumedUnits ?? 0),
    }));
  }

  /**
   * 2005, single-UPN form. `not_synced` becomes null — the same shape Graph's
   * 404 produces — so the caller's "user is not in the directory yet" branch
   * does not have to know which provider answered.
   */
  async findUser(upn: string): Promise<DirectoryUser | null> {
    const body = await this.call(
      N8N_LICENSE_PATHS.syncCheck,
      { upn },
      'look up the target user',
    );
    const result = Array.isArray(body.results) ? body.results[0] : undefined;
    if (!result || result.status === 'not_synced') return null;
    if (result.status === 'error') {
      // The workflow reached Graph and Graph refused. That is the same class of
      // failure as an outage from the caller's point of view.
      throw new ServiceUnavailableException(
        'n8n could not look up the target user. Please retry.',
      );
    }
    return {
      userPrincipalName: String(result.upn ?? upn),
      usageLocation: result.usageLocation ?? null,
    };
  }

  /**
   * 2003. Two response shapes, not one:
   *   - `already_assigned` / `not_synced` are answered straight from the
   *     `Route Status` switch, carrying the `Evaluate User` shape.
   *   - a real assignment falls through to `Build Response`, whose status is
   *     `success` (NOT `assigned` — ADR-0017 D2 paraphrased this wrong).
   *
   * 🔴 `details` is deliberately dropped (W39 OQ-2, Chris 2026-07-28). Both
   * workflow nodes fill it with `JSON.stringify(graphErrorBody).slice(0,500)`,
   * and a Graph 404/400 body routinely carries the UPN — the exact leak shape
   * as BUG-004. The vendor detail stays in n8n's own execution log, which is
   * where its owner looks anyway.
   */
  async assignLicense(
    upn: string,
    skuId: string,
    options: AssignOptions,
  ): Promise<AssignOutcome> {
    const body = await this.call(
      N8N_LICENSE_PATHS.assign,
      {
        upn,
        skuId,
        ...(options.usageLocation
          ? { targetUsageLocation: options.usageLocation }
          : {}),
      },
      'assign the license via n8n',
    );

    switch (body.status) {
      case 'success':
        return { status: 'assigned' };
      case 'already_assigned':
        // W39 OQ-1 = A: the caller treats this exactly like 'assigned', ledger
        // increment included. n8n knows more than Graph here (Graph's POST is
        // idempotent and silent), and we deliberately do NOT act on the extra
        // knowledge: doing so would make switching provider also change ledger
        // semantics. The double-count risk is pre-existing on the Graph path;
        // fixing it is a separate change that must fix BOTH paths at once.
        return { status: 'already_assigned' };
      case 'not_synced':
        return { status: 'not_synced' };
      default:
        return {
          status: 'error',
          details:
            'The n8n license workflow reported a failure. See the n8n execution log for details.',
        };
    }
  }
}
