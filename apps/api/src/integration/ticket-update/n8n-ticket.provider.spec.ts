import { ConfigService } from '@nestjs/config';
import { ConnectorConfigService } from '../connector-config.service';
import { N8nTicketProvider } from './n8n-ticket.provider';

/**
 * W40 F2 — what the n8n implementation sends, and what it refuses to pass on.
 *
 * The workflow is mocked at the fetch boundary rather than mocked away: what
 * matters here is the exact request 2004 receives (path, header, mode) and how
 * its two response shapes are read. Both were taken from the workflow JSON.
 */
describe('N8nTicketProvider', () => {
  let fetchMock: jest.Mock;
  let provider: N8nTicketProvider;
  let env: Record<string, string | undefined>;

  const build = (
    resolved: string | null = 'https://n8n.example.com/webhook/',
  ) => {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    const connectorConfig = {
      resolve: jest.fn().mockResolvedValue(resolved),
    } as unknown as ConnectorConfigService;
    return new N8nTicketProvider(config, connectorConfig);
  };

  const respond = (body: unknown, ok = true, status = 200) =>
    fetchMock.mockResolvedValue({
      ok,
      status,
      json: async () => body,
    } as Response);

  beforeEach(() => {
    env = { N8N_TICKET_WEBHOOK_KEY: 'shhh-secret-value' };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = build();
  });

  describe('what 2004 receives', () => {
    it('closeComplete sends mode 0 to wf4-sn-update with the shared secret', async () => {
      respond({ status: 'success', newState: '3' });

      await provider.closeComplete('RITMSYS1', 'fulfilled');

      const [url, init] = fetchMock.mock.calls[0];
      // Trailing slash on the configured base must not produce a double slash.
      expect(url).toBe('https://n8n.example.com/webhook/wf4-sn-update');
      expect(init.headers['x-uop-secret']).toBe('shhh-secret-value');
      expect(JSON.parse(init.body)).toEqual({
        ritmId: 'RITMSYS1',
        mode: 0,
        notes: 'fulfilled',
      });
    });

    it('markInProgress sends mode 1', async () => {
      respond({ status: 'success', newState: '2' });

      await provider.markInProgress('RITMSYS2', 'procurement');

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        ritmId: 'RITMSYS2',
        mode: 1,
        notes: 'procurement',
      });
    });

    /**
     * The modes are numerically adjacent and mean opposite things — close vs
     * hold. Asserting them per-method is not enough, because the same mistake
     * (a swapped constant) would be copied into both assertions above.
     */
    it('never sends the close mode when asked to hold, or vice versa', async () => {
      respond({ status: 'success', newState: '2' });
      await provider.markInProgress('S', 'n');
      await provider.closeComplete('S', 'n');

      const modes = fetchMock.mock.calls.map(
        (c) => JSON.parse(c[1].body).mode as number,
      );
      expect(modes).toEqual([1, 0]);
    });
  });

  describe('reading the answer', () => {
    it('reports the state ServiceNow ended up in', async () => {
      respond({ status: 'success', newState: '3' });

      await expect(provider.closeComplete('S', 'n')).resolves.toEqual({
        status: 'updated',
        newState: '3',
      });
    });

    it('falls back to the requested state when the workflow echoes none', async () => {
      respond({ status: 'success' });

      await expect(provider.markInProgress('S', 'n')).resolves.toEqual({
        status: 'updated',
        newState: '2',
      });
    });

    /**
     * 🔴 The case the whole `error` variant exists for: 2004 patches with
     * `neverError: true`, so a ServiceNow refusal (row-level ACL on the
     * n8napiservice1 credential) comes back as HTTP 200 with status 'error'.
     * Treating the webhook's 200 as success would report a ticket as closed
     * while it never moved.
     */
    it('treats a workflow-level error as a failed update even though HTTP was 200', async () => {
      respond({ status: 'error', httpStatus: 403, details: 'whatever' });

      const outcome = await provider.closeComplete('S', 'n');

      expect(outcome.status).toBe('error');
    });

    /**
     * H4 — same call as W39 OQ-2. 2004 builds `details` as
     * JSON.stringify(snErrorBody).substring(0,500), which is precisely the
     * shape BUG-004 was about. The operator-facing text must be ours.
     */
    it('never passes the workflow details through, even when they carry a UPN', async () => {
      respond({
        status: 'error',
        httpStatus: 404,
        details:
          '{"error":{"message":"No record for sensitive.person@example.com"}}',
      });

      const outcome = await provider.closeComplete('S', 'n');

      expect(JSON.stringify(outcome)).not.toContain('sensitive.person');
      expect(JSON.stringify(outcome)).not.toContain('@example.com');
      // The one vendor fact that is kept, because a number cannot carry PII and
      // it is what tells an ACL failure apart from a wrong sys_id.
      expect(JSON.stringify(outcome)).toContain('404');
    });
  });

  describe('failures that are ours, not the vendor’s', () => {
    /**
     * W39's lesson, ported: if the secret were read inside the try, a missing
     * key would be reported as "n8n is unavailable" and send whoever is on call
     * to investigate a third party for our own misconfiguration.
     */
    it('says the key is missing rather than blaming n8n', async () => {
      env = {};
      provider = build();

      await expect(provider.closeComplete('S', 'n')).rejects.toThrow(
        /N8N_TICKET_WEBHOOK_KEY is not set/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says the URL is missing rather than blaming n8n', async () => {
      provider = build(null);

      await expect(provider.closeComplete('S', 'n')).rejects.toThrow(
        /webhook URL is not configured/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('turns an unreachable n8n into a 503 without leaking the secret', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(provider.markInProgress('S', 'n')).rejects.toThrow(
        /n8n is unavailable/,
      );
    });

    /** 2004 answers 400 for a bad secret or a bad mode — a wiring mistake. */
    it('turns a non-2xx into a 503 rather than a business outcome', async () => {
      respond({}, false, 400);

      await expect(provider.closeComplete('S', 'n')).rejects.toThrow(
        /n8n rejected the request/,
      );
    });

    it('turns a malformed body into a 503', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response);

      await expect(provider.closeComplete('S', 'n')).rejects.toThrow(
        /malformed response/,
      );
    });
  });

  /**
   * Hard line: the shared key must never reach anything a human or a log can
   * read. Every failure path is exercised, because they are the paths that
   * build strings out of context.
   */
  it('never lets the shared secret into an error surfaced to the caller', async () => {
    const leaked: string[] = [];
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await provider
      .markInProgress('S', 'n')
      .catch((e) => leaked.push(String(e)));

    respond({}, false, 500);
    await provider.closeComplete('S', 'n').catch((e) => leaked.push(String(e)));

    respond({ status: 'error', httpStatus: 500 });
    leaked.push(JSON.stringify(await provider.closeComplete('S', 'n')));

    expect(leaked.join(' ')).not.toContain('shhh-secret-value');
  });
});
