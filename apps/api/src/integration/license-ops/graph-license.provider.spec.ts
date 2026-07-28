import { ServiceUnavailableException } from '@nestjs/common';
import { GraphLicenseProvider } from './graph-license.provider';
import { GraphService } from '../graph/graph.service';

/**
 * W38 F2. The point of these tests is not that the provider "works" — it is a
 * thin translator — but that the two things a refactor silently breaks are
 * nailed down: the 503 message the API returns, and the PII boundary.
 */
describe('GraphLicenseProvider', () => {
  let graph: {
    getSubscribedSkus: jest.Mock;
    findUser: jest.Mock;
    assignLicense: jest.Mock;
  };
  let provider: GraphLicenseProvider;

  beforeEach(() => {
    graph = {
      getSubscribedSkus: jest.fn(),
      findUser: jest.fn(),
      assignLicense: jest.fn(),
    };
    provider = new GraphLicenseProvider(graph as unknown as GraphService);
  });

  describe('listTenantSkus', () => {
    it('narrows SubscribedSku to seat counts only', async () => {
      graph.getSubscribedSkus.mockResolvedValue([
        {
          skuId: 'sku-guid-1',
          skuPartNumber: 'SPE_E3',
          prepaidEnabled: 100,
          consumedUnits: 42,
          capabilityStatus: 'Enabled',
          appliesTo: 'User',
        },
      ]);

      const result = await provider.listTenantSkus();

      // Exactly three keys — a non-Graph implementation must not be forced to
      // invent capabilityStatus / appliesTo (see TenantSkuSeats).
      expect(result).toEqual([
        { skuId: 'sku-guid-1', prepaidEnabled: 100, consumedUnits: 42 },
      ]);
      expect(Object.keys(result[0])).toHaveLength(3);
    });

    it('wraps a transport failure as 503 with the message assign.service used', async () => {
      graph.getSubscribedSkus.mockRejectedValue(new Error('ECONNRESET'));

      await expect(provider.listTenantSkus()).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(provider.listTenantSkus()).rejects.toThrow(
        'could not read the tenant license inventory',
      );
    });
  });

  describe('findUser', () => {
    it('narrows the directory user and keeps usageLocation', async () => {
      graph.findUser.mockResolvedValue({
        id: 'oid-1',
        userPrincipalName: 'a.b@example.com',
        displayName: 'A B',
        usageLocation: 'HK',
        accountEnabled: true,
      });

      const result = await provider.findUser('a.b@example.com');

      // displayName / accountEnabled are dropped: nothing on the assign path
      // reads them and they are PII we would rather not carry across the seam.
      expect(result).toEqual({
        userPrincipalName: 'a.b@example.com',
        usageLocation: 'HK',
      });
    });

    it('preserves null (a genuine 404 = not synced yet) rather than throwing', async () => {
      graph.findUser.mockResolvedValue(null);
      await expect(provider.findUser('ghost@example.com')).resolves.toBeNull();
    });

    it('wraps a transport failure as 503 with the message assign.service used', async () => {
      graph.findUser.mockRejectedValue(new Error('AADSTS700016'));

      await expect(provider.findUser('a.b@example.com')).rejects.toThrow(
        'could not look up the target user',
      );
    });
  });

  describe('assignLicense', () => {
    it('returns { status: assigned } and forwards usageLocation', async () => {
      graph.assignLicense.mockResolvedValue(undefined);

      const outcome = await provider.assignLicense(
        'a.b@example.com',
        'sku-guid-1',
        { usageLocation: 'HK' },
      );

      expect(outcome).toEqual({ status: 'assigned' });
      expect(graph.assignLicense).toHaveBeenCalledWith(
        'a.b@example.com',
        'sku-guid-1',
        { usageLocation: 'HK' },
      );
    });

    it('wraps a transport failure as 503 — NOT as { status: error }', async () => {
      graph.assignLicense.mockRejectedValue(new Error('throttled'));

      // The W38 error contract: "the vendor is down" is the absence of an
      // outcome, so it throws and the caller retries. Folding it into the
      // vocabulary would have made assign.service re-throw a hand-copied 503.
      await expect(
        provider.assignLicense('a.b@example.com', 'sku-guid-1', {}),
      ).rejects.toThrow(ServiceUnavailableException);
      await expect(
        provider.assignLicense('a.b@example.com', 'sku-guid-1', {}),
      ).rejects.toThrow('could not assign the license in Microsoft Graph');
    });
  });

  /**
   * 🔴 Scope of this block, stated precisely because it is easy to over-read:
   * it proves the 503 *message* (what the API returns to the caller) is clean.
   * It does NOT prove the log line is.
   *
   * Running these tests shows graphUnavailable() writing the raw vendor error
   * into logger.error, and a Graph 404 body carries the UPN in the request path
   * — so the UPN does reach the log today. That is a pre-existing defect in
   * graph-unavailable.ts (whose own comment claims "never log the target UPN"),
   * on every direct Graph caller, not something W38 introduced. Fixing it would
   * change logging behaviour, which is exactly what a pure refactor must not do
   * — logged as BUG candidate in W38 progress Day 2 instead.
   */
  describe('H4 — the 503 MESSAGE never carries the target UPN', () => {
    const upn = 'sensitive.person@example.com';

    it.each([
      [
        'findUser',
        () => {
          graph.findUser.mockRejectedValue(
            new Error(`Request failed for /users/${upn}`),
          );
          return provider.findUser(upn);
        },
      ],
      [
        'assignLicense',
        () => {
          graph.assignLicense.mockRejectedValue(
            new Error(`Request failed for /users/${upn}/assignLicense`),
          );
          return provider.assignLicense(upn, 'sku-guid-1', {});
        },
      ],
    ])(
      '%s: the 503 message stays clean even when the vendor error carries the UPN',
      async (_name, act) => {
        // The vendor error deliberately contains the UPN — that is exactly the
        // case that leaked in BUG-001. graphUnavailable() must not pass it on.
        await expect(act()).rejects.toMatchObject({
          message: expect.not.stringContaining(upn),
        });
      },
    );
  });
});
