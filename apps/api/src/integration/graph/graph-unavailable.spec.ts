import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { graphUnavailable } from './graph-unavailable';

/**
 * BUG-004 regression.
 *
 * The existing tests around this helper (W38 graph-license.provider.spec, W39
 * n8n-license.provider.spec) only ever asserted the 503 MESSAGE was clean —
 * which it always was. The leak was in the LOG LINE, and nothing looked at it.
 * That is why this file asserts on the logger itself.
 */
describe('graphUnavailable', () => {
  const UPN = 'sensitive.person@example.com';
  let logger: { error: jest.Mock };

  beforeEach(() => {
    logger = { error: jest.fn() };
  });

  const call = (err: unknown) =>
    graphUnavailable(
      logger as unknown as Logger,
      'look up the target user',
      err,
    );

  it('does not write the UPN into the log, even when Graph quotes it', () => {
    call(
      new Error(
        `Resource '/users/${UPN}' does not exist or one of its queried reference-property objects are not present.`,
      ),
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    const logged = logger.error.mock.calls[0][0] as string;
    expect(logged).not.toContain(UPN);
    expect(logged).toContain('[redacted-email]');
  });

  it('still logs what the action was and what the vendor said', () => {
    call(new Error('AADSTS7000215: Invalid client secret provided.'));

    const logged = logger.error.mock.calls[0][0] as string;
    // Without these the log line would be safe and useless.
    expect(logged).toContain('look up the target user');
    expect(logged).toContain('AADSTS7000215');
  });

  it('returns a 503 whose message never carried the UPN in the first place', () => {
    const ex = call(new Error(`nope: ${UPN}`));

    expect(ex).toBeInstanceOf(ServiceUnavailableException);
    expect(ex.message).not.toContain(UPN);
    // The caller-facing text is fixed wording plus the action — it never
    // included the vendor string, which is why BUG-004 hid for so long.
    expect(ex.message).toContain('could not look up the target user');
  });

  it('handles an error with no message without printing "undefined"', () => {
    call({});

    const logged = logger.error.mock.calls[0][0] as string;
    expect(logged).not.toContain('undefined');
  });
});
