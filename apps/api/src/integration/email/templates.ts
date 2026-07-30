/**
 * CH-011 / ADR-0019 D3 — templates as typed code, one function per template.
 *
 * NOT database rows and NOT an editing UI: that is a product feature, not a base
 * layer, and it is listed under ADR-0019 D7 as explicitly out of scope. Keeping
 * them as code means a template that references a parameter nobody passes is a
 * compile error rather than a blank line in somebody's inbox.
 *
 * Every template returns all three parts. `text` is not optional: a plain-text
 * alternative is what keeps the message out of spam folders and readable in
 * clients that refuse HTML, and making it optional guarantees it gets skipped.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Every template the platform can send.
 *
 * `password-reset` landed in W41 / AUTH-4c-C. CH-011 deliberately shipped
 * without it — it would have been half-implementing a flow it could not test —
 * and this is the phase that closes that gap. It is also the caller ADR-0019
 * Consequences named: the base layer no longer has zero production callers.
 */
export type TemplateKey = 'connectivity-check' | 'password-reset';

/**
 * Sent by the CH-011 A11 ops script and by nothing else. It exists so the
 * transport can be proven end-to-end while the base layer still has no
 * production caller (ADR-0019 Consequences — the known cost of splitting).
 */
function connectivityCheck(params: Record<string, string>): RenderedEmail {
  const stamp = params.stamp ?? '';
  return {
    subject: 'Unified Operation Platform — connectivity check',
    text: [
      'This is a connectivity check from the Unified Operation Platform.',
      '',
      'If you are reading this, the platform can send mail through Azure',
      'Communication Services and the sender domain resolves correctly.',
      '',
      `Reference: ${stamp}`,
      '',
      'No action is required.',
    ].join('\n'),
    html: [
      '<p>This is a connectivity check from the Unified Operation Platform.</p>',
      '<p>If you are reading this, the platform can send mail through Azure',
      'Communication Services and the sender domain resolves correctly.</p>',
      `<p style="font-family:monospace">Reference: ${escapeHtml(stamp)}</p>`,
      '<p>No action is required.</p>',
    ].join(''),
  };
}

/**
 * W41 / AUTH-4c-C. Everything interpolated here goes through `escapeHtml` —
 * `displayName` is user-controlled (an admin types it when creating the account)
 * and `resetUrl` carries a token, so neither is treated as trusted markup.
 *
 * 🔴 The link uses a FRAGMENT (`#token=`), not a query string (plan OQ-4). A
 * fragment is never sent to the server, so the token stays out of the nginx
 * access log that fronts this very application (ADR-0012) and out of any
 * `Referer` header. The cost is that the reset page reads `location.hash`
 * instead of a query param — a few lines, in exchange for a single-use
 * credential not being written down in plain text on the way in.
 */
function passwordReset(params: Record<string, string>): RenderedEmail {
  const displayName = params.displayName ?? '';
  const resetUrl = params.resetUrl ?? '';
  const ttlMinutes = params.ttlMinutes ?? '30';
  const greeting = displayName ? `Hi ${displayName},` : 'Hi,';

  return {
    subject: 'Unified Operation Platform — reset your password',
    text: [
      greeting,
      '',
      'Somebody asked to reset the password for this account. Open the link',
      `below to choose a new one. It works once and expires in ${ttlMinutes} minutes.`,
      '',
      resetUrl,
      '',
      'If this was not you, no action is needed — your password has not changed,',
      'and the link above is the only way to change it.',
    ].join('\n'),
    html: [
      `<p>${escapeHtml(greeting)}</p>`,
      '<p>Somebody asked to reset the password for this account. Use the link',
      `below to choose a new one. It works once and expires in ${escapeHtml(ttlMinutes)} minutes.</p>`,
      `<p><a href="${escapeHtml(resetUrl)}">Choose a new password</a></p>`,
      '<p>If this was not you, no action is needed — your password has not',
      'changed, and the link above is the only way to change it.</p>',
    ].join(''),
  };
}

export const TEMPLATES: Record<
  TemplateKey,
  (params: Record<string, string>) => RenderedEmail
> = {
  'connectivity-check': connectivityCheck,
  'password-reset': passwordReset,
};

/**
 * Templates an operator may re-send from the failure queue.
 *
 * Stated as a positive list, for the reason W40 inverted `KINDS_WITH_LINE_ITEMS`
 * to one: written as "everything except X" it would silently opt in every future
 * template.
 *
 * 🔴 That template has now arrived and it stays OUT. `password-reset` depends on
 * a single-use token which `notification.send` deliberately does not persist
 * (the failure-queue payload whitelist carries `to` and `template`, never
 * `params`), so a replay could only ever send a broken or already-spent link —
 * while looking, to the operator who clicked retry, like a successful resend.
 *
 * A new template has to ask to be here.
 */
export const REPLAYABLE_TEMPLATES: readonly TemplateKey[] = [
  'connectivity-check',
];

/**
 * Minimal escaping for values interpolated into the HTML part.
 *
 * Templates are ours, but their PARAMS are not always: AUTH-4c-C will pass a
 * token and a link built from config. Escaping at the one place values enter
 * markup is cheaper than remembering to do it per template — and forgetting is
 * how a stray `<` turns a reset mail into a broken one.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
