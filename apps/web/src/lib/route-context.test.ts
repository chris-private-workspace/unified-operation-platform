import { describe, expect, it } from 'vitest';
import { routeContext } from './route-context';

/**
 * W49 `F3-1`. These assert what the dock SENDS, not what it may do — the second
 * question belongs to the server and is covered by
 * `agent-conversation.scope.spec.ts`.
 */
describe('routeContext (W49 F3)', () => {
  it('reads the id off a request detail route', () => {
    expect(routeContext('/requests/cmsq0p4ou0001xgekk80kf1mi')).toEqual({
      kind: 'request',
      id: 'cmsq0p4ou0001xgekk80kf1mi',
    });
  });

  it('tolerates a trailing slash', () => {
    expect(routeContext('/requests/abc123/')).toEqual({
      kind: 'request',
      id: 'abc123',
    });
  });

  /**
   * 🔴 `/requests/new` is the create form, not a request. It matches the detail
   * shape exactly, so without this the dock would offer to talk about a request
   * called "new" and fail at the first turn with a 404.
   */
  it('does not treat the create form as a request', () => {
    expect(routeContext('/requests/new')).toBeNull();
  });

  it.each([
    ['/requests', 'the list has no single subject'],
    ['/', 'overview'],
    ['/drift', 'another screen entirely'],
    ['/assistant', 'the full assistant'],
    ['/agent', 'the registry'],
    ['/settings', 'settings'],
  ])('returns null for %s (%s)', (path) => {
    expect(routeContext(path)).toBeNull();
  });

  /**
   * ⚠️ Anything deeper is not a request detail. Asserted because the regex
   * anchors both ends, and a future nested route (`/requests/:id/audit`) would
   * otherwise silently start sending "audit" — or worse, keep sending the id
   * for a screen whose subject has changed.
   */
  it('returns null for a route nested below a request', () => {
    expect(routeContext('/requests/abc123/timeline')).toBeNull();
  });

  /**
   * ⚠️ The id is passed through opaquely — no validation, no cuid check. That is
   * deliberate: validating here would build a second, weaker copy of a rule the
   * server already enforces, and the failure mode of guessing wrong (the dock
   * silently sends nothing) is worse than a clean 404.
   */
  it('passes the segment through without judging it', () => {
    expect(routeContext('/requests/not-a-real-id')).toEqual({
      kind: 'request',
      id: 'not-a-real-id',
    });
  });
});
