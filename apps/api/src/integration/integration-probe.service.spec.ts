import { GraphService } from './graph/graph.service';
import { ServiceNowService } from './servicenow/servicenow.service';
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

  beforeEach(() => {
    graph = { getSubscribedSkus: jest.fn().mockResolvedValue([{}, {}, {}]) };
    snow = {
      query: jest.fn().mockResolvedValue([{}]),
      createRecord: jest.fn(),
      updateRecord: jest.fn(),
      addWorkNote: jest.fn(),
    };
    service = new IntegrationProbeService(
      graph as unknown as GraphService,
      snow as unknown as ServiceNowService,
    );
  });

  /**
   * 🔴 G2 — the load-bearing test. ADR-0010 D5: a probe must have no side
   * effects. Run every probe there is, then assert nothing that writes was
   * touched. If someone later "improves" the ServiceNow probe into a create,
   * or wires the n8n webhook up to "test it properly", this fails.
   */
  it('never calls anything that writes', async () => {
    await service.run('graph', 1_000);
    await service.run('servicenow', 1_000);
    await service.run('n8n-outbound', 1_000);
    await service.run('n8n-inbound', 1_000);

    expect(snow.createRecord).not.toHaveBeenCalled();
    expect(snow.updateRecord).not.toHaveBeenCalled();
    expect(snow.addWorkNote).not.toHaveBeenCalled();
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
