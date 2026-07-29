import { ConfigService } from '@nestjs/config';
import { ServiceNowService } from '../servicenow/servicenow.service';
import { ConnectorConfigService } from '../connector-config.service';
import { DirectTicketProvider } from './direct-ticket.provider';
import { N8nTicketProvider } from './n8n-ticket.provider';
import { TicketUpdateProvider } from './ticket-update.provider';

/**
 * Seam ④'s contract — REWRITTEN BY CH-010, and the rewrite is the point.
 *
 * W40 wrote this file to assert the opposite of what it asserts now: same
 * situation, both providers, same outcome. That was correct while both wrote
 * the RITM's state. It stopped being correct when CH-010 moved the direct
 * implementation onto the catalog task, because workflow 2004 has sc_req_item
 * baked into its patch URL and cannot follow.
 *
 * The honest thing is not to relax the old assertions until they pass again —
 * that would leave a file claiming an equivalence that no longer exists. It is
 * to assert the two facts that ARE true now:
 *
 *   1. the two providers no longer do the same thing, and
 *   2. the n8n one refuses rather than doing the old thing quietly.
 *
 * When 2004 gains catalog-task support, this file goes back to the equivalence
 * shape — and until then it fails the moment someone "fixes" the n8n provider
 * by letting it patch the RITM again.
 */
describe('ticket-update seam contract (CH-010: a deliberate, contained divergence)', () => {
  let snow: {
    query: jest.Mock;
    updateRecord: jest.Mock;
    getIntegrationUserSysId: jest.Mock;
  };
  let fetchMock: jest.Mock;
  let direct: DirectTicketProvider;
  /**
   * Typed as the abstract for the same reason the n8n spec does: the factory
   * hands callers a `TicketUpdateProvider`, and the refusing implementation
   * narrows its signature by dropping the note it cannot use.
   */
  let n8n: TicketUpdateProvider;

  beforeEach(() => {
    snow = {
      query: jest
        .fn()
        .mockResolvedValue([
          { sys_id: 'TASK1', number: 'SCTASK001', assigned_to: 'someone' },
        ]),
      updateRecord: jest.fn().mockResolvedValue({ state: '3' }),
      getIntegrationUserSysId: jest.fn().mockResolvedValue('INTEGRATION_USER'),
    };
    direct = new DirectTicketProvider(snow as unknown as ServiceNowService);

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    n8n = new N8nTicketProvider(
      { get: () => 'key' } as unknown as ConfigService,
      {
        resolve: async () => 'https://n8n.example.com/webhook',
      } as unknown as ConnectorConfigService,
    );
  });

  describe('the direct provider carries the decision to the catalog task', () => {
    it('closeComplete moves the task and reports the outcome', async () => {
      await expect(direct.closeComplete('RITM1', 'fulfilled')).resolves.toEqual(
        { status: 'updated', newState: '3' },
      );
      expect(snow.updateRecord).toHaveBeenCalledWith(
        'TASK1',
        expect.objectContaining({ state: '3' }),
        'sc_task',
      );
    });

    it('markInProgress does the same with state 2', async () => {
      snow.updateRecord.mockResolvedValue({ state: '2' });

      await expect(
        direct.markInProgress('RITM1', 'procurement'),
      ).resolves.toEqual({ status: 'updated', newState: '2' });
      expect(snow.updateRecord).toHaveBeenCalledWith(
        'TASK1',
        expect.objectContaining({ state: '2' }),
        'sc_task',
      );
    });
  });

  /**
   * 🔴 The containment. Three ways of getting this wrong, each asserted, because
   * each is a plausible "fix" for a provider that currently refuses:
   *
   *   returning an outcome  → the caller would record a fulfilled ticket
   *   calling 2004 anyway   → the two switch positions would do different
   *                           things to a customer's ticket (D0)
   *   silently delegating   → the switch would not mean what it says
   */
  describe('the n8n provider refuses instead of doing the old thing', () => {
    it('closeComplete throws rather than returning an outcome', async () => {
      await expect(n8n.closeComplete('RITM1', 'n')).rejects.toThrow(
        /catalog task/i,
      );
    });

    it('markInProgress throws too', async () => {
      await expect(n8n.markInProgress('RITM1', 'n')).rejects.toThrow(
        /catalog task/i,
      );
    });

    it('never calls workflow 2004', async () => {
      await expect(n8n.closeComplete('RITM1', 'n')).rejects.toThrow();
      await expect(n8n.markInProgress('RITM1', 'n')).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never reaches the Table API either — it does not quietly become direct', async () => {
      await expect(n8n.closeComplete('RITM1', 'n')).rejects.toThrow();
      expect(snow.updateRecord).not.toHaveBeenCalled();
      expect(snow.query).not.toHaveBeenCalled();
    });

    /**
     * The message is the whole remedy: whoever hits this needs to know the
     * switch is the problem, not ServiceNow.
     */
    it('says what to do about it', async () => {
      await expect(n8n.closeComplete('RITM1', 'n')).rejects.toThrow(/direct/i);
    });
  });

  /**
   * Unchanged from W40 and still true: the vendor being unreachable is the
   * absence of an outcome, not one of its values.
   */
  describe('the vendor is unreachable', () => {
    it('direct lets the failure through instead of reporting an outcome', async () => {
      snow.updateRecord.mockRejectedValue(new Error('ServiceNow down'));
      await expect(direct.closeComplete('RITM1', 'n')).rejects.toThrow();
    });
  });

  /**
   * Also unchanged: when ServiceNow refuses the patch, the direct provider
   * surfaces it as a thrown failure. Reporting a ticket as closed while it
   * never moved is the failure mode this seam must not have — and CH-010 exists
   * because a subtler version of exactly that was happening.
   */
  it('a refused patch surfaces as a failure, never as updated', async () => {
    snow.updateRecord.mockRejectedValue(
      new Error('ServiceNow request failed (403)'),
    );
    await expect(direct.closeComplete('RITM1', 'n')).rejects.toThrow();
  });
});
