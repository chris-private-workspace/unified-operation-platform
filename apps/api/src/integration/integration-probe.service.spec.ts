import { GraphService } from './graph/graph.service';
import { ServiceNowService } from './servicenow/servicenow.service';
import { N8nLicenseProvider } from './license-ops/n8n-license.provider';
import { CONNECTOR_KEYS } from './connectors';
import {
  IntegrationProbeService,
  PROBE_THROTTLE_MS,
} from './integration-probe.service';

describe('IntegrationProbeService', () => {
  let service: IntegrationProbeService;
  let graph: { getSubscribedSkus: jest.Mock };
  let snow: {
    query: jest.Mock;
    createRecord: jest.Mock;
    updateRecord: jest.Mock;
    addWorkNote: jest.Mock;
  };
  let n8nLicense: {
    listTenantSkus: jest.Mock;
    findUser: jest.Mock;
    assignLicense: jest.Mock;
  };

  beforeEach(() => {
    graph = { getSubscribedSkus: jest.fn().mockResolvedValue([{}, {}, {}]) };
    snow = {
      query: jest.fn().mockResolvedValue([{}]),
      createRecord: jest.fn(),
      updateRecord: jest.fn(),
      addWorkNote: jest.fn(),
    };
    // W39: only listTenantSkus (2002 mode 1) may ever be reached from here.
    n8nLicense = {
      listTenantSkus: jest.fn().mockResolvedValue([{}, {}]),
      findUser: jest.fn(),
      assignLicense: jest.fn(),
    };
    service = new IntegrationProbeService(
      graph as unknown as GraphService,
      snow as unknown as ServiceNowService,
      n8nLicense as unknown as N8nLicenseProvider,
    );
  });

  /**
   * 🔴 G2 — the load-bearing test. ADR-0010 D5: a probe must have no side
   * effects. Run every probe there is, then assert nothing that writes was
   * touched. If someone later "improves" the ServiceNow probe into a create,
   * or wires the n8n webhook up to "test it properly", this fails.
   *
   * W39: iterates CONNECTOR_KEYS instead of a hand-written list. The list
   * version claimed to "run every probe there is" while actually running the
   * four that existed when it was written — so adding 'n8n-license' left the
   * new probe silently uncovered, which is how it shipped briefly reaching
   * ServiceNow. A guard that has to be updated by hand is a guard with a hole
   * in it (same failure mode as TD-1).
   */
  it('never calls anything that writes — every connector, not a hand-written list', async () => {
    for (const key of CONNECTOR_KEYS) {
      await service.run(key, 1_000);
    }

    expect(snow.createRecord).not.toHaveBeenCalled();
    expect(snow.updateRecord).not.toHaveBeenCalled();
    expect(snow.addWorkNote).not.toHaveBeenCalled();
    // W39: assigning IS a write, and the worst kind — it consumes a real seat
    // for a real person. 2005 is read-only but needs a real UPN (H4).
    expect(n8nLicense.assignLicense).not.toHaveBeenCalled();
    expect(n8nLicense.findUser).not.toHaveBeenCalled();
  });

  describe('n8n-license probe (W39)', () => {
    it('probes workflow 2002 mode 1 and nothing else', async () => {
      const res = await service.run('n8n-license', 1_000);

      expect(n8nLicense.listTenantSkus).toHaveBeenCalledTimes(1);
      expect(res.ok).toBe(true);
      expect(res.message).toContain('2');
      expect(res.message).toMatch(/n8n/i);
    });

    /**
     * 🔴 The regression this whole block exists for. `execute()` falls through
     * to the ServiceNow branch for any probeable key it does not name, so
     * adding 'n8n-license' to PROBEABLE without adding the branch made
     * "test the n8n connector" quietly probe ServiceNow and report the result
     * under an n8n label — a green tick for a connector nobody had contacted.
     */
    it('does NOT fall through to ServiceNow or Graph', async () => {
      await service.run('n8n-license', 1_000);

      expect(snow.query).not.toHaveBeenCalled();
      expect(graph.getSubscribedSkus).not.toHaveBeenCalled();
    });

    it('reports a failure without leaking the vendor message', async () => {
      n8nLicense.listTenantSkus.mockRejectedValue(
        new Error('x-uop-secret rejected by https://n8n.internal/webhook'),
      );

      const res = await service.run('n8n-license', 1_000);

      expect(res.ok).toBe(false);
      expect(res.message).not.toContain('n8n.internal');
      expect(res.message).not.toContain('x-uop-secret');
    });
  });

  it('probes Graph with the existing read-only subscribed-SKUs call', async () => {
    const res = await service.run('graph', 1_000);

    expect(graph.getSubscribedSkus).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('3');
  });

  it('probes ServiceNow with a single-row read', async () => {
    await service.run('servicenow', 1_000);

    // limit 1 — the cheapest read that proves auth + reachability.
    expect(snow.query).toHaveBeenCalledWith('', undefined, 1);
  });

  /**
   * The outbound webhook opens a REAL ticket (ADR-0008 乙/丙). "Testing" it
   * would create work for a human, so it reports configuration only.
   */
  it('reports n8n outbound without calling the webhook', async () => {
    const res = await service.run('n8n-outbound', 1_000);

    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/real ticket/i);
  });

  it('reports n8n inbound as nothing to call', async () => {
    const res = await service.run('n8n-inbound', 1_000);
    expect(res.message).toMatch(/pushed by n8n/i);
  });

  /**
   * H4 / D5: a vendor error can carry the instance URL or hints about the
   * service account. It goes to the log, never to the caller.
   */
  it('never surfaces the vendor error text', async () => {
    graph.getSubscribedSkus.mockRejectedValue(
      new Error(
        'AADSTS7000215: invalid client secret for https://acme.service-now.com admin@acme',
      ),
    );

    const res = await service.run('graph', 1_000);

    expect(res.ok).toBe(false);
    expect(res.message).not.toContain('AADSTS');
    expect(res.message).not.toContain('acme');
    expect(res.message).not.toContain('secret');
  });

  describe('throttle (10s per connector — plan §9 Q2)', () => {
    it('allows the first probe and blocks a repeat within the window', () => {
      expect(service.cooldownRemainingMs('graph', 1_000)).toBe(0);

      void service.run('graph', 1_000);

      expect(service.cooldownRemainingMs('graph', 4_000)).toBe(
        PROBE_THROTTLE_MS - 3_000,
      );
    });

    it('allows again once the window has passed', async () => {
      await service.run('graph', 1_000);

      expect(
        service.cooldownRemainingMs('graph', 1_000 + PROBE_THROTTLE_MS),
      ).toBe(0);
    });

    // Throttling one connector must not lock out a different one.
    it('tracks the cooldown per connector', async () => {
      await service.run('graph', 1_000);

      expect(service.cooldownRemainingMs('servicenow', 1_000)).toBe(0);
    });
  });

  describe('result retention', () => {
    it('has no result before the connector is ever probed', () => {
      expect(service.get('graph')).toBeNull();
    });

    // In-process only — ADR-0010 D4 chose not to persist health, so this is
    // not a history and the UI must not present it as one.
    it('remembers the latest result for the session', async () => {
      await service.run('graph', 1_000);
      expect(service.get('graph')?.ok).toBe(true);

      graph.getSubscribedSkus.mockRejectedValue(new Error('down'));
      await service.run('graph', 99_000);
      expect(service.get('graph')?.ok).toBe(false);
    });
  });
});
