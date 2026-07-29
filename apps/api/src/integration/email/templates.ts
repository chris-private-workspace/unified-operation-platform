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
 * The only template CH-011 ships.
 *
 * 🔴 There is deliberately NO password-reset template here. It belongs to
 * AUTH-4c-C (ADR-0019 D8) and putting it in now would blur the line between two
 * changes that were split on purpose — CH-011 would end up half-implementing a
 * flow it cannot test.
 */
export type TemplateKey = 'connectivity-check';

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

export const TEMPLATES: Record<
  TemplateKey,
  (params: Record<string, string>) => RenderedEmail
> = {
  'connectivity-check': connectivityCheck,
};

/**
 * Templates an operator may re-send from the failure queue.
 *
 * Stated as a positive list, for the reason W40 inverted `KINDS_WITH_LINE_ITEMS`
 * to one: written as "everything except X" it would silently opt in every future
 * template, and the next template to arrive is AUTH-4c-C's password reset — the
 * one that must NOT be replayable. Its content depends on a single-use token
 * that `notification.send` deliberately does not persist, so a replay would send
 * a broken or stale reset link.
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
