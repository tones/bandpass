export function BpmKeyBadge({ bpm, musicalKey }: { bpm?: number | null; musicalKey?: string | null }) {
  if (!bpm && !musicalKey) return null;
  return (
    <span className="inline-flex shrink-0 gap-1.5">
      {bpm != null && bpm > 0 && (
        <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-xs tabular-nums text-amber-300">
          {Math.round(bpm)} bpm
        </span>
      )}
      {musicalKey && (
        <span className="rounded bg-violet-900/50 px-1.5 py-0.5 text-xs text-violet-300">
          {musicalKey}
        </span>
      )}
    </span>
  );
}
