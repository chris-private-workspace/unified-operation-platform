/**
 * BUG-004 — strip user identifiers out of a vendor's error text before it is
 * logged.
 *
 * Why this exists: Microsoft Graph (and n8n relaying it) routinely quotes the
 * request path in its error messages, and on the assign path that path contains
 * the target user's UPN:
 *
 *   Resource '/users/someone@example.com' does not exist or one of its
 *   queried reference-property objects are not present.
 *
 * Logging that verbatim puts PII in plaintext logs, against CLAUDE.md §5.4 H4.
 *
 * 🔴 This is NOT the same defect as BUG-001, and the difference is the whole
 * point. BUG-001 was our own template literal interpolating a UPN — fixed by
 * not writing it. This is a string HANDED TO US by an external system, so the
 * fix has to be "never trust foreign text", not "remember not to write it".
 *
 * ## What this deliberately does NOT do
 *
 * It is a *net*, not a guarantee. It matches email-shaped tokens, so it will
 * miss an identifier that is not email-shaped (a bare sAMAccountName, an
 * employee number, an object GUID). Those are not currently known to appear in
 * Graph error text, and widening the pattern would start eating the parts we
 * keep this text for — AADSTS codes, HTTP statuses, correlation ids.
 *
 * So: use it on vendor error text, and still do not build log lines out of
 * identifiers yourself (that remains BUG-001's rule).
 */

/**
 * Email-shaped tokens. Requires at least one dot in the domain so ordinary
 * prose containing an "@" is left alone.
 */
const EMAIL_LIKE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

export const REDACTED = '[redacted-email]';

/**
 * @param text a vendor-supplied message, or undefined when the error had none.
 * @returns the same text with email-shaped tokens replaced; '' for no input,
 *   so callers can interpolate the result without printing "undefined".
 */
export function scrubPii(text: string | undefined | null): string {
  if (!text) return '';
  return text.replace(EMAIL_LIKE, REDACTED);
}
