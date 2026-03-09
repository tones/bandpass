export type HtmlFetcher = (url: string) => Promise<string>;

export const publicFetcher: HtmlFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
  return res.text();
};

export interface DiscographyItem {
  id: number;
  title: string;
  pageUrl: string;
  artId: number;
  type: 'album' | 'track';
  bandId: number;
  artist?: string;
}

export interface BandInfo {
  id: number;
  name: string;
  subdomain: string;
  url: string;
}

export interface DiscographyResult {
  band: BandInfo;
  items: DiscographyItem[];
}

export interface AlbumTrack {
  trackNum: number;
  title: string;
  duration: number;
  streamUrl: string | null;
  trackUrl: string | null;
}

export interface AlbumDetail {
  title: string;
  artist: string;
  imageUrl: string;
  releaseDate: string | null;
  tags: string[];
  tracks: AlbumTrack[];
}

function extractJsonAttr(html: string, attrName: string): unknown | null {
  const pattern = new RegExp(`${attrName}="([^"]*)"`, 's');
  const match = html.match(pattern);
  if (!match?.[1]) return null;

  const decoded = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");

  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function parseTags(html: string): string[] {
  const tags: string[] = [];
  const tagPattern = /<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/g;
  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[1].trim().toLowerCase();
    if (tag) tags.push(tag);
  }
  return [...new Set(tags)].sort();
}

function artIdToUrl(artId: number, size: number = 5): string {
  return `https://f4.bcbits.com/img/a${artId}_${size}.jpg`;
}

export async function fetchDiscography(
  fetchHtml: HtmlFetcher,
  bandUrl: string,
): Promise<DiscographyResult> {
  const html = await fetchHtml(`${bandUrl}/music`);

  const bandData = extractJsonAttr(html, 'data-band') as {
    id: number;
    name: string;
    subdomain: string;
    url?: string;
  } | null;

  if (!bandData) {
    throw new Error('Could not extract band data from page');
  }

  const rawItems = extractJsonAttr(html, 'data-client-items') as Array<{
    id: number;
    title: string;
    page_url: string;
    art_id: number;
    type: string;
    band_id: number;
    artist?: string;
  }> | null;

  const items: DiscographyItem[] = (rawItems ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    pageUrl: item.page_url,
    artId: item.art_id,
    type: item.type === 'track' ? 'track' : 'album',
    bandId: item.band_id,
    artist: item.artist,
  }));

  return {
    band: {
      id: bandData.id,
      name: bandData.name,
      subdomain: bandData.subdomain,
      url: bandUrl,
    },
    items,
  };
}

export async function fetchAlbumTracks(
  fetchHtml: HtmlFetcher,
  albumUrl: string,
): Promise<AlbumDetail> {
  const html = await fetchHtml(albumUrl);

  const tralbum = extractJsonAttr(html, 'data-tralbum') as {
    current?: { title?: string; artist?: string; art_id?: number; release_date?: string; publish_date?: string };
    album_release_date?: string;
    trackinfo?: Array<{
      track_num: number;
      title: string;
      duration: number;
      file?: Record<string, string>;
      title_link?: string;
    }>;
    artist?: string;
    art_id?: number;
    url?: string;
  } | null;

  if (!tralbum) {
    throw new Error('Could not extract track data from album page');
  }

  const artId = tralbum.current?.art_id ?? tralbum.art_id ?? 0;
  const baseUrl = tralbum.url ? new URL(tralbum.url).origin : '';

  const tracks: AlbumTrack[] = (tralbum.trackinfo ?? []).map((t) => ({
    trackNum: t.track_num,
    title: t.title,
    duration: t.duration,
    streamUrl: t.file?.['mp3-128'] ?? null,
    trackUrl: t.title_link
      ? (t.title_link.startsWith('http') ? t.title_link : `${baseUrl}${t.title_link}`)
      : null,
  }));

  const releaseDate = tralbum.current?.release_date
    ?? tralbum.album_release_date
    ?? tralbum.current?.publish_date
    ?? null;

  const tags = parseTags(html);

  return {
    title: tralbum.current?.title ?? '',
    artist: tralbum.current?.artist ?? tralbum.artist ?? '',
    imageUrl: artId ? artIdToUrl(artId) : '',
    releaseDate,
    tags,
    tracks,
  };
}

export function extractSlug(artistUrl: string): string {
  try {
    const url = new URL(artistUrl);
    const host = url.hostname;
    if (host.endsWith('.bandcamp.com')) {
      return host.replace('.bandcamp.com', '');
    }
    return host;
  } catch {
    return artistUrl;
  }
}

export { artIdToUrl };
