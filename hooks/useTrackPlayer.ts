'use client';

import { useState, useCallback, useRef } from 'react';
import type { FeedItem } from '@/lib/bandcamp/types/domain';
import type { WaveformPlayerHandle } from '@/components/feed/WaveformPlayer';

export function useTrackPlayer() {
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
  }, []);

  return {
    playingTrackUrl,
    playingItem,
    isPlaying,
    playerRef,
    play,
    stop,
    setIsPlaying,
  };
}
