import { Injectable, Logger } from '@nestjs/common';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import {
  RequestSubmissionProvider,
  SubmitRequestPayload,
  SubmittedLineItem,
  SubmittedRequest,
} from './request-submission.provider';

/**
 * ADR-0008 D3 / Phase 乙 — create the request directly via the ServiceNow Table
 * API: one sc_request (REQ) parent, then one sc_req_item (RITM) per line linked
 * to it (D6 two-level). Field mapping is REPRESENTATIVE — real sc_request /
 * sc_req_item field names + whether Table API insert is the right mechanism are
 * pending alignment with the ServiceNow owner (ADR §10 open item). This provider
 * isolates that mapping, so going live only changes the field maps below.
 */
@Injectable()
export class DirectServiceNowProvider extends RequestSubmissionProvider {
  private readonly logger = new Logger(DirectServiceNowProvider.name);

  constructor(private readonly snow: ServiceNowService) {
    super();
  }

  async submit(payload: SubmitRequestPayload): Promise<SubmittedRequest> {
    // 1. Parent REQ (sc_request). Representative fields — align with Phase 1.
    const req = await this.snow.createRecord(
      {
        short_description: `M365/D365 license request — ${payload.targetUpn}`,
        comments: payload.remark ?? '',
      },
      'sc_request',
    );

    // 2. One RITM (sc_req_item) per line, linked to the parent REQ.
    // If any RITM create throws, it propagates (fail-closed) — the caller builds
    // no local mirror. A partially-created REQ is an accepted risk this phase
    // (orphan-ticket, plan §5); real compensation is out of scope for 乙.
    const lineItems: SubmittedLineItem[] = [];
    for (const line of payload.lineItems) {
      const ritm = await this.snow.createRecord(
        {
          request: req.sys_id, // parent REQ reference (representative)
          cat_item: line.skuId, // representative — real cat_item mapping TBD
          quantity: line.quantity,
          short_description: `${line.skuPartNumber ?? line.skuId} ×${line.quantity}`,
        },
        'sc_req_item',
      );
      lineItems.push({
        skuId: line.skuId,
        quantity: line.quantity,
        serviceNowSysId: ritm.sys_id,
        serviceNowNumber: ritm.number,
      });
    }

    // H4: log REQ number + count only, never the target UPN (PII).
    this.logger.log(
      `Submitted request to ServiceNow: REQ ${req.number ?? req.sys_id} (${lineItems.length} RITM)`,
    );
    return {
      serviceNowSysId: req.sys_id,
      serviceNowNumber: req.number,
      lineItems,
    };
  }
}
