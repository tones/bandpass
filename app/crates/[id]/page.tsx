import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getExchangeRates } from '@/lib/currency';
import { getCrates, getCrateItems, getCrateCatalogItems, getCrateWishlistItems, getWishlistItems, ensureDefaultCrate, getItemCrateMultiMap, getWishlistAlbumTracks } from '@/lib/db/crates';
import { CratesView } from '@/components/CratesView';
import { AppHeader } from '@/components/AppHeader';

interface CrateDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: CrateDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!session.fanId) return { title: 'Crates' };
  const crates = getCrates(session.fanId);
  const crate = crates.find((c) => c.id === parseInt(id, 10));
  return { title: crate?.name ?? 'Crates' };
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

  const albumItemUrls = initialWishlistItems
    .filter((item) => item.tralbumType === 'a')
    .map((item) => item.itemUrl);
  const initialAlbumTracks = getWishlistAlbumTracks(albumItemUrls);

  return (
    <main className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <AppHeader username={username} />
      <CratesView
        crates={crates}
        initialCrateId={targetCrate?.id ?? null}
        initialItems={initialItems}
        initialCatalogItems={initialCatalogItems}
        initialWishlistItems={initialWishlistItems}
        initialAlbumTracks={initialAlbumTracks}
        exchangeRates={exchangeRates}
        initialItemCrateMap={initialItemCrateMap}
      />
    </main>
  );
}
