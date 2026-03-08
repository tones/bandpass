'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SyncInfo {
  totalItems: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
}

interface SyncStatusProps {
  onSyncComplete: () => void;
}

export function SyncStatus({ onSyncComplete }: SyncStatusProps) {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [triggered, setTriggered] = useState(false);
  const prevItemCount = useRef(0);
  const syncEverStarted = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json() as SyncInfo;
        setInfo(data);
        if (data.isSyncing) syncEverStarted.current = true;
        return data;
      }
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
      const isEmpty = data.totalItems === 0;

      if ((isStale || isEmpty) && !triggered) {
        setTriggered(true);
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

      if (data.totalItems > prevItemCount.current) {
        prevItemCount.current = data.totalItems;
        onSyncComplete();
      }

      if (!data.isSyncing && syncEverStarted.current) {
        clearInterval(interval);
        onSyncComplete();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [triggered, poll, onSyncComplete]);

  if (!info) return null;

  if (triggered && (!syncEverStarted.current || info.isSyncing)) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        Syncing... {info.totalItems > 0 ? `${info.totalItems} items` : 'starting'}
      </div>
    );
  }

  return null;
}
