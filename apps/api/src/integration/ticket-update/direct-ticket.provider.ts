import { Injectable } from '@nestjs/common';
import { ServiceNowService } from '../servicenow/servicenow.service';
import {
  RITM_STATE,
  RITM_TABLE,
  TicketUpdateOutcome,
  TicketUpdateProvider,
} from './ticket-update.provider';

/**
 * Default implementation of seam ④ — PATCH the RITM through the ServiceNow
 * Table API, which is what the platform has always done.
 *
 * Transport failures propagate untouched (see the error contract in
 * ticket-update.provider.ts): ServiceNowService already throws on any non-2xx,
 * and the callers of this seam queue that failure rather than surface it.
 */
@Injectable()
export class DirectTicketProvider extends TicketUpdateProvider {
  constructor(private readonly snow: ServiceNowService) {
    super();
  }

  async markInProgress(
    sysId: string,
    note: string,
  ): Promise<TicketUpdateOutcome> {
    return this.patch(sysId, {
      state: RITM_STATE.workInProgress,
      work_notes: note,
    });
  }

  async closeComplete(
    sysId: string,
    note: string,
  ): Promise<TicketUpdateOutcome> {
    return this.patch(sysId, {
      state: RITM_STATE.closedComplete,
      close_notes: note,
    });
  }

  /**
   * One shared write, because the ONLY difference between the two transitions
   * is the field map above — keeping them in one place means a change to how
   * the result is read cannot apply to just one of them.
   *
   * `error` is never produced here: ServiceNowService throws on non-2xx, so
   * reaching this return means ServiceNow accepted the patch. That asymmetry
   * with the n8n implementation is documented in the outcome type and is why
   * the contract test asserts the resulting STATE rather than the outcome
   * shape.
   */
  private async patch(
    sysId: string,
    fields: Record<string, string>,
  ): Promise<TicketUpdateOutcome> {
    const record = await this.snow.updateRecord(sysId, fields, RITM_TABLE);
    // The Table API echoes the record back; `state` is a string there. Fall
    // back to the value we asked for rather than to null, so the caller is not
    // told "unknown" for a patch ServiceNow just accepted.
    const reported = record?.state;
    return {
      status: 'updated',
      newState: reported == null ? (fields.state ?? null) : String(reported),
    };
  }
}
