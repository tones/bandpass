const cookie = process.env.BANDCAMP_IDENTITY;
if (!cookie) {
  console.error('Set BANDCAMP_IDENTITY in .env.local');
  process.exit(1);
}

async function main() {
  // Step 1: Get fan_id
  const summaryRes = await fetch('https://bandcamp.com/api/fan/2/collection_summary', {
    headers: { Cookie: `identity=${cookie}` },
  });
  const summary = await summaryRes.json();
  console.log('=== collection_summary (top-level keys) ===');
  console.log(Object.keys(summary));
  console.log('fan_id:', summary.fan_id);

  // Step 2: Get feed
  const fanId = summary.fan_id;
  const olderThan = Math.floor(Date.now() / 1000);
  const feedRes = await fetch('https://bandcamp.com/fan_dash_feed_updates', {
    method: 'POST',
    headers: {
      Cookie: `identity=${cookie}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `fan_id=${fanId}&older_than=${olderThan}`,
  });
  const feed = await feedRes.json();

  console.log('\n=== feed response (top-level keys) ===');
  console.log(Object.keys(feed));

  console.log('\n=== feed.stories (keys) ===');
  console.log(Object.keys(feed.stories));

  console.log('\n=== feed.stories.track_list type ===');
  console.log('typeof:', typeof feed.stories.track_list);
  console.log('isArray:', Array.isArray(feed.stories.track_list));
  if (feed.stories.track_list && typeof feed.stories.track_list === 'object') {
    console.log('keys:', Object.keys(feed.stories.track_list));
    if (Array.isArray(feed.stories.track_list)) {
      console.log('first entry sample:', JSON.stringify(feed.stories.track_list[0], null, 2));
    } else if (feed.stories.track_list.entries) {
      console.log('entries isArray:', Array.isArray(feed.stories.track_list.entries));
      console.log('first entry sample:', JSON.stringify(feed.stories.track_list.entries?.[0], null, 2));
    }
  }

  console.log('\n=== first story entry (full) ===');
  if (feed.stories.entries?.length > 0) {
    console.log(JSON.stringify(feed.stories.entries[0], null, 2));
  }

  console.log('\n=== story entry keys (all unique) ===');
  const allKeys = new Set<string>();
  for (const entry of feed.stories.entries ?? []) {
    for (const key of Object.keys(entry)) allKeys.add(key);
  }
  console.log([...allKeys].sort());

  console.log('\n=== story_type values ===');
  const types = new Set<string>();
  for (const entry of feed.stories.entries ?? []) {
    types.add(entry.story_type);
  }
  console.log([...types]);

  console.log('\n=== fan_info sample ===');
  const fanInfoKeys = Object.keys(feed.fan_info ?? {});
  if (fanInfoKeys.length > 0) {
    console.log(JSON.stringify(feed.fan_info[fanInfoKeys[0]], null, 2));
  }

  console.log('\n=== band_info sample ===');
  const bandInfoKeys = Object.keys(feed.band_info ?? {});
  if (bandInfoKeys.length > 0) {
    console.log(JSON.stringify(feed.band_info[bandInfoKeys[0]], null, 2));
  }

  console.log('\n=== entry count:', feed.stories.entries?.length);
  console.log('oldest_story_date:', feed.stories.oldest_story_date);
  console.log('newest_story_date:', feed.stories.newest_story_date);
}

main().catch(console.error);
