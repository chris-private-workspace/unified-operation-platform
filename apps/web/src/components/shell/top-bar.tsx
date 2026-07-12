import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  LogOut,
  Moon,
  PanelLeft,
  Search,
  Settings as SettingsIcon,
  Sun,
} from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Avatar } from '@/components/ui/avatar';
import { useUiStore, type Role } from '@/store/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { msalConfigured } from '@/lib/auth/msal';

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/requests': 'Requests',
  '/assets': 'License Assets',
  '/drift': 'Drift Alerts',
  '/catalog': 'SKU Catalog',
  '/settings': 'Settings',
};

const ROLES: readonly Role[] = ['Regional', 'RHK IT'];

// The single tenant the console operates against (ADR-0002). Display-only — the
// prototype shows the connected tenant next to a green status dot.
const TENANT = 'ricoh.onmicrosoft.com';

// Account menu (prototype topbar user menu). MVP: identity + Settings + Sign out
// wired to existing routes/actions; dev-bypass shows an honest note (no session).
function UserMenu() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { instance } = useMsal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const canSignOut = !user.isDevBypass && msalConfigured;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title="Account"
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-[6px] rounded-lg border border-border bg-card p-[4px] pr-[8px]"
      >
        <Avatar name={user.name} size={26} variant="brand" />
        <ChevronDown size={14} strokeWidth={2} className="text-fg-subtle" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[212px] rounded-[10px] border border-border bg-panel p-[6px] shadow-overlay">
          <div className="flex flex-col px-[8px] py-[6px] leading-[1.3]">
            <span className="truncate text-[12.5px] font-medium text-fg">
              {user.name}
            </span>
            <span className="truncate text-[11px] text-fg-subtle">
              {user.email}
            </span>
          </div>
          <div className="my-[4px] h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
            className="flex w-full cursor-pointer items-center gap-[8px] rounded-md px-[8px] py-[7px] text-[12.5px] text-fg-muted hover:bg-hover"
          >
            <SettingsIcon size={15} strokeWidth={2} />
            Settings
          </button>
          {canSignOut ? (
            <button
              type="button"
              onClick={() => void instance.logoutRedirect()}
              className="flex w-full cursor-pointer items-center gap-[8px] rounded-md px-[8px] py-[7px] text-[12.5px] text-fg-muted hover:bg-hover"
            >
              <LogOut size={15} strokeWidth={2} />
              Sign out
            </button>
          ) : (
            <div className="px-[8px] py-[7px] text-[11px] text-fg-subtle">
              {user.isDevBypass
                ? 'Local dev-bypass — no session'
                : 'SSO not configured yet'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const { pathname } = useLocation();
  const { theme, role, toggleTheme, setRole, toggleSidebar } = useUiStore();
  // Nested request detail (/requests/:id) has its own title.
  const title =
    TITLES[pathname] ??
    (pathname.startsWith('/requests/') ? 'Request detail' : 'LicenseOps');
  const context =
    role === 'Regional' ? 'Regional — all OpCos' : 'RHK IT — RHK only';

  return (
    <header className="flex h-[56px] shrink-0 items-center gap-[14px] border-b border-border bg-panel px-[18px]">
      <IconButton title="Toggle sidebar" onClick={toggleSidebar}>
        <PanelLeft size={16} strokeWidth={2} />
      </IconButton>

      <div className="flex flex-col leading-[1.15]">
        <h1 className="m-0 whitespace-nowrap text-[15px] font-semibold">
          {title}
        </h1>
        <span className="whitespace-nowrap text-[11.5px] text-fg-subtle">
          {context}
        </span>
      </div>

      <div className="mx-auto max-w-[420px] flex-1">
        <Input
          icon={<Search size={15} strokeWidth={2} />}
          placeholder="Search requests, users, SKUs…"
          trailing={
            <kbd className="rounded-[5px] border border-border px-[5px] py-[1px] font-mono text-[10.5px] text-fg-subtle">
              ⌘K
            </kbd>
          }
        />
      </div>

      <div className="flex items-center gap-[12px]">
        <SegmentedControl options={ROLES} value={role} onChange={setRole} />
        <IconButton title="Toggle theme" onClick={toggleTheme}>
          {theme === 'dark' ? (
            <Sun size={16} strokeWidth={2} />
          ) : (
            <Moon size={16} strokeWidth={2} />
          )}
        </IconButton>
        <div className="h-[24px] w-px bg-border" />
        <div className="flex items-center gap-[7px] rounded-lg border border-border bg-card px-[10px] py-[4px]">
          <span className="h-[8px] w-[8px] rounded-full bg-ok" />
          <span className="font-mono text-[11.5px] text-fg-muted">
            {TENANT}
          </span>
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
