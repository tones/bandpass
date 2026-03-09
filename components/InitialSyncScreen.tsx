'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const SIX_MONTHS_SECONDS = 180 * 24 * 60 * 60;

interface SyncInfo {
  totalItems: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  oldestStoryDate: number | null;
  newestStoryDate: number | null;
}

interface InitialSyncScreenProps {
  onComplete: () => void;
}

export function InitialSyncScreen({ onComplete }: InitialSyncScreenProps) {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [triggered, setTriggered] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = (await res.json()) as SyncInfo;
        setInfo(data);
        return data;
      }
    } catch (err) {
      console.error('InitialSyncScreen poll error:', err);
    }
    return null;
  }, []);

  useEffect(() => {
    fetch('/api/sync', { method: 'POST' })
      .then(() => setTriggered(true))
      .catch((err) => console.error('Failed to trigger initial sync:', err));
  }, []);

  useEffect(() => {
    if (!triggered) return;

    const interval = setInterval(async () => {
      const data = await poll();
      if (!data) return;

      if (data.oldestStoryDate) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - data.oldestStoryDate;
        const pct = Math.min(100, Math.max(0, (elapsed / SIX_MONTHS_SECONDS) * 100));
        setProgress(pct);
      }

      if (!data.isSyncing && data.lastSyncAt) {
        setProgress(100);
        clearInterval(interval);
        setTimeout(onComplete, 500);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [triggered, poll, onComplete]);

  const itemCount = info?.totalItems ?? 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">BandPass</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Loading 6 months of feed data...
      </p>
      <div className="mb-3 h-2 w-80 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500">
        {itemCount > 0
          ? `${itemCount} items loaded · ${Math.round(progress)}%`
          : 'Starting sync...'}
      </p>
    </div>
  );
}
