import { ConnectorConfigService } from '../connector-config.service';
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

  it('falls back to Direct when nothing is configured', async () => {
    await expect(ticketUpdateProviderFactory(direct, n8n, cc())).resolves.toBe(
      direct,
    );
  });

  it("uses Direct when explicitly set to 'direct'", async () => {
    await expect(
      ticketUpdateProviderFactory(direct, n8n, cc('direct')),
    ).resolves.toBe(direct);
  });

  it("uses n8n only on the exact string 'n8n'", async () => {
    await expect(
      ticketUpdateProviderFactory(direct, n8n, cc('n8n')),
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
        ticketUpdateProviderFactory(direct, n8n, cc(value)),
      ).resolves.toBe(direct);
    },
  );
});
