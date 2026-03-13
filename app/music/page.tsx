import { getSession } from '@/lib/session';
import { MusicBrowse } from '@/components/music/MusicBrowse';
import { AppHeader } from '@/components/AppHeader';

export default async function MusicPage() {
  const session = await getSession();
  const username = session.username ?? null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader username={username} />
      <MusicBrowse />
    </main>
  );
}
