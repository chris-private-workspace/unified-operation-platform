import { ConnectorConfigService } from '../connector-config.service';
import { SeamRuntimeRegistry } from '../seam-runtime.registry';
import { ticketUpdateProviderFactory } from '../integration.module';
import { DirectTicketProvider } from './direct-ticket.provider';
import { N8nTicketProvider } from './n8n-ticket.provider';

/**
 * W40 F3 — the switch for seam ④.
 *
 * The property under test is the FAIL-SAFE DIRECTION, not the happy path.
 * Getting it backwards breaks nothing visibly: the app boots, the tests pass,
 * and ticket closures quietly start going through a third party. So each way of
 * "not properly configured" is asserted separately rather than as one case,
 * because they arrive for different reasons — nobody set it, someone mistyped
 * it, someone half-finished a migration.
 */
describe('ticketUpdateProviderFactory', () => {
  const direct = {} as DirectTicketProvider;
  const n8n = {} as N8nTicketProvider;

  const cc = (value?: string) =>
    ({
      resolve: async (_c: string, column: string) =>
        column === 'ticketUpdateProvider' ? value : undefined,
    }) as unknown as ConnectorConfigService;

  // BUG-011 — real registry, not a mock (pure in-memory bookkeeping).
  const reg = () => new SeamRuntimeRegistry();

  it('falls back to Direct when nothing is configured', async () => {
    await expect(
      ticketUpdateProviderFactory(direct, n8n, cc(), reg()),
    ).resolves.toBe(direct);
  });

  it("uses Direct when explicitly set to 'direct'", async () => {
    await expect(
      ticketUpdateProviderFactory(direct, n8n, cc('direct'), reg()),
    ).resolves.toBe(direct);
  });

  it("uses n8n only on the exact string 'n8n'", async () => {
    await expect(
      ticketUpdateProviderFactory(direct, n8n, cc('n8n'), reg()),
    ).resolves.toBe(n8n);
  });

  /**
   * The cases that decide whether this switch is safe. A typo, a case
   * difference or a stray space must all land on Direct — the value came from a
   * DB column an admin typed into, so none of these is far-fetched.
   */
  it.each(['N8N', ' n8n', 'n8n ', 'nn8n', 'true', ''])(
    'treats %p as not-n8n and stays on Direct',
    async (value) => {
      await expect(
        ticketUpdateProviderFactory(direct, n8n, cc(value), reg()),
      ).resolves.toBe(direct);
    },
  );

  /** BUG-011 — same two properties as seam ②: it records, and it records the
   * value that actually took effect rather than the one that was typed. */
  it('records the effective boot decision, not the typed string', async () => {
    const recorded = reg();
    const mistyped = reg();

    await ticketUpdateProviderFactory(direct, n8n, cc('n8n'), recorded);
    await ticketUpdateProviderFactory(direct, n8n, cc('N8N'), mistyped);

    expect(recorded.isUsingN8n('n8n-ticket')).toBe(true);
    expect(mistyped.isUsingN8n('n8n-ticket')).toBe(false);
  });
});
