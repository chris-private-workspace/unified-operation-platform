import { useLocation } from 'react-router-dom';
import { Moon, Search, Sun } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useUiStore, type Role } from '@/store/ui';

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/requests': 'Requests',
  '/assets': 'License Assets',
  '/drift': 'Drift Alerts',
  '/catalog': 'SKU Catalog',
};

const ROLES: readonly Role[] = ['Regional', 'RHK IT'];

export function TopBar() {
  const { pathname } = useLocation();
  const { theme, role, toggleTheme, setRole } = useUiStore();
  const title = TITLES[pathname] ?? 'LicenseOps';
  const context =
    role === 'Regional' ? 'Regional — all OpCos' : 'RHK IT — RHK only';

  return (
    <header className="flex h-[56px] shrink-0 items-center gap-[16px] border-b border-border bg-panel px-[22px]">
      <div className="flex flex-col leading-[1.15]">
        <h1 className="m-0 text-[15px] font-semibold">{title}</h1>
        <span className="text-[11.5px] text-fg-subtle">{context}</span>
      </div>

      <div className="mx-auto max-w-[420px] flex-1">
        <Input
          icon={<Search size={15} strokeWidth={2} />}
          placeholder="Search requests, users, SKUs…"
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
      </div>
    </header>
  );
}
