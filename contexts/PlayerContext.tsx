'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
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
  const playerRef = useRef<WaveformPlayerHandle>(null);

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

  return (
    <PlayerContext.Provider value={{ playingTrackUrl, playingItem, isPlaying, playerRef, play, stop, setIsPlaying }}>
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
