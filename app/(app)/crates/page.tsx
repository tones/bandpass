import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { getCrates, ensureDefaultCrate } from '@/lib/db/crates';

export const metadata: Metadata = { title: 'Crates' };

export default async function CratesPage() {
  const user = await getUser();
  const fanId = user?.fanId;

  if (!fanId) {
    return (
      <main className="min-h-screen">
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <p className="text-lg text-zinc-400">
            {user ? 'Connect your Bandcamp account to use crates.' : 'Log in to see your crates.'}
          </p>
          <a
            href={user ? '/account' : '/login'}
            className="mt-4 rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            {user ? 'Go to settings' : 'Log in'}
          </a>
        </div>
      </main>
    );
  }

  await ensureDefaultCrate(fanId);
  const crates = await getCrates(fanId);
  const firstCrate = crates[0];

  if (firstCrate) {
    redirect(`/crates/${firstCrate.id}`);
  }

  return (
    <main className="flex h-screen flex-col">
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-lg text-zinc-400">No crates yet</p>
      </div>
    </main>
  );
}
