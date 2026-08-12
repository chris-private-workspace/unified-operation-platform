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
          suspendedUnits: 0,
          warningUnits: 0,
          lockedOutUnits: 0,
          consumedUnits: 42,
          capabilityStatus: 'Enabled',
          appliesTo: 'User',
        },
      ]);

      const result = await provider.listTenantSkus();

      // Exactly four keys — a non-Graph implementation must not be forced to
      // invent capabilityStatus / appliesTo, nor the three extra prepaidUnits
      // buckets (ADR-0033 D3). assignableUnits is a conclusion, not a bucket.
      expect(result).toEqual([
        {
          skuId: 'sku-guid-1',
          prepaidEnabled: 100,
          consumedUnits: 42,
          assignableUnits: 100,
        },
      ]);
      expect(Object.keys(result[0])).toHaveLength(4);
    });

    /**
     * ADR-0033 D3/D4 — the whole point of the change, on SPE_E3's real numbers.
     * `enabled + warning`; `suspended` and `lockedOut` stay out.
     */
    it('counts grace-period seats as assignable, cancelled and locked ones not', async () => {
      graph.getSubscribedSkus.mockResolvedValue([
        {
          skuId: 'sku-guid-e3',
          skuPartNumber: 'SPE_E3',
          prepaidEnabled: 21,
          suspendedUnits: 7,
          warningUnits: 4477,
          lockedOutUnits: 5,
          consumedUnits: 677,
          capabilityStatus: 'Enabled',
          appliesTo: 'User',
        },
      ]);

      const [row] = await provider.listTenantSkus();

      expect(row.assignableUnits).toBe(4498);
      // Spelled out rather than derived from the fixture: an expectation that
      // recomputes the implementation always passes (CH-023's tautology).
      expect(row.prepaidEnabled).toBe(21);
      expect(row).not.toHaveProperty('warningUnits');
      expect(row).not.toHaveProperty('suspendedUnits');
      expect(row).not.toHaveProperty('capabilityStatus');
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
   * The log line WAS leaking when this block was written (W38): graphUnavailable
   * interpolated the raw vendor error, and a Graph 404 body carries the UPN in
   * the request path. W38 deliberately left it — fixing it would have changed
   * logging behaviour, which a pure refactor must not do — and logged it as a
   * BUG candidate instead.
   *
   * That is now **BUG-004, fixed**: the helper scrubs email-shaped tokens, and
   * graph-unavailable.spec.ts asserts on the logger directly. This block keeps
   * its narrower claim rather than being widened, because the two are different
   * guarantees and the caller-facing message is the one this file is about.
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
