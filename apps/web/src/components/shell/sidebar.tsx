import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bot,
  Boxes,
  Building2,
  Cable,
  Inbox,
  MessageSquare,
  Layers,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  PackageX,
  ScrollText,
  TriangleAlert,
  UserMinus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavItem } from '@/components/ui/nav-item';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { useSignOut } from '@/lib/auth/use-sign-out';
import { useUiStore } from '@/store/ui';
import { useDrift } from '@/hooks/queries';
import {
  canManageAgentProfiles,
  canRepairOutbound,
  canSeeAdminNav,
  canUseAgent,
} from '@/lib/roles';
import type { Role } from '@/lib/api-types';
import { roleLabel, roleTone } from '@/lib/user-admin';

interface NavEntry {
  path: string;
  label: string;
  Icon: LucideIcon;
  count?: number;
  countTone?: 'neutral' | 'danger';
  /**
   * W48 F5 — optional role gate, mirroring what `ADMIN` entries already carry.
   *
   * Absent means "everyone signed in", which is what every prototype entry is.
   * Added because Assistant is an OPERATIONS tool that OPCO_IT may not use
   * (ADR-0041 D6) — and putting it under Administration to borrow that
   * section's gating would have filed a daily working tool under admin.
   */
  visible?: (role: Role | undefined) => boolean;
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
  // W48 F5 — Assistant (Tier 2 `T2-c`). An operations tool, not an admin one:
  // it is where a person asks the agent about a request, and the answer still
  // goes through the same approval gate as any run (ADR-0041 D8).
  //
  // 🔴 Its own predicate (`canUseAgent`), not `canManageAgentProfiles`: "may I
  // ask the agent a question?" and "may I change which model every future run
  // uses?" are different questions, and one moving must not silently move the
  // other — the same reasoning `/agent` recorded for itself one phase earlier.
  {
    path: '/assistant',
    label: 'Assistant',
    Icon: MessageSquare,
    visible: canUseAgent,
  },
];

// SKU Catalog sits in its own CATALOG section (prototype), not under Operations.
const CATALOG: NavEntry[] = [
  { path: '/catalog', label: 'SKU Catalog', Icon: Package },
];

// ADMINISTRATION deep-links into the Settings sub-tabs (prototype): Users & roles
// and Integrations are the two admin surfaces, not a generic "Settings" item.
// Audit log (W29 F4) is the one standalone-route entry — an owner-approved
// screen beyond the prototype (design-system.md §3.2, plan §9.1 Q2).
//
// Each entry carries its own role predicate (W31): the section used to be
// uniformly ADMIN-only, but Delivery failures is ADMIN + REGIONAL (ADR-0011 D4).
// Gating per entry rather than widening the whole section keeps REGIONAL out of
// Users & roles while still giving it the queue it is meant to work.
const ADMIN: {
  to: string;
  label: string;
  Icon: LucideIcon;
  visible: (role: Role | undefined) => boolean;
}[] = [
  {
    to: '/settings?tab=users',
    label: 'Users & roles',
    Icon: Users,
    visible: canSeeAdminNav,
  },
  {
    to: '/settings?tab=opcos',
    label: 'Operating companies',
    Icon: Building2,
    visible: canSeeAdminNav,
  },
  {
    to: '/settings?tab=integrations',
    label: 'Integrations',
    Icon: Cable,
    visible: canSeeAdminNav,
  },
  {
    to: '/audit',
    label: 'Audit log',
    Icon: ScrollText,
    visible: canSeeAdminNav,
  },
  {
    to: '/outbound-failures',
    label: 'Delivery failures',
    Icon: PackageX,
    visible: canRepairOutbound,
  },
  // W47 F5 — the agent registry (Tier 2 `T2-a`). Its own predicate rather than
  // canSeeAdminNav: "may I open the admin console?" and "may I change which
  // model every future run uses?" are different questions, and one moving must
  // not silently move the other.
  {
    to: '/agent',
    label: 'Agent',
    Icon: Bot,
    visible: canManageAgentProfiles,
  },
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
    entries
      // W48 F5 — an entry with no predicate is visible to everyone signed in,
      // which is what every prototype entry is. The server's 403 stays the
      // authority; this only decides what the nav offers.
      .filter(({ visible }) => (visible ? visible(user.role) : true))
      .map(({ path, label, Icon, count, countTone }) => {
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

        {ADMIN.some((e) => e.visible(user.role)) && (
          <>
            <div className="pt-[6px]" />
            {!collapsed && <SectionLabel>Administration</SectionLabel>}
            {ADMIN.filter((e) => e.visible(user.role)).map(
              ({ to, label, Icon }) => {
                // Settings deep-links match on their tab param; the standalone
                // /audit route matches on the pathname like the Operations nav.
                const [path, query] = to.split('?');
                const tab = new URLSearchParams(query).get('tab');
                const active = tab
                  ? pathname === path && params.get('tab') === tab
                  : isActive(path);
                return (
                  <NavItem
                    key={to}
                    icon={<Icon size={16} strokeWidth={2} />}
                    label={label}
                    collapsed={collapsed}
                    active={active}
                    onClick={() => navigate(to)}
                  />
                );
              },
            )}
          </>
        )}

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
              <div className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[1.2]">
                <span className="truncate text-[12.5px] font-medium">
                  {user.name}
                </span>
                <span className="truncate text-[11px] text-fg-subtle">
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
