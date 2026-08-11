import { dedupeRecipients } from './intake-notification-recipients';

/**
 * CH-021 A5 — one address, one mail.
 *
 * Pure function, so this file can be exhaustive cheaply. The case that actually
 * happens in production is the last one: an ops mailbox that is ALSO an OpCo IT
 * user, typed into an env var by hand with different casing.
 */
describe('dedupeRecipients (CH-021 §2.2 ②)', () => {
  it('keeps distinct addresses in first-seen order', () => {
    expect(dedupeRecipients(['a@rci-t.com', 'b@rci-t.com'])).toEqual([
      'a@rci-t.com',
      'b@rci-t.com',
    ]);
  });

  it('drops null / undefined / blank without leaving a hole', () => {
    expect(
      dedupeRecipients([null, 'a@rci-t.com', undefined, '', '   ']),
    ).toEqual(['a@rci-t.com']);
  });

  it('trims surrounding whitespace off an env-var value', () => {
    expect(dedupeRecipients(['  ops@rci-t.com  '])).toEqual(['ops@rci-t.com']);
  });

  /**
   * 🔴 The one that matters. Without case folding the OpCo IT user and the ops
   * mailbox are two recipients, and somebody gets every onboarding twice — which
   * reads as a mail-server fault, not as a platform bug.
   */
  it('treats addresses differing only in case as the same person', () => {
    expect(
      dedupeRecipients(['Jane.Doe@rci-t.com', 'jane.doe@RCI-T.com']),
    ).toEqual(['Jane.Doe@rci-t.com']);
  });

  it('returns an empty list when there is nobody at all', () => {
    expect(dedupeRecipients([undefined, null, ''])).toEqual([]);
  });
});
