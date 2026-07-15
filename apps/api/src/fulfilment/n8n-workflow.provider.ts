import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RequestSubmissionProvider,
  SubmitRequestPayload,
  SubmittedLineItem,
  SubmittedRequest,
} from './request-submission.provider';

/** Header carrying the shared m2m secret the platform sends to n8n (CONTRACT-OUTBOUND §2). */
export const N8N_KEY_HEADER = 'X-N8n-Key';

// Representative synchronous response shape (CONTRACT-OUTBOUND §4). Real shape
// pending live alignment with the n8n owner; this provider isolates the mapping.
interface N8nOutboundResponse {
  request?: { sysId?: string; number?: string };
  lineItems?: { skuId?: string; sysId?: string; number?: string }[];
}

/**
 * ADR-0008 D3 / Phase 丙 — submit the request by POSTing the platform payload to
 * an n8n webhook; n8n's existing workflow creates the sc_request (REQ) + per-line
 * sc_req_item (RITM) and responds SYNCHRONOUSLY with their IDs (Fork 2). URL /
 * fields / auth are REPRESENTATIVE (CONTRACT-OUTBOUND, Fork 1) — real values are
 * pending alignment with the n8n owner; this provider isolates that mapping, so
 * going live only changes the payload/response maps + env below. fail-closed: any
 * non-2xx or missing/mismatched ID throws so the caller builds no local mirror
 * (same ordering as DirectServiceNowProvider / assign.service).
 */
@Injectable()
export class N8nWorkflowProvider extends RequestSubmissionProvider {
  private readonly logger = new Logger(N8nWorkflowProvider.name);
  private readonly webhookUrl: string;
  private readonly webhookKey: string;

  constructor(config: ConfigService) {
    super();
    // getOrThrow → when n8n is the selected provider, boot fails fast if its
    // URL/key are unset (no silent broken outbound path). Only constructed when
    // the module factory picks n8n, so direct mode never requires these.
    this.webhookUrl = config.getOrThrow<string>('N8N_OUTBOUND_WEBHOOK_URL');
    this.webhookKey = config.getOrThrow<string>('N8N_OUTBOUND_WEBHOOK_KEY');
  }

  async submit(payload: SubmitRequestPayload): Promise<SubmittedRequest> {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [N8N_KEY_HEADER]: this.webhookKey,
      },
      body: JSON.stringify({
        targetUpn: payload.targetUpn,
        opcoCode: payload.opcoCode,
        requesterEmail: payload.requesterEmail,
        remark: payload.remark,
        lineItems: payload.lineItems.map((l) => ({
          skuId: l.skuId,
          skuPartNumber: l.skuPartNumber,
          quantity: l.quantity,
        })),
      }),
    });

    // Fail-closed rule 1 (CONTRACT §5): non-2xx → throw, caller writes no mirror.
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // H4: log status only, never the key or the target UPN (PII).
      this.logger.error(`n8n outbound webhook -> ${res.status}: ${text}`);
      throw new Error(`n8n outbound webhook failed (${res.status})`);
    }

    const data = (await res.json()) as N8nOutboundResponse;

    // Fail-closed rule 2: REQ sysId required.
    const reqSysId = data.request?.sysId;
    if (!reqSysId) {
      throw new Error('n8n outbound response missing request.sysId');
    }

    // Fail-closed rule 3: line count must match what we sent.
    const respLines = data.lineItems ?? [];
    if (respLines.length !== payload.lineItems.length) {
      throw new Error(
        `n8n outbound response line count mismatch (sent ${payload.lineItems.length}, got ${respLines.length})`,
      );
    }

    // Fail-closed rule 4: each line needs a RITM sysId and must line up by skuId
    // + order (guards against n8n reordering). quantity comes from the payload,
    // not the response — we requested it, so it is authoritative.
    const lineItems: SubmittedLineItem[] = [];
    for (let i = 0; i < payload.lineItems.length; i++) {
      const sent = payload.lineItems[i];
      const got = respLines[i];
      if (!got.sysId) {
        throw new Error(`n8n outbound response line ${i} missing sysId`);
      }
      if (got.skuId && got.skuId !== sent.skuId) {
        throw new Error(`n8n outbound response line ${i} skuId mismatch`);
      }
      lineItems.push({
        skuId: sent.skuId,
        quantity: sent.quantity,
        serviceNowSysId: got.sysId,
        serviceNowNumber: got.number,
      });
    }

    // H4: REQ number + count only, never the target UPN (PII).
    this.logger.log(
      `Submitted request via n8n: REQ ${
        data.request?.number ?? reqSysId
      } (${lineItems.length} RITM)`,
    );
    return {
      serviceNowSysId: reqSysId,
      serviceNowNumber: data.request?.number,
      lineItems,
    };
  }
}
