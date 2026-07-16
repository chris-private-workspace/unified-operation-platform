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
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
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

// Settings section = the shared Card primitive (1px border + 12px radius +
// resting shadow + header divider), so it matches every other console surface.
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card title={title}>
      <div className="flex flex-col gap-[14px]">{children}</div>
    </Card>
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

// Read-only label→value row for the "Role & access" card (prototype).
function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between border-b border-border py-[9px] text-[12.5px] last:border-0">
      <span className="text-fg-muted">{label}</span>
      <span className={cn('font-medium', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

// Settings (handoff full-console): left sub-nav + full-width content, no page
// heading (prototype). Account + Preferences wire real state (identity, theme);
// Users & roles is the live admin console (AUTH-4b); Integrations has the
// allocation import + an honest connector-status coming-soon.
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
    <div className="flex gap-[24px]">
      {/* left sub-nav (prototype: no page-level "Settings" heading);
          page padding comes from the shell <main>, like every other view. */}
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
      <div className="flex flex-1 flex-col gap-[16px]">
        {tab === 'account' && (
          <>
            {/* Identity — avatar + read-only (IT-managed; no editable fields,
                Save, photo or MFA — the app has none of that data, H7). */}
            <Card title="Account">
              <div className="flex items-center gap-[16px]">
                <Avatar name={user.name} size={60} variant="brand" />
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <span className="text-[16px] font-semibold">{user.name}</span>
                  <span className="font-mono text-[12.5px] text-fg-muted">
                    {user.email}
                  </span>
                  {user.role && (
                    <span className="self-start">
                      <Badge tone={roleTone(user.role)}>
                        {roleLabel(user.role)}
                      </Badge>
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[11.5px] text-fg-subtle">
                Your profile and role are managed by IT and can’t be edited
                here.
              </p>
            </Card>

            {/* Role & access — read-only rows (prototype). */}
            <Card title="Role &amp; access">
              <div className="flex flex-col">
                <Row
                  label="Role"
                  value={user.role ? roleLabel(user.role) : '…'}
                />
                <Row
                  label="OpCo scope"
                  value={user.opcoScope ? user.opcoScope.code : 'All OpCos'}
                  mono={Boolean(user.opcoScope)}
                />
                <Row
                  label="Sign-in"
                  value={
                    isLocalSession
                      ? 'Local account (password)'
                      : 'Microsoft Entra ID (SSO)'
                  }
                />
              </div>
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
            </Card>

            {isLocalSession && (
              <Card title="Password">
                {pwChanged && (
                  <p className="text-[12px] text-ok">Password updated.</p>
                )}
                <ChangePasswordForm onDone={() => setPwChanged(true)} />
              </Card>
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
  );
}
