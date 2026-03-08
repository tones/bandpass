'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SyncInfo {
  totalItems: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  newItemsFound: number | null;
}

interface SyncStatusProps {
  onSyncComplete: () => void;
}

type SyncPhase = 'idle' | 'checking' | 'done';

export function SyncStatus({ onSyncComplete }: SyncStatusProps) {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [newItems, setNewItems] = useState(0);
  const [triggered, setTriggered] = useState(false);
  const syncEverStarted = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) return (await res.json()) as SyncInfo;
    } catch (err) {
      console.error('SyncStatus poll error:', err);
    }
    return null;
  }, []);

  useEffect(() => {
    poll().then((data) => {
      if (!data) return;

      const staleThreshold = 60 * 60 * 1000;
      const isStale = !data.lastSyncAt || Date.now() - new Date(data.lastSyncAt).getTime() > staleThreshold;

      if (isStale && !triggered) {
        setTriggered(true);
        setPhase('checking');
        fetch('/api/sync', { method: 'POST' })
          .catch((err) => console.error('Failed to trigger sync:', err));
      }
    });
  }, [poll, triggered]);

  useEffect(() => {
    if (!triggered) return;

    const interval = setInterval(async () => {
      const data = await poll();
      if (!data) return;

      if (data.isSyncing) syncEverStarted.current = true;

      if (!data.isSyncing && (syncEverStarted.current || data.lastSyncAt)) {
        clearInterval(interval);
        const found = data.newItemsFound ?? 0;
        setNewItems(found);
        setPhase('done');
        if (found > 0) onSyncComplete();
        setTimeout(() => setPhase('idle'), 4000);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [triggered, poll, onSyncComplete]);

  if (phase === 'checking') {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        Checking for new items...
      </div>
    );
  }

  if (phase === 'done' && newItems > 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-400">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
        Found {newItems} new {newItems === 1 ? 'item' : 'items'}
      </div>
    );
  }

  return null;
}
