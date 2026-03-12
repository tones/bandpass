import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedCatalogRelease, seedCatalogTrack, seedFeedItem, seedCrate, seedWishlistItem } from './helpers';

let testDb: Database.Database;

vi.mock('../index', () => ({
  getDb: () => testDb,
}));

import {
  getCrates,
  createCrate,
  renameCrate,
  deleteCrate,
  ensureDefaultCrate,
  ensureCrateBySource,
  getCrateItems,
  getCrateCatalogItems,
  addToCrate,
  removeFromCrate,
  getItemCrates,
  getItemCrateMultiMap,
  clearCrate,
  catalogTrackCrateItemId,
  getWishlistItems,
  getWishlistItemCount,
  getAllCrateItemIds,
} from '../crates';

const fanId = 100;

beforeEach(() => {
  testDb = createTestDb();
});

describe('createCrate / getCrates', () => {
  it('creates a crate and lists it', () => {
    const id = createCrate(fanId, 'Disco');
    const crates = getCrates(fanId);
    expect(crates).toHaveLength(1);
    expect(crates[0]).toMatchObject({
      id,
      fanId,
      name: 'Disco',
      source: 'user',
    });
  });

  it('returns crates ordered by created_at ascending', () => {
    createCrate(fanId, 'First');
    createCrate(fanId, 'Second');
    createCrate(fanId, 'Third');
    const names = getCrates(fanId).map((c) => c.name);
    expect(names).toEqual(['First', 'Second', 'Third']);
  });

  it('does not return crates from other fans', () => {
    createCrate(fanId, 'Mine');
    createCrate(999, 'Theirs');
    expect(getCrates(fanId)).toHaveLength(1);
    expect(getCrates(999)).toHaveLength(1);
  });

  it('includes wishlist crates in listing', () => {
    createCrate(fanId, 'User Crate');
    seedCrate(testDb, fanId, { name: 'Bandcamp Wishlist', source: 'bandcamp_wishlist' });
    const crates = getCrates(fanId);
    expect(crates).toHaveLength(2);
    expect(crates.map((c) => c.source)).toContain('bandcamp_wishlist');
  });
});

describe('renameCrate', () => {
  it('renames a crate', () => {
    const id = createCrate(fanId, 'Old Name');
    renameCrate(id, fanId, 'New Name');
    expect(getCrates(fanId)[0].name).toBe('New Name');
  });

  it('throws when fan does not own the crate', () => {
    const id = createCrate(fanId, 'Mine');
    expect(() => renameCrate(id, 999, 'Hacked')).toThrow('Crate not found');
  });
});

describe('deleteCrate', () => {
  it('deletes a crate', () => {
    const id = createCrate(fanId, 'Temporary');
    deleteCrate(id, fanId);
    expect(getCrates(fanId)).toHaveLength(0);
  });

  it('cascade deletes crate_items', () => {
    const crateId = createCrate(fanId, 'Doomed');
    const itemId = seedFeedItem(testDb, fanId, { id: 'feed-1' });
    addToCrate(crateId, fanId, itemId);
    deleteCrate(crateId, fanId);
    const rows = testDb.prepare('SELECT * FROM crate_items WHERE crate_id = ?').all(crateId);
    expect(rows).toHaveLength(0);
  });

  it('throws when deleting a bandcamp_wishlist crate', () => {
    const id = seedCrate(testDb, fanId, { name: 'Bandcamp Wishlist', source: 'bandcamp_wishlist' });
    expect(() => deleteCrate(id, fanId)).toThrow();
  });

  it('throws when fan does not own the crate', () => {
    const id = createCrate(fanId, 'Mine');
    expect(() => deleteCrate(id, 999)).toThrow('Crate not found');
  });
});

describe('ensureDefaultCrate', () => {
  it('creates "My Crate" when fan has no user crates', () => {
    const id = ensureDefaultCrate(fanId);
    const crates = getCrates(fanId);
    expect(crates).toHaveLength(1);
    expect(crates[0]).toMatchObject({ id, name: 'My Crate', source: 'user' });
  });

  it('returns existing crate ID on subsequent calls', () => {
    const first = ensureDefaultCrate(fanId);
    const second = ensureDefaultCrate(fanId);
    expect(first).toBe(second);
    expect(getCrates(fanId)).toHaveLength(1);
  });

  it('returns existing user crate even if named differently', () => {
    const existing = createCrate(fanId, 'Custom Name');
    const id = ensureDefaultCrate(fanId);
    expect(id).toBe(existing);
    expect(getCrates(fanId)).toHaveLength(1);
  });

  it('ignores wishlist crates when checking for existing user crates', () => {
    seedCrate(testDb, fanId, { name: 'Bandcamp Wishlist', source: 'bandcamp_wishlist' });
    const id = ensureDefaultCrate(fanId);
    const crates = getCrates(fanId);
    expect(crates).toHaveLength(2);
    const userCrate = crates.find((c) => c.id === id);
    expect(userCrate?.source).toBe('user');
  });
});

describe('addToCrate / removeFromCrate', () => {
  it('adds an item to a crate', () => {
    const crateId = createCrate(fanId, 'Test');
    const itemId = seedFeedItem(testDb, fanId, { id: 'feed-1' });
    addToCrate(crateId, fanId, itemId);

    const rows = testDb.prepare('SELECT * FROM crate_items WHERE crate_id = ?').all(crateId);
    expect(rows).toHaveLength(1);
  });

  it('duplicate add is idempotent', () => {
    const crateId = createCrate(fanId, 'Test');
    addToCrate(crateId, fanId, 'feed-1');
    addToCrate(crateId, fanId, 'feed-1');

    const rows = testDb.prepare('SELECT * FROM crate_items WHERE crate_id = ?').all(crateId);
    expect(rows).toHaveLength(1);
  });

  it('removes an item from a crate', () => {
    const crateId = createCrate(fanId, 'Test');
    addToCrate(crateId, fanId, 'feed-1');
    removeFromCrate(crateId, fanId, 'feed-1');

    const rows = testDb.prepare('SELECT * FROM crate_items WHERE crate_id = ?').all(crateId);
    expect(rows).toHaveLength(0);
  });

  it('remove is safe on non-existent item', () => {
    const crateId = createCrate(fanId, 'Test');
    expect(() => removeFromCrate(crateId, fanId, 'nonexistent')).not.toThrow();
  });

  it('throws when fan does not own the crate', () => {
    const crateId = createCrate(fanId, 'Mine');
    expect(() => addToCrate(crateId, 999, 'feed-1')).toThrow('Crate not found');
    expect(() => removeFromCrate(crateId, 999, 'feed-1')).toThrow('Crate not found');
  });
});

describe('getCrateItems', () => {
  it('returns feed items joined from feed_items table', () => {
    const crateId = createCrate(fanId, 'Test');
    const itemId = seedFeedItem(testDb, fanId, {
      id: 'nr-123',
      storyType: 'new_release',
      albumTitle: 'Great Album',
      artistName: 'Cool Artist',
      trackTitle: 'Track One',
    });
    addToCrate(crateId, fanId, itemId);

    const items = getCrateItems(crateId, fanId);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('nr-123');
    expect(items[0].album.title).toBe('Great Album');
    expect(items[0].artist.name).toBe('Cool Artist');
    expect(items[0].track?.title).toBe('Track One');
  });

  it('does not return catalog-track items', () => {
    const crateId = createCrate(fanId, 'Test');
    addToCrate(crateId, fanId, 'catalog-track-42');
    seedFeedItem(testDb, fanId, { id: 'feed-1' });
    addToCrate(crateId, fanId, 'feed-1');

    const items = getCrateItems(crateId, fanId);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('feed-1');
  });

  it('returns items ordered by added_at descending', () => {
    const crateId = createCrate(fanId, 'Test');
    seedFeedItem(testDb, fanId, { id: 'first' });
    seedFeedItem(testDb, fanId, { id: 'second' });
    addToCrate(crateId, fanId, 'first');
    addToCrate(crateId, fanId, 'second');

    const items = getCrateItems(crateId, fanId);
    expect(items).toHaveLength(2);
  });
});

describe('getCrateCatalogItems', () => {
  it('joins crate_items with catalog_tracks and catalog_releases', () => {
    const crateId = createCrate(fanId, 'Test');
    const releaseId = seedCatalogRelease(testDb, {
      bandSlug: 'ghostfunk',
      bandName: 'Ghost Funk Orchestra',
      bandUrl: 'https://ghostfunk.bandcamp.com',
      title: 'A New Kind of Love',
      url: 'https://ghostfunk.bandcamp.com/album/a-new-kind-of-love',
      imageUrl: 'https://img/cover.jpg',
    });
    const trackId = seedCatalogTrack(testDb, releaseId, {
      trackNum: 3,
      title: 'Walk Like a Motherfucker',
      duration: 245.5,
      streamUrl: 'https://stream/track3.mp3',
      trackUrl: 'https://ghostfunk.bandcamp.com/track/walk-like-a-motherfucker',
    });

    const crateItemId = catalogTrackCrateItemId(trackId);
    addToCrate(crateId, fanId, crateItemId);

    const items = getCrateCatalogItems(crateId, fanId);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      crateItemId,
      trackId,
      trackTitle: 'Walk Like a Motherfucker',
      trackDuration: 245.5,
      streamUrl: 'https://stream/track3.mp3',
      trackUrl: 'https://ghostfunk.bandcamp.com/track/walk-like-a-motherfucker',
      releaseTitle: 'A New Kind of Love',
      releaseUrl: 'https://ghostfunk.bandcamp.com/album/a-new-kind-of-love',
      imageUrl: 'https://img/cover.jpg',
      bandName: 'Ghost Funk Orchestra',
      bandUrl: 'https://ghostfunk.bandcamp.com',
    });
  });

  it('ignores non-catalog crate entries', () => {
    const crateId = createCrate(fanId, 'Test');
    addToCrate(crateId, fanId, 'feed-item-123');
    expect(getCrateCatalogItems(crateId, fanId)).toEqual([]);
  });

  it('returns empty array when no catalog items in crate', () => {
    const crateId = createCrate(fanId, 'Test');
    expect(getCrateCatalogItems(crateId, fanId)).toEqual([]);
  });

  it('handles null streamUrl and trackUrl', () => {
    const crateId = createCrate(fanId, 'Test');
    const releaseId = seedCatalogRelease(testDb);
    const trackId = seedCatalogTrack(testDb, releaseId, {
      title: 'No Stream',
      streamUrl: null,
      trackUrl: null,
    });
    addToCrate(crateId, fanId, catalogTrackCrateItemId(trackId));

    const items = getCrateCatalogItems(crateId, fanId);
    expect(items).toHaveLength(1);
    expect(items[0].streamUrl).toBeNull();
    expect(items[0].trackUrl).toBeNull();
  });
});

describe('catalogTrackCrateItemId', () => {
  it('returns catalog-track-{id} format', () => {
    expect(catalogTrackCrateItemId(42)).toBe('catalog-track-42');
    expect(catalogTrackCrateItemId(0)).toBe('catalog-track-0');
  });
});

describe('getItemCrates', () => {
  it('returns crate IDs containing the item', () => {
    const crate1 = createCrate(fanId, 'Crate A');
    const crate2 = createCrate(fanId, 'Crate B');
    addToCrate(crate1, fanId, 'feed-1');
    addToCrate(crate2, fanId, 'feed-1');

    const crateIds = getItemCrates(fanId, 'feed-1');
    expect(crateIds.sort()).toEqual([crate1, crate2].sort());
  });

  it('returns empty array when item is in no crates', () => {
    expect(getItemCrates(fanId, 'nonexistent')).toEqual([]);
  });

  it('only returns crates belonging to the specified fan', () => {
    const myCrate = createCrate(fanId, 'Mine');
    const theirCrate = createCrate(999, 'Theirs');
    addToCrate(myCrate, fanId, 'feed-1');
    addToCrate(theirCrate, 999, 'feed-1');

    expect(getItemCrates(fanId, 'feed-1')).toEqual([myCrate]);
    expect(getItemCrates(999, 'feed-1')).toEqual([theirCrate]);
  });
});

describe('getItemCrateMultiMap', () => {
  it('returns map of feedItemId to crateId array', () => {
    const crateId = createCrate(fanId, 'Test');
    addToCrate(crateId, fanId, 'feed-1');
    addToCrate(crateId, fanId, 'feed-2');

    const map = getItemCrateMultiMap(fanId);
    expect(map['feed-1']).toEqual([crateId]);
    expect(map['feed-2']).toEqual([crateId]);
  });

  it('returns empty map when no items', () => {
    const map = getItemCrateMultiMap(fanId);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('maps items across multiple crates', () => {
    const crate1 = createCrate(fanId, 'A');
    const crate2 = createCrate(fanId, 'B');
    addToCrate(crate1, fanId, 'feed-1');
    addToCrate(crate2, fanId, 'feed-2');
    addToCrate(crate2, fanId, 'feed-1');

    const map = getItemCrateMultiMap(fanId);
    expect(map['feed-1']?.sort()).toEqual([crate1, crate2].sort());
    expect(map['feed-2']).toEqual([crate2]);
  });

  it('only includes crates for the specified fan', () => {
    const myCrate = createCrate(fanId, 'Mine');
    const theirCrate = createCrate(999, 'Theirs');
    addToCrate(myCrate, fanId, 'feed-1');
    addToCrate(theirCrate, 999, 'feed-2');

    const map = getItemCrateMultiMap(fanId);
    expect(Object.keys(map)).toHaveLength(1);
    expect(map['feed-1']).toBeDefined();
    expect(map['feed-2']).toBeUndefined();
  });
});

describe('clearCrate', () => {
  it('removes all items but keeps the crate', () => {
    const crateId = createCrate(fanId, 'Test');
    addToCrate(crateId, fanId, 'feed-1');
    addToCrate(crateId, fanId, 'feed-2');
    addToCrate(crateId, fanId, 'feed-3');

    clearCrate(crateId, fanId);

    const rows = testDb.prepare('SELECT * FROM crate_items WHERE crate_id = ?').all(crateId);
    expect(rows).toHaveLength(0);
    expect(getCrates(fanId)).toHaveLength(1);
  });

  it('throws when fan does not own the crate', () => {
    const crateId = createCrate(fanId, 'Mine');
    expect(() => clearCrate(crateId, 999)).toThrow('Crate not found');
  });
});

describe('getWishlistItems', () => {
  it('returns wishlist items for a fan', () => {
    seedWishlistItem(testDb, fanId, {
      id: 'wl-1',
      title: 'Cool Album',
      artistName: 'Cool Artist',
      tags: ['electronic', 'ambient'],
    });
    seedWishlistItem(testDb, fanId, { id: 'wl-2', title: 'Another Album' });

    const items = getWishlistItems(fanId);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === 'wl-1')?.tags).toEqual(['electronic', 'ambient']);
  });

  it('returns empty array for fan with no wishlist items', () => {
    expect(getWishlistItems(fanId)).toEqual([]);
  });

  it('does not return items from other fans', () => {
    seedWishlistItem(testDb, fanId, { id: 'wl-mine' });
    seedWishlistItem(testDb, 999, { id: 'wl-theirs' });
    expect(getWishlistItems(fanId)).toHaveLength(1);
    expect(getWishlistItems(fanId)[0].id).toBe('wl-mine');
  });

  it('parses empty tags gracefully', () => {
    seedWishlistItem(testDb, fanId, { id: 'wl-notags', tags: [] });
    const items = getWishlistItems(fanId);
    expect(items[0].tags).toEqual([]);
  });
});

describe('getWishlistItemCount', () => {
  it('returns 0 when no items exist', () => {
    expect(getWishlistItemCount(fanId)).toBe(0);
  });

  it('returns correct count', () => {
    seedWishlistItem(testDb, fanId, { id: 'wl-1' });
    seedWishlistItem(testDb, fanId, { id: 'wl-2' });
    seedWishlistItem(testDb, fanId, { id: 'wl-3' });
    expect(getWishlistItemCount(fanId)).toBe(3);
  });

  it('only counts items for the specified fan', () => {
    seedWishlistItem(testDb, fanId, { id: 'wl-mine' });
    seedWishlistItem(testDb, 999, { id: 'wl-theirs' });
    expect(getWishlistItemCount(fanId)).toBe(1);
  });
});

describe('getAllCrateItemIds', () => {
  it('returns all item IDs across all crates', () => {
    const crate1 = createCrate(fanId, 'A');
    const crate2 = createCrate(fanId, 'B');
    addToCrate(crate1, fanId, 'feed-1');
    addToCrate(crate2, fanId, 'feed-2');
    addToCrate(crate2, fanId, 'feed-1');

    const ids = getAllCrateItemIds(fanId);
    expect(ids.size).toBe(2);
    expect(ids.has('feed-1')).toBe(true);
    expect(ids.has('feed-2')).toBe(true);
  });

  it('returns empty set when no crate items', () => {
    expect(getAllCrateItemIds(fanId).size).toBe(0);
  });

  it('only includes items for the specified fan', () => {
    const myCrate = createCrate(fanId, 'Mine');
    const theirCrate = createCrate(999, 'Theirs');
    addToCrate(myCrate, fanId, 'feed-1');
    addToCrate(theirCrate, 999, 'feed-2');

    const myIds = getAllCrateItemIds(fanId);
    expect(myIds.size).toBe(1);
    expect(myIds.has('feed-1')).toBe(true);
  });
});

describe('ensureCrateBySource', () => {
  it('creates a crate with given source and name when none exists', () => {
    const id = ensureCrateBySource(fanId, 'bandcamp_wishlist', 'Bandcamp Wishlist');
    const crates = getCrates(fanId);
    expect(crates).toHaveLength(1);
    expect(crates[0]).toMatchObject({ id, source: 'bandcamp_wishlist', name: 'Bandcamp Wishlist' });
  });

  it('returns existing crate ID on subsequent calls', () => {
    const first = ensureCrateBySource(fanId, 'bandcamp_wishlist', 'Bandcamp Wishlist');
    const second = ensureCrateBySource(fanId, 'bandcamp_wishlist', 'Bandcamp Wishlist');
    expect(first).toBe(second);
    expect(getCrates(fanId)).toHaveLength(1);
  });

  it('creates separate crates for different sources', () => {
    ensureCrateBySource(fanId, 'user', 'My Crate');
    ensureCrateBySource(fanId, 'bandcamp_wishlist', 'Bandcamp Wishlist');
    expect(getCrates(fanId)).toHaveLength(2);
  });
});
