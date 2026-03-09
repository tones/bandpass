import { getIdentityCookie, getSession } from '@/lib/session';
import { getExchangeRates } from '@/lib/currency';
import { getShortlistItems, getShortlistCatalogItems } from '@/lib/db/shortlist';
import { ShortlistView } from '@/components/ShortlistView';
import { AppHeader } from '@/components/AppHeader';

export default async function ShortlistPage() {
  const cookie = await getIdentityCookie();
  const session = await getSession();
  const fanId = session.fanId;
  const username = session.username ?? null;

  if (!cookie || !fanId) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader activeTab="shortlist" username={username} />
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <p className="text-lg text-zinc-400">Log in to see your shortlist</p>
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

  const items = getShortlistItems(fanId);
  const catalogItems = getShortlistCatalogItems(fanId);
  const exchangeRates = await getExchangeRates();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader activeTab="shortlist" username={username} />
      <ShortlistView
        initialItems={items}
        initialCatalogItems={catalogItems}
        exchangeRates={exchangeRates}
      />
    </main>
  );
}
