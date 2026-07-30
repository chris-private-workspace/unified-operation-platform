import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { API_SCOPE, msalConfigured } from '@/lib/auth/msal';
import { apiPost, ApiError } from '@/lib/api';
import { setLocalProfile } from '@/lib/auth/local-profile';
import type { SessionResponse } from '@/lib/api-types';

// The one multi-color mark allowed in the system (DS-6) — Microsoft's 4-square, brand colors.
function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

// Login screen (handoff README §0): two panels. Left ~52% is the brand panel — the
// system's one gradient (DS-7). Right is the sign-in form. Real SSO goes through
// "Continue with Microsoft Entra ID" (loginRedirect, ADR-0003); the email/password
// fields are the mockup's visual — reproduced but never wired (no fake password form).
export function Login() {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = () => {
    // Scope empty until the app registration exists; msalConfigured gates the button.
    void instance
      .loginRedirect({ scopes: API_SCOPE ? [API_SCOPE] : [] })
      .catch(() => {});
  };

  // Local password login (ADR-0005): POST /auth/login → store the session → app.
  async function onLocalLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiPost<SessionResponse>('/auth/login', {
        email,
        password,
      });
      setLocalProfile(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Invalid email or password.'
          : 'Sign-in failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen w-full">
      {/* Brand panel */}
      <div
        className="relative hidden w-[52%] flex-col justify-between overflow-hidden p-[40px] text-white md:flex"
        style={{ background: 'var(--gradient-brand)' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        />
        <div className="relative flex items-center gap-[10px]">
          <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-white/15">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16v6H4z" />
              <path d="M4 14h10v6H4z" />
              <path d="M18 14h2v6h-2z" />
            </svg>
          </div>
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[15px] font-semibold tracking-[-0.02em]">
              LicenseOps
            </span>
            <span className="text-[11.5px] text-white/70">
              Ricoh APAC · Regional IT
            </span>
          </div>
        </div>
        <div className="relative max-w-[440px]">
          <h1 className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em]">
            Microsoft 365 license fulfilment, under control.
          </h1>
          <p className="mt-[14px] text-[13.5px] leading-[1.5] text-white/80">
            The operations console for onboarding license assignment and
            inventory reconciliation across all Ricoh APAC operating companies —
            one shared tenant, one source of action.
          </p>
        </div>
        <div className="relative flex flex-col gap-[22px]">
          <div className="flex gap-[40px]">
            {[
              { figure: '23', label: 'Operating companies' },
              { figure: '10', label: 'License SKUs tracked' },
              { figure: 'Live', label: 'Drift reconciliation' },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-mono text-[22px] font-semibold">
                  {s.figure}
                </div>
                <div className="mt-[2px] text-[11.5px] text-white/70">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11.5px] leading-[1.5] text-white/60">
            Consumes ServiceNow requests · writes to Microsoft Graph ·
            reconciles the ledger
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-bg p-[24px]">
        <div className="w-full max-w-[360px]">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
            Sign in
          </h2>
          <p className="mt-[4px] text-[12.5px] text-fg-muted">
            Access is managed by your Microsoft Entra ID.
          </p>

          <Button
            variant="secondary"
            size="lg"
            icon={<MicrosoftLogo />}
            onClick={signIn}
            disabled={!msalConfigured}
            className="mt-[22px] w-full"
          >
            Continue with Microsoft Entra ID
          </Button>
          {!msalConfigured && (
            <p className="mt-[8px] text-[11.5px] text-fg-subtle">
              Single sign-on isn’t configured in this environment yet.
            </p>
          )}

          <div className="my-[18px] flex items-center gap-[10px] text-[11px] text-fg-subtle">
            <span className="h-px flex-1 bg-border" />
            or with a local account
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Local password login (ADR-0005) — real form. */}
          <form onSubmit={onLocalLogin}>
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
            <label className="mt-[12px] block text-[12px] text-fg-muted">
              Password
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-[6px]"
            />

            <div className="mt-[14px] flex items-center justify-between">
              <Checkbox label="Keep me signed in" disabled />
              {/* W41 — the right-hand slot the handoff layout already left open.
                  A ghost Button rather than a bare anchor: the system has no
                  text-link pattern, and inventing one is exactly what H6 asks
                  us not to do (DS-3 still holds — one primary per view). */}
              <Link to="/forgot-password">
                <Button variant="ghost" size="sm" type="button">
                  Forgot password?
                </Button>
              </Link>
            </div>

            {error && (
              <p className="mt-[12px] rounded-md bg-danger-soft px-[10px] py-[7px] text-[11.5px] text-danger">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting || !email || !password}
              className="mt-[16px] w-full"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-[18px] text-[11.5px] leading-[1.5] text-fg-subtle">
            SSO uses your organization’s Microsoft Entra ID. Local accounts are
            provisioned by IT — contact them if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
