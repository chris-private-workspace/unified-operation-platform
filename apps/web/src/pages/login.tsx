import { useMsal } from '@azure/msal-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { API_SCOPE, msalConfigured } from '@/lib/auth/msal';

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

  const signIn = () => {
    // Scope empty until the app registration exists; msalConfigured gates the button.
    void instance.loginRedirect({ scopes: API_SCOPE ? [API_SCOPE] : [] }).catch(() => {});
  };

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
        <div className="relative text-[15px] font-semibold tracking-[-0.02em]">
          LicenseOps
        </div>
        <div className="relative max-w-[420px]">
          <h1 className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em]">
            Microsoft 365 license fulfilment, unified.
          </h1>
          <p className="mt-[14px] text-[13.5px] leading-[1.5] text-white/80">
            Onboarding license requests, catalog truth, and tenant drift — one
            operator console for the group.
          </p>
        </div>
        <div className="relative flex gap-[40px]">
          {[
            { figure: '23', label: 'Operating companies' },
            { figure: 'M365', label: 'License SKUs tracked' },
            { figure: 'Live', label: 'Drift reconciliation' },
          ].map((s) => (
            <div key={s.label}>
              <div className="font-mono text-[22px] font-semibold">{s.figure}</div>
              <div className="mt-[2px] text-[11.5px] text-white/70">{s.label}</div>
            </div>
          ))}
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
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Visual-only (mockup fidelity); SSO does not collect a password here. */}
          <label className="text-[12px] text-fg-muted">Email</label>
          <Input
            type="email"
            placeholder="you@opco.com"
            disabled
            className="mt-[6px]"
          />
          <label className="mt-[12px] block text-[12px] text-fg-muted">
            Password
          </label>
          <Input type="password" placeholder="••••••••" disabled className="mt-[6px]" />

          <div className="mt-[14px] flex items-center justify-between">
            <Checkbox label="Keep me signed in" disabled />
          </div>

          <Button variant="primary" size="lg" disabled className="mt-[16px] w-full">
            Sign in
          </Button>

          <p className="mt-[18px] text-[11.5px] leading-[1.5] text-fg-subtle">
            Signing in uses your organization’s Microsoft Entra ID. Contact IT if
            you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
