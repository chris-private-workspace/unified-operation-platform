import { ServiceNowService } from './servicenow.service';
import { ServiceNowLookupService } from './servicenow-lookup.service';

/**
 * CH-013 / ADR-0021 D6.
 *
 * Two things this file is actually here to catch:
 *
 *  1. **The active-task verdict.** `importable` decides whether an operator is
 *     allowed to import a RITM at all, and getting it backwards is silent —
 *     the import succeeds and the failure surfaces one assign later, as a
 *     ticket nobody can close (ADR-0018 D3). So 0 / 1 / 2 are asserted
 *     separately rather than through a shared helper that could carry the same
 *     off-by-one into the assertion.
 *
 *  2. **That this stays read-only.** Every method here is a GET today. Nothing
 *     structurally stops a future edit from adding a write, and a write on the
 *     preview path would fire on every button press. `expect(...).not
 *     .toHaveBeenCalled()` on the mutating methods is the only thing that would
 *     go red.
 */
describe('ServiceNowLookupService', () => {
  let snow: {
    getRecordByNumber: jest.Mock;
    query: jest.Mock;
    updateRecord: jest.Mock;
    createRecord: jest.Mock;
  };
  let lookup: ServiceNowLookupService;

  const REQ = {
    sys_id: 'REQ_SYS',
    number: 'REQ0044038',
    short_description: 'Create a new O365 user license maintenance request',
    opened_at: '2026-07-30 06:01:33',
  };

  /** sys_id → the active tasks the instance would return for that RITM. */
  let tasksByRitm: Record<string, unknown[]>;
  let ritms: unknown[];

  const task = (n: string) => ({ sys_id: `T_${n}`, number: n, state: '1' });

  beforeEach(() => {
    ritms = [
      { sys_id: 'RITM_A', number: 'RITM0047331', short_description: 'O365' },
    ];
    tasksByRitm = { RITM_A: [task('SCTASK0071802')] };

    snow = {
      getRecordByNumber: jest.fn().mockResolvedValue(REQ),
      query: jest.fn().mockImplementation((q: string, table: string) => {
        if (table === 'sc_request') return Promise.resolve([REQ]);
        if (table === 'sc_req_item') return Promise.resolve(ritms);
        if (table === 'sc_task') {
          // `request_item=<sysId>^active=true`
          const sysId = q
            .replace('request_item=', '')
            .replace('^active=true', '');
          return Promise.resolve(tasksByRitm[sysId] ?? []);
        }
        return Promise.resolve([]);
      }),
      updateRecord: jest.fn(),
      createRecord: jest.fn(),
    };
    lookup = new ServiceNowLookupService(snow as unknown as ServiceNowService);
  });

  describe('lookupByNumber', () => {
    it('returns null when the request is not found', async () => {
      snow.getRecordByNumber.mockResolvedValue(null);

      await expect(lookup.lookupByNumber('REQ0000000')).resolves.toBeNull();
      // It must not go hunting for items of a request that does not exist.
      expect(snow.query).not.toHaveBeenCalled();
    });

    it('walks REQ → RITM → active tasks with the expected queries', async () => {
      const result = await lookup.lookupByNumber('REQ0044038');

      expect(snow.getRecordByNumber).toHaveBeenCalledWith(
        'REQ0044038',
        'sc_request',
      );
      expect(snow.query).toHaveBeenCalledWith(
        'request=REQ_SYS',
        'sc_req_item',
        50,
      );
      expect(snow.query).toHaveBeenCalledWith(
        'request_item=RITM_A^active=true',
        'sc_task',
        20,
      );
      expect(result).toMatchObject({
        number: 'REQ0044038',
        sysId: 'REQ_SYS',
        items: [{ number: 'RITM0047331', sysId: 'RITM_A' }],
      });
    });

    it('returns an empty item list when the request has no RITM', async () => {
      ritms = [];

      const result = await lookup.lookupByNumber('REQ0044038');

      expect(result?.items).toEqual([]);
    });

    it('falls back to sys_created_on when opened_at is absent', async () => {
      snow.getRecordByNumber.mockResolvedValue({
        ...REQ,
        opened_at: '',
        sys_created_on: '2026-07-30 06:00:00',
      });

      const result = await lookup.lookupByNumber('REQ0044038');

      expect(result?.openedAt).toBe('2026-07-30 06:00:00');
    });
  });

  describe('the active-task verdict (ADR-0018 D3)', () => {
    it('exactly one active task → importable, no reason', async () => {
      const result = await lookup.lookupByNumber('REQ0044038');

      expect(result?.items[0]).toMatchObject({
        activeTaskCount: 1,
        importable: true,
        blockedReason: null,
      });
    });

    it('zero active tasks → not importable, says there is nothing to close', async () => {
      tasksByRitm = { RITM_A: [] };

      const result = await lookup.lookupByNumber('REQ0044038');

      expect(result?.items[0]).toMatchObject({
        activeTaskCount: 0,
        importable: false,
      });
      expect(result?.items[0].blockedReason).toMatch(/nothing to close/i);
    });

    it('two active tasks → not importable, says it cannot tell which is its own', async () => {
      tasksByRitm = { RITM_A: [task('SCTASK1'), task('SCTASK2')] };

      const result = await lookup.lookupByNumber('REQ0044038');

      expect(result?.items[0]).toMatchObject({
        activeTaskCount: 2,
        importable: false,
      });
      expect(result?.items[0].blockedReason).toMatch(/cannot tell which/i);
    });

    it('judges each RITM on its own tasks, not on the request as a whole', async () => {
      ritms = [
        { sys_id: 'RITM_A', number: 'RITM_1', short_description: 'ok' },
        { sys_id: 'RITM_B', number: 'RITM_2', short_description: 'blocked' },
      ];
      tasksByRitm = { RITM_A: [task('SCTASK1')], RITM_B: [] };

      const result = await lookup.lookupByNumber('REQ0044038');

      expect(result?.items.map((i) => i.importable)).toEqual([true, false]);
    });
  });

  describe('listRecent', () => {
    it('returns the same shape as lookupByNumber, task counts included', async () => {
      const result = await lookup.listRecent(15);

      expect(snow.query).toHaveBeenCalledWith(
        'ORDERBYDESCsys_created_on',
        'sc_request',
        15,
      );
      expect(result).toHaveLength(1);
      expect(result[0].items[0]).toMatchObject({
        number: 'RITM0047331',
        activeTaskCount: 1,
        importable: true,
      });
    });
  });

  describe('🔴 read-only', () => {
    it('lookupByNumber writes nothing', async () => {
      await lookup.lookupByNumber('REQ0044038');

      expect(snow.updateRecord).not.toHaveBeenCalled();
      expect(snow.createRecord).not.toHaveBeenCalled();
    });

    it('listRecent writes nothing', async () => {
      await lookup.listRecent();

      expect(snow.updateRecord).not.toHaveBeenCalled();
      expect(snow.createRecord).not.toHaveBeenCalled();
    });
  });
});
