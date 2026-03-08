const cookie = process.env.BANDCAMP_IDENTITY;
if (!cookie) {
  console.error('Set BANDCAMP_IDENTITY in .env.local');
  process.exit(1);
}

async function main() {
  const summaryRes = await fetch('https://bandcamp.com/api/fan/2/collection_summary', {
    headers: { Cookie: `identity=${cookie}` },
  });
  const summary = await summaryRes.json();
  const fanId = summary.fan_id;

  let olderThan = Math.floor(Date.now() / 1000);
  let totalItems = 0;
  let pages = 0;
  let oldestDate: string | null = null;
  let newestDate: string | null = null;

  console.log('Paging through feed...\n');

  while (true) {
    const res = await fetch('https://bandcamp.com/fan_dash_feed_updates', {
      method: 'POST',
      headers: {
        Cookie: `identity=${cookie}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `fan_id=${fanId}&older_than=${olderThan}`,
    });
    const feed = await res.json();
    const entries = feed.stories?.entries ?? [];
    pages++;

    if (entries.length === 0) {
      console.log(`Page ${pages}: 0 entries — end of feed.`);
      break;
    }

    const dates = entries.map((e: { story_date: string }) => e.story_date);
    const newest = dates[0];
    const oldest = dates[dates.length - 1];

    if (!newestDate) newestDate = newest;
    oldestDate = oldest;
    totalItems += entries.length;

    console.log(
      `Page ${pages}: ${entries.length} entries | ${oldest} → ${newest} | running total: ${totalItems}`,
    );

    const nextOlderThan = feed.stories?.oldest_story_date;
    if (!nextOlderThan || nextOlderThan >= olderThan) {
      console.log('No further pagination token — end of feed.');
      break;
    }
    olderThan = nextOlderThan;
  }

  console.log('\n=== Summary ===');
  console.log(`Total pages: ${pages}`);
  console.log(`Total items: ${totalItems}`);
  console.log(`Newest: ${newestDate}`);
  console.log(`Oldest: ${oldestDate}`);
  if (oldestDate) {
    const days = Math.round(
      (Date.now() - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    console.log(`Feed depth: ~${days} days`);
  }
}

main().catch(console.error);
