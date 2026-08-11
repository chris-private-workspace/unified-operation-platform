import { REPLAYABLE_TEMPLATES, TEMPLATES, type TemplateKey } from './templates';

/**
 * CH-021 A9 — every template renders all three parts, and `text` is never empty.
 *
 * ADR-0019 made that a rule and templates.ts states it in a comment; this is the
 * first thing that enforces it. Derived from `TEMPLATES` rather than a hand-
 * written list, for the reason W39/W40 kept re-learning: a hand-copied list of
 * "everything" is a list that silently stops being everything.
 */
describe('email templates (ADR-0019 D3)', () => {
  const keys = Object.keys(TEMPLATES) as TemplateKey[];

  it('has at least the three templates that exist today', () => {
    // Not an exhaustive equality assert — a new template should not have to
    // edit this file. It exists so `keys` being empty cannot make every
    // `it.each` below silently vacuous.
    expect(keys.length).toBeGreaterThanOrEqual(3);
  });

  describe.each(keys)('%s', (key) => {
    // Rendered with NO params: the failure-queue replay path does exactly this
    // (the row carries `to` and `template`, never `params`), so a template that
    // throws on missing input would turn a repair into a 500.
    const rendered = () => TEMPLATES[key]({});

    it('renders subject, text and html', () => {
      const email = rendered();
      expect(typeof email.subject).toBe('string');
      expect(typeof email.text).toBe('string');
      expect(typeof email.html).toBe('string');
    });

    it('has a non-empty subject and a non-empty text part', () => {
      const email = rendered();
      expect(email.subject.trim()).not.toBe('');
      // 🔴 The plain-text alternative is what keeps the message out of spam and
      // readable in clients that refuse HTML. Optional in practice = skipped.
      expect(email.text.trim()).not.toBe('');
    });
  });

  /**
   * 🔴 CH-021 — a template that is not replayable must SAY so here, because the
   * queue refuses it at retry time by consulting this list. Asserted as a
   * property of the whole set rather than of one key: the failure mode is a new
   * template being added and nobody thinking about it.
   */
  it('only lists templates that render usefully with no parameters', () => {
    for (const key of REPLAYABLE_TEMPLATES) {
      expect(keys).toContain(key);
    }
    // `password-reset` needs a token, `onboarding-intake` needs the request —
    // neither survives a parameterless re-render, so neither may be replayed.
    expect(REPLAYABLE_TEMPLATES).not.toContain('password-reset');
    expect(REPLAYABLE_TEMPLATES).not.toContain('onboarding-intake');
  });

  describe('onboarding-intake (CH-021)', () => {
    const params = {
      displayName: 'Jane Doe',
      targetUpn: 'jane.doe@rhk.com',
      opcoCode: 'RHK',
      reqNumber: 'REQ0044038',
      lineItems: 'SPE_E5 × 1',
      requestUrl: 'https://uop.example.com/requests/r1',
    };

    /** R5 — a 24-OpCo ops mailbox needs to filter, so the code leads. */
    it('leads the subject with the OpCo code and carries the REQ number', () => {
      const { subject } = TEMPLATES['onboarding-intake'](params);
      expect(subject).toBe('[RHK] Onboarding licence request — REQ0044038');
    });

    it('puts every detail in both parts', () => {
      const { text, html } = TEMPLATES['onboarding-intake'](params);
      for (const part of [text, html]) {
        expect(part).toContain('Jane Doe');
        expect(part).toContain('jane.doe@rhk.com');
        expect(part).toContain('RHK');
        expect(part).toContain('REQ0044038');
        expect(part).toContain('SPE_E5');
      }
      expect(html).toContain('https://uop.example.com/requests/r1');
      expect(text).toContain('https://uop.example.com/requests/r1');
    });

    it('drops the link rather than rendering an empty one', () => {
      const { text, html } = TEMPLATES['onboarding-intake']({
        ...params,
        requestUrl: '',
      });
      expect(html).not.toContain('<a href');
      expect(text).not.toContain('href');
      // ...and the message still says its piece.
      expect(text).toContain('jane.doe@rhk.com');
    });

    /**
     * 🔴 `targetDisplayName` comes off an Outlook trigger via n8n. It is not
     * ours, so it is not markup.
     */
    it('escapes a display name that carries markup', () => {
      const { html } = TEMPLATES['onboarding-intake']({
        ...params,
        displayName: '<script>alert(1)</script>',
      });
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
