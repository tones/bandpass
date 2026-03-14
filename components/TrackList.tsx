import type { CatalogTrack } from '@/lib/db/catalog';
import { AlbumTrackRow } from './AlbumTrackRow';
import type { CrateInfo } from './TrackActions';

function catalogTrackCrateId(trackId: number): string {
  return `catalog-track-${trackId}`;
}

interface TrackListProps {
  tracks: CatalogTrack[];
  playingTrackUrl: string | null;
  isPlayerPlaying: boolean;
  fallbackUrl: string;
  crates: CrateInfo[];
  itemCrateMap: Record<string, number[]>;
  showCrate?: boolean;
  onPlayTrack: (track: CatalogTrack) => void;
  onToggleCrate: (itemId: string) => void;
  onAddToCrate: (itemId: string, crateId: number) => void;
  onRemoveFromCrate: (itemId: string, crateId: number) => void;
}

export { catalogTrackCrateId };

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
        const cid = catalogTrackCrateId(track.id);
        return (
          <AlbumTrackRow
            key={track.id}
            track={track}
            isActive={playingTrackUrl === track.streamUrl && track.streamUrl != null && isPlayerPlaying}
            fallbackUrl={fallbackUrl}
            crates={crates}
            crateIds={itemCrateMap[cid]}
            showCrate={showCrate}
            onPlay={() => onPlayTrack(track)}
            onToggleCrate={() => onToggleCrate(cid)}
            onAddToCrate={(crateId) => onAddToCrate(cid, crateId)}
            onRemoveFromCrate={(crateId) => onRemoveFromCrate(cid, crateId)}
          />
        );
      })}
    </>
  );
}
