import { readFileSync } from 'fs';
import { join } from 'path';
import { scrubPii, REDACTED } from './scrub-pii';

/**
 * BUG-004. Two halves, and the second matters as much as the first: a scrubber
 * that ate the diagnostic content would be "safe" and useless, and nobody would
 * notice until the next outage.
 */
describe('scrubPii', () => {
  describe('removes email-shaped identifiers', () => {
    it('redacts a UPN quoted inside a Graph 404', () => {
      const message =
        "Resource '/users/sensitive.person@example.com' does not exist or one of its queried reference-property objects are not present.";

      const out = scrubPii(message);

      expect(out).not.toContain('sensitive.person@example.com');
      expect(out).toContain(REDACTED);
      // The shape of the message survives — an operator still sees it was a
      // "resource does not exist" against /users/.
      expect(out).toContain("Resource '/users/");
      expect(out).toContain('does not exist');
    });

    it.each([
      'plain@example.com',
      'with.dots@example.co.uk',
      'plus+tag@example.com',
      'dash-user@sub.example-corp.com',
      'UPPER.CASE@EXAMPLE.COM',
    ])('redacts %s', (upn) => {
      expect(scrubPii(`failed for ${upn} at 12:00`)).not.toContain(upn);
    });

    it('redacts every occurrence, not just the first', () => {
      const out = scrubPii('a@x.com tried to reach b@y.com');
      expect(out).not.toContain('a@x.com');
      expect(out).not.toContain('b@y.com');
      expect(
        out.match(new RegExp(REDACTED.replace(/[[\]]/g, '\\$&'), 'g')),
      ).toHaveLength(2);
    });
  });

  /**
   * 🔴 The half that keeps this useful. These are exactly the tokens someone
   * reads at 2am to tell an expired secret from a missing permission.
   */
  describe('keeps the parts we log this text for', () => {
    it('does not touch an AADSTS code', () => {
      const message =
        'AADSTS7000215: Invalid client secret provided. Trace ID: bf9599cb-22f1-40c0-913e-34049f301000';

      const out = scrubPii(message);

      expect(out).toContain('AADSTS7000215');
      expect(out).toContain('Invalid client secret provided');
      expect(out).toContain('bf9599cb-22f1-40c0-913e-34049f301000');
    });

    it('does not touch HTTP statuses, GUIDs or correlation ids', () => {
      const message =
        'Request failed with status 429 (throttled). Correlation ID: 6a0c221a-cfb8-4185-aa88-cde4e3bffa74, sku 05e9a617-0261-4cee-bb44-138d3ef5d965';

      expect(scrubPii(message)).toBe(message);
    });

    it('leaves an "@" that is not an address alone', () => {
      // Requires a dotted domain, so prose survives.
      const message = 'retry @ 3 attempts';
      expect(scrubPii(message)).toBe(message);
    });
  });

  describe('input edge cases', () => {
    it.each([undefined, null, ''])(
      'returns an empty string for %p rather than printing it',
      (input) => {
        // Callers interpolate the result directly; returning undefined would
        // put the literal text "undefined" in the log.
        expect(scrubPii(input as undefined)).toBe('');
      },
    );
  });

  /**
   * Stated as a test so the limitation is not something a reader has to infer
   * from the regex. scrubPii is a net, not a guarantee — BUG-001's rule (do not
   * build log lines out of identifiers yourself) still applies.
   */
  it('does NOT catch identifiers that are not email-shaped — known limitation', () => {
    const message = 'user CN=jdoe,OU=Users,DC=corp not found';
    expect(scrubPii(message)).toBe(message);
  });
});

/**
 * BUG-004 — stop the fix from being undone one call site at a time.
 *
 * Scrubbing at four places is only as good as the next person remembering to do
 * it at the fifth. These files are the ones whose vendor call carries a user's
 * identity, so a raw `${(err as Error).message}` in any of them puts a UPN back
 * in the log — and no behavioural test would notice, because the exception
 * message stays clean either way. That is exactly how BUG-004 survived from
 * BE-graph-harden to W39.
 *
 * Scope note: the other eight raw-message logs in the codebase (ServiceNow
 * write-back, token rejection, connector probes) are deliberately NOT covered.
 * Their vendor call does not involve a specific user, so the same pattern is
 * not the same risk — see BUG-004 report §6.
 */
describe('BUG-004 — user-identity call sites must not log a raw vendor message', () => {
  const RAW_MESSAGE = /\$\{\s*\(err as Error\)\??\.message\s*\}/;

  const IDENTITY_CALL_SITES = [
    'integration/graph/graph-unavailable.ts',
    'integration/license-ops/n8n-license.provider.ts',
    'fulfilment/sync-sweep.service.ts',
  ];

  it.each(IDENTITY_CALL_SITES)(
    '%s interpolates no raw vendor message',
    (rel) => {
      const src = readFileSync(join(__dirname, '..', rel), 'utf8');
      expect(src).not.toMatch(RAW_MESSAGE);
    },
  );

  it.each(IDENTITY_CALL_SITES)('%s actually calls scrubPii', (rel) => {
    // The negative alone would also pass if the file stopped logging the vendor
    // message entirely — which is a different (and worse) outcome than scrubbing.
    const src = readFileSync(join(__dirname, '..', rel), 'utf8');
    expect(src).toContain('scrubPii(');
  });
});
