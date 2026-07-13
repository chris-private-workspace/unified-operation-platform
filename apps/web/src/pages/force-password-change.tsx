import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import {
  clearMustChangePassword,
  getLocalSession,
} from '@/lib/auth/local-session';

// Force-change gate (AUTH-4c-A). A local account flagged mustChangePassword (fresh
// admin-set / reset password) can't use the app until it sets its own password.
// RequireAuth routes such sessions here; no session → /login, already-changed → app.
export function ForcePasswordChange() {
  const navigate = useNavigate();
  const session = getLocalSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!session.user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-[24px]">
      <div className="w-full max-w-[400px] rounded-[14px] border border-border bg-card p-[24px]">
        <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[11px] bg-accent-soft text-accent">
          <KeyRound size={18} strokeWidth={2} />
        </span>
        <h1 className="mt-[12px] text-[18px] font-semibold tracking-[-0.02em] text-fg">
          Set a new password
        </h1>
        <p className="mt-[4px] text-[12.5px] leading-[1.5] text-fg-subtle">
          Your account is using a password set by an administrator. Choose your
          own password to continue.
        </p>
        <div className="mt-[18px]">
          <ChangePasswordForm
            submitLabel="Set password & continue"
            onDone={() => {
              clearMustChangePassword();
              navigate('/', { replace: true });
            }}
          />
        </div>
      </div>
    </div>
  );
}
