import { describe, expect, it } from 'vitest';
import { validatePassword } from './password-policy';

// Mirror of the backend policy (ADR-0006 §1) — must stay in sync with
// apps/api/src/auth/password-policy.spec.ts.
describe('validatePassword', () => {
  const good = 'Str0ng!Pass99';

  it('accepts a strong password', () => {
    expect(validatePassword(good)).toBeNull();
  });

  it('rejects shorter than 12', () => {
    expect(validatePassword('Sh0rt!Aa')).toMatch(/at least 12/i);
  });

  it('rejects fewer than 3 classes', () => {
    expect(validatePassword('abcdefghijkl')).toMatch(/at least 3/i);
    expect(validatePassword('abcdefgh1234')).toMatch(/at least 3/i);
  });

  it('rejects equal to the email or its local-part', () => {
    expect(
      validatePassword('User@Company1', { email: 'User@Company1' }),
    ).toMatch(/same as your email/i);
  });

  it('rejects a new password equal to the current one', () => {
    expect(validatePassword(good, { currentPassword: good })).toMatch(
      /different from the current/i,
    );
  });
});
