import { ServiceNowService } from '../servicenow/servicenow.service';
import { DirectTicketProvider } from './direct-ticket.provider';
import type { TicketTarget } from './ticket-update.provider';

/**
 * CH-020 — every pre-existing case below addresses a RITM, exactly as it did
 * when the parameter was a bare sys_id. Only the call shape moved; not one
 * assertion changed, which is the point: `kind: 'ritm'` must still mean what it
 * meant before the union existed.
 */
const RITM: TicketTarget = { kind: 'ritm', sysId: 'RITM_SYS' };
const TASK: TicketTarget = { kind: 'task', sysId: 'TASK_SYS' };

/**
 * CH-010 — what the default implementation actually sends.
 *
 * Two things decide whether this seam is safe, and neither fails loudly if it
 * is wrong:
 *
 *  1. WHICH RECORD it patches. Patching the RITM looks successful (ServiceNow
 *     answers 200) while the request stays open — the bug CH-010 fixes.
 *  2. WHICH TASK it picks. Closing the wrong one closes someone else's work,
 *     and the ticket looks correctly handled afterwards.
 *
 * So both are asserted literally rather than through helpers that could carry
 * the same mistake into the assertion.
 */
describe('DirectTicketProvider', () => {
  let snow: {
    query: jest.Mock;
    updateRecord: jest.Mock;
    getIntegrationUserSysId: jest.Mock;
  };
  let provider: DirectTicketProvider;

  /** One active task, already assigned — the simple case. */
  const assignedTask = {
    sys_id: 'TASK1',
    number: 'SCTASK001',
    assigned_to: { value: 'someone', link: 'x' },
  };
  /** Reference fields come back as { value: '' } when empty, not undefined. */
  const unassignedTask = {
    sys_id: 'TASK1',
    number: 'SCTASK001',
    assigned_to: { value: '', link: '' },
  };

  beforeEach(() => {
    snow = {
      query: jest.fn().mockResolvedValue([assignedTask]),
      updateRecord: jest.fn().mockResolvedValue({ state: '3' }),
      getIntegrationUserSysId: jest.fn().mockResolvedValue('INTEGRATION_USER'),
    };
    provider = new DirectTicketProvider(snow as unknown as ServiceNowService);
  });

  describe('it moves the catalog task, never the RITM', () => {
    it('closeComplete patches state 3 + close_notes on sc_task', async () => {
      const outcome = await provider.closeComplete(RITM, 'fulfilled');

      expect(snow.query).toHaveBeenCalledWith(
        'request_item=RITM_SYS^active=true',
        'sc_task',
        20,
      );
      expect(snow.updateRecord).toHaveBeenCalledWith(
        'TASK1',
        { state: '3', close_notes: 'fulfilled' },
        'sc_task',
      );
      expect(outcome).toEqual({ status: 'updated', newState: '3' });
    });

    it('markInProgress patches state 2 + work_notes on sc_task', async () => {
      snow.updateRecord.mockResolvedValue({ state: '2' });

      const outcome = await provider.markInProgress(RITM, 'procurement');

      expect(snow.updateRecord).toHaveBeenCalledWith(
        'TASK1',
        { state: '2', work_notes: 'procurement' },
        'sc_task',
      );
      expect(outcome).toEqual({ status: 'updated', newState: '2' });
    });

    /**
     * The regression CH-010 exists to prevent. Before it, both methods wrote to
     * sc_req_item — which ServiceNow accepts and which leaves the request open.
     */
    it('never writes to sc_req_item', async () => {
      await provider.closeComplete(RITM, 'n');
      await provider.markInProgress(RITM, 'n');

      for (const call of snow.updateRecord.mock.calls) {
        expect(call[2]).toBe('sc_task');
      }
      for (const call of snow.query.mock.calls) {
        expect(call[1]).toBe('sc_task');
      }
    });

    it('never sends close_notes on a hold, or work_notes on a close', async () => {
      await provider.markInProgress(RITM, 'n');
      expect(snow.updateRecord.mock.calls[0][1]).not.toHaveProperty(
        'close_notes',
      );

      await provider.closeComplete(RITM, 'n');
      expect(snow.updateRecord.mock.calls[1][1]).not.toHaveProperty(
        'work_notes',
      );
    });
  });

  /**
   * `Validate "Assigned to" before close` rejects an unassigned close with 403.
   * Proven live on 2026-07-29: the same task refused `{state:'3'}` and accepted
   * `{assigned_to, state:'3'}`.
   */
  describe('assigned_to', () => {
    it('fills an empty assignee with the integration account', async () => {
      snow.query.mockResolvedValue([unassignedTask]);

      await provider.closeComplete(RITM, 'fulfilled');

      expect(snow.updateRecord).toHaveBeenCalledWith(
        'TASK1',
        {
          state: '3',
          close_notes: 'fulfilled',
          assigned_to: 'INTEGRATION_USER',
        },
        'sc_task',
      );
    });

    /**
     * 🔴 The one that matters. Taking a human's ticket away from them to satisfy
     * a rule that is already satisfied would be invisible — the close succeeds
     * either way.
     */
    it('never overwrites an assignee that is already set', async () => {
      await provider.closeComplete(RITM, 'fulfilled');

      expect(snow.updateRecord.mock.calls[0][1]).not.toHaveProperty(
        'assigned_to',
      );
      expect(snow.getIntegrationUserSysId).not.toHaveBeenCalled();
    });

    it('treats a missing assigned_to field as unassigned', async () => {
      snow.query.mockResolvedValue([{ sys_id: 'TASK1', number: 'SCTASK001' }]);

      await provider.closeComplete(RITM, 'n');

      expect(snow.updateRecord.mock.calls[0][1]).toHaveProperty(
        'assigned_to',
        'INTEGRATION_USER',
      );
    });

    /**
     * Without an assignee ServiceNow would answer 403. Saying so up front beats
     * attempting the patch and reporting the vendor's refusal.
     */
    it('reports an error instead of patching when the integration account cannot be resolved', async () => {
      snow.query.mockResolvedValue([unassignedTask]);
      snow.getIntegrationUserSysId.mockResolvedValue(null);

      const outcome = await provider.closeComplete(RITM, 'n');

      expect(outcome.status).toBe('error');
      expect(snow.updateRecord).not.toHaveBeenCalled();
    });
  });

  /**
   * ADR-0018 D3 — fail closed. Both branches are real: 772 RITMs sampled had at
   * most one active task, but RITM0047290 (a D365 User License Maintenance
   * Request — exactly the kind this seam is handed) has two.
   */
  describe('picking the task', () => {
    it('patches nothing when the RITM has no open task', async () => {
      snow.query.mockResolvedValue([]);

      const outcome = await provider.closeComplete(RITM, 'n');

      expect(outcome.status).toBe('error');
      expect(snow.updateRecord).not.toHaveBeenCalled();
    });

    it('patches nothing when the RITM has several open tasks', async () => {
      snow.query.mockResolvedValue([
        { sys_id: 'TASK1', number: 'SCTASK001' },
        { sys_id: 'TASK2', number: 'SCTASK002' },
      ]);

      const outcome = await provider.closeComplete(RITM, 'n');

      expect(outcome.status).toBe('error');
      expect(snow.updateRecord).not.toHaveBeenCalled();
    });

    it('applies the same rule to markInProgress', async () => {
      snow.query.mockResolvedValue([]);

      const outcome = await provider.markInProgress(RITM, 'n');

      expect(outcome.status).toBe('error');
      expect(snow.updateRecord).not.toHaveBeenCalled();
    });
  });

  /**
   * Error contract: transport failures propagate. This seam must NOT swallow
   * them or convert them into an `error` outcome — its callers queue the
   * failure (ADR-0011 OD4), and an outcome would look to them like ServiceNow
   * had answered.
   */
  describe('error contract', () => {
    it('lets a failed patch throw instead of reporting an outcome', async () => {
      snow.updateRecord.mockRejectedValue(
        new Error('ServiceNow request failed (503)'),
      );

      await expect(provider.closeComplete(RITM, 'n')).rejects.toThrow(
        'ServiceNow request failed (503)',
      );
    });

    it('lets a failed task lookup throw as well', async () => {
      snow.query.mockRejectedValue(
        new Error('ServiceNow request failed (503)'),
      );

      await expect(provider.closeComplete(RITM, 'n')).rejects.toThrow();
    });
  });

  /**
   * CH-020 / ADR-0024 D4 + D5 — the caller already knows the task.
   *
   * The `pickTask` query above filters on `^active=true`, so a closed task
   * simply is not in its results. Nothing filters a caller-supplied sys_id, so
   * these cases are the only thing standing between the platform and re-closing
   * a task somebody else finished (REQ0044049's SCTASK0071807 did exactly that
   * after intake).
   */
  describe('closing a task the caller already knows', () => {
    /** `active` is a string in the Table API's default (raw value) mode. */
    const openTask = {
      sys_id: 'TASK_SYS',
      number: 'SCTASK900',
      active: 'true',
      assigned_to: { value: 'someone', link: 'x' },
    };

    it('looks the task up by sys_id and never runs the RITM query', async () => {
      snow.query.mockResolvedValue([openTask]);

      const outcome = await provider.closeComplete(TASK, 'fulfilled');

      expect(snow.query).toHaveBeenCalledWith('sys_id=TASK_SYS', 'sc_task', 1);
      // The regression this whole change exists to prevent: feeding a task
      // sys_id to `request_item=` finds nothing, every time, silently.
      for (const call of snow.query.mock.calls) {
        expect(String(call[0])).not.toContain('request_item=');
      }
      expect(snow.updateRecord).toHaveBeenCalledWith(
        'TASK_SYS',
        { state: '3', close_notes: 'fulfilled' },
        'sc_task',
      );
      expect(outcome).toEqual({ status: 'updated', newState: '3' });
    });

    it('accepts a boolean active as well as the string form', async () => {
      snow.query.mockResolvedValue([{ ...openTask, active: true }]);

      const outcome = await provider.closeComplete(TASK, 'fulfilled');

      expect(outcome.status).toBe('updated');
    });

    it('🔴 refuses to move a task that is no longer open', async () => {
      snow.query.mockResolvedValue([{ ...openTask, active: 'false' }]);

      const outcome = await provider.closeComplete(TASK, 'fulfilled');

      expect(outcome.status).toBe('error');
      expect(snow.updateRecord).not.toHaveBeenCalled();
    });

    /**
     * Fail closed on an indeterminate answer. A task whose `active` we cannot
     * read is not evidence that it is open, and being wrong here reopens
     * somebody else's finished work.
     */
    it('refuses when ServiceNow reports no active field at all', async () => {
      snow.query.mockResolvedValue([
        { sys_id: 'TASK_SYS', number: 'SCTASK900' },
      ]);

      const outcome = await provider.closeComplete(TASK, 'fulfilled');

      expect(outcome.status).toBe('error');
      expect(snow.updateRecord).not.toHaveBeenCalled();
    });

    it('reports an error when the task does not exist', async () => {
      snow.query.mockResolvedValue([]);

      const outcome = await provider.closeComplete(TASK, 'fulfilled');

      expect(outcome.status).toBe('error');
      expect(snow.updateRecord).not.toHaveBeenCalled();
    });

    it('fills an empty assignee on this path too', async () => {
      snow.query.mockResolvedValue([
        { ...openTask, assigned_to: { value: '', link: '' } },
      ]);

      await provider.closeComplete(TASK, 'fulfilled');

      expect(snow.updateRecord.mock.calls[0][1]).toHaveProperty(
        'assigned_to',
        'INTEGRATION_USER',
      );
    });

    it('never overwrites an assignee on this path either', async () => {
      snow.query.mockResolvedValue([openTask]);

      await provider.closeComplete(TASK, 'fulfilled');

      expect(snow.updateRecord.mock.calls[0][1]).not.toHaveProperty(
        'assigned_to',
      );
    });

    it('applies the same active gate to markInProgress', async () => {
      snow.query.mockResolvedValue([{ ...openTask, active: 'false' }]);

      const outcome = await provider.markInProgress(TASK, 'procurement');

      expect(outcome.status).toBe('error');
      expect(snow.updateRecord).not.toHaveBeenCalled();
    });

    it('lets a failed lookup throw rather than reporting "not found"', async () => {
      snow.query.mockRejectedValue(
        new Error('ServiceNow request failed (503)'),
      );

      await expect(provider.closeComplete(TASK, 'n')).rejects.toThrow(
        'ServiceNow request failed (503)',
      );
    });
  });

  it('falls back to the requested state when ServiceNow echoes no state', async () => {
    snow.updateRecord.mockResolvedValue({});

    await expect(provider.closeComplete(RITM, 'n')).resolves.toEqual({
      status: 'updated',
      newState: '3',
    });
  });
});
