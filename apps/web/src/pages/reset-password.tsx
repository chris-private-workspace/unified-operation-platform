import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiPost, ApiError } from '@/lib/api';
import { clearLocalProfile } from '@/lib/auth/local-profile';
import {
  PASSWORD_MIN_CLASSES,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from '@/lib/password-policy';
import { cn } from '@/lib/utils';

const HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with ${PASSWORD_MIN_CLASSES} of: lowercase, uppercase, number, symbol.`;

/**
 * Choose a new password with a token from the reset mail (AUTH-4c-C).
 *
 * 🔴 The token arrives in the URL FRAGMENT (`#token=…`), not the query string
 * (plan OQ-4). A fragment is never sent to the server, so a single-use
 * credential does not end up written down in the nginx access log that fronts
 * this app, nor in a `Referer` header. Reading it costs the two lines below.
 */
function useTokenFromHash(): string {
  return useMemo(() => {
    const hash = window.location.hash.replace(/^#/, '');
    return new URLSearchParams(hash).get('token') ?? '';
  }, []);
}

export function ResetPassword() {
  const navigate = useNavigate();
  const token = useTokenFromHash();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // No email in context — nobody is signed in — so the email-similarity rule is
  // left to the backend, which knows whose token this is. Length and character
  // classes are checked here purely for instant feedback; the server re-validates
  // with the SAME shared policy and its answer is the authoritative one.
  const policyError = next ? validatePassword(next) : null;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    Boolean(token && next && confirm) &&
    !policyError &&
    !mismatch &&
    !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<void>('/auth/reset-password', {
        token,
        newPassword: next,
      });
      // Every refresh token for this account was just revoked server-side; drop
      // any stale identity here too, so the app cannot briefly look signed-in.
      clearLocalProfile();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reset the password. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-[24px]">
      <div className="w-full max-w-[400px] rounded-[14px] border border-border bg-card p-[24px]">
        <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[11px] bg-accent-soft text-accent">
          <KeyRound size={18} strokeWidth={2} />
        </span>
        <h1 className="mt-[12px] text-[18px] font-semibold tracking-[-0.02em] text-fg">
          Choose a new password
        </h1>

        {!token ? (
          <>
            <p className="mt-[4px] text-[12.5px] leading-[1.5] text-fg-subtle">
              This link is incomplete — it is missing its reset token. Links can
              break when an email client rewrites them, so request a fresh one.
            </p>
            <Link to="/forgot-password" className="mt-[18px] inline-block">
              <Button variant="primary" size="lg">
                Request a new link
              </Button>
            </Link>
          </>
        ) : (
          <>
            <p className="mt-[4px] text-[12.5px] leading-[1.5] text-fg-subtle">
              Pick a password you have not used here before. Signing in
              everywhere else will stop working — that is intentional.
            </p>

            <form
              onSubmit={submit}
              className="mt-[18px] flex flex-col gap-[14px]"
            >
              <div className="flex flex-col gap-[6px]">
                <label className="text-[12px] text-fg-muted">
                  New password
                </label>
                <Input
                  type="password"
                  value={next}
                  autoComplete="new-password"
                  onChange={(e) => setNext(e.target.value)}
                />
                <p
                  className={cn(
                    'text-[11.5px] leading-[1.5]',
                    policyError ? 'text-danger' : 'text-fg-subtle',
                  )}
                >
                  {policyError ?? HINT}
                </p>
              </div>

              <div className="flex flex-col gap-[6px]">
                <label className="text-[12px] text-fg-muted">
                  Confirm new password
                </label>
                <Input
                  type="password"
                  value={confirm}
                  autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {mismatch && (
                  <p className="text-[11.5px] text-danger">
                    Passwords don’t match.
                  </p>
                )}
              </div>

              {error && (
                <p className="rounded-md bg-danger-soft px-[10px] py-[7px] text-[11.5px] text-danger">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!canSubmit}
                className="w-full"
              >
                {submitting ? 'Saving…' : 'Set new password'}
              </Button>
            </form>

            <Link to="/forgot-password" className="mt-[14px] inline-block">
              <Button variant="ghost" size="sm">
                Request a new link
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
