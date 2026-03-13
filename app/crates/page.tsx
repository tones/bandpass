import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getCrates, ensureDefaultCrate } from '@/lib/db/crates';
import { AppHeader } from '@/components/AppHeader';

export const metadata: Metadata = { title: 'Crates' };

export default async function CratesPage() {
  const cookie = await getIdentityCookie();
  const session = await getSession();
  const fanId = session.fanId;
  const username = session.username ?? null;

  if (!cookie || !fanId) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader username={username} />
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <p className="text-lg text-zinc-400">Log in to see your crates</p>
          <a
            href="/login"
            className="mt-4 rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            Log in
          </a>
        </div>
      </main>
    );
  }

  ensureDefaultCrate(fanId);
  const crates = getCrates(fanId);
  const firstCrate = crates[0];

  if (firstCrate) {
    redirect(`/crates/${firstCrate.id}`);
  }

  return (
    <main className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <AppHeader username={username} />
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-lg text-zinc-400">No crates yet</p>
      </div>
    </main>
  );
}
