/**
 * One-time audit script: validates that fetchDiscography accurately captures
 * all releases from real Bandcamp artist/label pages.
 *
 * Samples artists from the local feed_items database, fetches their /music
 * pages, and compares what our scraper finds against a ground-truth broad
 * URL scan of the raw HTML.
 *
 * Usage:  npx tsx scripts/audit-scraper.ts [--limit N] [--delay MS]
 */

import { fetchDiscography, publicFetcher } from '../lib/bandcamp/scraper';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const delayIdx = args.indexOf('--delay');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;
const DELAY_MS = delayIdx !== -1 ? parseInt(args[delayIdx + 1], 10) : 1000;

interface ArtistRow {
  artist_url: string;
  artist_name: string;
  track_count: number;
}

function groundTruthUrls(html: string): Set<string> {
  const pattern = /\/(album|track)\/([a-z0-9][a-z0-9-]*)/g;
  const urls = new Set<string>();
  let match;
  while ((match = pattern.exec(html)) !== null) {
    urls.add(`/${match[1]}/${match[2]}`);
  }
  return urls;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Load artists from the local DB
  const Database = (await import('better-sqlite3')).default;
  const path = await import('path');
  const dbPath = path.join(process.cwd(), 'data', 'bandpass.db');

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (err) {
    console.error('Could not open database at', dbPath);
    process.exit(1);
  }

  const artists = db.prepare(`
    SELECT artist_url, artist_name, COUNT(*) as track_count
    FROM feed_items
    WHERE artist_url != '' AND artist_url LIKE '%bandcamp.com%'
    GROUP BY artist_url
    ORDER BY track_count DESC
    LIMIT ?
  `).all(LIMIT) as ArtistRow[];

  db.close();

  console.log(`Auditing ${artists.length} artists (delay: ${DELAY_MS}ms between requests)\n`);
  console.log('Artist'.padEnd(40) + 'Scraper'.padStart(10) + 'Ground'.padStart(10) + 'Delta'.padStart(10) + '  Status');
  console.log('-'.repeat(80));

  let totalScraperItems = 0;
  let totalGroundItems = 0;
  let mismatches = 0;
  let errors = 0;

  for (let i = 0; i < artists.length; i++) {
    const { artist_url, artist_name } = artists[i];
    const bandUrl = artist_url.replace(/\/+$/, '');
    const displayName = artist_name.slice(0, 38);

    try {
      const html = await publicFetcher(`${bandUrl}/music`);

      const result = await fetchDiscography(publicFetcher, bandUrl);
      const scraperUrls = new Set(
        result.items.map((item) => {
          const url = item.pageUrl.startsWith('http')
            ? new URL(item.pageUrl).pathname.split('?')[0]
            : item.pageUrl.split('?')[0];
          return url;
        }),
      );

      const truthUrls = groundTruthUrls(html);

      const scraperCount = scraperUrls.size;
      const groundCount = truthUrls.size;
      const missed = [...truthUrls].filter((u) => !scraperUrls.has(u));
      const delta = missed.length;

      totalScraperItems += scraperCount;
      totalGroundItems += groundCount;

      const status = delta === 0 ? 'OK' : `MISSED ${delta}`;
      if (delta > 0) mismatches++;

      console.log(
        displayName.padEnd(40) +
        String(scraperCount).padStart(10) +
        String(groundCount).padStart(10) +
        String(delta).padStart(10) +
        '  ' + status,
      );

      if (missed.length > 0 && missed.length <= 5) {
        for (const u of missed) {
          console.log(`  -> missing: ${u}`);
        }
      } else if (missed.length > 5) {
        for (const u of missed.slice(0, 3)) {
          console.log(`  -> missing: ${u}`);
        }
        console.log(`  -> ... and ${missed.length - 3} more`);
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(displayName.padEnd(40) + '         -         -         -  ' + `ERROR: ${msg.slice(0, 40)}`);
    }

    if (i < artists.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log('-'.repeat(80));
  console.log(`\nSummary:`);
  console.log(`  Artists checked:  ${artists.length}`);
  console.log(`  Total scraper:    ${totalScraperItems} releases`);
  console.log(`  Total ground:     ${totalGroundItems} releases`);
  console.log(`  Mismatches:       ${mismatches}`);
  console.log(`  Errors:           ${errors}`);
  console.log(`  Accuracy:         ${artists.length - mismatches - errors}/${artists.length - errors} (${((artists.length - mismatches - errors) / Math.max(1, artists.length - errors) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
