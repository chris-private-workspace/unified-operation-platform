import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorConfigService } from './connector-config.service';
import {
  CONNECTORS,
  type ConnectorKey,
  type ConnectorState,
} from './connectors';

/** One connector row. `lastProbe` is attached by the controller, not here. */
export interface ConnectorStatus {
  key: ConnectorKey;
  label: string;
  state: ConnectorState;
  /**
   * When this connector last demonstrably worked, derived from domain data
   * (ADR-0010 D4). null = no such evidence — never a guess, never "now".
   */
  lastSuccessAt: Date | null;
  /** Why lastSuccessAt is null when it can never be derived at all (W30 plan §8). */
  lastSuccessNote: string | null;
}

/**
 * Integration status read-model (W30 / ADR-0010 item 4). Pure query layer —
 * touches no external system and writes nothing.
 *
 * Two things this deliberately does NOT report:
 *
 *  - **"configured: true/false"**. GraphService / ServiceNowService / the intake
 *    guard all call ConfigService.getOrThrow in their CONSTRUCTORS, so a missing
 *    value stops the app from booting. If you can read this response, they are
 *    configured — the field would be a tautology (D3). Hence `state`, which
 *    describes deployment shape instead.
 *  - **Any config value**, masked or otherwise (D2). The DTO lists its fields
 *    explicitly rather than spreading, so widening the response is a decision
 *    someone has to make on purpose.
 */
@Injectable()
export class IntegrationStatusService {
  constructor(
    private readonly prisma: PrismaService,
    /**
     * BUG-005: the panel must ask the same resolver the runtime factories ask,
     * or it reports a route the platform is not taking.
     *
     * ConfigService was removed rather than kept alongside — with both injected
     * it stays one convenient line away to read env directly again, which is
     * how the two drifted apart in the first place. Nothing here can bypass the
     * resolver now.
     */
    private readonly connectorConfig: ConnectorConfigService,
  ) {}

  async list(): Promise<ConnectorStatus[]> {
    const [
      graph,
      servicenow,
      n8nOutbound,
      outboundSelected,
      licenseSelected,
      ticketSelected,
    ] = await Promise.all([
      this.graphLastSuccess(),
      this.serviceNowLastSuccess(),
      this.n8nOutboundLastSuccess(),
      this.n8nSelected(),
      this.n8nLicenseSelected(),
      this.n8nTicketSelected(),
    ]);

    return [
      {
        ...CONNECTORS.graph,
        state: 'required',
        lastSuccessAt: graph,
        lastSuccessNote: null,
      },
      {
        ...CONNECTORS.servicenow,
        state: 'required',
        lastSuccessAt: servicenow,
        lastSuccessNote: null,
      },
      {
        ...CONNECTORS['n8n-outbound'],
        // Only constructed when selected (fulfilment.module factory), so this is
        // the one connector where "not set up" is a real, reportable state.
        state: outboundSelected ? 'active' : 'inactive',
        lastSuccessAt: n8nOutbound,
        lastSuccessNote: null,
      },
      {
        ...CONNECTORS['n8n-inbound'],
        state: 'required', // INTAKE_API_KEY is getOrThrow'd by IntakeKeyGuard at boot
        lastSuccessAt: null,
        /**
         * W30 plan §8 / Q1 (Chris, 2026-07-21): this one cannot be derived at
         * all. Request.origin DEFAULTS to 'onboarding-intake', so seeded and
         * W03-created requests are indistinguishable from real n8n pushes.
         * We report the gap rather than pick a plausible-looking timestamp —
         * a wrong "last seen" is worse than none, because someone will use it
         * to decide whether the connector is dead.
         */
        lastSuccessNote:
          'Cannot be distinguished from other requests in existing data',
      },
      {
        ...CONNECTORS['n8n-license'],
        // W39 / OQ-4: unconfigured reports `inactive`, not `error`. `state`
        // describes deployment shape, never health (ADR-0010 D3) — and during
        // rollout "nobody selected this yet" must not look like "it is broken".
        state: licenseSelected ? 'active' : 'inactive',
        lastSuccessAt: null,
        /**
         * Deliberately blank rather than derived. Nothing the platform stores
         * records WHICH provider performed an assignment, so any timestamp here
         * would really mean "an assign succeeded", not "n8n worked" — and the
         * default provider is Graph. Same reasoning as n8n-inbound above: a
         * wrong "last seen" is worse than none, because someone will use it to
         * decide whether the connector is dead.
         */
        lastSuccessNote:
          'Not recorded — assignments do not store which provider performed them',
      },
      {
        ...CONNECTORS['n8n-ticket'],
        // W40 seam ④. Same rule as the license row: unconfigured is `inactive`,
        // never `error` — during rollout "nobody selected this yet" must not
        // read as "it is broken" (ADR-0010 D3).
        state: ticketSelected ? 'active' : 'inactive',
        lastSuccessAt: null,
        /**
         * Blank for the same reason as the license row, and one more: nothing
         * the platform stores records that a RITM state change went through
         * n8n rather than the Table API. A timestamp here would mean "some
         * ticket moved", which is true on both paths and therefore says
         * nothing about this connector.
         */
        lastSuccessNote:
          'Not recorded — ticket updates do not store which provider performed them',
      },
    ];
  }

  /**
   * BUG-005 — both selection reads go through the SAME resolver the runtime
   * factories use (DB-then-env, ADR-0013 D3).
   *
   * They used to read env directly. The runtime has resolved DB-then-env since
   * W34, so an admin who flipped a provider through the UI — the entire point
   * of ADR-0013 Model C, and the only practical route in UAT where changing env
   * means going through Azure — saw this panel keep reporting `inactive` while
   * the platform was in fact routing through n8n. A monitoring surface that
   * contradicts the runtime is worse than no surface: nobody goes looking at
   * n8n for a fault when the panel says n8n is not in the path.
   *
   * The rule this encodes: whatever decides the route at runtime is what this
   * panel must ask. Not a copy of the same logic — the same call.
   */
  async n8nSelected(): Promise<boolean> {
    const provider = await this.connectorConfig.resolve(
      'n8n-outbound',
      'requestSubmissionProvider',
    );
    return provider === 'n8n';
  }

  /** W39 seam ②. Same resolver, same reason as above (BUG-005). */
  async n8nLicenseSelected(): Promise<boolean> {
    const provider = await this.connectorConfig.resolve(
      'n8n-license',
      'licenseOpsProvider',
    );
    return provider === 'n8n';
  }

  /** W40 seam ④. Same resolver, same reason as above (BUG-005). */
  async n8nTicketSelected(): Promise<boolean> {
    const provider = await this.connectorConfig.resolve(
      'n8n-ticket',
      'ticketUpdateProvider',
    );
    return provider === 'n8n';
  }

  /** Graph: the catalog sync and the tenant snapshot sweep both prove it worked. */
  private async graphLastSuccess(): Promise<Date | null> {
    const [sku, snapshot] = await Promise.all([
      this.prisma.skuCatalog.aggregate({ _max: { lastSyncedAt: true } }),
      this.prisma.tenantSkuSnapshot.aggregate({ _max: { capturedAt: true } }),
    ]);
    return latest(sku._max.lastSyncedAt, snapshot._max.capturedAt);
  }

  /** ServiceNow: a request carrying a sys_id means a ticket round-trip succeeded. */
  private async serviceNowLastSuccess(): Promise<Date | null> {
    const row = await this.prisma.request.findFirst({
      where: { serviceNowSysId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  /**
   * n8n outbound: platform-created requests only go out through the selected
   * provider, so one with a sys_id proves the outbound path completed. This is
   * still a proxy — it does not distinguish which provider was selected at the
   * time — but unlike the inbound case the origin value is unambiguous.
   */
  private async n8nOutboundLastSuccess(): Promise<Date | null> {
    if (!(await this.n8nSelected())) return null; // not the active path — nothing to claim
    const row = await this.prisma.request.findFirst({
      where: { origin: 'platform-created', serviceNowSysId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
