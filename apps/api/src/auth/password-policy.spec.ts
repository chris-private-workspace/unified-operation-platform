import { validatePassword } from './password-policy';

// Strict policy (ADR-0006 §1): min 12 · ≥3 classes · ≠email · new≠current.
describe('validatePassword', () => {
  const good = 'Str0ng!Pass99'; // 13 chars, 4 classes

  it('accepts a strong password', () => {
    expect(validatePassword(good)).toBeNull();
  });

  it('rejects a password shorter than 12', () => {
    expect(validatePassword('Sh0rt!Aa')).toMatch(/at least 12/i);
  });

  it('rejects fewer than 3 character classes', () => {
    // 12 lowercase letters only = 1 class
    expect(validatePassword('abcdefghijkl')).toMatch(/at least 3/i);
    // lowercase + digits only = 2 classes
    expect(validatePassword('abcdefgh1234')).toMatch(/at least 3/i);
  });

  it('accepts exactly 3 classes', () => {
    expect(validatePassword('abcdEFGH1234')).toBeNull(); // lower+upper+digit
  });

  it('rejects a password equal to the email or its local-part', () => {
    expect(
      validatePassword('User@Company1', { email: 'User@Company1' }),
    ).toMatch(/same as your email/i);
  });

  it('rejects a new password equal to the current one', () => {
    expect(validatePassword(good, { currentPassword: good })).toMatch(
      /different from the current/i,
    );
  });

  it('allows a new password that differs from the current', () => {
    expect(
      validatePassword('Different!99Xx', { currentPassword: good }),
    ).toBeNull();
  });
});
