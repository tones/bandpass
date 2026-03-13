import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getExchangeRates } from '@/lib/currency';
import { getCrates, getCrateItems, getCrateCatalogItems, getCrateWishlistItems, getWishlistItems, ensureDefaultCrate, getItemCrateMultiMap } from '@/lib/db/crates';
import { CratesView } from '@/components/CratesView';
import { AppHeader } from '@/components/AppHeader';

interface CrateDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CrateDetailPage({ params }: CrateDetailPageProps) {
  const cookie = await getIdentityCookie();
  const session = await getSession();
  const fanId = session.fanId;
  const username = session.username ?? null;

  if (!cookie || !fanId) {
    redirect('/crates');
  }

  ensureDefaultCrate(fanId);
  const crates = getCrates(fanId);

  const { id } = await params;
  const requestedId = parseInt(id, 10);
  const targetCrate = crates.find((c) => c.id === requestedId) ?? crates[0] ?? null;

  if (targetCrate && targetCrate.id !== requestedId) {
    redirect(`/crates/${targetCrate.id}`);
  }

  const isWishlist = targetCrate?.source === 'bandcamp_wishlist';
  const initialItems = targetCrate && !isWishlist ? getCrateItems(targetCrate.id, fanId) : [];
  const initialCatalogItems = targetCrate && !isWishlist ? getCrateCatalogItems(targetCrate.id, fanId) : [];
  const initialWishlistItems = targetCrate
    ? isWishlist
      ? getWishlistItems(fanId)
      : getCrateWishlistItems(targetCrate.id, fanId)
    : [];
  const exchangeRates = await getExchangeRates();
  const initialItemCrateMap = getItemCrateMultiMap(fanId);

  return (
    <main className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <AppHeader username={username} />
      <CratesView
        crates={crates}
        initialCrateId={targetCrate?.id ?? null}
        initialItems={initialItems}
        initialCatalogItems={initialCatalogItems}
        initialWishlistItems={initialWishlistItems}
        exchangeRates={exchangeRates}
        initialItemCrateMap={initialItemCrateMap}
      />
    </main>
  );
}
