import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * W40 F1 — seam ④'s scope boundary, enforced.
 *
 * Same technique as license-ops.boundary.spec.ts (W38): static source checks,
 * because the claim being locked is "this file does not reach for the seam AT
 * ALL", which an import list answers directly and a behavioural mock only
 * answers for the paths it happens to exercise.
 *
 * What makes this seam's boundary worth locking is that it is NARROWER than the
 * ADR says. Anyone reading ADR-0017 D3 will find addWorkNote listed as one of
 * the three methods, will not find it here, and — without these tests — could
 * reasonably conclude it was forgotten and "fix" it.
 */
describe('ticket-update seam boundary (W40 OQ-A / OQ-D)', () => {
  const src = (relative: string) =>
    readFileSync(join(__dirname, '..', '..', relative), 'utf8');

  describe('OQ-A — addWorkNote is deliberately NOT part of this seam', () => {
    /**
     * Matched on the DECLARATION form (`abstract name(`), not on the bare name.
     *
     * Two traps, both hit for real while writing this:
     *
     *  1. Reading TicketUpdateProvider.prototype returns ["constructor"] — a
     *     TypeScript `abstract` method has no runtime existence at all. The
     *     negative assertion would then have passed no matter what the
     *     interface said: a test that can never fail. Its positive half is what
     *     exposed that, which is exactly why W38 started pairing them.
     *  2. A plain substring check on the source flags this file's own comments,
     *     which discuss addWorkNote at length to explain why it is absent —
     *     the same trap W39 hit with integration-probe.
     */
    const iface = () =>
      src('integration/ticket-update/ticket-update.provider.ts');
    const declares = (method: string) =>
      new RegExp(`abstract\\s+${method}\\s*\\(`).test(iface());

    it('has no addWorkNote — workflow 2004 has no mode that adds a note without moving state, so offering one would mean the n8n implementation could not honour the interface', () => {
      expect(declares('addWorkNote')).toBe(false);
    });

    // Positive half: "no addWorkNote" would also pass if the interface were
    // empty or renamed away. Assert the two transitions it DOES own, so the
    // test keeps meaning what its name says.
    it('owns exactly the two state transitions', () => {
      expect(declares('markInProgress')).toBe(true);
      expect(declares('closeComplete')).toBe(true);
    });
  });

  /**
   * OQ-D, restated after F4 — and this one was WIDENED, not tightened, so the
   * reason has to be on the record.
   *
   * F1 read OQ-D as "outbound-retry must not import the seam at all" and locked
   * that with a source check. F4 showed the decision was narrower than the test:
   * OQ-D is about the WORK NOTE. Its payload records a note that failed as a
   * direct Table API call, so replaying it directly is replaying the same thing.
   *
   * A ticket STATE repair is the opposite case. That failure was produced by
   * whichever provider is configured, so repairing it directly would fix an n8n
   * close by calling the Table API — a different system doing a different thing.
   * It must go through the seam.
   *
   * So the file now imports the seam legitimately, and a source check can no
   * longer tell the two paths apart. The real guarantee — each repair kind
   * reaching exactly one of them — is asserted behaviourally in
   * outbound-retry.service.spec.ts. What stays here is only what a source check
   * still answers honestly.
   */
  describe('OQ-D — the work-note repair stays on the direct call', () => {
    const retry = () => src('fulfilment/outbound-retry.service.ts');

    it('still re-sends work notes via ServiceNowService.addWorkNote', () => {
      expect(retry()).toContain('this.snow.addWorkNote');
    });
  });

  /**
   * Both implementations must write to sc_req_item and only sc_req_item.
   * Workflow 2004 has the table baked into its patch URL, so if the direct side
   * followed SERVICENOW_DEFAULT_TABLE the two paths would silently diverge the
   * day someone changes that setting — a config value quietly deciding which
   * table one of two supposedly-equivalent providers writes to.
   */
  it('the direct implementation pins the table instead of inheriting the configured default', () => {
    const direct = src('integration/ticket-update/direct-ticket.provider.ts');
    expect(direct).toContain('RITM_TABLE');
    expect(direct).not.toContain('defaultTable');
  });
});
