import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiPost, ApiError } from '@/lib/api';

/**
 * Request a password-reset mail (AUTH-4c-C / ADR-0019 D8).
 *
 * 🔴 The confirmation is deliberately non-committal. The backend answers 204 for
 * an unknown address, an SSO account, a deactivated account and a cooldown alike
 * (D8 #4); saying "we've sent it" here would hand back, in the UI, exactly the
 * account-existence answer the API refuses to give.
 *
 * It also does NOT quote the expiry in minutes. That number lives in one place
 * (RESET_TTL_MINUTES, which the mail itself renders) and a copy here would be a
 * second one — the kind that goes stale and then gets believed (AP-3).
 */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<void>('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      // The only realistic failure is a malformed address (the DTO's @IsEmail),
      // which reveals nothing about who has an account.
      setError(
        err instanceof ApiError && err.status === 400
          ? 'That does not look like an email address.'
          : 'Could not submit the request. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-[24px]">
      <div className="w-full max-w-[400px] rounded-[14px] border border-border bg-card p-[24px]">
        <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[11px] bg-accent-soft text-accent">
          <MailCheck size={18} strokeWidth={2} />
        </span>

        {sent ? (
          <>
            <h1 className="mt-[12px] text-[18px] font-semibold tracking-[-0.02em] text-fg">
              Check your inbox
            </h1>
            <p className="mt-[4px] text-[12.5px] leading-[1.5] text-fg-subtle">
              If an account exists for that address, a link to choose a new
              password is on its way. It works once, and it expires — so use it
              soon. Remember to check your spam folder.
            </p>
            <Link to="/login" className="mt-[18px] inline-block">
              <Button variant="secondary" size="lg">
                Back to sign in
              </Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-[12px] text-[18px] font-semibold tracking-[-0.02em] text-fg">
              Reset your password
            </h1>
            <p className="mt-[4px] text-[12.5px] leading-[1.5] text-fg-subtle">
              Enter the address you sign in with and we will send you a link to
              choose a new password. Accounts that use Microsoft Entra ID sign
              in through SSO instead.
            </p>

            <form onSubmit={submit} className="mt-[18px]">
              <label className="text-[12px] text-fg-muted">Email</label>
              <Input
                type="email"
                placeholder="you@opco.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                className="mt-[6px]"
              />

              {error && (
                <p className="mt-[12px] rounded-md bg-danger-soft px-[10px] py-[7px] text-[11.5px] text-danger">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={submitting || !email}
                className="mt-[16px] w-full"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>

            <Link to="/login" className="mt-[14px] inline-block">
              <Button variant="ghost" size="sm">
                Back to sign in
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
