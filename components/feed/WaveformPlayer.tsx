'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import WavesurferPlayer from '@wavesurfer/react';
import type WaveSurfer from 'wavesurfer.js';
import type { FeedItem } from '@/lib/bandcamp';
import { formatDuration, proxyUrl } from '@/lib/formatters';

interface WaveformPlayerProps {
  item: FeedItem;
  trackUrl: string;
  isShortlisted?: boolean;
  onToggleShortlist?: () => void;
}

export function WaveformPlayer({ item, trackUrl, isShortlisted, onToggleShortlist }: WaveformPlayerProps) {
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const prevUrlRef = useRef(trackUrl);
  const proxied = proxyUrl(trackUrl);

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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-center gap-4">
        <img
          src={item.album.imageUrl}
          alt=""
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

        <div className="min-w-0 flex-1">
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
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeupdate={(ws: WaveSurfer) => setCurrentTime(ws.getCurrentTime())}
          />
        </div>

        <span className="w-10 shrink-0 text-xs tabular-nums text-zinc-500">
          {duration > 0 ? formatDuration(duration) : '—'}
        </span>

        <button
          onClick={togglePlayPause}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 transition-colors hover:bg-zinc-700"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {onToggleShortlist && (
          <button
            onClick={onToggleShortlist}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-lg transition-colors ${
              isShortlisted
                ? 'text-rose-400 hover:text-rose-300'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
            title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
          >
            <span className="leading-none">{isShortlisted ? '♥' : '♡'}</span>
          </button>
        )}

        <a
          href={item.album.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm text-zinc-600 transition-colors hover:text-zinc-400"
          title="Open on Bandcamp"
        >
          ↗
        </a>
      </div>
    </div>
  );
}
