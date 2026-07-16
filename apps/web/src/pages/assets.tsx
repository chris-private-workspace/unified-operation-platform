import { useState } from 'react';
import { ByOpcoView } from '@/components/assets/by-opco-view';
import { PlatformView } from '@/components/assets/platform-view';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { canSeePlatform } from '@/lib/roles';
import { cn } from '@/lib/utils';

type Mode = 'byopco' | 'platform';

// Prototype order: Platform first, then By OpCo (default stays By OpCo).
const MODES: { value: Mode; label: string }[] = [
  { value: 'platform', label: 'Platform' },
  { value: 'byopco', label: 'By OpCo' },
];

// License Assets (W15 By-OpCo + W17 Platform). By-OpCo works for every role;
// Platform is a tenant-wide admin surface — OPCO_IT can't see it (AUTH-3b gates it
// proactively; the backend still 403s tenant-skus as the real authority).
export function Assets() {
  const { role } = useCurrentUser();
  const showPlatform = canSeePlatform(role);
  const [mode, setMode] = useState<Mode>('byopco');
  // Platform hidden (OPCO_IT / role still loading) → always show By-OpCo.
  const activeMode: Mode = showPlatform ? mode : 'byopco';

  return (
    <div className="flex flex-col gap-[16px]">
      {/* Mode switcher (prototype): card+border segmented; active tab = accent
          (CH-002 decision B — design-system DS-3 allows segmented-active accent).
          Only shown when Platform is available (ADMIN / REGIONAL). */}
      {showPlatform && (
        <div className="inline-flex w-fit gap-[2px] rounded-[8px] border border-border bg-card p-[2px]">
          {MODES.map((m) => {
            const active = activeMode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  'h-[30px] cursor-pointer rounded-[6px] px-[13px] text-[12px] transition-colors',
                  active
                    ? 'bg-accent font-semibold text-accent-fg'
                    : 'font-medium text-fg-muted hover:text-fg',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {activeMode === 'byopco' ? <ByOpcoView /> : <PlatformView />}
    </div>
  );
}
