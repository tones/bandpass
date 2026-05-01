'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

export interface CrateInfo {
  id: number;
  name: string;
}

interface TrackActionsProps {
  isPlaying: boolean;
  hasStream: boolean;
  isInCrate: boolean;
  bandcampUrl: string;
  onPlay: () => void;
  onToggleCrate: () => void;
  size?: 'sm' | 'md';
  showCrate?: boolean;
  showPlayButton?: boolean;
  crates?: CrateInfo[];
  itemCrateIds?: number[];
  onAddToCrate?: (crateId: number) => void;
  onRemoveFromCrate?: (crateId: number) => void;
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

import { CrateIcon } from '@/components/icons/CrateIcon';

export function TrackActions({
  isPlaying,
  hasStream,
  isInCrate,
  bandcampUrl,
  onPlay,
  onToggleCrate,
  size = 'sm',
  showCrate = true,
  showPlayButton = true,
  crates,
  itemCrateIds,
  onAddToCrate,
  onRemoveFromCrate,
}: TrackActionsProps) {
  const s = SIZE_CLASSES[size];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const multiCrate = crates && crates.length > 1;

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

  useLayoutEffect(() => {
    if (!pickerOpen || !pickerRef.current) return;
    const rect = pickerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // ~32px per row + 12px padding, capped at 280px
    const estimatedMenuHeight = Math.min((crates?.length ?? 0) * 32 + 12, 280);
    setDropUp(spaceBelow < estimatedMenuHeight);
  }, [pickerOpen, crates]);

  const handleCrateClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (multiCrate) {
      setPickerOpen((prev) => !prev);
    } else {
      onToggleCrate();
    }
  }, [multiCrate, onToggleCrate]);

  const handlePickerToggle = useCallback((crateId: number, isIn: boolean) => {
    if (isIn) {
      onRemoveFromCrate?.(crateId);
    } else {
      onAddToCrate?.(crateId);
    }
  }, [onAddToCrate, onRemoveFromCrate]);

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showPlayButton && (
        <button
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          disabled={!hasStream}
          className={`flex items-center justify-center rounded transition-colors ${s.button} ${
            hasStream
              ? isPlaying
                ? 'cursor-pointer text-amber-400 hover:text-amber-300'
                : 'cursor-pointer text-zinc-500 hover:text-zinc-300'
              : 'cursor-default text-zinc-800'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          <span className="leading-none">{isPlaying ? '⏸' : '▶'}</span>
        </button>
      )}

      {showCrate && (
        <div className="relative" ref={pickerRef}>
          <button
            onClick={handleCrateClick}
            className={`flex cursor-pointer items-center justify-center rounded transition-colors ${s.button} ${
              isInCrate
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
            title={isInCrate ? 'Remove from crate' : 'Add to crate'}
          >
            <CrateIcon filled={isInCrate} />
          </button>

          {pickerOpen && multiCrate && (
            <div
              className={`absolute right-0 z-30 min-w-[160px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl ${
                dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
              }`}
            >
              {crates.map((crate) => {
                const isIn = itemCrateIds?.includes(crate.id) ?? false;
                return (
                  <button
                    key={crate.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePickerToggle(crate.id, isIn);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-zinc-800"
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
