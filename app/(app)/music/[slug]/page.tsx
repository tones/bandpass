import type { Metadata } from 'next';
import { getIdentityCookie, getSession } from '@/lib/session';
import { BandcampClient } from '@/lib/bandcamp/client';
import { fetchDiscography, artIdToUrl, publicFetcher } from '@/lib/bandcamp/scraper';
import { getCachedDiscography, cacheDiscography } from '@/lib/db/catalog';
import { enqueueUrlsForEnrichment } from '@/lib/db/sync';
import { getAllCrateItemIds, getCrates, getItemCrateMultiMap } from '@/lib/db/crates';
import { CatalogView } from '@/components/music/CatalogView';

export const dynamic = 'force-dynamic';

interface MusicDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: MusicDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const releases = await getCachedDiscography(slug);
  const bandName = releases?.[0]?.bandName ?? slug;
  return { title: bandName };
}

function slugToBandUrl(slug: string): string {
  if (slug.includes('.')) {
    return `https://${slug}`;
  }
  return `https://${slug}.bandcamp.com`;
}

export default async function MusicDetailPage({ params }: MusicDetailPageProps) {
  const cookie = await getIdentityCookie();
  const session = await getSession();
  const fanId = session.fanId;

  const { slug } = await params;
  const bandUrl = slugToBandUrl(slug);

  let releases = await getCachedDiscography(slug);
  let bandName = releases?.[0]?.bandName ?? slug;

  if (!releases) {
    try {
      const fetcher = cookie
        ? (url: string) => new BandcampClient(cookie).getHtml(url)
        : publicFetcher;
      const result = await fetchDiscography(fetcher, bandUrl);
      bandName = result.band.name;

      releases = await cacheDiscography(
        slug,
        result.band.name,
        result.band.url,
        result.items.map((item) => ({
          title: item.title,
          url: item.pageUrl.startsWith('http')
            ? item.pageUrl
            : `${bandUrl}${item.pageUrl}`,
          imageUrl: item.artId ? artIdToUrl(item.artId) : '',
          releaseType: item.type,
        })),
      );

      const urls = releases.map((r) => r.url).filter(Boolean);
      enqueueUrlsForEnrichment(urls).catch((err) =>
        console.error('Failed to enqueue discography for enrichment:', err),
      );
    } catch (err) {
      console.error('Failed to fetch discography:', err);
      releases = [];
    }
  }

  const crateItemIds = fanId ? await getAllCrateItemIds(fanId) : new Set<string>();
  const crates = fanId ? (await getCrates(fanId)).filter((c) => c.source === 'user') : [];
  const itemCrateMap = fanId ? await getItemCrateMultiMap(fanId) : {};

  return (
    <main className="min-h-screen">
      <CatalogView
        slug={slug}
        bandName={bandName}
        bandUrl={bandUrl}
        releases={releases}
        initialCrateItemIds={[...crateItemIds]}
        initialCrates={crates}
        initialItemCrateMap={itemCrateMap}
        loggedIn={!!fanId}
      />
    </main>
  );
}
