# Bandpass Feature Ideas

Brainstormed 2026-03-14. Not prioritized -- just a backlog of possibilities.

---

## Harmonic Mixing / DJ Tools

- **Transition finder** -- given a track, show compatible tracks (within a BPM range, adjacent keys on the Camelot wheel). Basically what Rekordbox and Mixed In Key do, built into your own library.
- **Smart crates** -- auto-populated crates based on rules like "120-130 BPM, keys 8A-10A, tagged deep-house." Saved filters that act as crates.
- **Set builder** -- arrange tracks into a DJ set with suggested ordering based on harmonic compatibility and energy flow. Could visualize as a Camelot wheel or linear timeline.
- **Export to DJ software** -- generate Rekordbox XML or Traktor NML with BPM/key/cue data already populated.

## Discovery and Recommendations

- **"Fans who bought X also bought Y"** -- lightweight collaborative filtering using scraped fan/collection overlap data.
- **Tag graph / genre explorer** -- visualize the tag space as a network or treemap. Click a tag cluster to explore.
- **New release radar** -- surface new releases from artists you've purchased from, prominently and separately from the general feed.
- **Friend taste profiles** -- build mini-profiles from friends' purchases ("this friend buys a lot of jazz and post-punk") and browse by friend as a discovery mechanism.

## Collection Analytics

- **Dashboard / stats page** -- BPM distribution histogram, key distribution (Camelot wheel visualization), genre breakdown, purchases over time, top artists by track count. Year-in-review style.
- **Collection gaps** -- "you own 8 of 12 tracks from this album" or "you have 3 releases from this artist but not their most popular one."
- **Spending tracker** -- chart spending over time, by genre, etc. Bandcamp Friday ROI. (Price data already exists on feed items.)

## Playback and Listening Experience

- **Crossfade / auto-DJ** -- continuous playback with crossfades, optionally using harmonic mixing logic to pick the next track.
- **Queue** -- a transient "up next" queue separate from crates, like Spotify's queue. Drag tracks in from anywhere.
- **Play history / scrobbling** -- track what you've listened to, surface "recently played," weight recommendations. Optionally scrobble to Last.fm.
- **Keyboard shortcuts** -- spacebar play/pause, arrow keys for prev/next, number keys for star ratings or quick-add to a crate.

## Sharing and Social

- **Shareable crates** -- public link to a crate that anyone can browse and listen to (via the audio proxy). Like a mixtape link.
- **Collaborative crates** -- multiple bandpass users curate a crate together.
- **"What's hot in my network"** -- aggregate view of what friends are buying this week, ranked by frequency.

## Bandcamp-Specific Utilities

- **Wishlist price alerts** -- notify when something on your wishlist goes on sale or becomes name-your-price.
- **Bandcamp Friday dashboard** -- countdown timer, curated "buy these today" list from wishlist, spending budget tracker.
- **Download manager** -- "download all" for a crate as a zip, with files already ID3-tagged with BPM/key metadata. (Leverages S3 storage.)
