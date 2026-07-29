import { Injectable, Logger } from '@nestjs/common';
import {
  ServiceNowRecord,
  ServiceNowService,
  ServiceNowUpdate,
} from '../servicenow/servicenow.service';
import {
  TASK_STATE,
  TASK_TABLE,
  TicketUpdateOutcome,
  TicketUpdateProvider,
} from './ticket-update.provider';

/**
 * Default implementation of seam ④ — CH-010 / ADR-0018.
 *
 * Takes a RITM sys_id, finds the catalog task the platform is responsible for,
 * and moves THAT. ServiceNow's own workflow moves the RITM.
 *
 * Before CH-010 this patched the RITM's state directly. On Ricoh's instance
 * that does not actually close the request — RITM state is driven by its
 * catalog tasks — so the platform was reporting fulfilment for tickets that
 * stayed open, with nothing on either side raising a complaint.
 *
 * Transport failures propagate untouched (see the error contract in
 * ticket-update.provider.ts): ServiceNowService already throws on any non-2xx,
 * and the callers of this seam queue that failure rather than surface it.
 */
@Injectable()
export class DirectTicketProvider extends TicketUpdateProvider {
  private readonly logger = new Logger(DirectTicketProvider.name);

  constructor(private readonly snow: ServiceNowService) {
    super();
  }

  async markInProgress(
    sysId: string,
    note: string,
  ): Promise<TicketUpdateOutcome> {
    return this.moveTask(sysId, TASK_STATE.workInProgress, {
      work_notes: note,
    });
  }

  async closeComplete(
    sysId: string,
    note: string,
  ): Promise<TicketUpdateOutcome> {
    return this.moveTask(sysId, TASK_STATE.closedComplete, {
      close_notes: note,
    });
  }

  /**
   * One shared write, because the only difference between the two transitions
   * is the state + note field above.
   *
   * Returns `error` — rather than throwing — when the task cannot be identified.
   * That is a real answer about this ticket ("we looked, and could not tell
   * which task is ours"), not the absence of one, which is what throwing means
   * in this seam.
   */
  private async moveTask(
    ritmSysId: string,
    state: string,
    notes: ServiceNowUpdate,
  ): Promise<TicketUpdateOutcome> {
    const task = await this.pickTask(ritmSysId);
    if ('error' in task) return task.error;

    const fields: ServiceNowUpdate = { state, ...notes };

    /**
     * `Validate "Assigned to" before close` rejects a close on an unassigned
     * task with HTTP 403. The platform fills the gap with the integration
     * account, because that is who actually did the work.
     *
     * 🔴 Only when the field is EMPTY. Overwriting an assignee would take a
     * human's ticket away from them to satisfy a rule that is already
     * satisfied — and unlike a failed close, nobody would ever see it happen.
     */
    if (!this.assignedTo(task.record)) {
      const me = await this.snow.getIntegrationUserSysId();
      if (!me) {
        this.logger.error(
          `Cannot set assigned_to on task ${String(
            task.record.number,
          )}: the integration account was not found in sys_user`,
        );
        return {
          status: 'error',
          details:
            'The catalog task has no assignee and the integration account could not be resolved, so ServiceNow would reject the update.',
        };
      }
      fields.assigned_to = me;
    }

    const updated = await this.snow.updateRecord(
      String(task.record.sys_id),
      fields,
      TASK_TABLE,
    );

    // ServiceNow does not always echo the field back; reporting null would tell
    // the caller "unknown" about a patch it had just accepted.
    const reported = updated?.state;
    return {
      status: 'updated',
      newState: reported == null ? state : String(reported),
    };
  }

  /**
   * The platform's task = the ONE active task under that RITM (ADR-0018 D3).
   *
   * 🔴 Zero or several → fail closed, touch nothing. Picking "the first one"
   * would eventually close a task belonging to someone else's queue, and the
   * ticket would look correctly handled afterwards.
   *
   * Both branches are real. 772 RITMs sampled on 2026-07-29 had at most one
   * active task each — but RITM0047290, a `D365 User License Maintenance
   * Request` (exactly the kind this seam is handed), has two. A rule that holds
   * in a sample is not a rule.
   */
  private async pickTask(
    ritmSysId: string,
  ): Promise<{ record: ServiceNowRecord } | { error: TicketUpdateOutcome }> {
    const tasks = await this.snow.query(
      `request_item=${ritmSysId}^active=true`,
      TASK_TABLE,
      20,
    );

    if (tasks.length === 1) return { record: tasks[0] };

    // H4: the RITM sys_id is an opaque identifier, not PII — and it is the only
    // thing that makes this log actionable.
    this.logger.warn(
      `Cannot identify the catalog task for RITM ${ritmSysId}: found ${tasks.length} active tasks (expected exactly 1)`,
    );
    return {
      error: {
        status: 'error',
        details:
          tasks.length === 0
            ? 'The request has no open catalog task, so there is nothing for the platform to close.'
            : `The request has ${tasks.length} open catalog tasks, so the platform cannot tell which one is its own.`,
      },
    };
  }

  /**
   * Reference fields come back as `{ value, link }` from the Table API, or as a
   * bare string when the caller asked for display values. Empty is `''` in the
   * first shape's `value` — not undefined — so a plain truthiness check on the
   * field object would call every unassigned task assigned.
   */
  private assignedTo(record: ServiceNowRecord): string | null {
    const raw: unknown = record.assigned_to;
    if (!raw) return null;
    if (typeof raw === 'string') return raw || null;
    const value = (raw as { value?: unknown }).value;
    return typeof value === 'string' && value !== '' ? value : null;
  }
}
