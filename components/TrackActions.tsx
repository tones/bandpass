interface TrackActionsProps {
  isPlaying: boolean;
  hasStream: boolean;
  isShortlisted: boolean;
  bandcampUrl: string;
  onPlay: () => void;
  onToggleShortlist: () => void;
  size?: 'sm' | 'md';
  showShortlist?: boolean;
}

const SIZE_CLASSES = {
  sm: {
    button: 'h-7 w-7 text-base',
    link: 'h-7 w-7 text-sm',
  },
  md: {
    button: 'h-8 w-8 text-lg',
    link: 'h-8 w-8 text-sm',
  },
};

export function TrackActions({
  isPlaying,
  hasStream,
  isShortlisted,
  bandcampUrl,
  onPlay,
  onToggleShortlist,
  size = 'sm',
  showShortlist = true,
}: TrackActionsProps) {
  const s = SIZE_CLASSES[size];

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onPlay(); }}
        disabled={!hasStream}
        className={`flex items-center justify-center rounded transition-colors ${s.button} ${
          hasStream
            ? isPlaying
              ? 'text-amber-400 hover:text-amber-300'
              : 'text-zinc-500 hover:text-zinc-300'
            : 'cursor-default text-zinc-800'
        }`}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        <span className="leading-none">{isPlaying ? '⏸' : '▶'}</span>
      </button>

      {showShortlist && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleShortlist(); }}
          className={`flex items-center justify-center rounded transition-colors ${s.button} ${
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
        href={bandcampUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center justify-center rounded transition-colors text-zinc-600 hover:text-zinc-400 ${s.link}`}
        title="Open on Bandcamp"
      >
        ↗
      </a>
    </div>
  );
}
