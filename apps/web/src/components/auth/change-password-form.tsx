import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChangePassword } from '@/hooks/mutations';
import { getLocalProfile } from '@/lib/auth/local-profile';
import { ApiError } from '@/lib/api';
import {
  PASSWORD_MIN_CLASSES,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from '@/lib/password-policy';
import { cn } from '@/lib/utils';

const HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with ${PASSWORD_MIN_CLASSES} of: lowercase, uppercase, number, symbol.`;

// Change-own-password (AUTH-4c-A). Reused by Settings (voluntary) and the
// force-change gate. Mirrors the backend policy for instant feedback; the server
// re-validates (currentPassword + policy) and its rejection wins.
export function ChangePasswordForm({
  onDone,
  submitLabel = 'Update password',
}: {
  onDone: () => void;
  submitLabel?: string;
}) {
  const change = useChangePassword();
  const email = getLocalProfile()?.email;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const policyError = next
    ? validatePassword(next, { email, currentPassword: current || undefined })
    : null;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    Boolean(current && next && confirm) &&
    !policyError &&
    !mismatch &&
    !change.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          onDone();
        },
        onError: (err) =>
          setError(
            err instanceof ApiError
              ? err.message
              : 'Could not change password.',
          ),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[14px]">
      <div className="flex flex-col gap-[6px]">
        <label className="text-[12px] text-fg-muted">Current password</label>
        <Input
          type="password"
          value={current}
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-[6px]">
        <label className="text-[12px] text-fg-muted">New password</label>
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
          <p className="text-[11.5px] text-danger">Passwords don’t match.</p>
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
        disabled={!canSubmit}
        className="self-start"
      >
        {change.isPending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
