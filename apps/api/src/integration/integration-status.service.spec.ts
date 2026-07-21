import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationStatusService } from './integration-status.service';

const SYNCED = new Date('2026-07-20T03:00:00.000Z');
const CAPTURED = new Date('2026-07-21T03:00:00.000Z');
const REQUESTED = new Date('2026-07-19T03:00:00.000Z');

describe('IntegrationStatusService', () => {
  let service: IntegrationStatusService;
  let prisma: {
    skuCatalog: { aggregate: jest.Mock };
    tenantSkuSnapshot: { aggregate: jest.Mock };
    request: { findFirst: jest.Mock };
  };
  let env: Record<string, string>;

  const build = (overrides: Record<string, string> = {}) => {
    env = { ...overrides };
    prisma = {
      skuCatalog: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _max: { lastSyncedAt: null } }),
      },
      tenantSkuSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { capturedAt: null } }),
      },
      request: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new IntegrationStatusService(
      prisma as unknown as PrismaService,
      { get: (k: string) => env[k] } as unknown as ConfigService,
    );
  };

  beforeEach(() => build());

  const byKey = (rows: Awaited<ReturnType<typeof service.list>>, key: string) =>
    rows.find((r) => r.key === key)!;

  /**
   * 🔴 G1 — the load-bearing test. ADR-0010 D2: the response must never carry a
   * config value, masked or otherwise. Feed the config real-looking secrets and
   * assert none of them survive serialisation.
   */
  it('never leaks a config value into the response', async () => {
    build({
      GRAPH_CLIENT_SECRET: 'SECRET-GRAPH-DO-NOT-LEAK',
      SERVICENOW_PASSWORD: 'SECRET-SNOW-DO-NOT-LEAK',
      SERVICENOW_INSTANCE_URL: 'https://acme.service-now.com',
      N8N_OUTBOUND_WEBHOOK_URL: 'https://n8n.internal/hook/abc',
      N8N_OUTBOUND_WEBHOOK_KEY: 'SECRET-N8N-DO-NOT-LEAK',
      INTAKE_API_KEY: 'SECRET-INTAKE-DO-NOT-LEAK',
      REQUEST_SUBMISSION_PROVIDER: 'n8n',
    });

    const serialised = JSON.stringify(await service.list());

    for (const value of Object.values(env)) {
      if (value === 'n8n') continue; // the selection itself is not a secret
      expect(serialised).not.toContain(value);
    }
    // Not even a fragment: a masked tail would still leak length + last chars.
    expect(serialised).not.toContain('DO-NOT-LEAK');
    expect(serialised).not.toContain('service-now.com');
  });

  it('reports all four connectors', async () => {
    const rows = await service.list();
    expect(rows.map((r) => r.key)).toEqual([
      'graph',
      'servicenow',
      'n8n-outbound',
      'n8n-inbound',
    ]);
  });

  /**
   * D3: Graph / ServiceNow / intake are getOrThrow'd in constructors, so if they
   * were unconfigured the app could not serve this request at all. `required`
   * states that fact instead of reporting a tautological "configured: true".
   */
  it('marks the fail-fast connectors required', async () => {
    const rows = await service.list();
    expect(byKey(rows, 'graph').state).toBe('required');
    expect(byKey(rows, 'servicenow').state).toBe('required');
    expect(byKey(rows, 'n8n-inbound').state).toBe('required');
  });

  it('marks n8n outbound active only when it is the selected provider', async () => {
    expect(byKey(await service.list(), 'n8n-outbound').state).toBe('inactive');

    build({ REQUEST_SUBMISSION_PROVIDER: 'n8n' });
    expect(byKey(await service.list(), 'n8n-outbound').state).toBe('active');
  });

  it('takes the more recent of the two Graph success signals', async () => {
    prisma.skuCatalog.aggregate.mockResolvedValue({
      _max: { lastSyncedAt: SYNCED },
    });
    prisma.tenantSkuSnapshot.aggregate.mockResolvedValue({
      _max: { capturedAt: CAPTURED }, // newer
    });

    expect(byKey(await service.list(), 'graph').lastSuccessAt).toEqual(
      CAPTURED,
    );
  });

  it('derives ServiceNow from the newest request carrying a sys_id', async () => {
    prisma.request.findFirst.mockResolvedValue({ createdAt: REQUESTED });

    expect(byKey(await service.list(), 'servicenow').lastSuccessAt).toEqual(
      REQUESTED,
    );
    expect(prisma.request.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serviceNowSysId: { not: null } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  // No evidence must stay "no evidence" — never "now", never a fallback.
  it('reports null rather than guessing when there is no evidence', async () => {
    const rows = await service.list();
    expect(byKey(rows, 'graph').lastSuccessAt).toBeNull();
    expect(byKey(rows, 'servicenow').lastSuccessAt).toBeNull();
  });

  it('claims no outbound success while n8n is not the selected provider', async () => {
    prisma.request.findFirst.mockResolvedValue({ createdAt: REQUESTED });

    expect(
      byKey(await service.list(), 'n8n-outbound').lastSuccessAt,
    ).toBeNull();
  });

  /**
   * Q1 (Chris, 2026-07-21) — Request.origin DEFAULTS to 'onboarding-intake', so
   * seeded rows are indistinguishable from real n8n pushes. Report the gap in
   * words rather than a plausible-looking timestamp somebody would trust to
   * decide whether the connector is dead.
   */
  it('leaves n8n inbound blank with a stated reason, never a derived guess', async () => {
    prisma.request.findFirst.mockResolvedValue({ createdAt: REQUESTED });

    const inbound = byKey(await service.list(), 'n8n-inbound');
    expect(inbound.lastSuccessAt).toBeNull();
    expect(inbound.lastSuccessNote).toMatch(/cannot be distinguished/i);
  });
});
