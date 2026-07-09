import { useLocation, useNavigate } from 'react-router-dom';
import {
  Inbox,
  Layers,
  LayoutDashboard,
  LineChart,
  Package,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavItem } from '@/components/ui/nav-item';
import { Avatar } from '@/components/ui/avatar';
import { useUiStore } from '@/store/ui';

interface NavEntry {
  path: string;
  label: string;
  Icon: LucideIcon;
  count?: number;
  countTone?: 'neutral' | 'danger';
}

// OPERATIONS nav (design_handoff index.html). Counts are placeholder until the
// screen phases wire real data via TanStack Query.
const NAV: NavEntry[] = [
  { path: '/', label: 'Overview', Icon: LayoutDashboard },
  { path: '/requests', label: 'Requests', Icon: Inbox, count: 6 },
  { path: '/assets', label: 'License Assets', Icon: Layers },
  {
    path: '/drift',
    label: 'Drift Alerts',
    Icon: TriangleAlert,
    count: 3,
    countTone: 'danger',
  },
  { path: '/catalog', label: 'SKU Catalog', Icon: Package },
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
  const role = useUiStore((s) => s.role);

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-border bg-sidebar">
      {/* brand */}
      <div className="flex h-[56px] items-center gap-[10px] border-b border-border px-[18px]">
        <div className="flex h-[28px] w-[28px] items-center justify-center rounded-md bg-accent text-accent-fg">
          <BrandGlyph />
        </div>
        <div className="flex flex-col leading-[1.15]">
          <span className="font-semibold">LicenseOps</span>
          <span className="text-[11px] text-fg-subtle">Ricoh APAC IT</span>
        </div>
      </div>

      {/* nav */}
      <nav className="flex flex-1 flex-col gap-[2px] px-[12px] py-[14px]">
        <SectionLabel>Operations</SectionLabel>
        {NAV.map(({ path, label, Icon, count, countTone }) => (
          <NavItem
            key={path}
            icon={<Icon size={16} strokeWidth={2} />}
            label={label}
            active={pathname === path}
            count={count ?? null}
            countTone={countTone}
            onClick={() => navigate(path)}
          />
        ))}
        <div className="pt-[6px]" />
        <SectionLabel>Roadmap</SectionLabel>
        <NavItem
          icon={<Users size={16} strokeWidth={2} />}
          label="Offboarding"
          disabled
          soon
        />
        <NavItem
          icon={<LineChart size={16} strokeWidth={2} />}
          label="Cost Insights"
          disabled
          soon
        />
      </nav>

      {/* user card */}
      <div className="border-t border-border p-[12px]">
        <div className="flex items-center gap-[9px] rounded-[9px] border border-border bg-card px-[10px] py-[8px]">
          <Avatar
            name={role === 'Regional' ? 'Alex Tan' : 'May Wong'}
            variant="brand"
          />
          <div className="flex min-w-0 flex-1 flex-col leading-[1.2]">
            <span className="text-[12.5px] font-medium">
              {role === 'Regional' ? 'Alex Tan' : 'May Wong'}
            </span>
            <span className="text-[11px] text-fg-subtle">
              {role === 'Regional'
                ? 'Regional IT operator'
                : 'RHK IT · OpCo admin'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
