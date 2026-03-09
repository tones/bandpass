import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getExchangeRates } from '@/lib/currency';
import { getShortlistItems, getShortlistCatalogItems } from '@/lib/db/shortlist';
import { ShortlistView } from '@/components/ShortlistView';
import { AppHeader } from '@/components/AppHeader';

export default async function ShortlistPage() {
  const cookie = await getIdentityCookie();
  if (!cookie) redirect('/login');

  const session = await getSession();
  const fanId = session.fanId;
  const username = session.username;
  if (!fanId) redirect('/login');

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
