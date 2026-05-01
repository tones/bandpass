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

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);
  const [playingItem, setPlayingItem] = useState<FeedItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylistState] = useState<FeedItem[]>([]);
  const playerRef = useRef<WaveformPlayerHandle>(null);

  const currentIndex = useMemo(() => {
    if (!playingItem) return -1;
    return playlist.findIndex((item) => item.id === playingItem.id);
  }, [playingItem, playlist]);

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
    }
  }, [canGoNext, playlist, currentIndex]);

  const prev = useCallback(() => {
    if (!canGoPrev) return;
    const prevItem = playlist[currentIndex - 1];
    if (prevItem?.track?.streamUrl) {
      setPlayingTrackUrl(prevItem.track.streamUrl);
      setPlayingItem(prevItem);
    }
  }, [canGoPrev, playlist, currentIndex]);

  // Spacebar toggles play/pause when a track is loaded in the player bar.
  // Skips inputs / buttons so typing and button activation behave normally.
  useEffect(() => {
    if (!playingItem) return;

    const SKIP_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        if (SKIP_TAGS.has(target.tagName)) return;
        if (target.isContentEditable) return;
      }

      e.preventDefault();
      playerRef.current?.togglePlayPause();
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
