import { getIdentityCookie, getSession } from '@/lib/session';
import { getExchangeRates } from '@/lib/currency';
import { getCrates, getCrateItems, getCrateCatalogItems, getCrateWishlistItems, getWishlistItems, ensureDefaultCrate, getItemCrateMultiMap } from '@/lib/db/crates';
import { CratesView } from '@/components/CratesView';
import { AppHeader } from '@/components/AppHeader';

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

  const isWishlist = firstCrate?.source === 'bandcamp_wishlist';
  const initialItems = firstCrate && !isWishlist ? getCrateItems(firstCrate.id, fanId) : [];
  const initialCatalogItems = firstCrate && !isWishlist ? getCrateCatalogItems(firstCrate.id, fanId) : [];
  const initialWishlistItems = firstCrate
    ? isWishlist
      ? getWishlistItems(fanId)
      : getCrateWishlistItems(firstCrate.id, fanId)
    : [];
  const exchangeRates = await getExchangeRates();
  const initialItemCrateMap = getItemCrateMultiMap(fanId);

  return (
    <main className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <AppHeader username={username} />
      <CratesView
        crates={crates}
        initialCrateId={firstCrate?.id ?? null}
        initialItems={initialItems}
        initialCatalogItems={initialCatalogItems}
        initialWishlistItems={initialWishlistItems}
        exchangeRates={exchangeRates}
        initialItemCrateMap={initialItemCrateMap}
      />
    </main>
  );
}
