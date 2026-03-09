import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { MusicBrowse } from '@/components/music/ArtistGrid';
import { AppHeader } from '@/components/AppHeader';

export default async function MusicPage() {
  const cookie = await getIdentityCookie();
  if (!cookie) redirect('/login');

  const session = await getSession();
  const username = session.username;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader activeTab="music" username={username} />
      <MusicBrowse />
    </main>
  );
}
