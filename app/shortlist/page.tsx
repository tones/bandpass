import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getExchangeRates } from '@/lib/currency';
import { getShortlistItems } from '@/lib/db/shortlist';
import { ShortlistView } from '@/components/ShortlistView';

export default async function ShortlistPage() {
  const cookie = await getIdentityCookie();
  if (!cookie) redirect('/login');

  const session = await getSession();
  const fanId = session.fanId;
  if (!fanId) redirect('/login');

  const items = getShortlistItems(fanId);
  const exchangeRates = await getExchangeRates();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← Feed
          </a>
          <h1 className="text-xl font-semibold tracking-tight">Shortlist</h1>
        </div>
      </header>
      <ShortlistView initialItems={items} exchangeRates={exchangeRates} />
    </main>
  );
}
