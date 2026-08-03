import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectorConfigService } from '../connector-config.service';
import {
  TicketTarget,
  TicketUpdateOutcome,
  TicketUpdateProvider,
} from './ticket-update.provider';

/**
 * The n8n implementation of seam ④ — currently a REFUSAL, and deliberately so
 * (CH-010 / ADR-0018 D6).
 *
 * ── Why there is no 2004 client here any more ───────────────────────────────
 * Seam ④ now means "move the RITM's CATALOG TASK". Workflow 2004 cannot do
 * that: `sc_req_item` is baked into its patch URL, and its own sticky note
 * calls that deliberate — "RITM ONLY. 3 fields: state, work_notes, close_notes
 * … No stage, no tasks, no REQ".
 *
 * Three options existed and only one is honest:
 *
 *   patch the RITM anyway  → the two positions of one switch would do different
 *                            things to a customer's ticket. That is exactly
 *                            what ADR-0017 D0 forbids, and it is the bug
 *                            CH-010 exists to fix.
 *   fall back to direct    → the switch would silently not mean what it says.
 *                            An operator would believe n8n is handling tickets
 *                            while the Table API is.
 *   refuse                 → chosen.
 *
 * W40's working 2004 client (webhook call, `x-uop-secret`, the two response
 * shapes, the rule that its `details` field is never passed through) was
 * REMOVED rather than left dormant. Untestable code that no caller can reach
 * rots quietly, and the project has the precedent: W38 took 3 of the 5 methods
 * ADR-0017 D2 listed, on the principle that a seam must not pretend a vendor
 * can do something it cannot. Re-enabling n8n is therefore a conscious rebuild
 * against whatever task-capable mode 2004 gains — not a revert. The old client
 * is in git history at the commit that introduced this comment; the workflow
 * JSON stays the source of truth for its shapes (W39's lesson).
 *
 * Refusing PER CALL rather than at boot is deliberate: every caller of this
 * seam queues the failure (ADR-0011 OD4), so a wrong switch shows up as an
 * OutboundFailure naming the reason — recoverable, and visible without taking
 * the application down with it.
 *
 * The constructor keeps its dependencies: the class is still a registered
 * provider that the factory can select, and dropping them would make
 * re-enabling it a larger change than it should be.
 */
@Injectable()
export class N8nTicketProvider extends TicketUpdateProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly connectorConfig: ConnectorConfigService,
  ) {
    super();
  }

  /**
   * The note is deliberately absent from both signatures below: a method may
   * declare fewer parameters than the one it overrides, and nothing here can
   * use it. The target IS used — its sys_id lands in the failure queue, where
   * the first question is always "which ticket".
   *
   * CH-020 / ADR-0024 D4 — the two target kinds refuse DIFFERENTLY, and the
   * asymmetry is the honest one rather than an oversight:
   *
   *   ritm — throws, exactly as before. Nothing about that path changed, and a
   *          wrong connector setting should keep looking like the misconfiguration
   *          it is.
   *   task — returns an `error` outcome. 2004 cannot address a catalog task at
   *          all, so this is not "something went wrong reaching n8n", it is the
   *          provider answering that the ticket did not move — which is exactly
   *          what `error` means in this seam.
   *
   * Either way the caller queues it (ADR-0011 OD4), so neither can turn a
   * completed assign into a failure.
   */
  private refusal(action: string, target: TicketTarget): string {
    return (
      `The n8n ticket provider cannot ${action} ${target.sysId}: workflow 2004 ` +
      'updates the RITM, but the platform now closes the catalog task instead ' +
      "(ADR-0018). Switch the n8n-ticket connector back to 'direct' until " +
      '2004 supports catalog tasks.'
    );
  }

  private refuse(action: string, target: TicketTarget): TicketUpdateOutcome {
    const details = this.refusal(action, target);
    if (target.kind === 'task') return { status: 'error', details };
    throw new Error(details);
  }

  async markInProgress(target: TicketTarget): Promise<TicketUpdateOutcome> {
    return this.refuse('put a ticket on hold for', target);
  }

  async closeComplete(target: TicketTarget): Promise<TicketUpdateOutcome> {
    return this.refuse('close a ticket for', target);
  }
}
