'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { FeedItem } from '@/lib/bandcamp/types/domain';
import { WaveformPlayer } from '@/components/feed/WaveformPlayer';
import type { WaveformPlayerHandle } from '@/components/feed/WaveformPlayer';

interface PlayerContextValue {
  playingTrackUrl: string | null;
  playingItem: FeedItem | null;
  isPlaying: boolean;
  playerRef: React.RefObject<WaveformPlayerHandle | null>;
  play: (item: FeedItem) => void;
  stop: () => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaylist: (items: FeedItem[]) => void;
  next: () => void;
  prev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within a PlayerProvider');
  return ctx;
}

function scrollTrackIntoViewIfOffscreen(streamUrl: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  requestAnimationFrame(() => {
    let el: HTMLElement | null = null;
    try {
      el = document.querySelector(`[data-stream-url="${CSS.escape(streamUrl)}"]`);
    } catch {
      const all = document.querySelectorAll<HTMLElement>('[data-stream-url]');
      for (const item of all) {
        if (item.getAttribute('data-stream-url') === streamUrl) {
          el = item;
          break;
        }
      }
    }

    if (!el) return;

    const rect = el.getBoundingClientRect();
    const topBoundary = 72; // Clearance below sticky top header / filter bar
    const bottomBoundary = (window.innerHeight || document.documentElement.clientHeight) - 88; // Clearance above fixed player bar

    if (rect.bottom > bottomBoundary) {
      // Offscreen below: scroll down just enough to bring track above bottom player bar with breathing room
      const delta = rect.bottom - bottomBoundary + 16;
      window.scrollBy({ top: delta, behavior: 'smooth' });
    } else if (rect.top < topBoundary) {
      // Offscreen above: scroll up just enough to bring track below top header with breathing room
      const delta = rect.top - topBoundary - 16;
      window.scrollBy({ top: delta, behavior: 'smooth' });
    }
  });
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);
  const [playingItem, setPlayingItem] = useState<FeedItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylistState] = useState<FeedItem[]>([]);
  const playerRef = useRef<WaveformPlayerHandle>(null);

  const currentIndex = useMemo(() => {
    if (!playingItem) return -1;
    const directIndex = playlist.findIndex((item) => item.id === playingItem.id);
    if (directIndex !== -1) return directIndex;
    if (playingTrackUrl) {
      return playlist.findIndex((item) => item.track?.streamUrl === playingTrackUrl);
    }
    return -1;
  }, [playingItem, playlist, playingTrackUrl]);

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < playlist.length - 1;

  const play = useCallback((item: FeedItem) => {
    if (!item.track?.streamUrl) return;
    if (playingTrackUrl === item.track.streamUrl) {
      playerRef.current?.togglePlayPause();
      return;
    }
    setPlayingTrackUrl(item.track.streamUrl);
    setPlayingItem(item);
  }, [playingTrackUrl]);

  const stop = useCallback(() => {
    setPlayingTrackUrl(null);
    setPlayingItem(null);
    setIsPlaying(false);
  }, []);

  const setPlaylist = useCallback((items: FeedItem[]) => {
    setPlaylistState(items);
  }, []);

  const next = useCallback(() => {
    if (!canGoNext) return;
    const nextItem = playlist[currentIndex + 1];
    if (nextItem?.track?.streamUrl) {
      setPlayingTrackUrl(nextItem.track.streamUrl);
      setPlayingItem(nextItem);
      scrollTrackIntoViewIfOffscreen(nextItem.track.streamUrl);
    }
  }, [canGoNext, playlist, currentIndex]);

  const prev = useCallback(() => {
    if (!canGoPrev) return;
    const prevItem = playlist[currentIndex - 1];
    if (prevItem?.track?.streamUrl) {
      setPlayingTrackUrl(prevItem.track.streamUrl);
      setPlayingItem(prevItem);
      scrollTrackIntoViewIfOffscreen(prevItem.track.streamUrl);
    }
  }, [canGoPrev, playlist, currentIndex]);

  const nextRef = useRef(next);
  nextRef.current = next;
  const prevRef = useRef(prev);
  prevRef.current = prev;

  // Keyboard shortcuts when a track is loaded in the player bar:
  // - Space: toggle play/pause
  // - ArrowLeft: previous track
  // - ArrowRight: next track
  // - 0-9: seek to 0%, 10%, 20%, ..., 90% (YouTube style)
  // Skips text inputs so typing is not interrupted.
  useEffect(() => {
    if (!playingItem) return;

    const TEXT_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        if (TEXT_INPUT_TAGS.has(target.tagName)) return;
        if (target.isContentEditable) return;
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      }

      if (e.code === 'Space' || e.key === ' ') {
        if (e.repeat) return;
        e.preventDefault();
        playerRef.current?.togglePlayPause();
        return;
      }

      if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        if (e.repeat) return;
        e.preventDefault();
        prevRef.current();
        return;
      }

      if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        if (e.repeat) return;
        e.preventDefault();
        nextRef.current();
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        if (e.repeat) return;
        e.preventDefault();
        const digit = parseInt(e.key, 10);
        playerRef.current?.seekTo(digit / 10);
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playingItem]);

  return (
    <PlayerContext.Provider value={{
      playingTrackUrl, playingItem, isPlaying, playerRef,
      play, stop, setIsPlaying,
      setPlaylist, next, prev, canGoNext, canGoPrev,
    }}>
      {children}
      {playingItem && playingTrackUrl && (
        <WaveformPlayer
          ref={playerRef}
          item={playingItem}
          trackUrl={playingTrackUrl}
          onPlayStateChange={setIsPlaying}
          onClose={stop}
        />
      )}
    </PlayerContext.Provider>
  );
}
