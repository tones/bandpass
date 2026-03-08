// components/feed/FilterBar.tsx
import type { StoryType } from '@/lib/bandcamp';

export type TimeRange = '7d' | '30d' | '90d' | 'all';

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All' },
];

interface FilterBarProps {
  activeFilters: Set<StoryType>;
  onToggle: (type: StoryType) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

const FILTERS: { type: StoryType; label: string }[] = [
  { type: 'friend_purchase', label: 'Friends' },
  { type: 'new_release', label: 'New Releases' },
  { type: 'also_purchased', label: 'Also Purchased' },
];

export function FilterBar({ activeFilters, onToggle, timeRange, onTimeRangeChange }: FilterBarProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-3 border-l border-zinc-800 pl-3 ml-3">
          <select
            value={timeRange}
            onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
            className="rounded bg-zinc-800/50 px-2 py-1 text-sm text-zinc-400 outline-none hover:bg-zinc-800"
          >
            {TIME_RANGES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
