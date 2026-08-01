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
      file: 'fulfilment/sync-sweep.service.ts',
      why: 'ADR-0015 exists to upgrade azureSyncedAt from "n8n claims it" to "the platform verified it". Verifying through n8n would undo exactly that, and the gate would silently go back to trusting the caller.',
    },
    {
      file: 'fulfilment/sync-check.service.ts',
      why: 'CH-015 — the on-demand half of the same gate. It writes through the sweep\'s own openSyncGate, so routing ITS lookup through n8n would reopen the hole ADR-0015 closed, from the side nobody is watching.',
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

  /**
   * W39 — integration-probe was in MUST_STAY_DIRECT until 庚 needed to probe the
   * n8n connector itself. The rule it was under is now stated precisely, because
   * the original string check ("must not mention license-ops at all") was WIDER
   * than the reason behind it.
   *
   * The reason was never "the probe may not touch this folder". It was: a probe
   * must reach the connector it NAMES. Injecting the abstraction would make
   * "test the n8n connector" probe whichever provider is currently selected —
   * with the default wiring that is Graph, so the panel would report Graph's
   * health under an n8n label. Injecting the CONCRETE N8nLicenseProvider is the
   * opposite: it is the only way to reach n8n on demand while Graph stays
   * selected.
   *
   * So the boundary is tightened, not relaxed: the abstraction is now banned by
   * name, which the old substring check never actually asserted.
   */
  describe('integration-probe: names its connector, never goes through the seam', () => {
    const probe = () => src('integration/integration-probe.service.ts');

    // Matched on the IMPORT PATH, not the class name: the file's own comments
    // name the abstraction (to explain why it is not used), and a substring
    // check on the name flagged that as a violation. What matters is what the
    // file imports, not what it talks about.
    it('does NOT import the LicenseOperationsProvider abstraction', () => {
      expect(probe()).not.toContain(
        "from './license-ops/license-ops.provider'",
      );
    });

    it('probes Graph via GraphService and n8n via the concrete provider', () => {
      expect(probe()).toContain('GraphService');
      expect(probe()).toContain("from './license-ops/n8n-license.provider'");
    });

    it('never reaches the assign or sync-check workflows from a health check', () => {
      // 2003 assigns a real licence; 2005 needs a real UPN (H4). Only the
      // read-only seat count (2002 mode 1) is allowed here.
      expect(probe()).not.toContain('assignLicense');
      expect(probe()).not.toContain('findUser');
      expect(probe()).toContain('listTenantSkus');
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
