'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SyncInfo {
  totalItems: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  newItemsFound: number | null;
  isDeepSyncing: boolean;
  deepSyncComplete: boolean;
  oldestStoryDate: number | null;
}

interface SyncStatusProps {
  onSyncComplete: () => void;
  onOldestDateChange?: (timestamp: number) => void;
}

type SyncPhase = 'idle' | 'initial' | 'checking' | 'done' | 'deep' | 'deep_done';

const PROGRESSIVE_REFRESH_INTERVAL_MS = 10_000;

function formatSyncDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', ...(!sameYear && { year: 'numeric' }) });
}

function formatItemCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function SyncStatus({ onSyncComplete, onOldestDateChange }: SyncStatusProps) {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [newItems, setNewItems] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [oldestDate, setOldestDate] = useState<number | null>(null);
  const [triggered, setTriggered] = useState(false);
  const syncEverStarted = useRef(false);
  const lastRefreshAt = useRef(0);
  const lastRefreshedCount = useRef(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) return (await res.json()) as SyncInfo;
    } catch (err) {
      console.error('SyncStatus poll error:', err);
    }
    return null;
  }, []);

  const maybeRefreshFeed = useCallback((itemCount: number) => {
    const now = Date.now();
    if (
      itemCount > lastRefreshedCount.current &&
      now - lastRefreshAt.current > PROGRESSIVE_REFRESH_INTERVAL_MS
    ) {
      lastRefreshAt.current = now;
      lastRefreshedCount.current = itemCount;
      onSyncComplete();
    }
  }, [onSyncComplete]);

  useEffect(() => {
    poll().then((data) => {
      if (!data || triggered) return;

      const staleThreshold = 60 * 60 * 1000;
      const isStale = !data.lastSyncAt || Date.now() - new Date(data.lastSyncAt).getTime() > staleThreshold;
      const isFirstSync = !data.lastSyncAt;
      const deepSyncInProgress = data.isDeepSyncing || data.isSyncing;
      const needsSync = !data.deepSyncComplete;

      if (isStale || needsSync || deepSyncInProgress) {
        setTriggered(true);

        if (isFirstSync) {
          setPhase('initial');
        } else if (deepSyncInProgress && !isStale) {
          setPhase('deep');
        } else if (isStale) {
          setPhase('checking');
        } else {
          setPhase('deep');
        }

        if (!deepSyncInProgress) {
          fetch('/api/sync', { method: 'POST' })
            .catch((err) => console.error('Failed to trigger sync:', err));
        }
      }
    });
  }, [poll, triggered]);

  useEffect(() => {
    if (!triggered) return;

    const interval = setInterval(async () => {
      const data = await poll();
      if (!data) return;

      if (data.isSyncing) syncEverStarted.current = true;
      setTotalItems(data.totalItems);

      if (data.oldestStoryDate) {
        setOldestDate(data.oldestStoryDate);
        onOldestDateChange?.(data.oldestStoryDate);
      }

      if (data.isSyncing && (phase === 'initial' || phase === 'deep')) {
        maybeRefreshFeed(data.totalItems);
        return;
      }

      if (data.isDeepSyncing) {
        setPhase('deep');
        maybeRefreshFeed(data.totalItems);
        return;
      }

      if (phase === 'deep' && !data.isDeepSyncing) {
        if (data.deepSyncComplete) {
          setPhase('deep_done');
          onSyncComplete();
          setTimeout(() => setPhase('idle'), 4000);
          clearInterval(interval);
        }
        return;
      }

      if (!data.isSyncing && (syncEverStarted.current || data.lastSyncAt)) {
        if (phase === 'initial' || phase === 'checking') {
          const found = data.newItemsFound ?? 0;
          setNewItems(found);
          setPhase('done');
          onSyncComplete();
        }

        if (data.deepSyncComplete) {
          setTimeout(() => setPhase('idle'), 4000);
          clearInterval(interval);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [triggered, poll, onSyncComplete, onOldestDateChange, maybeRefreshFeed, phase]);

  if (phase === 'initial') {
    return (
      <SyncBar color="amber">
        <PulsingDot color="amber" />
        <span>Syncing your feed{totalItems > 0 ? `... ${formatItemCount(totalItems)} items` : '...'}</span>
      </SyncBar>
    );
  }

  if (phase === 'checking') {
    return (
      <SyncBar color="amber">
        <PulsingDot color="amber" />
        <span>Checking for new items...</span>
      </SyncBar>
    );
  }

  if (phase === 'done') {
    return (
      <SyncBar color="emerald">
        <SolidDot color="emerald" />
        <span>
          {newItems > 0
            ? `Found ${formatItemCount(newItems)} new ${newItems === 1 ? 'item' : 'items'}`
            : 'Feed is up to date'}
        </span>
      </SyncBar>
    );
  }

  if (phase === 'deep') {
    return (
      <SyncBar color="zinc">
        <PulsingDot color="zinc" />
        <span>
          Syncing older history
          {totalItems > 0 ? ` · ${formatItemCount(totalItems)} items` : ''}
          {oldestDate ? ` · back to ${formatSyncDate(oldestDate)}` : '...'}
        </span>
      </SyncBar>
    );
  }

  if (phase === 'deep_done') {
    return (
      <SyncBar color="emerald">
        <SolidDot color="emerald" />
        <span>Full history loaded · {formatItemCount(totalItems)} items</span>
      </SyncBar>
    );
  }

  return null;
}

type DotColor = 'amber' | 'emerald' | 'zinc';

const DOT_COLORS: Record<DotColor, string> = {
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  zinc: 'bg-zinc-500',
};

const TEXT_COLORS: Record<DotColor, string> = {
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  zinc: 'text-zinc-500',
};

function SyncBar({ color, children }: { color: DotColor; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${TEXT_COLORS[color]}`}>
      {children}
    </div>
  );
}

function PulsingDot({ color }: { color: DotColor }) {
  return <span className={`inline-block h-2 w-2 shrink-0 animate-pulse rounded-full ${DOT_COLORS[color]}`} />;
}

function SolidDot({ color }: { color: DotColor }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[color]}`} />;
}
