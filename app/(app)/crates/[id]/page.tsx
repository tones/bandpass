import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { getExchangeRates } from '@/lib/currency';
import { getCrates, getCrateCatalogItems, getCrateReleaseItems, getWishlistItems, ensureDefaultCrate, getItemCrateMultiMap, getWishlistAlbumTracks } from '@/lib/db/crates';
import { CratesView } from '@/components/CratesView';

interface CrateDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: CrateDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser();
  if (!user?.fanId) return { title: 'Crates' };
  const crates = await getCrates(user.fanId);
  const crate = crates.find((c) => c.id === parseInt(id, 10));
  return { title: crate?.name ?? 'Crates' };
}

export default async function CrateDetailPage({ params }: CrateDetailPageProps) {
  const user = await getUser();
  const fanId = user?.fanId;

  if (!fanId) {
    redirect('/crates');
  }

  await ensureDefaultCrate(fanId);
  const crates = await getCrates(fanId);

  const { id } = await params;
  const requestedId = parseInt(id, 10);
  const targetCrate = crates.find((c) => c.id === requestedId) ?? crates[0] ?? null;

  if (targetCrate && targetCrate.id !== requestedId) {
    redirect(`/crates/${targetCrate.id}`);
  }

  const isWishlist = targetCrate?.source === 'bandcamp_wishlist';
  const initialCatalogItems = targetCrate && !isWishlist ? await getCrateCatalogItems(targetCrate.id, fanId) : [];
  const initialReleaseItems = targetCrate && !isWishlist ? await getCrateReleaseItems(targetCrate.id, fanId) : [];
  const initialWishlistItems = isWishlist ? await getWishlistItems(fanId) : [];
  const exchangeRates = await getExchangeRates();
  const initialItemCrateMap = await getItemCrateMultiMap(fanId);

  const albumItemUrls = initialWishlistItems
    .filter((item) => item.tralbumType === 'a')
    .map((item) => item.itemUrl);
  const initialAlbumTracks = await getWishlistAlbumTracks(albumItemUrls);

  return (
    <main className="flex h-screen flex-col">
      <CratesView
        crates={crates}
        initialCrateId={targetCrate?.id ?? null}
        initialCatalogItems={initialCatalogItems}
        initialReleaseItems={initialReleaseItems}
        initialWishlistItems={initialWishlistItems}
        initialAlbumTracks={initialAlbumTracks}
        exchangeRates={exchangeRates}
        initialItemCrateMap={initialItemCrateMap}
      />
    </main>
  );
}
