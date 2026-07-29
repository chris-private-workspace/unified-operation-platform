import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * CH-011 A2 — the ACS SDK stays inside `src/integration/email/`.
 *
 * CLAUDE.md §3.1 / ADR-0019 D2. The failure mode this guards is quiet: someone
 * needs to send a mail from a service, imports `EmailClient` where they are,
 * everything compiles and every test passes — and the vendor has leaked into the
 * domain layer, where the next transport change has to chase it.
 *
 * Static source scan rather than DI inspection, for the reason W40 learned the
 * hard way: an assertion about what a class does NOT do is easy to write in a
 * form that can never fail. Reading imports off disk cannot silently become
 * vacuous — and the positive halves below prove the scan is looking at anything
 * at all.
 */
describe('email transport boundary (ADR-0019 D2)', () => {
  const SRC = join(__dirname, '..', '..');
  const SDK = '@azure/communication-email';
  const ALLOWED_DIR = join('integration', 'email');

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith('.ts') ? [full] : [];
    });

  const filesMentioningSdk = () =>
    walk(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes(SDK))
      .map((f) => relative(SRC, f));

  it(`confines ${SDK} to src/${ALLOWED_DIR.split(sep).join('/')}/`, () => {
    const outside = filesMentioningSdk().filter(
      (f) => !f.startsWith(ALLOWED_DIR + sep),
    );
    expect(outside).toEqual([]);
  });

  /**
   * Positive half. Without it, deleting the transport entirely would turn the
   * assertion above into a test that passes because there is nothing left to
   * find — green for the worst possible reason.
   */
  it('and the transport really does import it', () => {
    expect(filesMentioningSdk()).toContain(
      join(ALLOWED_DIR, 'acs-email.service.ts'),
    );
  });

  /**
   * The other half of the same boundary: depending on the CONCRETE service is
   * how a domain module ends up pinned to ACS without ever naming the SDK.
   * Callers take `NotificationService`; only the module wiring names the class.
   *
   * ⚠️ Matched on the IMPORT PATH, not the class name — and this test caught its
   * own first draft doing the wrong thing. `notification-dispatch.service.ts`
   * mentions `AcsEmailService` in a comment (to explain that scrubbing already
   * happened upstream) and a name check flagged that as a violation. W39 hit the
   * identical false positive on the license seam and settled it the same way:
   * what a file IMPORTS is the boundary; what it talks about is not.
   */
  it('is reached through NotificationService, never the concrete class', () => {
    const offenders = walk(SRC)
      .filter((f) =>
        readFileSync(f, 'utf8').includes('email/acs-email.service'),
      )
      .map((f) => relative(SRC, f))
      .filter((f) => !f.startsWith(ALLOWED_DIR + sep))
      // The module is where the one legitimate binding lives (useClass).
      .filter((f) => f !== join('integration', 'integration.module.ts'));

    expect(offenders).toEqual([]);
  });

  /**
   * Positive half again: prove the import-path scan can actually find that
   * string, so the assertion above is not green because it is looking for
   * something that never appears anywhere.
   */
  it('and the module binding really is the one place that names it', () => {
    const naming = walk(SRC)
      .filter((f) =>
        readFileSync(f, 'utf8').includes('email/acs-email.service'),
      )
      .map((f) => relative(SRC, f));

    expect(naming).toContain(join('integration', 'integration.module.ts'));
  });

  it('and something does depend on the abstraction', () => {
    const consumers = walk(SRC)
      .filter((f) =>
        readFileSync(f, 'utf8').includes('email/notification.service'),
      )
      .map((f) => relative(SRC, f));

    // fulfilment's dispatcher + retry service are the two in CH-011.
    expect(consumers).toContain(
      join('fulfilment', 'notification-dispatch.service.ts'),
    );
    expect(consumers).toContain(
      join('fulfilment', 'outbound-retry.service.ts'),
    );
  });
});
