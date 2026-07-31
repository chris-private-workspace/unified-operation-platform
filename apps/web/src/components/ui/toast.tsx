import { cn } from '@/lib/utils';

// Rebuilt from design_handoff feedback/Toast.jsx — bottom-center, tone dot.
// First-pass scaffold version; auto-dismiss handled by the caller.
const toneDot: Record<string, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  info: 'bg-info',
  danger: 'bg-danger',
  neutral: 'bg-neutral',
  purple: 'bg-purple',
};

export interface ToastProps {
  message?: string | null;
  tone?: keyof typeof toneDot;
  /**
   * ONE optional follow-up (CH-013, Chris approved 2026-07-31 — design-system §2).
   *
   * A text link, not a button: a toast is transient chrome, and a real button
   * here would read as a second primary action on whatever view is underneath.
   * At most one — a toast that asks two questions is a dialog wearing a
   * disguise.
   *
   * 🔴 Callers that pass this must give the toast longer than the usual ~2.6s.
   * An action nobody can reach before it disappears is worse than no action:
   * it teaches people the UI is flaky.
   */
  action?: { label: string; onClick: () => void };
}

export function Toast({ message, tone = 'ok', action }: ToastProps) {
  if (!message) return null;
  return (
    <div className="fixed bottom-[24px] left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-[10px] rounded-lg border border-border bg-card px-[14px] py-[10px] text-[12.5px] text-fg shadow-toast">
        <span
          className={cn(
            'h-[7px] w-[7px] shrink-0 rounded-full',
            toneDot[tone] ?? 'bg-neutral',
          )}
        />
        {message}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 font-medium text-accent underline-offset-2 hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
