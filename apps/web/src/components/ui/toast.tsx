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
}

export function Toast({ message, tone = 'ok' }: ToastProps) {
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
      </div>
    </div>
  );
}
