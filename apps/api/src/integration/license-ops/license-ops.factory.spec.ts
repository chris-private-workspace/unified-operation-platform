import { ConnectorConfigService } from '../connector-config.service';
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

  it('falls back to Graph when nothing is configured', async () => {
    await expect(licenseOpsProviderFactory(graph, n8n, cc())).resolves.toBe(
      graph,
    );
  });

  it("uses Graph when explicitly set to 'graph'", async () => {
    await expect(
      licenseOpsProviderFactory(graph, n8n, cc('graph')),
    ).resolves.toBe(graph);
  });

  it("uses n8n only on the exact string 'n8n'", async () => {
    await expect(
      licenseOpsProviderFactory(graph, n8n, cc('n8n')),
    ).resolves.toBe(n8n);
  });

  it.each(['N8N', ' n8n', 'n8n ', 'nn8n', 'true', ''])(
    'treats %p as not-n8n and stays on Graph',
    async (value) => {
      await expect(
        licenseOpsProviderFactory(graph, n8n, cc(value)),
      ).resolves.toBe(graph);
    },
  );
});
