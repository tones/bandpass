import type { CatalogTrack } from '@/lib/db/catalog';
import type { CrateItemRef } from '@/lib/crate-utils';
import { trackKey } from '@/lib/crate-utils';
import { AlbumTrackRow } from './AlbumTrackRow';
import type { CrateInfo } from './TrackActions';

interface TrackListProps {
  tracks: CatalogTrack[];
  playingTrackUrl: string | null;
  isPlayerPlaying: boolean;
  fallbackUrl: string;
  crates: CrateInfo[];
  itemCrateMap: Record<string, number[]>;
  showCrate?: boolean;
  onPlayTrack: (track: CatalogTrack) => void;
  onToggleCrate: (key: string, ref: CrateItemRef) => void;
  onAddToCrate: (key: string, ref: CrateItemRef, crateId: number) => void;
  onRemoveFromCrate: (key: string, ref: CrateItemRef, crateId: number) => void;
}

export function TrackList({
  tracks,
  playingTrackUrl,
  isPlayerPlaying,
  fallbackUrl,
  crates,
  itemCrateMap,
  showCrate,
  onPlayTrack,
  onToggleCrate,
  onAddToCrate,
  onRemoveFromCrate,
}: TrackListProps) {
  return (
    <>
      {tracks.map((track) => {
        const tk = trackKey(track.id);
        const ref: CrateItemRef = { trackId: track.id };
        return (
          <AlbumTrackRow
            key={track.id}
            track={track}
            isActive={playingTrackUrl === track.streamUrl && track.streamUrl != null && isPlayerPlaying}
            fallbackUrl={fallbackUrl}
            crates={crates}
            crateIds={itemCrateMap[tk]}
            showCrate={showCrate}
            onPlay={() => onPlayTrack(track)}
            onToggleCrate={() => onToggleCrate(tk, ref)}
            onAddToCrate={(crateId) => onAddToCrate(tk, ref, crateId)}
            onRemoveFromCrate={(crateId) => onRemoveFromCrate(tk, ref, crateId)}
          />
        );
      })}
    </>
  );
}
