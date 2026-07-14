import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Cable,
  LogOut,
  SlidersHorizontal,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useUiStore, type Theme } from '@/store/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { useSignOut } from '@/lib/auth/use-sign-out';
import { getLocalProfile } from '@/lib/auth/local-profile';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { AllocationImportPanel } from '@/components/settings/allocation-import';
import { UsersPanel } from '@/components/settings/users-panel';
import { roleLabel, roleTone } from '@/lib/user-admin';

const TABS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'account', label: 'Account', Icon: User },
  { value: 'preferences', label: 'Preferences', Icon: SlidersHorizontal },
  { value: 'users', label: 'Users & roles', Icon: Users },
  { value: 'integrations', label: 'Integrations', Icon: Cable },
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

// Settings (handoff full-console): left sub-nav + full-width content. Account +
// Preferences are wired to real state (identity, theme); Users & roles and
// Integrations need backend APIs that don't exist yet, so they show an honest
// coming-soon (plus the static role reference) rather than fabricated data.
export function Settings() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? 'account';
  const tab = TABS.some((t) => t.value === raw) ? raw : 'account';
  const setTab = (value: string) => setParams({ tab: value });

  const user = useCurrentUser();
  const signOut = useSignOut();
  const isLocalSession = Boolean(getLocalProfile());
  const [pwChanged, setPwChanged] = useState(false);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <div className="flex flex-col gap-[18px] p-[24px]">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">
        Settings
      </h1>

      <div className="flex gap-[24px]">
        {/* left sub-nav */}
        <nav className="flex w-[190px] shrink-0 flex-col gap-[2px]">
          {TABS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'flex cursor-pointer items-center gap-[9px] rounded-lg px-[10px] py-[8px] text-[13px]',
                tab === value
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'font-medium text-fg-muted hover:bg-hover',
              )}
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </button>
          ))}
        </nav>

        {/* content */}
        <div className="flex max-w-[760px] flex-1 flex-col gap-[16px]">
          {tab === 'account' && (
            <>
              <Section title="Profile">
                <Field label="Name">
                  <Input value={user.name} disabled readOnly />
                </Field>
                <Field label="Email">
                  <Input value={user.email} disabled readOnly />
                </Field>
                <Field label="Role">
                  {user.role ? (
                    <span className="self-start">
                      <Badge tone={roleTone(user.role)}>
                        {roleLabel(user.role)}
                      </Badge>
                    </span>
                  ) : (
                    <Input value="…" disabled readOnly />
                  )}
                </Field>
                <p className="text-[11.5px] text-fg-subtle">
                  Your profile and role are managed by IT and can’t be edited
                  here.
                </p>
              </Section>
              <Section title="Sign-in &amp; access">
                <Field label="Sign-in method">
                  <Input
                    value={
                      isLocalSession
                        ? 'Local account (password)'
                        : 'Microsoft Entra ID (single sign-on)'
                    }
                    disabled
                    readOnly
                  />
                </Field>
                {user.canSignOut ? (
                  <Button
                    variant="secondary"
                    icon={<LogOut size={15} strokeWidth={2} />}
                    onClick={signOut}
                    className="self-start"
                  >
                    Sign out
                  </Button>
                ) : (
                  <p className="text-[11.5px] text-fg-subtle">
                    Running under local dev-bypass — no real session to sign out
                    of.
                  </p>
                )}
              </Section>
              {isLocalSession && (
                <Section title="Password">
                  {pwChanged && (
                    <p className="text-[12px] text-ok">Password updated.</p>
                  )}
                  <ChangePasswordForm onDone={() => setPwChanged(true)} />
                </Section>
              )}
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

          {tab === 'users' && <UsersPanel />}

          {tab === 'integrations' && (
            <>
              <AllocationImportPanel />
              <div className="rounded-[12px] border border-border bg-card">
                <EmptyState
                  icon={<Cable size={18} strokeWidth={2} />}
                  title="Connector status coming soon"
                  description="Live status for Microsoft Graph, ServiceNow and DocuWare (and n8n config) needs the integration-status API."
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
