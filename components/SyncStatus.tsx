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
  isCollectionSyncing: boolean;
  collectionSynced: boolean;
}

interface SyncStatusProps {
  onSyncComplete: () => void;
  onOldestDateChange?: (timestamp: number) => void;
}

const PROGRESSIVE_REFRESH_INTERVAL_MS = 10_000;

export function SyncStatus({ onSyncComplete, onOldestDateChange }: SyncStatusProps) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [triggered, setTriggered] = useState(false);
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
      const isActive = data.isSyncing || data.isDeepSyncing || data.isCollectionSyncing;
      const needsSync = !data.deepSyncComplete || !data.collectionSynced;
      if (isActive || needsSync) {
        setTriggered(true);
        setSyncing(true);
      }
    });
  }, [poll, triggered]);

  useEffect(() => {
    if (!triggered) return;

    const interval = setInterval(async () => {
      const data = await poll();
      if (!data) return;

      if (data.oldestStoryDate) {
        onOldestDateChange?.(data.oldestStoryDate);
      }

      const isActive = data.isSyncing || data.isDeepSyncing || data.isCollectionSyncing;

      if (isActive) {
        setSyncing(true);
        if (data.isCollectionSyncing) {
          setMessage('Syncing purchases...');
        } else if (data.isDeepSyncing) {
          setMessage('Syncing older history...');
        } else {
          setMessage('Syncing...');
        }
        maybeRefreshFeed(data.totalItems);
      } else {
        setSyncing(false);
        setMessage(null);
        onSyncComplete();
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [triggered, poll, onSyncComplete, onOldestDateChange, maybeRefreshFeed]);

  if (!syncing || !message) return null;

  return (
    <a
      href="/account"
      className="inline-flex items-center gap-2 text-sm text-amber-400 transition-colors hover:text-amber-300"
    >
      <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
      <span>{message}</span>
    </a>
  );
}
