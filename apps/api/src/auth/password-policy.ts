// Strict password policy (ADR-0006 §1 / AUTH-4c-A). Pure + framework-free so it
// is the single source of truth; apps/web/src/lib/password-policy.ts mirrors the
// same rules for instant UI feedback, but the backend rejection is authoritative.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MIN_CLASSES = 3;

export interface PasswordPolicyContext {
  /** Reject a password equal to the account email (or its local-part). */
  email?: string;
  /** On change/reset: the current plaintext, so the new one must differ. */
  currentPassword?: string;
}

const CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];

/** First policy violation as a user-facing message, or null when the password passes. */
export function validatePassword(
  password: string,
  ctx: PasswordPolicyContext = {},
): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  const classes = CLASSES.filter((re) => re.test(password)).length;
  if (classes < PASSWORD_MIN_CLASSES) {
    return `Password must include at least ${PASSWORD_MIN_CLASSES} of: lowercase, uppercase, number, symbol.`;
  }
  if (ctx.email) {
    const pw = password.toLowerCase();
    const email = ctx.email.toLowerCase();
    if (pw === email || pw === email.split('@')[0]) {
      return 'Password must not be the same as your email.';
    }
  }
  if (ctx.currentPassword !== undefined && password === ctx.currentPassword) {
    return 'New password must be different from the current one.';
  }
  return null;
}
