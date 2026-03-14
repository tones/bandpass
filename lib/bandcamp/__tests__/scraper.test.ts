import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HtmlFetcher } from '../scraper';
import {
  fetchDiscography,
  fetchAlbumTracks,
  extractSlug,
  artIdToUrl,
} from '../scraper';

function encode(json: unknown): string {
  return JSON.stringify(json).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function makeMusicPageHtml(
  band: { id: number; name: string; subdomain: string },
  items: Array<{ id: number; title: string; page_url: string; art_id: number; type: string; band_id: number }>,
): string {
  return `<html><body><div data-band="${encode(band)}" data-client-items="${encode(items)}"></div></body></html>`;
}

function makeAlbumPageHtml(tralbum: Record<string, unknown>): string {
  return `<html><body><div data-tralbum="${encode(tralbum)}"></div></body></html>`;
}

describe('scraper', () => {
  let mockFetcher: HtmlFetcher;

  beforeEach(() => {
    mockFetcher = vi.fn();
    vi.restoreAllMocks();
  });

  describe('fetchDiscography', () => {
    it('extracts band info and discography items', async () => {
      const band = { id: 42, name: 'Ghost Funk Orchestra', subdomain: 'ghostfunkorchestra' };
      const items = [
        { id: 100, title: 'A New Kind of Love', page_url: '/album/a-new-kind-of-love', art_id: 555, type: 'album', band_id: 42 },
        { id: 101, title: 'Loose Change', page_url: '/track/loose-change', art_id: 556, type: 'track', band_id: 42 },
      ];
      const html = makeMusicPageHtml(band, items);

      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://ghostfunkorchestra.bandcamp.com');

      expect(result.band).toEqual({
        id: 42,
        name: 'Ghost Funk Orchestra',
        subdomain: 'ghostfunkorchestra',
        url: 'https://ghostfunkorchestra.bandcamp.com',
      });
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: 100,
        title: 'A New Kind of Love',
        pageUrl: '/album/a-new-kind-of-love',
        artId: 555,
        type: 'album',
        bandId: 42,
        artist: undefined,
      });
      expect(result.items[1].type).toBe('track');
    });

    it('normalizes unknown types to album', async () => {
      const html = makeMusicPageHtml(
        { id: 1, name: 'B', subdomain: 'b' },
        [{ id: 10, title: 'X', page_url: '/x', art_id: 1, type: 'compilation', band_id: 1 }],
      );
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://b.bandcamp.com');
      expect(result.items[0].type).toBe('album');
    });

    it('returns empty items when neither JSON nor HTML items are present', async () => {
      const html = `<html><body><div data-band="${encode({ id: 1, name: 'B', subdomain: 'b' })}"></div></body></html>`;
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://b.bandcamp.com');
      expect(result.items).toEqual([]);
      expect(result.band.name).toBe('B');
    });

    it('parses items from HTML when data-client-items is missing', async () => {
      const band = { id: 1, name: 'TestBand', subdomain: 'testband' };
      const html = `<html><body>
        <div data-band="${encode(band)}"></div>
        <li data-item-id="album-500" data-band-id="1">
          <a href="/album/cool-album">
            <img src="https://f4.bcbits.com/img/a777_5.jpg" />
          </a>
          <p class="title">Cool Album</p>
        </li>
        <li data-item-id="track-501" data-band-id="1">
          <a href="/track/nice-track">
            <img src="https://f4.bcbits.com/img/a888_5.jpg" />
          </a>
          <p class="title">Nice Track</p>
        </li>
      </body></html>`;
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://testband.bandcamp.com');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        id: 500,
        title: 'Cool Album',
        type: 'album',
        artId: 777,
        pageUrl: 'https://testband.bandcamp.com/album/cool-album',
      });
      expect(result.items[1]).toMatchObject({
        id: 501,
        title: 'Nice Track',
        type: 'track',
        artId: 888,
      });
    });

    it('decodes HTML entities in titles parsed from HTML', async () => {
      const band = { id: 1, name: 'B', subdomain: 'b' };
      const html = `<html><body>
        <div data-band="${encode(band)}"></div>
        <li data-item-id="album-100" data-band-id="1">
          <a href="/album/x">
            <img src="https://f4.bcbits.com/img/a1_5.jpg" />
          </a>
          <p class="title">Rock &#39;n&#39; Roll &amp; Blues</p>
        </li>
      </body></html>`;
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://b.bandcamp.com');
      expect(result.items[0].title).toBe("Rock 'n' Roll & Blues");
    });

    it('merges HTML and JSON items, preferring HTML for duplicates', async () => {
      const band = { id: 1, name: 'B', subdomain: 'b' };
      const jsonItems = [
        { id: 100, title: 'JSON Title', page_url: '/album/x', art_id: 1, type: 'album', band_id: 1 },
        { id: 200, title: 'JSON Only', page_url: '/album/y', art_id: 2, type: 'album', band_id: 1 },
      ];
      const htmlPart = `
        <li data-item-id="album-100" data-band-id="1">
          <a href="/album/x">
            <img src="https://f4.bcbits.com/img/a10_5.jpg" />
          </a>
          <p class="title">HTML Title</p>
        </li>
        <li data-item-id="album-300" data-band-id="1">
          <a href="/album/z">
            <img src="https://f4.bcbits.com/img/a30_5.jpg" />
          </a>
          <p class="title">HTML Only</p>
        </li>
      `;
      const html = `<html><body>
        <div data-band="${encode(band)}" data-client-items="${encode(jsonItems)}"></div>
        ${htmlPart}
      </body></html>`;
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://b.bandcamp.com');

      expect(result.items).toHaveLength(3);
      const byId = Object.fromEntries(result.items.map((i) => [i.id, i]));

      // ID 100: HTML overwrites JSON
      expect(byId[100].title).toBe('HTML Title');
      // ID 200: JSON-only item preserved
      expect(byId[200].title).toBe('JSON Only');
      // ID 300: HTML-only item included
      expect(byId[300].title).toBe('HTML Only');
    });

    it('resolves relative URLs against bandUrl for HTML items', async () => {
      const band = { id: 1, name: 'B', subdomain: 'b' };
      const html = `<html><body>
        <div data-band="${encode(band)}"></div>
        <li data-item-id="album-50" data-band-id="1">
          <a href="/album/relative-path"><img src="" /></a>
          <p class="title">Relative</p>
        </li>
        <li data-item-id="album-51" data-band-id="1">
          <a href="https://other.com/album/absolute"><img src="" /></a>
          <p class="title">Absolute</p>
        </li>
      </body></html>`;
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://b.bandcamp.com');
      expect(result.items[0].pageUrl).toBe('https://b.bandcamp.com/album/relative-path');
      expect(result.items[1].pageUrl).toBe('https://other.com/album/absolute');
    });

    it('throws when data-band is missing', async () => {
      mockFetcher = vi.fn().mockResolvedValue('<html><body><div></div></body></html>');

      await expect(fetchDiscography(mockFetcher, 'https://x.bandcamp.com')).rejects.toThrow(
        'Could not extract band data from page',
      );
    });

    it('fetches from bandUrl/music', async () => {
      const html = makeMusicPageHtml({ id: 1, name: 'B', subdomain: 'b' }, []);
      mockFetcher = vi.fn().mockResolvedValue(html);

      await fetchDiscography(mockFetcher, 'https://b.bandcamp.com');
      expect(mockFetcher).toHaveBeenCalledWith('https://b.bandcamp.com/music');
    });

    it('discovers URLs from broad HTML scan not in JSON or <li> items', async () => {
      const band = { id: 1, name: 'Label', subdomain: 'label' };
      const jsonItems = [
        { id: 100, title: 'Known Album', page_url: '/album/known-album', art_id: 1, type: 'album', band_id: 1 },
      ];
      const html = `<html><body>
        <div data-band="${encode(band)}" data-client-items="${encode(jsonItems)}"></div>
        <script>var urls = ["/album/known-album", "/album/hidden-gem", "/track/bonus-track"];</script>
      </body></html>`;
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://label.bandcamp.com');

      expect(result.items.length).toBe(3);
      const urls = result.items.map((i) => i.pageUrl);
      expect(urls).toContain('/album/known-album');
      expect(urls).toContain('https://label.bandcamp.com/album/hidden-gem');
      expect(urls).toContain('https://label.bandcamp.com/track/bonus-track');
    });

    it('does not create duplicates when broad scan finds already-known URLs', async () => {
      const band = { id: 1, name: 'B', subdomain: 'b' };
      const jsonItems = [
        { id: 100, title: 'Album One', page_url: '/album/album-one', art_id: 1, type: 'album', band_id: 1 },
      ];
      const html = `<html><body>
        <div data-band="${encode(band)}" data-client-items="${encode(jsonItems)}"></div>
        <li data-item-id="album-100" data-band-id="1">
          <a href="/album/album-one"><img src="" /></a>
          <p class="title">Album One</p>
        </li>
        <script>window.data = { url: "/album/album-one" };</script>
      </body></html>`;
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://b.bandcamp.com');
      expect(result.items).toHaveLength(1);
    });

    it('derives readable title from URL slug for broad-scan items', async () => {
      const band = { id: 1, name: 'B', subdomain: 'b' };
      const html = `<html><body>
        <div data-band="${encode(band)}"></div>
        <script>"/album/cool-new-album"</script>
      </body></html>`;
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchDiscography(mockFetcher, 'https://b.bandcamp.com');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('cool new album');
      expect(result.items[0].type).toBe('album');
    });
  });

  describe('fetchAlbumTracks', () => {
    it('extracts tracks with stream URLs and track URLs', async () => {
      const tralbum = {
        current: { title: 'Test Album', artist: 'Test Artist', art_id: 999 },
        url: 'https://testband.bandcamp.com/album/test-album',
        trackinfo: [
          {
            track_num: 1,
            title: 'First Track',
            duration: 240.5,
            file: { 'mp3-128': 'https://stream.example.com/track1.mp3' },
            title_link: '/track/first-track',
          },
          {
            track_num: 2,
            title: 'Second Track',
            duration: 180.0,
            file: { 'mp3-128': 'https://stream.example.com/track2.mp3' },
            title_link: '/track/second-track',
          },
        ],
      };
      const html = makeAlbumPageHtml(tralbum);
      mockFetcher = vi.fn().mockResolvedValue(html);

      const result = await fetchAlbumTracks(mockFetcher, 'https://testband.bandcamp.com/album/test-album');

      expect(result.title).toBe('Test Album');
      expect(result.artist).toBe('Test Artist');
      expect(result.imageUrl).toBe('https://f4.bcbits.com/img/a999_5.jpg');
      expect(result.tracks).toHaveLength(2);
      expect(result.tracks[0]).toEqual({
        trackNum: 1,
        title: 'First Track',
        duration: 240.5,
        streamUrl: 'https://stream.example.com/track1.mp3',
        trackUrl: 'https://testband.bandcamp.com/track/first-track',
        bandcampTrackId: null,
      });
    });

    it('handles missing file field (streamUrl = null)', async () => {
      const tralbum = {
        current: { title: 'A', artist: 'B' },
        url: 'https://x.bandcamp.com/album/a',
        trackinfo: [{ track_num: 1, title: 'No Stream', duration: 100 }],
      };
      mockFetcher = vi.fn().mockResolvedValue(makeAlbumPageHtml(tralbum));

      const result = await fetchAlbumTracks(mockFetcher, 'https://x.bandcamp.com/album/a');
      expect(result.tracks[0].streamUrl).toBeNull();
    });

    it('handles missing title_link (trackUrl = null)', async () => {
      const tralbum = {
        current: { title: 'A', artist: 'B' },
        url: 'https://x.bandcamp.com/album/a',
        trackinfo: [{ track_num: 1, title: 'No Link', duration: 100, file: { 'mp3-128': 'https://s.com/t.mp3' } }],
      };
      mockFetcher = vi.fn().mockResolvedValue(makeAlbumPageHtml(tralbum));

      const result = await fetchAlbumTracks(mockFetcher, 'https://x.bandcamp.com/album/a');
      expect(result.tracks[0].trackUrl).toBeNull();
    });

    it('resolves absolute title_link as-is', async () => {
      const tralbum = {
        current: { title: 'A', artist: 'B' },
        url: 'https://x.bandcamp.com/album/a',
        trackinfo: [{ track_num: 1, title: 'T', duration: 100, title_link: 'https://other.com/track/t' }],
      };
      mockFetcher = vi.fn().mockResolvedValue(makeAlbumPageHtml(tralbum));

      const result = await fetchAlbumTracks(mockFetcher, 'https://x.bandcamp.com/album/a');
      expect(result.tracks[0].trackUrl).toBe('https://other.com/track/t');
    });

    it('uses fallback artist when current.artist is missing', async () => {
      const tralbum = {
        current: { title: 'A' },
        artist: 'Fallback Artist',
        url: 'https://x.bandcamp.com/album/a',
        trackinfo: [],
      };
      mockFetcher = vi.fn().mockResolvedValue(makeAlbumPageHtml(tralbum));

      const result = await fetchAlbumTracks(mockFetcher, 'https://x.bandcamp.com/album/a');
      expect(result.artist).toBe('Fallback Artist');
    });

    it('uses fallback art_id from root when current.art_id is missing', async () => {
      const tralbum = {
        current: { title: 'A', artist: 'B' },
        art_id: 777,
        url: 'https://x.bandcamp.com/album/a',
        trackinfo: [],
      };
      mockFetcher = vi.fn().mockResolvedValue(makeAlbumPageHtml(tralbum));

      const result = await fetchAlbumTracks(mockFetcher, 'https://x.bandcamp.com/album/a');
      expect(result.imageUrl).toBe('https://f4.bcbits.com/img/a777_5.jpg');
    });

    it('throws when data-tralbum is missing', async () => {
      mockFetcher = vi.fn().mockResolvedValue('<html><body></body></html>');

      await expect(fetchAlbumTracks(mockFetcher, 'https://x.bandcamp.com/album/a')).rejects.toThrow(
        'Could not extract track data from album page',
      );
    });

    it('returns empty tracks when trackinfo is missing', async () => {
      const tralbum = { current: { title: 'A', artist: 'B' }, url: 'https://x.bandcamp.com/album/a' };
      mockFetcher = vi.fn().mockResolvedValue(makeAlbumPageHtml(tralbum));

      const result = await fetchAlbumTracks(mockFetcher, 'https://x.bandcamp.com/album/a');
      expect(result.tracks).toEqual([]);
    });
  });

  describe('extractSlug', () => {
    it('returns subdomain for bandcamp.com URLs', () => {
      expect(extractSlug('https://ghostfunkorchestra.bandcamp.com')).toBe('ghostfunkorchestra');
      expect(extractSlug('https://ghostfunkorchestra.bandcamp.com/music')).toBe('ghostfunkorchestra');
    });

    it('returns full hostname for custom domains', () => {
      expect(extractSlug('https://music.example.com')).toBe('music.example.com');
      expect(extractSlug('https://music.example.com/album/foo')).toBe('music.example.com');
    });

    it('returns input string for invalid URLs', () => {
      expect(extractSlug('not-a-url')).toBe('not-a-url');
      expect(extractSlug('')).toBe('');
    });
  });

  describe('artIdToUrl', () => {
    it('returns CDN URL with default size', () => {
      expect(artIdToUrl(12345)).toBe('https://f4.bcbits.com/img/a12345_5.jpg');
    });

    it('returns CDN URL with custom size', () => {
      expect(artIdToUrl(12345, 10)).toBe('https://f4.bcbits.com/img/a12345_10.jpg');
    });
  });
});
