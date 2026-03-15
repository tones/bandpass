'use client';

import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import WavesurferPlayer from '@wavesurfer/react';
import type WaveSurfer from 'wavesurfer.js';
import type { FeedItem } from '@/lib/bandcamp';
import { formatDuration, proxyUrl } from '@/lib/formatters';
import { TrackActions } from '@/components/TrackActions';
import type { CrateInfo } from '@/components/TrackActions';
import { usePlayer } from '@/contexts/PlayerContext';
import type { CrateItemRef } from '@/lib/crate-utils';
import { releaseKey, trackKey } from '@/lib/crate-utils';
import {
  getCratesAction,
  getItemCratesAction,
  toggleDefaultCrate,
  toggleDefaultCrateForAlbum,
  addToCrateAction,
  removeFromCrateAction,
} from '@/app/(app)/crates/actions';

interface WaveformPlayerProps {
  item: FeedItem;
  trackUrl: string;
  onPlayStateChange?: (playing: boolean) => void;
  onClose?: () => void;
}

export interface WaveformPlayerHandle {
  togglePlayPause: () => void;
}

export const WaveformPlayer = forwardRef<WaveformPlayerHandle, WaveformPlayerProps>(
  function WaveformPlayer({ item, trackUrl, onPlayStateChange, onClose }, ref) {
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const prevUrlRef = useRef(trackUrl);
  const catalogTrackId = item.track?.catalogTrackId;
  const proxied = proxyUrl(trackUrl, catalogTrackId);

  const [crates, setCrates] = useState<CrateInfo[]>([]);
  const [itemCrateIds, setItemCrateIds] = useState<number[]>([]);

  const itemRef: CrateItemRef | null = item.track?.catalogTrackId
    ? { trackId: item.track.catalogTrackId }
    : item.releaseId
      ? { releaseId: item.releaseId }
      : null;

  useEffect(() => {
    let cancelled = false;
    getCratesAction()
      .then((c) => { if (!cancelled) setCrates(c.filter((cr) => cr.source === 'user').map(({ id, name }) => ({ id, name }))); })
      .catch(() => {});
    if (itemRef) {
      getItemCratesAction(itemRef)
        .then((ids) => { if (!cancelled) setItemCrateIds(ids); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleCrate = useCallback(() => {
    setItemCrateIds((prev) => (prev.length > 0 ? [] : crates.length === 1 ? [crates[0].id] : []));
    if (itemRef) {
      toggleDefaultCrate(itemRef).catch(() => {
        setItemCrateIds((prev) => (prev.length > 0 ? [] : crates.length === 1 ? [crates[0].id] : []));
      });
    } else {
      toggleDefaultCrateForAlbum({
        url: item.album.url,
        title: item.album.title,
        imageUrl: item.album.imageUrl,
        artistName: item.artist.name,
        artistUrl: item.artist.url,
        bandcampId: item.album.id,
      }).catch(() => {
        setItemCrateIds((prev) => (prev.length > 0 ? [] : crates.length === 1 ? [crates[0].id] : []));
      });
    }
  }, [item, itemRef, crates]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddToCrate = useCallback((crateId: number) => {
    if (!itemRef) return;
    setItemCrateIds((prev) => [...prev, crateId]);
    addToCrateAction(crateId, itemRef).catch(() => {
      setItemCrateIds((prev) => prev.filter((id) => id !== crateId));
    });
  }, [itemRef]);

  const handleRemoveFromCrate = useCallback((crateId: number) => {
    if (!itemRef) return;
    setItemCrateIds((prev) => prev.filter((id) => id !== crateId));
    removeFromCrateAction(crateId, itemRef).catch(() => {
      setItemCrateIds((prev) => [...prev, crateId]);
    });
  }, [itemRef]);

  const onReady = useCallback((ws: WaveSurfer) => {
    setWavesurfer(ws);
    setDuration(ws.getDuration());
    ws.play();
  }, []);

  useEffect(() => {
    if (wavesurfer && trackUrl !== prevUrlRef.current) {
      prevUrlRef.current = trackUrl;
      wavesurfer.load(proxyUrl(trackUrl, catalogTrackId));
    }
  }, [wavesurfer, trackUrl, catalogTrackId]);

  const togglePlayPause = useCallback(() => {
    wavesurfer?.playPause();
  }, [wavesurfer]);

  const { next, prev, canGoNext, canGoPrev } = usePlayer();

  useImperativeHandle(ref, () => ({ togglePlayPause }), [togglePlayPause]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-center gap-4">
        <img
          src={item.album.imageUrl}
          alt={item.album.title}
          className="h-14 w-14 shrink-0 rounded"
        />
        <div className="w-40 shrink-0">
          <div className="truncate text-sm font-medium text-zinc-100">
            {item.track?.title}
          </div>
          <div className="truncate text-xs text-zinc-400">
            {item.artist.name} — {item.album.title}
          </div>
        </div>

        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">
          {formatDuration(currentTime)}
        </span>

        <div className="min-w-0 flex-1 cursor-pointer">
          <WavesurferPlayer
            key={trackUrl}
            height={48}
            barWidth={2}
            barGap={1}
            barRadius={2}
            waveColor="#52525b"
            progressColor="#d97706"
            cursorColor="transparent"
            url={proxied}
            onReady={onReady}
            onPlay={() => { setIsPlaying(true); onPlayStateChange?.(true); }}
            onPause={() => { setIsPlaying(false); onPlayStateChange?.(false); }}
            onTimeupdate={(ws: WaveSurfer) => setCurrentTime(ws.getCurrentTime())}
          />
        </div>

        <span className="w-10 shrink-0 text-xs tabular-nums text-zinc-500">
          {duration > 0 ? formatDuration(duration) : '—'}
        </span>

        <button
          onClick={prev}
          disabled={!canGoPrev}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            canGoPrev
              ? 'cursor-pointer text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
              : 'cursor-default text-zinc-700'
          }`}
          title="Previous track"
        >
          ⏮
        </button>

        <button
          onClick={togglePlayPause}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-800 text-zinc-200 transition-colors hover:bg-zinc-700"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <button
          onClick={next}
          disabled={!canGoNext}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            canGoNext
              ? 'cursor-pointer text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
              : 'cursor-default text-zinc-700'
          }`}
          title="Next track"
        >
          ⏭
        </button>

        <TrackActions
          isPlaying={false}
          hasStream={false}
          isInCrate={itemCrateIds.length > 0}
          bandcampUrl={item.album.url}
          onPlay={() => {}}
          onToggleCrate={handleToggleCrate}
          size="md"
          showPlayButton={false}
          crates={crates}
          itemCrateIds={itemCrateIds}
          onAddToCrate={handleAddToCrate}
          onRemoveFromCrate={handleRemoveFromCrate}
        />

        {onClose && (
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-zinc-600 transition-colors hover:text-zinc-300"
            title="Close player"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
});
