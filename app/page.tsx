import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getBandcamp } from '@/lib/bandcamp';
import { FeedView } from '@/components/feed/FeedView';
import { LogoutButton } from '@/components/LogoutButton';

function isAuthError(message: string): boolean {
  return /\b(401|403)\b/.test(message);
}

export default async function Home() {
  const cookie = await getIdentityCookie();
  if (!cookie) redirect('/login');

  const session = await getSession();
  const username = session.username;

  let feed;
  let error: string | null = null;

  try {
    const bandcamp = await getBandcamp();
    feed = await bandcamp.getFeedPages({ pages: 5 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load feed';
    if (isAuthError(message)) {
      const session = await getSession();
      session.destroy();
      redirect('/login');
    }
    error = message;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Bandpass</h1>
        <div className="flex items-center gap-3">
          {username && (
            <a
              href={`https://bandcamp.com/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              {username}
            </a>
          )}
          <LogoutButton />
        </div>
      </header>
      {error ? (
        <div className="p-6 text-red-400">{error}</div>
      ) : feed ? (
        <FeedView initialFeed={feed} />
      ) : null}
    </main>
  );
}
