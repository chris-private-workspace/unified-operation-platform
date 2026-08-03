import { ConfigService } from '@nestjs/config';
import { ConnectorConfigService } from '../connector-config.service';
import { N8nTicketProvider } from './n8n-ticket.provider';
import {
  TicketUpdateProvider,
  type TicketTarget,
} from './ticket-update.provider';

const RITM: TicketTarget = { kind: 'ritm', sysId: 'RITMSYS1' };
const TASK: TicketTarget = { kind: 'task', sysId: 'TASKSYS1' };

/**
 * CH-010 — this provider refuses, and the refusal is the behaviour under test.
 *
 * W40's version of this file asserted what workflow 2004 receives. Those tests
 * were removed with the client they covered: seam ④ now moves the RITM's
 * catalog task, and 2004 has `sc_req_item` baked into its patch URL, so there
 * is no longer a correct call for it to make.
 *
 * What replaces them is narrower but load-bearing. A provider that throws is an
 * obvious candidate for someone to "fix", and every plausible fix is wrong in a
 * way that would not be visible afterwards:
 *
 *   returning an outcome  → the caller records a fulfilled ticket that never
 *                           moved
 *   calling 2004 anyway   → the two switch positions do different things to a
 *                           customer's ticket (ADR-0017 D0)
 *   delegating to direct  → the switch stops meaning what it says
 */
describe('N8nTicketProvider (refusal — CH-010 / ADR-0018 D6)', () => {
  let fetchMock: jest.Mock;
  /**
   * Typed as the ABSTRACT, not the concrete class — that is how every caller
   * receives it (the factory provides `TicketUpdateProvider`). The refusing
   * implementation narrows its signature by dropping the unused note, which is
   * legal for an override; exercising it through the base keeps the test on the
   * surface production actually calls.
   */
  let provider: TicketUpdateProvider;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = new N8nTicketProvider(
      { get: () => 'shhh-secret-value' } as unknown as ConfigService,
      {
        resolve: jest.fn().mockResolvedValue('https://n8n.example.com/webhook'),
      } as unknown as ConnectorConfigService,
    );
  });

  describe('both transitions refuse', () => {
    it('closeComplete throws rather than returning an outcome', async () => {
      await expect(provider.closeComplete(RITM, 'n')).rejects.toThrow(
        /catalog task/i,
      );
    });

    it('markInProgress throws rather than returning an outcome', async () => {
      await expect(provider.markInProgress(RITM, 'n')).rejects.toThrow(
        /catalog task/i,
      );
    });
  });

  /**
   * CH-020 / ADR-0024 D4 — a task target answers instead of throwing.
   *
   * Not an inconsistency. Throwing means "the provider could not answer"; 2004
   * CAN answer about a catalog task, and its answer is that it does not address
   * them at all. That is the definition of the `error` outcome in this seam. The
   * caller queues both identically (ADR-0011 OD4), so nothing downstream cares —
   * but the failure row reads as a capability gap rather than an outage.
   */
  describe('a catalog task target answers rather than throwing', () => {
    it('closeComplete reports an error outcome', async () => {
      await expect(provider.closeComplete(TASK, 'n')).resolves.toEqual({
        status: 'error',
        details: expect.stringMatching(/catalog task/i) as unknown as string,
      });
    });

    it('markInProgress reports an error outcome', async () => {
      const outcome = await provider.markInProgress(TASK, 'n');
      expect(outcome.status).toBe('error');
    });

    it('still reaches no HTTP endpoint', async () => {
      await provider.closeComplete(TASK, 'n');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never lets the shared secret into the outcome either', async () => {
      const outcome = await provider.closeComplete(TASK, 'n');
      expect(JSON.stringify(outcome)).not.toContain('shhh-secret-value');
    });
  });

  /**
   * The negative halves. Without these, a "fix" that quietly restores the old
   * RITM patch — or that borrows the direct provider — would leave every
   * assertion above still passing.
   */
  describe('it does not quietly do something else instead', () => {
    it('never calls workflow 2004', async () => {
      await expect(provider.closeComplete(RITM, 'n')).rejects.toThrow();
      await expect(provider.markInProgress(RITM, 'n')).rejects.toThrow();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never reaches any HTTP endpoint at all', async () => {
      await expect(provider.closeComplete(RITM, 'n')).rejects.toThrow();
      expect(fetchMock.mock.calls).toHaveLength(0);
    });
  });

  /**
   * The message IS the remedy: whoever hits this in a failure queue needs to
   * learn that the switch is the problem, not ServiceNow being down — and what
   * to set it to.
   */
  describe('the error explains itself', () => {
    it('names the connector setting to change', async () => {
      await expect(provider.closeComplete(RITM, 'n')).rejects.toThrow(
        /direct/i,
      );
    });

    it('names the ADR that decided it', async () => {
      await expect(provider.markInProgress(RITM, 'n')).rejects.toThrow(
        /ADR-0018/,
      );
    });

    /**
     * H4 — kept from W40. The provider still holds the webhook key; an error
     * message is the classic place for a secret to escape.
     */
    it('never lets the shared secret into the error', async () => {
      await expect(provider.closeComplete(RITM, 'n')).rejects.toThrow(
        expect.not.stringContaining('shhh-secret-value') as unknown as string,
      );
    });
  });
});
