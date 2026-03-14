'use client';

import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import WavesurferPlayer from '@wavesurfer/react';
import type WaveSurfer from 'wavesurfer.js';
import type { FeedItem } from '@/lib/bandcamp';
import { formatDuration, proxyUrl } from '@/lib/formatters';
import { CrateIcon } from '@/components/icons/CrateIcon';
import { usePlayer } from '@/contexts/PlayerContext';
import {
  getCratesAction,
  getItemCratesAction,
  toggleDefaultCrate,
  addToCrateAction,
  removeFromCrateAction,
} from '@/app/crates/actions';

interface CrateInfo {
  id: number;
  name: string;
}

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
  const proxied = proxyUrl(trackUrl);

  const [crates, setCrates] = useState<CrateInfo[]>([]);
  const [itemCrateIds, setItemCrateIds] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setPickerOpen(false);
    getCratesAction()
      .then((c) => { if (!cancelled) setCrates(c.filter((cr) => cr.source === 'user').map(({ id, name }) => ({ id, name }))); })
      .catch(() => {});
    getItemCratesAction(item.id)
      .then((ids) => { if (!cancelled) setItemCrateIds(ids); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.id]);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  const isInAnyCrate = itemCrateIds.length > 0;
  const multiCrate = crates.length > 1;

  const handleCrateClick = useCallback(() => {
    if (multiCrate) {
      setPickerOpen((prev) => !prev);
    } else {
      setItemCrateIds((prev) => (prev.length > 0 ? [] : crates.length === 1 ? [crates[0].id] : []));
      toggleDefaultCrate(item.id).catch(() => {
        setItemCrateIds((prev) => (prev.length > 0 ? [] : crates.length === 1 ? [crates[0].id] : []));
      });
    }
  }, [multiCrate, item.id, crates]);

  const handlePickerToggle = useCallback((crateId: number, isIn: boolean) => {
    if (isIn) {
      setItemCrateIds((prev) => prev.filter((id) => id !== crateId));
      removeFromCrateAction(crateId, item.id).catch(() => {
        setItemCrateIds((prev) => [...prev, crateId]);
      });
    } else {
      setItemCrateIds((prev) => [...prev, crateId]);
      addToCrateAction(crateId, item.id).catch(() => {
        setItemCrateIds((prev) => prev.filter((id) => id !== crateId));
      });
    }
  }, [item.id]);

  const onReady = useCallback((ws: WaveSurfer) => {
    setWavesurfer(ws);
    setDuration(ws.getDuration());
    ws.play();
  }, []);

  useEffect(() => {
    if (wavesurfer && trackUrl !== prevUrlRef.current) {
      prevUrlRef.current = trackUrl;
      wavesurfer.load(proxyUrl(trackUrl));
    }
  }, [wavesurfer, trackUrl]);

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

        <div className="relative" ref={pickerRef}>
          <button
            onClick={handleCrateClick}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors ${
              isInAnyCrate
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
            title={isInAnyCrate ? 'Remove from crate' : 'Add to crate'}
          >
            <CrateIcon filled={isInAnyCrate} />
          </button>

          {pickerOpen && multiCrate && (
            <div className="absolute bottom-full right-0 z-30 mb-1 min-w-[160px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              {crates.map((crate) => {
                const isIn = itemCrateIds.includes(crate.id);
                return (
                  <button
                    key={crate.id}
                    onClick={() => handlePickerToggle(crate.id, isIn)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-zinc-800"
                  >
                    <span className={`w-4 text-center text-xs ${isIn ? 'text-amber-400' : 'text-zinc-700'}`}>
                      {isIn ? '✓' : ''}
                    </span>
                    <span className={isIn ? 'text-zinc-100' : 'text-zinc-400'}>
                      {crate.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <a
          href={item.album.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm text-zinc-600 transition-colors hover:text-zinc-400"
          title="Open on Bandcamp"
        >
          ↗
        </a>

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
