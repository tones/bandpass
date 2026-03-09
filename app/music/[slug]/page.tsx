import { redirect } from 'next/navigation';
import { getIdentityCookie, getSession } from '@/lib/session';
import { getBandcampClient } from '@/lib/bandcamp';
import { fetchDiscography, artIdToUrl } from '@/lib/bandcamp/scraper';
import { getCachedDiscography, cacheDiscography } from '@/lib/db/catalog';
import { getShortlist } from '@/lib/db/shortlist';
import { CatalogView } from '@/components/music/CatalogView';
import { AppHeader } from '@/components/AppHeader';

interface MusicDetailPageProps {
  params: Promise<{ slug: string }>;
}

function slugToBandUrl(slug: string): string {
  if (slug.includes('.')) {
    return `https://${slug}`;
  }
  return `https://${slug}.bandcamp.com`;
}

export default async function MusicDetailPage({ params }: MusicDetailPageProps) {
  const cookie = await getIdentityCookie();
  if (!cookie) redirect('/login');

  const session = await getSession();
  const fanId = session.fanId;
  const username = session.username;
  if (!fanId) redirect('/login');

  const { slug } = await params;
  const bandUrl = slugToBandUrl(slug);

  let releases = getCachedDiscography(slug);
  let bandName = releases?.[0]?.bandName ?? slug;

  if (!releases) {
    try {
      const client = await getBandcampClient();
      const result = await fetchDiscography(client, bandUrl);
      bandName = result.band.name;

      releases = cacheDiscography(
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
    } catch (err) {
      console.error('Failed to fetch discography:', err);
      releases = [];
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader activeTab="music" username={username} />
      <CatalogView
        slug={slug}
        bandName={bandName}
        bandUrl={bandUrl}
        releases={releases}
        initialShortlist={[...getShortlist(fanId)]}
      />
    </main>
  );
}
