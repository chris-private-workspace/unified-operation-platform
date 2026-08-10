import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorConfigService } from './connector-config.service';
import {
  CONNECTOR_CONFIG,
  CONNECTOR_KEYS,
  type ConnectorKey,
} from './connectors';
import { IntegrationStatusService } from './integration-status.service';
import { SeamRuntimeRegistry } from './seam-runtime.registry';

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

  /**
   * BUG-005: the service now reads selection through ConnectorConfigService, so
   * the double is a real DB-then-env resolver rather than an env bag — column
   * override wins, otherwise fall back to that field's env key, using the SAME
   * CONNECTOR_CONFIG mapping production uses. A hand-written mapping here would
   * be one more copy that can drift, which is the defect this bug is about.
   *
   * @param overrides env values, keyed by env var (existing tests unchanged)
   * @param db        DB overrides, keyed by ConnectorConfig column
   */
  const build = (
    overrides: Record<string, string> = {},
    db: Record<string, string> = {},
    /**
     * BUG-011 — what each seam's factory resolved AT BOOT, keyed by connector.
     * Defaults to empty = "no factory has run in this process", which is what
     * every pre-existing test below assumes and why none of them change.
     */
    boot: Partial<Record<ConnectorKey, boolean>> = {},
  ) => {
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
    const connectorConfig = {
      resolve: jest.fn(async (connector: ConnectorKey, column: string) => {
        if (column in db) return db[column];
        const field = CONNECTOR_CONFIG[connector].editable.find(
          (f) => f.column === column,
        );
        return field ? env[field.envKey] : undefined;
      }),
    };
    const seamRuntime = new SeamRuntimeRegistry();
    for (const [seam, isN8n] of Object.entries(boot)) {
      seamRuntime.record(seam as ConnectorKey, isN8n);
    }
    service = new IntegrationStatusService(
      prisma as unknown as PrismaService,
      connectorConfig as unknown as ConnectorConfigService,
      seamRuntime,
    );
  };

  beforeEach(() => build());

  const byKey = (rows: Awaited<ReturnType<typeof service.list>>, key: string) =>
    rows.find((r) => r.key === key)!;

  /**
   * Every non-secret and secret env key of every registered connector, with a
   * value shaped like the real thing. Coverage is asserted against the
   * inventory further down, so this cannot fall behind a new connector.
   */
  const LEAK_ENV: Record<string, string> = {
    GRAPH_TENANT_ID: '11111111-2222-3333-4444-555555555555',
    GRAPH_CLIENT_ID: '66666666-7777-8888-9999-aaaaaaaaaaaa',
    GRAPH_CLIENT_SECRET: 'SECRET-GRAPH-DO-NOT-LEAK',
    SERVICENOW_INSTANCE_URL: 'https://acme.service-now.com',
    SERVICENOW_DEFAULT_TABLE: 'sc_req_item_fixture',
    SERVICENOW_USER: 'SECRET-SNOW-USER-DO-NOT-LEAK',
    SERVICENOW_PASSWORD: 'SECRET-SNOW-DO-NOT-LEAK',
    REQUEST_SUBMISSION_PROVIDER: 'n8n',
    N8N_OUTBOUND_WEBHOOK_URL: 'https://n8n.internal/hook/abc',
    N8N_OUTBOUND_WEBHOOK_KEY: 'SECRET-N8N-DO-NOT-LEAK',
    INTAKE_API_KEY: 'SECRET-INTAKE-DO-NOT-LEAK',
    // W39 — the credential that lets a caller assign licences through n8n.
    LICENSE_OPS_PROVIDER: 'n8n',
    N8N_LICENSE_BASE_URL: 'https://n8n.internal/webhook',
    N8N_LICENSE_WEBHOOK_KEY: 'SECRET-N8N-LICENSE-DO-NOT-LEAK',
    // W40 — the credential that lets a caller close a customer's ticket.
    TICKET_UPDATE_PROVIDER: 'n8n',
    N8N_TICKET_WEBHOOK_URL: 'https://n8n.internal/webhook-ticket',
    N8N_TICKET_WEBHOOK_KEY: 'SECRET-N8N-TICKET-DO-NOT-LEAK',
    // CH-011 — the ACS connection string embeds the access key, so it is the
    // one value here whose leak would hand somebody the ability to send mail
    // as this organisation. Shaped like the real thing so a partial echo would
    // still be caught.
    ACS_SENDER_ADDRESS: 'no-reply@fixture.example.com',
    ACS_CONNECTION_STRING:
      'endpoint=https://fixture.communication.azure.com/;accesskey=SECRET-ACS-DO-NOT-LEAK',
    // W42 — a skuId GUID. Not a secret, but it is a configured value, and D2
    // says the status response carries no config value at all, secret or not.
    DEFAULT_ONBOARDING_SKU_ID: '06ebc4ee-1bb5-47dd-8120-11324bc54e06',
  };

  /**
   * 🔴 G1 — the load-bearing test. ADR-0010 D2: the response must never carry a
   * config value, masked or otherwise.
   *
   * ⚠️ BUG-005 changed what this proves. The service no longer takes
   * ConfigService at all, so it cannot read a secret even if someone asked it
   * to — the guarantee moved from "we checked the output" to "there is no wire
   * to the secrets". The test is kept because the non-secret values it now
   * feeds (webhook URLs, instance URLs) DO reach the service through the
   * resolver and still must not be echoed. The structural half is pinned
   * separately below.
   */
  it('never leaks a config value into the response', async () => {
    build(LEAK_ENV);

    const serialised = JSON.stringify(await service.list());

    for (const value of Object.values(env)) {
      if (value === 'n8n') continue; // the selection itself is not a secret
      expect(serialised).not.toContain(value);
    }
    // Not even a fragment: a masked tail would still leak length + last chars.
    expect(serialised).not.toContain('DO-NOT-LEAK');
    expect(serialised).not.toContain('service-now.com');
  });

  /**
   * W40 — the fixture above is hand-maintained, and a hand-maintained fixture
   * is a list that goes stale. Registering a connector and forgetting to feed
   * its keys in here would leave the leak test passing while saying nothing
   * about the new connector's secret.
   *
   * That is not hypothetical: writing this check found FOUR keys that had never
   * been covered — GRAPH_TENANT_ID, GRAPH_CLIENT_ID, SERVICENOW_DEFAULT_TABLE
   * and SERVICENOW_USER — alongside the three W40 added. So the fixture is
   * still written by hand (the concrete shapes matter: a real instance URL is
   * what makes `not.toContain('service-now.com')` mean anything), but its
   * COVERAGE is derived from the inventory and can no longer drift.
   */
  it('feeds every registered connector key into the leak test', () => {
    const declared = CONNECTOR_KEYS.flatMap((k) => [
      ...CONNECTOR_CONFIG[k].editable.map((f) => f.envKey),
      ...CONNECTOR_CONFIG[k].secrets.map((s) => s.envKey),
    ]);
    expect(Object.keys(LEAK_ENV).sort()).toEqual([...new Set(declared)].sort());
  });

  /**
   * W39: was a hand-written list of four. `list()` builds its rows by hand, so
   * registering a fifth connector in CONNECTORS did NOT make it appear here —
   * and a test that hard-codes the same four stayed green while the new
   * connector was invisible in the admin panel. Derived from the inventory now,
   * so the next connector cannot be registered and then quietly go unreported.
   */
  /**
   * CH-011 A3 — email is OPTIONAL (ADR-0019 D4). `required` would mean the app
   * cannot boot without it, which is exactly what D4 refused: a convenience
   * feature must not be able to take the platform down by being misconfigured.
   */
  describe('email connector (CH-011)', () => {
    it('is inactive when no sender address is configured anywhere', async () => {
      build();
      expect(byKey(await service.list(), 'email').state).toBe('inactive');
    });

    it('is active once env supplies a sender', async () => {
      build({ ACS_SENDER_ADDRESS: 'no-reply@fixture.example.com' });
      expect(byKey(await service.list(), 'email').state).toBe('active');
    });

    it('honours a DB override, like every other connector (BUG-005)', async () => {
      build({}, { acsSenderAddress: 'override@fixture.example.com' });
      expect(byKey(await service.list(), 'email').state).toBe('active');
    });

    it('🔴 is never reported as required, whatever the config', async () => {
      for (const setup of [
        () => build(),
        () => build({ ACS_SENDER_ADDRESS: 'no-reply@fixture.example.com' }),
        () => build({}, { acsSenderAddress: 'override@fixture.example.com' }),
      ]) {
        setup();
        expect(byKey(await service.list(), 'email').state).not.toBe('required');
      }
    });

    /**
     * Not derivable: nothing in the schema records a sent message, and this
     * connector has no probe either (D5). Reporting the gap beats reusing
     * "somebody configured it" as if it were evidence of working.
     */
    it('never guesses a last-success time, and says why', async () => {
      build({ ACS_SENDER_ADDRESS: 'no-reply@fixture.example.com' });
      const row = byKey(await service.list(), 'email');
      expect(row.lastSuccessAt).toBeNull();
      expect(row.lastSuccessNote).toMatch(/does not store sent messages/);
    });
  });

  it('reports every connector in the inventory — not a hand-written list', async () => {
    const rows = await service.list();
    expect(rows.map((r) => r.key).sort()).toEqual([...CONNECTOR_KEYS].sort());
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

  /**
   * 🔴 BUG-005 regression — the whole point of the bug.
   *
   * An admin flips the provider through the UI (ADR-0013 Model C), which writes
   * the ConnectorConfig column and leaves env alone. That is the normal route
   * in UAT, where changing env means going through Azure. The runtime has
   * honoured DB-then-env since W34; this panel did not, so it kept reporting
   * `inactive` for a path the platform was actually taking.
   */
  describe('reflects a DB override, not just env (BUG-005)', () => {
    it('reports n8n-outbound active when only the DB says so', async () => {
      build(
        { REQUEST_SUBMISSION_PROVIDER: 'direct' },
        {
          requestSubmissionProvider: 'n8n',
        },
      );

      expect(byKey(await service.list(), 'n8n-outbound').state).toBe('active');
    });

    it('reports n8n-license active when only the DB says so', async () => {
      build({ LICENSE_OPS_PROVIDER: 'graph' }, { licenseOpsProvider: 'n8n' });

      expect(byKey(await service.list(), 'n8n-license').state).toBe('active');
    });

    it('reports n8n-ticket active when only the DB says so', async () => {
      build(
        { TICKET_UPDATE_PROVIDER: 'direct' },
        { ticketUpdateProvider: 'n8n' },
      );

      expect(byKey(await service.list(), 'n8n-ticket').state).toBe('active');
    });

    it('a DB override back to the default also wins over env', async () => {
      // The override has to work in both directions, or "switch it back" would
      // silently do nothing.
      build(
        { REQUEST_SUBMISSION_PROVIDER: 'n8n' },
        {
          requestSubmissionProvider: 'direct',
        },
      );

      expect(byKey(await service.list(), 'n8n-outbound').state).toBe(
        'inactive',
      );
    });

    it('still falls back to env when the DB has no override', async () => {
      build({ REQUEST_SUBMISSION_PROVIDER: 'n8n' });

      expect(byKey(await service.list(), 'n8n-outbound').state).toBe('active');
    });
  });

  /**
   * BUG-011 — `state` says what is CONFIGURED; `pendingRestart` says whether the
   * running process has it yet.
   *
   * They have to be separate because ADR-0013 C2 has the factories read their
   * switch once, at boot. Between Save and restart the two disagree, and this
   * panel used to show only the first — so it announced a provider switch that
   * had not happened. BUG-005 fixed the mirror image of this and left the rule
   * "ask the same call the runtime asks"; the rule was followed, but it never
   * said WHEN, and the same call answers differently at boot and at now.
   */
  describe('pendingRestart — configured vs running (BUG-011)', () => {
    it('is false when the running provider is the configured one', async () => {
      build({}, { licenseOpsProvider: 'n8n' }, { 'n8n-license': true });

      const row = byKey(await service.list(), 'n8n-license');
      expect(row.state).toBe('active');
      expect(row.pendingRestart).toBe(false);
    });

    it('flags a switch as saved-but-not-live until the API restarts', async () => {
      // The exact DEV situation: an admin flipped it to n8n, while the factory
      // in this process resolved Graph at boot.
      build({}, { licenseOpsProvider: 'n8n' }, { 'n8n-license': false });

      const row = byKey(await service.list(), 'n8n-license');
      // Still `active`: that IS what is configured, and ADR-0010 D3 keeps
      // `state` describing deployment shape rather than what is loaded.
      expect(row.state).toBe('active');
      // …and the row now says outright that the process has not picked it up.
      expect(row.pendingRestart).toBe(true);
    });

    it('flags switching BACK too — the direction that was reported', async () => {
      build({}, { licenseOpsProvider: 'graph' }, { 'n8n-license': true });

      const row = byKey(await service.list(), 'n8n-license');
      expect(row.state).toBe('inactive');
      expect(row.pendingRestart).toBe(true);
    });

    it('covers all three seams, not only the one this was reported against', async () => {
      build(
        {},
        {
          requestSubmissionProvider: 'n8n',
          licenseOpsProvider: 'n8n',
          ticketUpdateProvider: 'n8n',
        },
        { 'n8n-outbound': false, 'n8n-license': false, 'n8n-ticket': false },
      );

      const rows = await service.list();
      expect(byKey(rows, 'n8n-outbound').pendingRestart).toBe(true);
      expect(byKey(rows, 'n8n-license').pendingRestart).toBe(true);
      expect(byKey(rows, 'n8n-ticket').pendingRestart).toBe(true);
    });

    it('claims nothing when no factory has run in this process', async () => {
      // Reporting "pending" here would be a guess — there is no boot answer for
      // the configured value to disagree with.
      build({}, { licenseOpsProvider: 'n8n' });

      const row = byKey(await service.list(), 'n8n-license');
      expect(row.pendingRestart).toBe(false);
    });

    it('never flags a connector that has no switchable seam', async () => {
      build();

      const rows = await service.list();
      const seamless = ['graph', 'servicenow', 'n8n-inbound', 'email'] as const;
      for (const key of seamless) {
        expect(byKey(rows, key).pendingRestart).toBe(false);
      }
    });
  });

  /**
   * The structural half of G1, and of BUG-005: this service has no route to env
   * at all. Kept as a source check because a future edit would re-introduce the
   * drift by simply injecting ConfigService again "just for one value" — which
   * is exactly how the panel and the runtime came apart.
   */
  it('has no ConfigService wire — every setting comes through the resolver', () => {
    const src = readFileSync(
      join(__dirname, 'integration-status.service.ts'),
      'utf8',
    );
    expect(src).not.toContain('@nestjs/config');
    expect(src).toContain('ConnectorConfigService');
  });

  /**
   * W39 / OQ-4. During rollout the n8n side is not reachable at all, so the
   * common case is "nobody selected this yet". That must read `inactive`
   * (deployment shape) and never `error` (health) — otherwise the panel shows
   * red for a connector that was simply never switched on, and the first real
   * failure has nothing left to distinguish itself with.
   */
  it('marks n8n license inactive until it is the selected provider', async () => {
    expect(byKey(await service.list(), 'n8n-license').state).toBe('inactive');

    build({ LICENSE_OPS_PROVIDER: 'n8n' });
    expect(byKey(await service.list(), 'n8n-license').state).toBe('active');
  });

  /** W40 seam ④ — same rule as the license row above. */
  it('marks n8n ticket inactive until it is the selected provider', async () => {
    expect(byKey(await service.list(), 'n8n-ticket').state).toBe('inactive');

    build({ TICKET_UPDATE_PROVIDER: 'n8n' });
    expect(byKey(await service.list(), 'n8n-ticket').state).toBe('active');
  });

  it('never guesses a last-success time for n8n ticket', async () => {
    const row = byKey(await service.list(), 'n8n-ticket');
    // Nothing records that a RITM state change went through n8n rather than the
    // Table API, so a timestamp would mean "some ticket moved" — true on both
    // paths, and therefore silent about this connector.
    expect(row.lastSuccessAt).toBeNull();
    expect(row.lastSuccessNote).toMatch(/do not store which provider/i);
  });

  it('never guesses a last-success time for n8n license', async () => {
    const row = byKey(await service.list(), 'n8n-license');
    // Nothing stored records WHICH provider performed an assignment, and the
    // default is Graph — so any timestamp here would be about assignments, not
    // about n8n. Same rule as n8n-inbound: state the gap, never a plausible
    // number someone would use to decide the connector is dead.
    expect(row.lastSuccessAt).toBeNull();
    expect(row.lastSuccessNote).toMatch(/do not store which provider/i);
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
