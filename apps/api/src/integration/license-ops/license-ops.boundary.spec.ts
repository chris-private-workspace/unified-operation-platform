import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * W38 F4 — the seam's scope boundary, enforced.
 *
 * ADR-0017 seam ② covers the ASSIGN path and nothing else (W38 OQ-1/OQ-2, Chris
 * 2026-07-27). Three other GraphService callers must keep talking to the vendor
 * directly. None of that is visible from reading assign.service, so without
 * these tests the boundary survives only as long as everyone remembers it —
 * and the failure mode is silent: 庚 flips the provider to n8n, everything
 * still compiles, and drift detection quietly starts trusting n8n.
 *
 * Static source checks rather than DI wiring: the claim being locked is
 * "this file does not reach for the seam AT ALL", which an import list answers
 * directly and a behavioural mock only answers for the paths it exercises.
 */
describe('license-ops seam boundary (W38 OQ-1 / OQ-2)', () => {
  const src = (relative: string) =>
    readFileSync(join(__dirname, '..', '..', relative), 'utf8');

  /** Why each one stays on the vendor directly — not just THAT it does. */
  const MUST_STAY_DIRECT = [
    {
      file: 'license/reconcile.service.ts',
      why: "Drift is the platform's own claim about reality. Routing it through a switchable seam would make the drift baseline depend on which provider happens to be configured, and D0 keeps decision-makers on the platform.",
    },
    {
      file: 'integration/integration-probe.service.ts',
      why: 'The probe reports whether the GRAPH CONNECTOR is healthy (ADR-0010). The thing it must observe is precisely the executor this seam swaps out — through the seam it would be probing n8n and labelling the answer "Graph".',
    },
    {
      file: 'fulfilment/sync-sweep.service.ts',
      why: 'ADR-0015 exists to upgrade azureSyncedAt from "n8n claims it" to "the platform verified it". Verifying through n8n would undo exactly that, and the gate would silently go back to trusting the caller.',
    },
  ];

  describe.each(MUST_STAY_DIRECT)('$file', ({ file, why }) => {
    it(`does not import the license-ops seam — ${why}`, () => {
      expect(src(file)).not.toContain('license-ops');
    });

    // Positive half: "no seam import" alone would also pass if the file stopped
    // calling the vendor entirely (deleted, refactored elsewhere). Assert it is
    // still on GraphService, so the test keeps meaning what it says.
    it('still talks to GraphService directly', () => {
      expect(src(file)).toContain('GraphService');
    });
  });

  it('catalog.service also stays direct (OQ-1: ADR-0017 never scoped SKU dictionary sync)', () => {
    const catalog = src('license/catalog.service.ts');
    expect(catalog).not.toContain('license-ops');
    expect(catalog).toContain('GraphService');
  });

  it('assign.service is the ONLY consumer that went through the seam', () => {
    const assign = src('fulfilment/assign.service.ts');
    expect(assign).toContain('license-ops/license-ops.provider');
    // The flip side of the refactor: it must no longer reach the vendor itself,
    // otherwise both paths would coexist and 庚 would swap only half of them.
    expect(assign).not.toContain('graph/graph.service');
    expect(assign).not.toContain('graph-unavailable');
  });
});
