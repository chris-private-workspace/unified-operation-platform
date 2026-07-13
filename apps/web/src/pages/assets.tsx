import { useState } from 'react';
import { ByOpcoView } from '@/components/assets/by-opco-view';
import { PlatformView } from '@/components/assets/platform-view';
import { cn } from '@/lib/utils';

type Mode = 'byopco' | 'platform';

const MODES: { value: Mode; label: string }[] = [
  { value: 'byopco', label: 'By OpCo' },
  { value: 'platform', label: 'Platform' },
];

// License Assets (W15 By-OpCo + W17 Platform). Default By-OpCo works for every
// role; Platform is a tenant-wide admin surface (OPCO_IT → 403 → restricted).
export function Assets() {
  const [mode, setMode] = useState<Mode>('byopco');

  return (
    <div className="flex flex-col gap-[16px]">
      {/* Mode switcher — neutral segmented (no accent, one primary per view; DS-3). */}
      <div className="inline-flex w-fit gap-[3px] rounded-lg bg-hover p-[3px]">
        {MODES.map((m) => {
          const active = mode === m.value;
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

      {mode === 'byopco' ? <ByOpcoView /> : <PlatformView />}
    </div>
  );
}
