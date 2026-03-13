import Link from 'next/link';

export function TagPill({ tag }: { tag: string }) {
  return (
    <Link
      href={`/timeline?tag=${encodeURIComponent(tag)}`}
      className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
      onClick={(e) => e.stopPropagation()}
    >
      {tag}
    </Link>
  );
}
