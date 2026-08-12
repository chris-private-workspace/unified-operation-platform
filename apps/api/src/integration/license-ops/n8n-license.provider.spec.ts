import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { N8nLicenseProvider } from './n8n-license.provider';
import { ConnectorConfigService } from '../connector-config.service';

/**
 * W39 F1/F2. Every response shape asserted here was read out of the workflow
 * JSON, not out of ADR prose — the two disagreed in four places (plan §2), and
 * the workflow is what answers at runtime.
 */
describe('N8nLicenseProvider', () => {
  const BASE = 'https://n8n.example.invalid/webhook';
  let fetchMock: jest.Mock;
  let provider: N8nLicenseProvider;

  const ok = (json: unknown) => ({
    ok: true,
    status: 200,
    json: async () => json,
  });

  const build = (opts?: { baseUrl?: string | undefined; secret?: string }) => {
    const connectorConfig = {
      resolve: jest
        .fn()
        .mockResolvedValue('baseUrl' in (opts ?? {}) ? opts!.baseUrl : BASE),
    } as unknown as ConnectorConfigService;
    const config = {
      get: jest.fn().mockReturnValue(opts?.secret ?? 'shared-secret'),
    } as unknown as ConfigService;
    return new N8nLicenseProvider(config, connectorConfig);
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = build();
  });

  describe('listTenantSkus (2002 mode 1)', () => {
    it('posts mode 1 and narrows to seat counts', async () => {
      fetchMock.mockResolvedValue(
        ok({
          status: 'ok',
          mode: 1,
          skus: [
            {
              skuId: 'guid-1',
              skuPartNumber: 'SPE_E3',
              prepaidEnabled: 100,
              consumedUnits: 42,
              capabilityStatus: 'Enabled',
              appliesTo: 'User',
            },
          ],
        }),
      );

      const result = await provider.listTenantSkus();

      // ADR-0033 D3 — assignableUnits === prepaidEnabled here, and that is the
      // honest answer, not a placeholder: workflow 2002 sends one seat number.
      // The consequence is deliberate — on this provider the tenant seat gate
      // keeps its pre-CH-027 behaviour until n8n itself starts sending more.
      expect(result).toEqual([
        {
          skuId: 'guid-1',
          prepaidEnabled: 100,
          consumedUnits: 42,
          assignableUnits: 100,
        },
      ]);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/wf2-license-check`);
      expect(JSON.parse(init.body)).toEqual({ mode: 1 });
      expect(init.headers['x-uop-secret']).toBe('shared-secret');
    });

    it('tolerates a missing skus array rather than throwing', async () => {
      fetchMock.mockResolvedValue(ok({ status: 'ok', mode: 1 }));
      await expect(provider.listTenantSkus()).resolves.toEqual([]);
    });
  });

  describe('findUser (2005)', () => {
    it('maps a synced result to DirectoryUser, keeping usageLocation', async () => {
      fetchMock.mockResolvedValue(
        ok({
          status: 'ok',
          results: [
            { upn: 'a.b@example.com', status: 'synced', usageLocation: 'HK' },
          ],
        }),
      );

      await expect(provider.findUser('a.b@example.com')).resolves.toEqual({
        userPrincipalName: 'a.b@example.com',
        usageLocation: 'HK',
      });
    });

    it('maps not_synced to NULL — the same shape a Graph 404 produces', async () => {
      fetchMock.mockResolvedValue(
        ok({
          status: 'ok',
          results: [{ upn: 'x@y.com', status: 'not_synced' }],
        }),
      );
      // The caller's "not in the directory yet" branch must not need to know
      // which provider answered.
      await expect(provider.findUser('x@y.com')).resolves.toBeNull();
    });

    it('treats a per-result error as unavailable, not as "no such user"', async () => {
      fetchMock.mockResolvedValue(
        ok({ status: 'ok', results: [{ upn: 'x@y.com', status: 'error' }] }),
      );
      // Returning null here would open the sync gate's 400 path and tell the
      // operator "not synced yet" when the truth is "we could not find out".
      await expect(provider.findUser('x@y.com')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('assignLicense (2003) — two response shapes, not one', () => {
    it('maps success -> assigned (ADR-0017 D2 paraphrased this as "assigned")', async () => {
      fetchMock.mockResolvedValue(ok({ status: 'success' }));

      const outcome = await provider.assignLicense('a@b.com', 'guid-1', {
        usageLocation: 'HK',
      });

      expect(outcome).toEqual({ status: 'assigned' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/wf3-assign-license`);
      expect(JSON.parse(init.body)).toEqual({
        upn: 'a@b.com',
        skuId: 'guid-1',
        targetUsageLocation: 'HK',
      });
    });

    it('omits targetUsageLocation when the caller resolved none', async () => {
      fetchMock.mockResolvedValue(ok({ status: 'success' }));
      await provider.assignLicense('a@b.com', 'guid-1', {});
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        upn: 'a@b.com',
        skuId: 'guid-1',
      });
    });

    // These two come from the `Route Status` switch, which responds directly
    // with the `Evaluate User` shape and never reaches `Build Response`.
    it('maps already_assigned through as-is (W39 OQ-1 = A)', async () => {
      fetchMock.mockResolvedValue(ok({ status: 'already_assigned' }));
      await expect(
        provider.assignLicense('a@b.com', 'guid-1', {}),
      ).resolves.toEqual({ status: 'already_assigned' });
    });

    it('maps not_synced through as-is', async () => {
      fetchMock.mockResolvedValue(ok({ status: 'not_synced' }));
      await expect(
        provider.assignLicense('a@b.com', 'guid-1', {}),
      ).resolves.toEqual({ status: 'not_synced' });
    });

    it('maps an unrecognised status to error', async () => {
      fetchMock.mockResolvedValue(ok({ status: 'something-new' }));
      const outcome = await provider.assignLicense('a@b.com', 'guid-1', {});
      expect(outcome.status).toBe('error');
    });
  });

  /**
   * 🔴 The reason OQ-2 exists. Both 2003 code nodes fill `details` with
   * `JSON.stringify(graphErrorBody).slice(0, 500)`, and a Graph 404/400 body
   * routinely carries the UPN in the request path — the exact leak shape as
   * BUG-004, except this time we get to stop it before it ships.
   */
  describe('H4 — n8n `details` never reaches the platform', () => {
    const upn = 'sensitive.person@example.com';

    it('drops the workflow details even when they quote the UPN', async () => {
      fetchMock.mockResolvedValue(
        ok({
          status: 'error',
          details: `{"error":{"message":"Resource '/users/${upn}' does not exist"}}`,
        }),
      );

      const outcome = await provider.assignLicense(upn, 'guid-1', {});

      expect(outcome.status).toBe('error');
      expect(JSON.stringify(outcome)).not.toContain(upn);
      // ...and it still says something an operator can act on.
      expect((outcome as { details: string }).details).toMatch(
        /n8n execution log/i,
      );
    });
  });

  describe('error contract — transport failures throw, they are not outcomes', () => {
    it('throws 503 when the webhook is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        provider.assignLicense('a@b.com', 'guid-1', {}),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws 503 on a non-2xx (bad secret / bad input = our wiring mistake)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });
      // A 401 must NOT become { status: 'error' }: that would read as "the
      // assignment failed" when the truth is "nobody was ever asked".
      await expect(
        provider.assignLicense('a@b.com', 'guid-1', {}),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws 503 on a malformed body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      });
      await expect(provider.listTenantSkus()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('half-configured provider says so instead of failing obscurely', () => {
    it('names the missing base URL', async () => {
      const p = build({ baseUrl: undefined });
      await expect(p.listTenantSkus()).rejects.toThrow(
        /webhook base URL is not configured/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('names the missing shared key without echoing any value', async () => {
      const p = build({ secret: '' });
      await expect(p.listTenantSkus()).rejects.toThrow(
        /N8N_LICENSE_WEBHOOK_KEY is not set/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
