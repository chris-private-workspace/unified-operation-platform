import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Boxes,
  Cable,
  Inbox,
  Layers,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  TriangleAlert,
  UserMinus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavItem } from '@/components/ui/nav-item';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { useSignOut } from '@/lib/auth/use-sign-out';
import { useUiStore } from '@/store/ui';
import { useDrift } from '@/hooks/queries';

interface NavEntry {
  path: string;
  label: string;
  Icon: LucideIcon;
  count?: number;
  countTone?: 'neutral' | 'danger';
}

// OPERATIONS nav (design_handoff full-console). Counts are placeholder until the
// screen phases wire real data via TanStack Query.
const OPERATIONS: NavEntry[] = [
  { path: '/', label: 'Overview', Icon: LayoutDashboard },
  { path: '/requests', label: 'Requests', Icon: Inbox, count: 6 },
  { path: '/assets', label: 'License Assets', Icon: Layers },
  {
    path: '/drift',
    label: 'Drift Alerts',
    Icon: TriangleAlert,
    countTone: 'danger',
  },
];

// SKU Catalog sits in its own CATALOG section (prototype), not under Operations.
const CATALOG: NavEntry[] = [
  { path: '/catalog', label: 'SKU Catalog', Icon: Package },
];

// ADMINISTRATION deep-links into the Settings sub-tabs (prototype): Users & roles
// and Integrations are the two admin surfaces, not a generic "Settings" item.
const ADMIN: { tab: string; label: string; Icon: LucideIcon }[] = [
  { tab: 'users', label: 'Users & roles', Icon: Users },
  { tab: 'integrations', label: 'Integrations', Icon: Cable },
];

const SectionLabel = ({ children }: { children: string }) => (
  <div className="px-[10px] pb-[5px] pt-[6px] text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle">
    {children}
  </div>
);

// DS-12: no fabricated logo — a generic stacked-bars glyph in the accent square.
const BrandGlyph = () => (
  <svg
    width="17"
    height="17"
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
);

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const user = useCurrentUser();
  const signOut = useSignOut();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  // Drift Alerts badge reflects the live open-alert count (shared query cache
  // with the Drift screen). Other nav counts stay placeholder until their phase.
  const { data: drift } = useDrift();
  const driftCount = drift?.length ?? 0;

  const isActive = (path: string) =>
    pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));

  const renderNav = (entries: NavEntry[]) =>
    entries.map(({ path, label, Icon, count, countTone }) => {
      const badge = path === '/drift' ? driftCount || null : (count ?? null);
      return (
        <NavItem
          key={path}
          icon={<Icon size={16} strokeWidth={2} />}
          label={label}
          collapsed={collapsed}
          active={isActive(path)}
          count={badge}
          countTone={countTone}
          onClick={() => navigate(path)}
        />
      );
    });

  return (
    <aside
      className={`flex ${
        collapsed ? 'w-[64px]' : 'w-[248px]'
      } shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-150`}
    >
      {/* brand */}
      <div
        className={`flex h-[56px] items-center gap-[10px] border-b border-border ${
          collapsed ? 'justify-center px-0' : 'px-[18px]'
        }`}
      >
        <div className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
          <BrandGlyph />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-[1.15]">
            <span className="font-semibold">LicenseOps</span>
            <span className="text-[11px] text-fg-subtle">Ricoh APAC IT</span>
          </div>
        )}
      </div>

      {/* nav */}
      <nav className="flex flex-1 flex-col gap-[2px] px-[12px] py-[14px]">
        {!collapsed && <SectionLabel>Operations</SectionLabel>}
        {renderNav(OPERATIONS)}

        <div className="pt-[6px]" />
        {!collapsed && <SectionLabel>Catalog</SectionLabel>}
        {renderNav(CATALOG)}

        <div className="pt-[6px]" />
        {!collapsed && <SectionLabel>Administration</SectionLabel>}
        {ADMIN.map(({ tab, label, Icon }) => (
          <NavItem
            key={tab}
            icon={<Icon size={16} strokeWidth={2} />}
            label={label}
            collapsed={collapsed}
            active={pathname === '/settings' && params.get('tab') === tab}
            onClick={() => navigate(`/settings?tab=${tab}`)}
          />
        ))}

        <div className="pt-[6px]" />
        {!collapsed && <SectionLabel>Roadmap</SectionLabel>}
        <NavItem
          icon={<UserMinus size={16} strokeWidth={2} />}
          label="Offboarding"
          collapsed={collapsed}
          disabled
          soon
        />
        <NavItem
          icon={<LineChart size={16} strokeWidth={2} />}
          label="Cost Insights"
          collapsed={collapsed}
          disabled
          soon
        />
        <NavItem
          icon={<Boxes size={16} strokeWidth={2} />}
          label="D365 Licenses"
          collapsed={collapsed}
          disabled
          soon
        />
      </nav>

      {/* user card */}
      <div className="border-t border-border p-[12px]">
        <div
          className={`flex items-center gap-[9px] rounded-[9px] border border-border bg-card ${
            collapsed ? 'justify-center p-[6px]' : 'px-[10px] py-[8px]'
          }`}
        >
          <Avatar name={user.name} variant="brand" />
          {!collapsed && (
            <>
              <div className="flex min-w-0 flex-1 flex-col leading-[1.2]">
                <span className="truncate text-[12.5px] font-medium">
                  {user.name}
                </span>
                <span className="truncate text-[11px] text-fg-subtle">
                  {user.email}
                </span>
              </div>
              {user.canSignOut && (
                <IconButton title="Sign out" onClick={signOut}>
                  <LogOut size={15} strokeWidth={2} />
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
