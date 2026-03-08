'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import type { StoryType } from '@/lib/bandcamp';

export type FeedFilter = StoryType | 'all';

interface Friend {
  name: string;
  username: string;
  count: number;
}

interface FilterBarProps {
  feedFilter: FeedFilter;
  onFeedFilterChange: (filter: FeedFilter) => void;
  friends: Friend[];
  selectedFriend: string | null;
  onFriendChange: (username: string | null) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}

const FEED_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: 'new_release', label: 'New Releases' },
  { value: 'friend_purchase', label: 'Friend Purchases' },
  { value: 'also_purchased', label: 'Also Purchased' },
  { value: 'all', label: 'All Items' },
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

export function FilterBar({ feedFilter, onFeedFilterChange, friends, selectedFriend, onFriendChange, dateRange, onDateRangeChange }: FilterBarProps) {
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
        {FEED_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => {
              onFeedFilterChange(value);
              if (value !== 'friend_purchase') onFriendChange(null);
            }}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              feedFilter === value
                ? 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}

        {feedFilter === 'friend_purchase' && friends.length > 0 && (
          <div className="ml-3 border-l border-zinc-800 pl-3">
            <select
              value={selectedFriend ?? ''}
              onChange={(e) => onFriendChange(e.target.value || null)}
              className="rounded-full bg-zinc-800/50 px-3 py-1 text-sm text-zinc-400 outline-none transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              style={selectedFriend ? { backgroundColor: 'rgb(14 165 233 / 0.15)', color: 'rgb(56 189 248)' } : undefined}
            >
              <option value="">All friends</option>
              {friends.map((f) => (
                <option key={f.username} value={f.username}>
                  {f.name} ({f.count})
                </option>
              ))}
            </select>
          </div>
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
