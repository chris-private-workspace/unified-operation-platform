import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphService } from '../graph/graph.service';
import { ConnectorConfigService } from '../connector-config.service';
import { GraphLicenseProvider } from './graph-license.provider';
import { N8nLicenseProvider } from './n8n-license.provider';
import { LicenseOperationsProvider } from './license-ops.provider';

/**
 * W39 F2 — the contract test ADR-0017 asks for: the same situation, put to both
 * providers, must come back as the same outcome. Without it, "switch the seam"
 * is a promise nothing checks; each provider's own spec proves it is
 * self-consistent, not that the two agree.
 *
 * Two things this file deliberately does NOT assert:
 *
 *   1. Identical error MESSAGES. When a vendor is down the operator needs to
 *      know WHICH one, so "Microsoft Graph is unavailable" and "n8n is
 *      unavailable" are both correct and must differ. The contract is the
 *      failure CLASS (a 503 either way), not the wording.
 *   2. Identical behaviour on a replay. That divergence is real, known and
 *      chosen (W39 OQ-1) — see the last block, which pins it in place rather
 *      than papering over it.
 */
describe('LicenseOperationsProvider contract — both implementations agree', () => {
  const BASE = 'https://n8n.example.invalid/webhook';
  const UPN = 'a.b@example.com';
  const SKU = 'guid-1';

  let graphMock: {
    findUser: jest.Mock;
    getSubscribedSkus: jest.Mock;
    assignLicense: jest.Mock;
  };
  let fetchMock: jest.Mock;
  let graph: LicenseOperationsProvider;
  let n8n: LicenseOperationsProvider;

  const okResponse = (json: unknown) => ({
    ok: true,
    status: 200,
    json: async () => json,
  });

  beforeEach(() => {
    graphMock = {
      findUser: jest.fn(),
      getSubscribedSkus: jest.fn(),
      assignLicense: jest.fn(),
    };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    graph = new GraphLicenseProvider(graphMock as unknown as GraphService);
    n8n = new N8nLicenseProvider(
      {
        get: jest.fn().mockReturnValue('shared-secret'),
      } as unknown as ConfigService,
      {
        resolve: jest.fn().mockResolvedValue(BASE),
      } as unknown as ConnectorConfigService,
    );
  });

  /**
   * Reduce "what happened" to something comparable across two very different
   * vendors: either a returned value, or the class of exception. Anything
   * vendor-specific (messages, status codes) is deliberately dropped here.
   */
  const observe = async (act: () => Promise<unknown>) => {
    try {
      return { kind: 'returned' as const, value: await act() };
    } catch (err) {
      return { kind: 'threw' as const, type: (err as object).constructor.name };
    }
  };

  /**
   * Each case describes ONE situation twice: once in Graph's vocabulary, once
   * in n8n's. Getting these two arrangements to mean the same thing is the
   * actual work — it is where a mistranslation would hide.
   */
  const CASES: {
    name: string;
    arrangeGraph: () => void;
    arrangeN8n: () => void;
    act: (p: LicenseOperationsProvider) => Promise<unknown>;
  }[] = [
    {
      name: 'the user exists and has a usageLocation',
      arrangeGraph: () =>
        graphMock.findUser.mockResolvedValue({
          id: 'oid-1',
          userPrincipalName: UPN,
          displayName: 'A B',
          usageLocation: 'HK',
          accountEnabled: true,
        }),
      arrangeN8n: () =>
        fetchMock.mockResolvedValue(
          okResponse({
            status: 'ok',
            results: [{ upn: UPN, status: 'synced', usageLocation: 'HK' }],
          }),
        ),
      act: (p) => p.findUser(UPN),
    },
    {
      name: 'the user is not in the directory yet (Graph 404 = n8n not_synced)',
      arrangeGraph: () => graphMock.findUser.mockResolvedValue(null),
      arrangeN8n: () =>
        fetchMock.mockResolvedValue(
          okResponse({
            status: 'ok',
            results: [{ upn: UPN, status: 'not_synced' }],
          }),
        ),
      // Both must be null, not "some falsy thing": the caller's sync-gate 400
      // branch keys off exactly this.
      act: (p) => p.findUser(UPN),
    },
    {
      name: 'the vendor is unreachable during a lookup',
      arrangeGraph: () =>
        graphMock.findUser.mockRejectedValue(new Error('ECONNRESET')),
      arrangeN8n: () => fetchMock.mockRejectedValue(new Error('ECONNREFUSED')),
      act: (p) => p.findUser(UPN),
    },
    {
      name: 'the tenant inventory reads back',
      /**
       * ADR-0033 D3 — warning/suspended are 0 here on purpose. The two
       * providers agree only while the grace period is empty; with warning > 0
       * Graph reports more assignable seats than n8n can, and that divergence is
       * the decision, not a contract break. It is asserted in
       * graph-license.provider.spec.ts, where it belongs.
       */
      arrangeGraph: () =>
        graphMock.getSubscribedSkus.mockResolvedValue([
          {
            skuId: SKU,
            skuPartNumber: 'SPE_E3',
            prepaidEnabled: 100,
            suspendedUnits: 0,
            warningUnits: 0,
            lockedOutUnits: 0,
            consumedUnits: 42,
            capabilityStatus: 'Enabled',
            appliesTo: 'User',
          },
        ]),
      arrangeN8n: () =>
        fetchMock.mockResolvedValue(
          okResponse({
            status: 'ok',
            mode: 1,
            skus: [
              {
                skuId: SKU,
                skuPartNumber: 'SPE_E3',
                prepaidEnabled: 100,
                consumedUnits: 42,
              },
            ],
          }),
        ),
      act: (p) => p.listTenantSkus(),
    },
    {
      name: 'the vendor is unreachable during an inventory read',
      arrangeGraph: () =>
        graphMock.getSubscribedSkus.mockRejectedValue(new Error('throttled')),
      arrangeN8n: () => fetchMock.mockRejectedValue(new Error('ETIMEDOUT')),
      act: (p) => p.listTenantSkus(),
    },
    {
      name: 'a fresh assignment succeeds',
      arrangeGraph: () => graphMock.assignLicense.mockResolvedValue(undefined),
      arrangeN8n: () =>
        fetchMock.mockResolvedValue(okResponse({ status: 'success' })),
      act: (p) => p.assignLicense(UPN, SKU, { usageLocation: 'HK' }),
    },
    {
      name: 'the vendor is unreachable during an assignment',
      arrangeGraph: () =>
        graphMock.assignLicense.mockRejectedValue(new Error('500')),
      arrangeN8n: () => fetchMock.mockRejectedValue(new Error('ECONNREFUSED')),
      act: (p) => p.assignLicense(UPN, SKU, {}),
    },
  ];

  it.each(CASES)('$name', async ({ arrangeGraph, arrangeN8n, act }) => {
    arrangeGraph();
    const fromGraph = await observe(() => act(graph));
    arrangeN8n();
    const fromN8n = await observe(() => act(n8n));

    expect(fromN8n).toEqual(fromGraph);
  });

  it('every transport failure above is a 503 on both sides, not a silent outcome', async () => {
    graphMock.assignLicense.mockRejectedValue(new Error('500'));
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    // Pinned separately from the equality check: `observe` compares the
    // exception's class NAME, so two unrelated error types with the same name
    // would still look equal. This says which class it has to be.
    await expect(graph.assignLicense(UPN, SKU, {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(n8n.assignLicense(UPN, SKU, {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  /**
   * 🔴 The one place the two providers are ALLOWED to differ, pinned so it
   * cannot drift silently in either direction.
   *
   * Graph's POST /assignLicense is idempotent and reports nothing, so a replay
   * is indistinguishable from a first assignment — it says `assigned`. Workflow
   * 2003 checks the user's existing licences first, so it says
   * `already_assigned`.
   *
   * W39 OQ-1 (Chris, 2026-07-28): the CALLER treats both identically, ledger
   * increment included. Acting on n8n's extra knowledge would mean switching
   * provider also switches ledger semantics — exactly what D0 forbids. The
   * double-count risk is pre-existing on the Graph path and must be fixed for
   * BOTH paths in a separate change, never as a side effect of this seam.
   *
   * If someone later "harmonises" these two — by probing licences on the Graph
   * side, or by dropping n8n's distinction — this test fails and sends them to
   * that decision instead of letting them quietly reverse it.
   */
  describe('the one known divergence: a replay', () => {
    it('Graph cannot tell a replay apart, n8n can', async () => {
      graphMock.assignLicense.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue(okResponse({ status: 'already_assigned' }));

      await expect(graph.assignLicense(UPN, SKU, {})).resolves.toEqual({
        status: 'assigned',
      });
      await expect(n8n.assignLicense(UPN, SKU, {})).resolves.toEqual({
        status: 'already_assigned',
      });
    });

    // Where the divergence is absorbed: assign.service's OQ-1 branch treats
    // both statuses identically. That behaviour belongs to assign.service.spec
    // and is NOT re-asserted here — a test that only restates a fact without
    // being able to fail is noise in the count, not coverage.
  });

  /**
   * `no_seats` is in the AssignOutcome union but NEITHER provider can produce
   * it, and that is correct, not a gap: the seat check is the platform's own
   * (assign.service reads listTenantSkus and refuses before calling assign),
   * and workflow 2003 deliberately does not do one either.
   *
   * Stated here because "a union member no implementation returns" reads like
   * an oversight to anyone who has not traced it.
   */
  it("neither provider ever returns no_seats — the seat gate is the platform's", async () => {
    graphMock.assignLicense.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(okResponse({ status: 'success' }));

    const outcomes = [
      await graph.assignLicense(UPN, SKU, {}),
      await n8n.assignLicense(UPN, SKU, {}),
    ];

    for (const outcome of outcomes) {
      expect(outcome.status).not.toBe('no_seats');
    }
  });
});
