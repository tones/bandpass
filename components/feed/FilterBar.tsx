'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import type { StoryType } from '@/lib/bandcamp';

interface FilterBarProps {
  activeFilters: Set<StoryType>;
  onToggle: (type: StoryType) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}

const FILTERS: { type: StoryType; label: string }[] = [
  { type: 'friend_purchase', label: 'Friends' },
  { type: 'new_release', label: 'New Releases' },
  { type: 'also_purchased', label: 'Also Purchased' },
];

const SIX_MONTHS_AGO = new Date(Date.now() - 180 * 86400000);

function formatDateLabel(range: DateRange | undefined): string {
  if (!range?.from) return 'All time';
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!range.to || range.from.getTime() === range.to.getTime()) {
    return fmt(range.from);
  }
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

export function FilterBar({ activeFilters, onToggle, dateRange, onDateRangeChange }: FilterBarProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [calendarOpen]);

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
        <div className="relative ml-3 border-l border-zinc-800 pl-3" ref={popoverRef}>
          <button
            onClick={() => setCalendarOpen((v) => !v)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              dateRange?.from
                ? 'bg-amber-600/20 text-amber-400'
                : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            {formatDateLabel(dateRange)}
          </button>
          {dateRange?.from && (
            <button
              onClick={() => onDateRangeChange(undefined)}
              className="ml-1 px-1 text-xs text-zinc-500 hover:text-zinc-400"
            >
              ×
            </button>
          )}
          {calendarOpen && (
            <div className="absolute left-0 top-full mt-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-xl">
              <DayPicker
                mode="range"
                selected={dateRange}
                onSelect={onDateRangeChange}
                disabled={{ before: SIX_MONTHS_AGO, after: new Date() }}
                defaultMonth={new Date()}
                startMonth={SIX_MONTHS_AGO}
                endMonth={new Date()}
                classNames={{
                  root: 'rdp-dark',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
