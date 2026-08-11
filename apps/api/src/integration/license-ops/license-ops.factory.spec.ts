import { ConnectorConfigService } from '../connector-config.service';
import { SeamRuntimeRegistry } from '../seam-runtime.registry';
import { licenseOpsProviderFactory } from '../integration.module';
import { GraphLicenseProvider } from './graph-license.provider';
import { N8nLicenseProvider } from './n8n-license.provider';

/**
 * W40 follow-up — the switch for seam ②.
 *
 * This existed since W39 but had no test, because it was written inline in the
 * module. Seam ④ got the identical switch WITH a test in W40, and the gap only
 * became visible when the two were side by side.
 *
 * The property under test is the FAIL-SAFE DIRECTION, not the happy path.
 * Getting it backwards breaks nothing visibly: the app boots, every other test
 * passes, and real licence assignments quietly start going through n8n. So each
 * way of "not properly configured" is asserted separately — they arrive for
 * different reasons, and the value comes from a DB column an admin typed into.
 */
describe('licenseOpsProviderFactory', () => {
  const graph = {} as GraphLicenseProvider;
  const n8n = {} as N8nLicenseProvider;

  const cc = (value?: string) =>
    ({
      resolve: async (_c: string, column: string) =>
        column === 'licenseOpsProvider' ? value : undefined,
    }) as unknown as ConnectorConfigService;

  // BUG-011 — a real registry, not a mock: it is pure in-memory bookkeeping, and
  // using the real one means these tests also pin what gets recorded.
  const reg = () => new SeamRuntimeRegistry();

  it('falls back to Graph when nothing is configured', async () => {
    await expect(
      licenseOpsProviderFactory(graph, n8n, cc(), reg()),
    ).resolves.toBe(graph);
  });

  it("uses Graph when explicitly set to 'graph'", async () => {
    await expect(
      licenseOpsProviderFactory(graph, n8n, cc('graph'), reg()),
    ).resolves.toBe(graph);
  });

  it("uses n8n only on the exact string 'n8n'", async () => {
    await expect(
      licenseOpsProviderFactory(graph, n8n, cc('n8n'), reg()),
    ).resolves.toBe(n8n);
  });

  it.each(['N8N', ' n8n', 'n8n ', 'nn8n', 'true', ''])(
    'treats %p as not-n8n and stays on Graph',
    async (value) => {
      await expect(
        licenseOpsProviderFactory(graph, n8n, cc(value), reg()),
      ).resolves.toBe(graph);
    },
  );

  /**
   * BUG-011 — the panel reported a provider switch the moment it was saved,
   * while this factory only re-reads its switch on restart (ADR-0013 C2). It now
   * records what it actually resolved so the two can be compared.
   */
  it('records the boot decision so the panel can tell saved from live', async () => {
    const registry = reg();

    await licenseOpsProviderFactory(graph, n8n, cc('n8n'), registry);

    expect(registry.isUsingN8n('n8n-license')).toBe(true);
  });

  /**
   * The recorded value must be the EFFECTIVE one. A typo fails safe to Graph, so
   * recording the raw string would show an operator a provider that never ran —
   * the same class of lie this bug is about, reintroduced one layer down.
   */
  it('records the effective choice, not the string that was typed', async () => {
    const registry = reg();

    const provider = await licenseOpsProviderFactory(
      graph,
      n8n,
      cc('N8N'),
      registry,
    );

    expect(provider).toBe(graph);
    expect(registry.isUsingN8n('n8n-license')).toBe(false);
  });
});
