import { useState } from 'react';
import { ByOpcoView } from '@/components/assets/by-opco-view';
import { PlatformView } from '@/components/assets/platform-view';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { canSeePlatform } from '@/lib/roles';
import { cn } from '@/lib/utils';

type Mode = 'byopco' | 'platform';

const MODES: { value: Mode; label: string }[] = [
  { value: 'byopco', label: 'By OpCo' },
  { value: 'platform', label: 'Platform' },
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
      {/* Mode switcher — neutral segmented (no accent, one primary per view; DS-3).
          Only shown when Platform is available (ADMIN / REGIONAL). */}
      {showPlatform && (
        <div className="inline-flex w-fit gap-[3px] rounded-lg bg-hover p-[3px]">
          {MODES.map((m) => {
            const active = activeMode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  'cursor-pointer rounded-md px-[14px] py-[6px] text-[12.5px] transition-colors',
                  active
                    ? 'bg-card font-semibold text-fg shadow'
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
