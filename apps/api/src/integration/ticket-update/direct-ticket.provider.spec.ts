import { ServiceNowService } from '../servicenow/servicenow.service';
import { DirectTicketProvider } from './direct-ticket.provider';

/**
 * W40 F1 — what the default implementation actually sends.
 *
 * The field maps are the whole contract with ServiceNow: state '2' vs '3', and
 * work_notes vs close_notes. Getting one of them wrong does not fail loudly —
 * it closes a ticket that should have been put on hold, or leaves a fulfilled
 * one open. So they are asserted literally rather than through a helper that
 * could carry the same mistake into the assertion.
 */
describe('DirectTicketProvider', () => {
  let snow: { updateRecord: jest.Mock };
  let provider: DirectTicketProvider;

  beforeEach(() => {
    snow = { updateRecord: jest.fn().mockResolvedValue({ state: '3' }) };
    provider = new DirectTicketProvider(snow as unknown as ServiceNowService);
  });

  it('markInProgress patches state 2 + work_notes on sc_req_item', async () => {
    snow.updateRecord.mockResolvedValue({ state: '2' });

    const outcome = await provider.markInProgress('SYS1', 'procurement');

    expect(snow.updateRecord).toHaveBeenCalledWith(
      'SYS1',
      { state: '2', work_notes: 'procurement' },
      'sc_req_item',
    );
    expect(outcome).toEqual({ status: 'updated', newState: '2' });
  });

  it('closeComplete patches state 3 + close_notes on sc_req_item', async () => {
    const outcome = await provider.closeComplete('SYS2', 'fulfilled');

    expect(snow.updateRecord).toHaveBeenCalledWith(
      'SYS2',
      { state: '3', close_notes: 'fulfilled' },
      'sc_req_item',
    );
    expect(outcome).toEqual({ status: 'updated', newState: '3' });
  });

  /**
   * The two transitions must not be able to leak into each other: a close that
   * also wrote work_notes, or a hold that wrote close_notes, would be visible
   * in ServiceNow as the wrong kind of ticket activity.
   */
  it('never sends close_notes on a hold, or work_notes on a close', async () => {
    await provider.markInProgress('SYS1', 'n');
    expect(snow.updateRecord.mock.calls[0][1]).not.toHaveProperty(
      'close_notes',
    );

    await provider.closeComplete('SYS1', 'n');
    expect(snow.updateRecord.mock.calls[1][1]).not.toHaveProperty('work_notes');
  });

  /**
   * Error contract: transport failures propagate. This seam must NOT swallow
   * them or convert them into an `error` outcome — its callers queue the
   * failure (ADR-0011 OD4), and an outcome would look to them like ServiceNow
   * had answered.
   */
  it('lets a transport failure throw instead of reporting an outcome', async () => {
    snow.updateRecord.mockRejectedValue(
      new Error('ServiceNow request failed (503)'),
    );

    await expect(provider.closeComplete('SYS1', 'n')).rejects.toThrow(
      'ServiceNow request failed (503)',
    );
  });

  /**
   * ServiceNow does not always echo the field back. Reporting null there would
   * tell the caller "unknown" about a patch ServiceNow had just accepted, so
   * the requested state is used instead — the one thing we do know.
   */
  it('falls back to the requested state when ServiceNow echoes no state', async () => {
    snow.updateRecord.mockResolvedValue({});

    await expect(provider.closeComplete('SYS1', 'n')).resolves.toEqual({
      status: 'updated',
      newState: '3',
    });
  });
});
