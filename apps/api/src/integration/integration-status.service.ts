import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly config: ConfigService,
  ) {}

  async list(): Promise<ConnectorStatus[]> {
    const [graph, servicenow, n8nOutbound] = await Promise.all([
      this.graphLastSuccess(),
      this.serviceNowLastSuccess(),
      this.n8nOutboundLastSuccess(),
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
        state: this.n8nSelected() ? 'active' : 'inactive',
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
    ];
  }

  /** n8n is the outbound provider only when explicitly selected (ADR-0008 D3). */
  n8nSelected(): boolean {
    return this.config.get<string>('REQUEST_SUBMISSION_PROVIDER') === 'n8n';
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
    if (!this.n8nSelected()) return null; // not the active path — nothing to claim
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
