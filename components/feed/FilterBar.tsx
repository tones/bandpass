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

interface Tag {
  name: string;
  count: number;
}

interface FilterBarProps {
  feedFilter: FeedFilter;
  onFeedFilterChange: (filter: FeedFilter) => void;
  friends: Friend[];
  selectedFriend: string | null;
  onFriendChange: (username: string | null) => void;
  tags: Tag[];
  selectedTag: string | null;
  onTagChange: (tag: string | null) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  oldestStoryDate?: number | null;
}

const FEED_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: 'new_release', label: 'New Releases' },
  { value: 'friend_purchase', label: 'Friend Purchases' },
  { value: 'my_purchase', label: 'My Purchases' },
  { value: 'all', label: 'All Items' },
];

const DEFAULT_OLDEST = new Date(Date.now() - 180 * 86400000);

const CHEVRON_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;
const SELECT_CLASS = 'appearance-none rounded-full bg-zinc-800/50 py-1 pl-3 pr-7 text-sm text-zinc-400 outline-none transition-colors hover:bg-zinc-800 hover:text-zinc-300 cursor-pointer bg-no-repeat bg-[right_0.5rem_center]';

function formatDateLabel(range: DateRange | undefined, oldest: Date): string {
  const now = new Date();
  const fmt = (d: Date) => {
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) });
  };
  if (!range?.from) {
    return `${fmt(oldest)} – Today`;
  }
  if (!range.to || range.from.getTime() === range.to.getTime()) {
    return fmt(range.from);
  }
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

export function FilterBar({ feedFilter, onFeedFilterChange, friends, selectedFriend, onFriendChange, tags, selectedTag, onTagChange, dateRange, onDateRangeChange, oldestStoryDate }: FilterBarProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const oldestDate = oldestStoryDate ? new Date(oldestStoryDate * 1000) : DEFAULT_OLDEST;

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
        <select
          value={feedFilter}
          onChange={(e) => {
            const value = e.target.value as FeedFilter;
            onFeedFilterChange(value);
            if (value !== 'friend_purchase') onFriendChange(null);
          }}
          className={SELECT_CLASS}
          style={{ backgroundImage: CHEVRON_SVG }}
        >
          {FEED_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {feedFilter === 'friend_purchase' && friends.length > 0 && (
          <div>
            <select
              value={selectedFriend ?? ''}
              onChange={(e) => onFriendChange(e.target.value || null)}
              className={SELECT_CLASS}
              style={{
                backgroundImage: CHEVRON_SVG,
                ...(selectedFriend ? { backgroundColor: 'rgb(14 165 233 / 0.15)', color: 'rgb(56 189 248)' } : {}),
              }}
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

        {tags.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              value={selectedTag ?? ''}
              onChange={(e) => onTagChange(e.target.value || null)}
              className={SELECT_CLASS}
              style={{
                backgroundImage: CHEVRON_SVG,
                ...(selectedTag ? { backgroundColor: 'rgb(168 85 247 / 0.15)', color: 'rgb(192 132 252)' } : {}),
              }}
            >
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.count})
                </option>
              ))}
            </select>
            {selectedTag && (
              <button
                onClick={() => onTagChange(null)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-purple-400 transition-colors hover:bg-purple-400/20 hover:text-purple-300"
                title="Clear tag filter"
              >
                ✕
              </button>
            )}
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
            {formatDateLabel(dateRange, oldestDate)}
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
                disabled={{ before: oldestDate, after: new Date() }}
                defaultMonth={new Date()}
                startMonth={oldestDate}
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
