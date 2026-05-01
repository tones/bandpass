'use client';

import * as Slider from '@radix-ui/react-slider';

interface BpmRangeSliderProps {
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  onValueCommit: (value: [number, number]) => void;
  min?: number;
  max?: number;
}

export function BpmRangeSlider({
  value,
  onValueChange,
  onValueCommit,
  min = 60,
  max = 200,
}: BpmRangeSliderProps) {
  return (
    <Slider.Root
      value={value}
      onValueChange={(v) => onValueChange([v[0], v[1]] as [number, number])}
      onValueCommit={(v) => onValueCommit([v[0], v[1]] as [number, number])}
      min={min}
      max={max}
      step={1}
      minStepsBetweenThumbs={1}
      className="relative flex h-5 w-full touch-none select-none items-center"
    >
      <Slider.Track className="relative h-1 grow rounded-full bg-zinc-800">
        <Slider.Range className="absolute h-full rounded-full bg-amber-500" />
      </Slider.Track>
      <Slider.Thumb
        className="block h-4 w-4 rounded-full bg-amber-400 shadow ring-2 ring-zinc-950 outline-none transition-colors hover:bg-amber-300 focus-visible:ring-amber-200"
        aria-label="Minimum BPM"
      />
      <Slider.Thumb
        className="block h-4 w-4 rounded-full bg-amber-400 shadow ring-2 ring-zinc-950 outline-none transition-colors hover:bg-amber-300 focus-visible:ring-amber-200"
        aria-label="Maximum BPM"
      />
    </Slider.Root>
  );
}
