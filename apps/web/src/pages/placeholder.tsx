// OD5: every route renders a placeholder this phase — real screens land in
// FE-1/2/3. Mirrors the EmptyState idiom (centered, muted).
export function Placeholder({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-[8px] text-center">
      <div className="text-[15px] font-semibold text-fg">{title}</div>
      <div className="text-[12.5px] text-fg-muted">
        Coming in <span className="font-mono">{phase}</span>
      </div>
    </div>
  );
}
