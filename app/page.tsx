// app/page.tsx
import { getBandcamp } from '@/lib/bandcamp';
import { FeedView } from '@/components/feed/FeedView';

export default async function Home() {
  const bandcamp = getBandcamp();

  let feed;
  let error: string | null = null;

  try {
    feed = await bandcamp.getFeed();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load feed';
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Bandpass</h1>
      </header>
      {error ? (
        <div className="p-6 text-red-400">{error}</div>
      ) : feed ? (
        <FeedView initialFeed={feed} />
      ) : null}
    </main>
  );
}
