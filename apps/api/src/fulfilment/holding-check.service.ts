import { Injectable, Logger } from '@nestjs/common';
import { GraphService } from '../integration/graph/graph.service';

/**
 * Does this user ALREADY hold this SKU in M365?
 *
 * Three answers, not two. `unknown` is the whole reason this is a named type
 * rather than a boolean: ADR-0034 D6 makes the read fail-OPEN, so a failure has
 * to stay distinguishable from a clean "no" all the way to the operator's
 * screen. A boolean would collapse them at the first `if`, and the gate would
 * then be indistinguishable from one that is quietly not running at all —
 * exactly the silent degradation D6 names as the residual risk.
 */
export const HOLDING_STATUS = {
  HELD: 'held',
  NOT_HELD: 'not-held',
  /** The read failed. Nothing is known — see D6: the caller assigns anyway. */
  UNKNOWN: 'unknown',
} as const;

export type HoldingStatus =
  (typeof HOLDING_STATUS)[keyof typeof HOLDING_STATUS];

/**
 * CH-029 / ADR-0034 D1 — the platform's OWN answer to "does this person
 * already have this licence".
 *
 * 🔴 It injects GraphService DIRECTLY and must never be moved onto
 * LicenseOperationsProvider. The whole point of D1 is that the gate stands
 * BEFORE the provider: only n8n can report `already_assigned` (Graph's POST is
 * idempotent and says nothing), so asking the provider would mean swapping the
 * provider also swaps ledger semantics — which is what ADR-0017 D0 forbids and
 * what W39 OQ-1 had to concede to in 2026-07. Asking Graph ourselves is not a
 * softening of D0, it is D0 applied properly: the decision stays on the
 * platform, and both provider paths receive the same one.
 *
 * 🔴 A SEPARATE service rather than a method on AssignService, for a reason
 * that is enforced rather than remembered: the W38 seam-boundary spec asserts
 * assign.service does not import GraphService at all. SyncCheckService lives
 * here under the identical rule — see the note beside it in
 * fulfilment.module.ts — so this follows a precedent rather than inventing an
 * exception.
 *
 * (That spec's own file name is deliberately not written out above: it checks
 * for the seam by substring, and W39 already had to loosen it once because a
 * comment EXPLAINING the rule tripped it.)
 */
@Injectable()
export class HoldingCheckService {
  private readonly logger = new Logger(HoldingCheckService.name);

  constructor(private readonly graph: GraphService) {}

  /**
   * @param targetUpn  the person the licence is for
   * @param skuId      the GUID (never the part number — DESIGN §5 / H-rule)
   */
  async check(targetUpn: string, skuId: string): Promise<HoldingStatus> {
    try {
      const held = await this.graph.getUserAssignedSkuIds(targetUpn);
      return held.includes(skuId)
        ? HOLDING_STATUS.HELD
        : HOLDING_STATUS.NOT_HELD;
    } catch (err) {
      /**
       * ADR-0034 D6 — fail OPEN, and say so.
       *
       * Deliberately NOT `graphUnavailable` (which is what sync-check uses):
       * that helper throws a 503, and throwing here would make this gate
       * fail-CLOSED — it would stop a real, needed licence from being assigned
       * in order to protect a ledger number. D6 draws that line explicitly:
       * this is an accounting-accuracy gate, not a security boundary, unlike
       * the ADR-0016 budget gate it sits next to.
       *
       * H4: the message only, never the UPN — this is a /users/{upn} lookup,
       * the likeliest place in the codebase for one to come back inside an
       * error string (BUG-004).
       */
      this.logger.warn(
        `Could not check whether the target already holds ${skuId}; assigning anyway (ADR-0034 D6): ${
          (err as Error)?.message
        }`,
      );
      return HOLDING_STATUS.UNKNOWN;
    }
  }
}
