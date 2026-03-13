import { useState, useEffect, useCallback, useRef } from 'react';

export interface SyncState {
  totalItems: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  isDeepSyncing: boolean;
  deepSyncComplete: boolean;
  oldestStoryDate: number | null;
  isCollectionSyncing: boolean;
  collectionSynced: boolean;
  collectionItemsFound?: number;
  newItemsFound?: number | null;
  isWishlistSyncing: boolean;
  wishlistSynced: boolean;
  wishlistItemsFound?: number;
  isEnrichingTags: boolean;
  tagsEnriched?: number;
  enrichmentPendingCount?: number;
  isAnalyzingAudio: boolean;
  audioAnalyzed?: number;
  audioAnalysisPending?: number;
  audioAnalysisDone?: number;
  audioAnalysisEnabled?: boolean;
}

interface UseSyncPollingOptions {
  onSyncComplete?: () => void;
  onStateChange?: (state: SyncState) => void;
}

const POLL_INTERVAL_MS = 3000;

export function useSyncPolling(options: UseSyncPollingOptions = {}) {
  const [state, setState] = useState<SyncState | null>(null);
  const [polling, setPolling] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fetchState = useCallback(async (): Promise<SyncState | null> => {
    try {
      const res = await fetch('/api/sync');
      if (!res.ok) return null;
      return (await res.json()) as SyncState;
    } catch {
      return null;
    }
  }, []);

  const isActive = useCallback((s: SyncState) => {
    const jobRunning = s.isSyncing || s.isDeepSyncing || s.isCollectionSyncing || s.isWishlistSyncing || s.isEnrichingTags || s.isAnalyzingAudio;
    const enrichmentQueued = (s.enrichmentPendingCount ?? 0) > 0 && !s.isEnrichingTags;
    return jobRunning || enrichmentQueued;
  }, []);

  useEffect(() => {
    fetchState().then((data) => {
      if (!data) return;
      setState(data);
      optionsRef.current.onStateChange?.(data);

      const needsSync = !data.deepSyncComplete || !data.collectionSynced || !data.wishlistSynced || (data.enrichmentPendingCount ?? 0) > 0;
      if (isActive(data) || needsSync) {
        setPolling(true);
      }
    });
  }, [fetchState, isActive]);

  useEffect(() => {
    if (!polling) return;

    const interval = setInterval(async () => {
      const data = await fetchState();
      if (!data) return;

      setState(data);
      optionsRef.current.onStateChange?.(data);

      if (!isActive(data)) {
        setPolling(false);
        optionsRef.current.onSyncComplete?.();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [polling, fetchState, isActive]);

  const triggerSync = useCallback(async () => {
    setPolling(true);
    setState((prev) => prev ? { ...prev, isSyncing: true } : prev);
    try {
      await fetch('/api/sync', { method: 'POST' });
    } catch (err) {
      console.error('Failed to trigger sync:', err);
    }
  }, []);

  return {
    state,
    isActive: state ? isActive(state) : false,
    triggerSync,
  };
}
