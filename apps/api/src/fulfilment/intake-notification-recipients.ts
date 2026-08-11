/**
 * CH-021 §2.2 ② — who gets told that an onboarding landed.
 *
 * ## Why this policy is written down here rather than resolved generically
 *
 * `notification.service.ts:24-27` says it outright: the policy of "who receives
 * which class of notification" does not exist in this codebase, so a generic
 * resolver would have to INVENT it. This module refuses to be that resolver. It
 * answers one question — who to tell about ONE event — and a second event that
 * wants notifying has to come here and say so.
 *
 * Chris decided the policy on 2026-08-09 (CH-021 §1): the OpCo's own IT people
 * AND a fixed ops mailbox. Not either/or — the OpCo team is who acts on it, the
 * ops mailbox is who notices when an OpCo has nobody configured.
 */

/**
 * Collapse the two sources into one address list.
 *
 * 🔴 Case-insensitive (CH-021 A5). The ops mailbox is typed into an env var by a
 * human and the `OPCO_IT` addresses come from the database — expecting those two
 * to agree on casing is exactly the kind of assumption that sends somebody two
 * copies of every onboarding and looks like a bug in the mail server.
 *
 * Order is preserved on FIRST occurrence, so when the ops mailbox is also an
 * OpCo IT user the address keeps its place in the OpCo list. Nothing depends on
 * the order today; it is stable so a test can assert the whole array rather than
 * sorting it first, which is how an off-by-one in a resolver stays hidden.
 */
export function dedupeRecipients(
  addresses: ReadonlyArray<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of addresses) {
    const address = raw?.trim();
    if (!address) continue;

    const key = address.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(address);
  }

  return out;
}
