import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectorConfigService } from '../connector-config.service';
import { N8N_TICKET_PATH } from '../connectors';
import { scrubPii } from '../scrub-pii';
import {
  RITM_STATE,
  TicketUpdateOutcome,
  TicketUpdateProvider,
} from './ticket-update.provider';

/**
 * The n8n implementation of seam ④ (ADR-0017 D3, 辛 / W40) — workflow 2004.
 *
 *   POST {base}/wf4-sn-update   header x-uop-secret
 *   body { ritmId, mode: 0|1, notes? }
 *
 * Every shape below was read out of 2004's own nodes, not out of the ADR prose.
 * The two disagree in three places (W40 plan §2.2), the biggest being that D3
 * lists an addWorkNote this workflow has no mode for — which is why the seam
 * does not have one either.
 *
 * D0 still holds: the platform decides that a request is fulfilled or stuck.
 * This class only carries that over.
 *
 * 🔴 RITM division of labour — this provider must only ever be handed a LICENSE
 * RITM (RequestLineItem.serviceNowSysId). n8n 1007 closes the AD-type RITMs and
 * already PATCHes state=3 itself; if both sides touched the same ticket they
 * would fight over its state.
 */
@Injectable()
export class N8nTicketProvider extends TicketUpdateProvider {
  private readonly logger = new Logger(N8nTicketProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connectorConfig: ConnectorConfigService,
  ) {
    super();
  }

  // ── plumbing (same shape as N8nLicenseProvider — deliberately) ─────────────

  private async baseUrl(): Promise<string> {
    const url = await this.connectorConfig.resolve(
      'n8n-ticket',
      'n8nTicketWebhookUrl',
    );
    if (!url) {
      // Not a vendor outage — someone selected n8n without finishing its
      // configuration. Say that, rather than letting an undefined URL surface
      // as a confusing fetch error.
      throw new ServiceUnavailableException(
        'The n8n ticket provider is selected but its webhook URL is not configured.',
      );
    }
    return url.replace(/\/+$/, '');
  }

  private secret(): string {
    const key = this.config.get<string>('N8N_TICKET_WEBHOOK_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        'The n8n ticket provider is selected but N8N_TICKET_WEBHOOK_KEY is not set.',
      );
    }
    return key;
  }

  /**
   * One POST to 2004. Transport failure and a non-2xx both THROW — 2004 answers
   * HTTP 400 for a bad secret or a bad mode, which is a wiring mistake on our
   * side rather than a per-ticket outcome, so it must not come back looking
   * like a business answer.
   *
   * H4: the shared key travels in a header and is never logged; `action` is a
   * fixed string and is never interpolated with anything ticket-specific.
   */
  private async call(
    body: Record<string, unknown>,
    action: string,
  ): Promise<Record<string, any>> {
    const url = `${await this.baseUrl()}/${N8N_TICKET_PATH}`;
    // Resolved BEFORE the try, deliberately — the same trap W39 hit: inline in
    // the fetch() arguments it would be evaluated inside the try, so "nobody
    // set the key" would be reported as "n8n is unavailable", sending whoever
    // is on call to investigate a third party for our own mistake.
    const secret = this.secret();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-uop-secret': secret,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // BUG-004 lesson 2: treat any string an external system hands us as
      // capable of carrying PII, even when we believe it cannot.
      this.logger.error(
        `n8n unreachable while trying to ${action}: ${scrubPii(
          (err as Error)?.message,
        )}`,
      );
      throw new ServiceUnavailableException(
        `n8n is unavailable — could not ${action}. Please retry.`,
      );
    }
    if (!res.ok) {
      this.logger.error(
        `n8n returned HTTP ${res.status} while trying to ${action}`,
      );
      throw new ServiceUnavailableException(
        `n8n rejected the request — could not ${action}. Please retry.`,
      );
    }
    try {
      return (await res.json()) as Record<string, any>;
    } catch {
      throw new ServiceUnavailableException(
        `n8n returned a malformed response — could not ${action}. Please retry.`,
      );
    }
  }

  /**
   * Shared result reading for both transitions.
   *
   * 🔴 A 200 from the webhook does NOT mean the ticket moved. 2004 calls its
   * ServiceNow PATCH with `neverError: true` and then reports
   * `status: 'success' | 'error'` plus the PATCH's own `httpStatus`. This is
   * not hypothetical: 2004 runs under the `n8napiservice1` credential, which
   * has row-level ACL, so a RITM it cannot see fails the PATCH while the
   * webhook still answers 200 (plan §5 R4).
   *
   * `details` from the workflow is deliberately dropped (same call as W39
   * OQ-2): 2004 fills it with `JSON.stringify(snErrorBody).substring(0,500)`,
   * the exact shape BUG-004 was about. `httpStatus` is kept because it is a
   * number, cannot carry PII, and is the one fact that makes an ACL failure
   * distinguishable from a wrong sys_id.
   */
  private read(
    body: Record<string, any>,
    requestedState: string,
    action: string,
  ): TicketUpdateOutcome {
    if (body.status !== 'success') {
      this.logger.warn(
        `n8n could not ${action}: workflow reported ${String(
          body.status,
        )} (ServiceNow HTTP ${String(body.httpStatus)})`,
      );
      return {
        status: 'error',
        details: `The n8n ticket workflow could not update the ticket (ServiceNow returned HTTP ${String(
          body.httpStatus ?? 'unknown',
        )}). See the n8n execution log for details.`,
      };
    }
    // Same fallback as the direct provider: reporting null for a patch that
    // just succeeded would tell the caller "unknown" about something we know.
    const reported = body.newState;
    return {
      status: 'updated',
      newState: reported == null ? requestedState : String(reported),
    };
  }

  // ── seam methods ──────────────────────────────────────────────────────────

  /** 2004 mode 1 — state '2' + work_notes. */
  async markInProgress(
    sysId: string,
    note: string,
  ): Promise<TicketUpdateOutcome> {
    const body = await this.call(
      { ritmId: sysId, mode: 1, notes: note },
      'mark the ticket as in progress',
    );
    return this.read(body, RITM_STATE.workInProgress, 'mark the ticket');
  }

  /**
   * 2004 mode 0 — state '3' + close_notes.
   *
   * The note we send is not the note ServiceNow ends up with: 2004 appends
   * "Handled & generated by n8n." to anything that does not already say so, and
   * truncates at 3900 characters. That is deliberate on their side and useful
   * on ours (the ticket shows which path wrote it), so the contract test
   * asserts the resulting STATE and not the text (W40 OQ-C).
   */
  async closeComplete(
    sysId: string,
    note: string,
  ): Promise<TicketUpdateOutcome> {
    const body = await this.call(
      { ritmId: sysId, mode: 0, notes: note },
      'close the ticket',
    );
    return this.read(body, RITM_STATE.closedComplete, 'close the ticket');
  }
}
