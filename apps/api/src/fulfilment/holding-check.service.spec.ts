import { Test } from '@nestjs/testing';
import { GraphService } from '../integration/graph/graph.service';
import { HOLDING_STATUS, HoldingCheckService } from './holding-check.service';

/**
 * CH-029 / ADR-0034 D1 + D6.
 *
 * The three answers are the point. A boolean would have been enough for
 * "held / not held", and the day the read fails it would silently join the
 * "not held" bucket — which is a lie the ledger then acts on.
 */
describe('HoldingCheckService', () => {
  let service: HoldingCheckService;
  let graph: { getUserAssignedSkuIds: jest.Mock };

  const SPE_E3 = '05e9a617-0261-4cee-bb44-138d3ef5d965';
  const SPE_E5 = 'c7df2760-2c81-4ef7-b578-5b5392b571df';

  beforeEach(async () => {
    graph = { getUserAssignedSkuIds: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        HoldingCheckService,
        { provide: GraphService, useValue: graph },
      ],
    }).compile();
    service = moduleRef.get(HoldingCheckService);
  });

  it('reports HELD when the user carries that SKU', async () => {
    graph.getUserAssignedSkuIds.mockResolvedValue([SPE_E5, SPE_E3]);

    await expect(service.check('a.user@rhk.com', SPE_E3)).resolves.toBe(
      HOLDING_STATUS.HELD,
    );
  });

  it('reports NOT_HELD when the user carries other SKUs', async () => {
    graph.getUserAssignedSkuIds.mockResolvedValue([SPE_E5]);

    await expect(service.check('a.user@rhk.com', SPE_E3)).resolves.toBe(
      HOLDING_STATUS.NOT_HELD,
    );
  });

  it('reports NOT_HELD for a user with no licences at all', async () => {
    graph.getUserAssignedSkuIds.mockResolvedValue([]);

    await expect(service.check('a.user@rhk.com', SPE_E3)).resolves.toBe(
      HOLDING_STATUS.NOT_HELD,
    );
  });

  /**
   * The GUID is the key, everywhere (DESIGN §5). A part-number comparison would
   * pass every test above and then fail on the live tenant, where two SKUs can
   * share a display name but never a GUID.
   */
  it('matches on the skuId GUID, never on anything else', async () => {
    graph.getUserAssignedSkuIds.mockResolvedValue([SPE_E5]);

    await expect(service.check('a.user@rhk.com', 'SPE_E5')).resolves.toBe(
      HOLDING_STATUS.NOT_HELD,
    );
  });

  describe('the read fails (ADR-0034 D6 — fail-open, loudly)', () => {
    const boom = () =>
      graph.getUserAssignedSkuIds.mockRejectedValue(
        Object.assign(new Error('AADSTS700038: expired credential'), {
          statusCode: -1,
        }),
      );

    /**
     * 🔴 The distinction this whole type exists for. UNKNOWN, not NOT_HELD:
     * a failed read that answered "no" would let the assign proceed *and* the
     * ledger increment, with a step reading like a check that passed.
     */
    it('answers UNKNOWN rather than NOT_HELD', async () => {
      boom();

      await expect(service.check('a.user@rhk.com', SPE_E3)).resolves.toBe(
        HOLDING_STATUS.UNKNOWN,
      );
    });

    /**
     * Fail-OPEN is a decision, not an accident (D6): this gate is accounting
     * accuracy, not a security boundary, so it may not stop a licence somebody
     * actually needs. Contrast sync-check, which wraps the same class of error
     * into a 503 — that gate is a statement of fact about whether the person
     * exists, and there is no assigning past it.
     */
    it('does not throw — a 503 here would make the gate fail CLOSED', async () => {
      boom();

      await expect(
        service.check('a.user@rhk.com', SPE_E3),
      ).resolves.toBeDefined();
    });

    // H4 / BUG-004: a /users/{upn} error is the likeliest place for a UPN to
    // come back inside a vendor message. Nothing this service logs may carry one.
    it('never logs the target UPN', async () => {
      boom();
      const warn = jest
        .spyOn(
          (service as unknown as { logger: { warn: (m: string) => void } })
            .logger,
          'warn',
        )
        .mockImplementation(() => undefined);

      await service.check('a.user@rhk.com', SPE_E3);

      expect(warn).toHaveBeenCalled();
      for (const call of warn.mock.calls) {
        expect(String(call[0])).not.toContain('a.user@rhk.com');
      }
    });
  });
});
