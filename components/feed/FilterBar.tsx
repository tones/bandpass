// components/feed/FilterBar.tsx
import type { StoryType } from '@/lib/bandcamp';

interface FilterBarProps {
  activeFilters: Set<StoryType>;
  onToggle: (type: StoryType) => void;
}

const FILTERS: { type: StoryType; label: string }[] = [
  { type: 'friend_purchase', label: 'Friends' },
  { type: 'new_release', label: 'New Releases' },
  { type: 'also_purchased', label: 'Also Purchased' },
];

export function FilterBar({ activeFilters, onToggle }: FilterBarProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 px-6 py-3 backdrop-blur">
      <div className="flex gap-2">
        {FILTERS.map(({ type, label }) => {
          const active = activeFilters.has(type);
          return (
            <button
              key={type}
              onClick={() => onToggle(type)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                active
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          );
        })}
        {activeFilters.size > 0 && (
          <button
            onClick={() => activeFilters.forEach((t) => onToggle(t))}
            className="px-2 text-xs text-zinc-500 hover:text-zinc-400"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
