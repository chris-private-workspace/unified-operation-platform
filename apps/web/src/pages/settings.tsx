import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Cable, LogOut, Users } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/ui/empty-state';
import { useUiStore, type Theme } from '@/store/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { msalConfigured } from '@/lib/auth/msal';

const TABS = [
  { value: 'account', label: 'Account' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'users', label: 'Users & roles' },
  { value: 'integrations', label: 'Integrations' },
];

const THEMES: readonly Theme[] = ['light', 'dark'];

// Card-like section (handoff card: 12px radius + 1px border + surface tint, DS-7).
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-[18px]">
      <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
      <div className="mt-[14px] flex flex-col gap-[14px]">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[12px] text-fg-muted">{label}</label>
      {children}
    </div>
  );
}

// Settings (handoff README §8). Account + Preferences are wired to real state
// (identity, theme); Users & roles and Integrations need backend APIs that don't
// exist yet, so they show an honest coming-soon rather than fabricated data.
export function Settings() {
  const [tab, setTab] = useState('account');
  const user = useCurrentUser();
  const { instance } = useMsal();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const signOut = () => void instance.logoutRedirect();

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-[18px] p-[24px]">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">
        Settings
      </h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'account' && (
        <>
          <Section title="Profile">
            <Field label="Name">
              <Input value={user.name} disabled readOnly />
            </Field>
            <Field label="Email">
              <Input value={user.email} disabled readOnly />
            </Field>
            <p className="text-[11.5px] text-fg-subtle">
              Your profile is managed by Microsoft Entra ID and can’t be edited
              here.
            </p>
          </Section>
          <Section title="Sign-in &amp; access">
            <Field label="Sign-in method">
              <Input
                value="Microsoft Entra ID (single sign-on)"
                disabled
                readOnly
              />
            </Field>
            {user.isDevBypass ? (
              <p className="text-[11.5px] text-fg-subtle">
                Running under local dev-bypass — no real session to sign out of.
              </p>
            ) : (
              <Button
                variant="secondary"
                icon={<LogOut size={15} strokeWidth={2} />}
                onClick={signOut}
                disabled={!msalConfigured}
                className="self-start"
              >
                Sign out
              </Button>
            )}
          </Section>
        </>
      )}

      {tab === 'preferences' && (
        <>
          <Section title="Appearance">
            <Field label="Theme">
              <SegmentedControl
                options={THEMES}
                value={theme}
                onChange={(v) => {
                  if (v !== theme) toggleTheme();
                }}
              />
            </Field>
          </Section>
          <Section title="More preferences">
            <p className="text-[11.5px] leading-[1.5] text-fg-subtle">
              Reduce-motion, localization, and notification preferences are
              coming soon.
            </p>
          </Section>
        </>
      )}

      {tab === 'users' && (
        <div className="rounded-[12px] border border-border bg-card">
          <EmptyState
            icon={<Users size={18} strokeWidth={2} />}
            title="User management coming soon"
            description="Managing users, roles, and invites needs the AppUser admin API — planned with per-OpCo scope (AUTH-3)."
          />
        </div>
      )}

      {tab === 'integrations' && (
        <div className="rounded-[12px] border border-border bg-card">
          <EmptyState
            icon={<Cable size={18} strokeWidth={2} />}
            title="Integrations coming soon"
            description="Connector status (Microsoft Graph, ServiceNow, DocuWare) and n8n configuration need the integration-status API."
          />
        </div>
      )}
    </div>
  );
}
