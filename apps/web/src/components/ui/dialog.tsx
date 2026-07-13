import { useEffect } from 'react';
import { X } from 'lucide-react';

// Rebuilt from design_handoff feedback/Dialog.jsx — a centered modal over a
// scrim. Header (title + close), body, optional footer. Esc / scrim-click close.
// Tokens only (bg-card / border / shadow-overlay); fadeIn keyframe comes from the
// handoff base.css. lucide X for the close glyph (DS-6), not the prototype's ✕.
export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}

export function Dialog({
  open,
  title,
  onClose,
  footer,
  width = 420,
  children,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 animate-[fadeIn_.15s_ease]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-w-[92vw] overflow-hidden rounded-[14px] border border-border bg-card shadow-overlay"
      >
        <div className="flex items-center justify-between border-b border-border px-[18px] py-[16px]">
          <h3 className="text-[14px] font-semibold text-fg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-hover"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="p-[18px]">{children}</div>
        {footer && (
          <div className="flex justify-end gap-[9px] border-t border-border px-[18px] py-[14px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
