'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSyncPolling } from '@/hooks/useSyncPolling';

interface SyncStatusProps {
  onSyncComplete: () => void;
  onOldestDateChange?: (timestamp: number) => void;
}

const PROGRESSIVE_REFRESH_INTERVAL_MS = 10_000;

export function SyncStatus({ onSyncComplete, onOldestDateChange }: SyncStatusProps) {
  const [message, setMessage] = useState<string | null>(null);
  const lastRefreshAt = useRef(0);
  const lastRefreshedCount = useRef(0);

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

  const { isActive } = useSyncPolling({
    onSyncComplete,
    onStateChange(data) {
      if (data.oldestStoryDate) {
        onOldestDateChange?.(data.oldestStoryDate);
      }

      const active = data.isSyncing || data.isDeepSyncing || data.isCollectionSyncing || data.isWishlistSyncing || data.isEnrichingTags;
      if (active) {
        if (data.isEnrichingTags) {
          const parts: string[] = [];
          if (data.tagsEnriched) parts.push(`${data.tagsEnriched} done`);
          if (data.enrichmentPendingCount) parts.push(`${data.enrichmentPendingCount.toLocaleString()} remaining`);
          setMessage(parts.length ? `Enriching tags... (${parts.join(', ')})` : 'Enriching tags...');
        } else if (data.isWishlistSyncing) {
          setMessage('Syncing wishlist...');
        } else if (data.isCollectionSyncing) {
          setMessage('Syncing purchases...');
        } else if (data.isDeepSyncing) {
          setMessage('Syncing older history...');
        } else {
          setMessage('Syncing...');
        }
        maybeRefreshFeed(data.totalItems);
      } else {
        setMessage(null);
      }
    },
  });

  if (!isActive || !message) return null;

  return (
    <Link
      href="/account"
      className="inline-flex items-center gap-2 text-sm text-amber-400 transition-colors hover:text-amber-300"
    >
      <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
      <span>{message}</span>
    </Link>
  );
}
