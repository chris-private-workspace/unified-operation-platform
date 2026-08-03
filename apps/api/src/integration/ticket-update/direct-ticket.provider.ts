import { Injectable, Logger } from '@nestjs/common';
import {
  ServiceNowRecord,
  ServiceNowService,
  ServiceNowUpdate,
} from '../servicenow/servicenow.service';
import {
  TASK_STATE,
  TASK_TABLE,
  TicketTarget,
  TicketUpdateOutcome,
  TicketUpdateProvider,
} from './ticket-update.provider';

/** Either the task to move, or the reason the platform will not move one. */
type TaskLookup = { record: ServiceNowRecord } | { error: TicketUpdateOutcome };

/**
 * Default implementation of seam ④ — CH-010 / ADR-0018.
 *
 * Moves a CATALOG TASK and lets ServiceNow's own workflow move the RITM. Which
 * task depends on what the caller has (CH-020 / ADR-0024 D4): given a RITM it
 * finds the one active task underneath; given a task it uses that one, after
 * checking it is still open.
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
    target: TicketTarget,
    note: string,
  ): Promise<TicketUpdateOutcome> {
    return this.moveTask(target, TASK_STATE.workInProgress, {
      work_notes: note,
    });
  }

  async closeComplete(
    target: TicketTarget,
    note: string,
  ): Promise<TicketUpdateOutcome> {
    return this.moveTask(target, TASK_STATE.closedComplete, {
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
    target: TicketTarget,
    state: string,
    notes: ServiceNowUpdate,
  ): Promise<TicketUpdateOutcome> {
    // The ONLY thing the two targets change is how the task is identified.
    // Everything below — the assignee rule, the patch, the reported state — is
    // the same write, which is what keeps the by-task path from becoming a
    // second, subtly different close.
    const task =
      target.kind === 'ritm'
        ? await this.pickTask(target.sysId)
        : await this.openTask(target.sysId);
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
  private async pickTask(ritmSysId: string): Promise<TaskLookup> {
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
   * 🔴 CH-020 / ADR-0024 D5 — the task is already known, so LOOK BEFORE WRITING.
   *
   * `pickTask` above never needed this check: its query says `^active=true`, so
   * a closed task simply is not in the result. A caller-supplied sys_id has no
   * such filter in front of it, and that difference is the whole reason this
   * method exists rather than a straight patch.
   *
   * It is not a hypothetical either. n8n's own resolver (1001, `Resolve WDA
   * Task`) queries without an `active` filter and takes the first row, so it can
   * and does hand over tasks that somebody has since finished — REQ0044049's
   * SCTASK0071807 was closed and assigned to a real person after intake. Without
   * this gate the platform would re-close their work and report success.
   *
   * `query` rather than `getRecord`: getRecord swallows its errors and returns
   * null, which would report "ServiceNow is down" as "the task does not exist".
   * Here a transport failure must throw, per this seam's error contract.
   */
  private async openTask(taskSysId: string): Promise<TaskLookup> {
    const tasks = await this.snow.query(`sys_id=${taskSysId}`, TASK_TABLE, 1);
    const record = tasks[0];
    if (!record) {
      this.logger.warn(
        `Catalog task ${taskSysId} was not found in ServiceNow — nothing to close`,
      );
      return {
        error: {
          status: 'error',
          details:
            'The catalog task handed over at intake does not exist in ServiceNow, so the platform has nothing to close.',
        },
      };
    }

    if (!this.isActive(record)) {
      // H4: sys_id + SCTASK number are opaque identifiers, not PII — and they
      // are what makes this actionable for whoever reads the failure queue.
      this.logger.warn(
        `Catalog task ${String(
          record.number ?? taskSysId,
        )} is not open — refusing to move it`,
      );
      return {
        error: {
          status: 'error',
          details: `ServiceNow does not report catalog task ${String(
            record.number ?? taskSysId,
          )} as open, so the platform will not reopen or overwrite it. The licence was still assigned.`,
        },
      };
    }
    return { record };
  }

  /**
   * Fail-closed on anything that is not an explicit yes. The Table API returns
   * `active` as the string `'true'`/`'false'` by default and as a boolean when
   * the caller asked for parsed values, so both are accepted — but a missing or
   * unrecognised value counts as "not open", because the cost of being wrong in
   * that direction is a queued failure and in the other it is somebody else's
   * closed ticket being reopened.
   */
  private isActive(record: ServiceNowRecord): boolean {
    const raw: unknown = record.active;
    return raw === true || raw === 'true';
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
