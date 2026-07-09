import { Loader2, TriangleAlert } from 'lucide-react';
import { EmptyState } from './empty-state';

// Shared query-state UI so screens never render fake data (FE-1 honest-data
// rule): a centered spinner while loading, a danger EmptyState on failure.

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-[8px] py-[40px] text-fg-subtle">
      <Loader2 className="animate-spin" size={18} strokeWidth={2} />
      <span className="text-[12.5px]">{label}</span>
    </div>
  );
}

export function LoadError({ description }: { description?: string }) {
  return (
    <EmptyState
      tone="danger"
      icon={<TriangleAlert size={18} strokeWidth={2} />}
      title="Couldn't load"
      description={
        description ??
        'The API request failed. Check the API is running, then retry.'
      }
    />
  );
}
