import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import { query, queryOne, execute } from '../index';
import {
  getCrates,
  createCrate,
  renameCrate,
  deleteCrate,
  ensureCrateBySource,
  addToCrate,
  removeFromCrate,
  getItemCrates,
  clearCrate,
  catalogTrackCrateItemId,
  catalogReleaseCrateItemId,
  getWishlistItemCount,
  getAllCrateItemIds,
} from '../crates';

describe('crates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCrates', () => {
    it('returns mapped crate objects', async () => {
      vi.mocked(query).mockResolvedValue([
        { id: 1, fan_id: 10, name: 'Wishlist', source: 'bandcamp_wishlist', created_at: '2025-01-01T00:00:00Z' },
        { id: 2, fan_id: 10, name: 'My Crate', source: 'user', created_at: '2025-02-01T00:00:00Z' },
      ]);

      const crates = await getCrates(10);

      expect(crates).toEqual([
        { id: 1, fanId: 10, name: 'Wishlist', source: 'bandcamp_wishlist', createdAt: '2025-01-01T00:00:00Z' },
        { id: 2, fanId: 10, name: 'My Crate', source: 'user', createdAt: '2025-02-01T00:00:00Z' },
      ]);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('fan_id = $1'), [10]);
    });

    it('converts Date objects to ISO strings', async () => {
      vi.mocked(query).mockResolvedValue([
        { id: 1, fan_id: 10, name: 'Test', source: 'user', created_at: new Date('2025-06-15T12:00:00Z') },
      ]);

      const crates = await getCrates(10);
      expect(crates[0].createdAt).toBe('2025-06-15T12:00:00.000Z');
    });
  });

  describe('createCrate', () => {
    it('inserts and returns new crate id', async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ c: '3' })   // count check
        .mockResolvedValueOnce({ id: 42 });   // INSERT RETURNING

      const id = await createCrate(10, 'New Crate');

      expect(id).toBe(42);
      const insertCall = vi.mocked(queryOne).mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO crates');
      expect(insertCall[1]).toEqual([10, 'New Crate', 'user']);
    });

    it('truncates long names to 64 chars', async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ c: '0' })
        .mockResolvedValueOnce({ id: 1 });

      const longName = 'A'.repeat(100);
      await createCrate(10, longName);

      const insertCall = vi.mocked(queryOne).mock.calls[1];
      expect((insertCall[1] as string[])[1]).toHaveLength(64);
    });

    it('throws when exceeding max crate limit', async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ c: '100' });
      await expect(createCrate(10, 'One Too Many')).rejects.toThrow('Cannot create more than 100 crates');
    });
  });

  describe('renameCrate', () => {
    it('updates name with ownership check', async () => {
      vi.mocked(execute).mockResolvedValue({ rowCount: 1 } as never);
      await renameCrate(5, 10, 'Renamed');
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE crates SET name'),
        ['Renamed', 5, 10],
      );
    });

    it('throws when crate not found', async () => {
      vi.mocked(execute).mockResolvedValue({ rowCount: 0 } as never);
      await expect(renameCrate(999, 10, 'Nope')).rejects.toThrow('Crate not found');
    });
  });

  describe('deleteCrate', () => {
    it('deletes user crate', async () => {
      vi.mocked(queryOne).mockResolvedValue({ source: 'user' });
      await deleteCrate(5, 10);
      expect(execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM crates'), [5, 10]);
    });

    it('throws when deleting wishlist crate', async () => {
      vi.mocked(queryOne).mockResolvedValue({ source: 'bandcamp_wishlist' });
      await expect(deleteCrate(1, 10)).rejects.toThrow('Cannot delete the Bandcamp wishlist crate');
    });

    it('throws when crate not found', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      await expect(deleteCrate(999, 10)).rejects.toThrow('Crate not found');
    });
  });

  describe('ensureCrateBySource', () => {
    it('returns existing crate id', async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: 7 });
      const id = await ensureCrateBySource(10, 'bandcamp_wishlist', 'Wishlist');
      expect(id).toBe(7);
    });

    it('creates crate when none exists', async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce(null)          // SELECT returns nothing
        .mockResolvedValueOnce({ id: 99 });   // INSERT RETURNING

      const id = await ensureCrateBySource(10, 'user', 'My Crate');
      expect(id).toBe(99);
      expect(queryOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('addToCrate', () => {
    it('inserts crate item after ownership check', async () => {
      vi.mocked(queryOne).mockResolvedValue({ exists: 1 }); // ownership
      await addToCrate(5, 10, 'item-abc');
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO crate_items'),
        [5, 'item-abc'],
      );
    });

    it('throws when not owned', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      await expect(addToCrate(5, 99, 'item-abc')).rejects.toThrow('Crate not found');
    });
  });

  describe('removeFromCrate', () => {
    it('deletes crate item after ownership check', async () => {
      vi.mocked(queryOne).mockResolvedValue({ exists: 1 });
      await removeFromCrate(5, 10, 'item-abc');
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM crate_items'),
        [5, 'item-abc'],
      );
    });

    it('throws when not owned', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      await expect(removeFromCrate(5, 99, 'item-abc')).rejects.toThrow('Crate not found');
    });
  });

  describe('clearCrate', () => {
    it('deletes all items from crate', async () => {
      vi.mocked(queryOne).mockResolvedValue({ exists: 1 });
      await clearCrate(5, 10);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM crate_items WHERE crate_id'),
        [5],
      );
    });

    it('throws when not owned', async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      await expect(clearCrate(5, 99)).rejects.toThrow('Crate not found');
    });
  });

  describe('getItemCrates', () => {
    it('returns crate ids for a feed item', async () => {
      vi.mocked(query).mockResolvedValue([{ crate_id: 1 }, { crate_id: 3 }]);
      const ids = await getItemCrates(10, 'item-abc');
      expect(ids).toEqual([1, 3]);
    });
  });

  describe('catalogTrackCrateItemId / catalogReleaseCrateItemId', () => {
    it('formats track crate item id', () => {
      expect(catalogTrackCrateItemId(42)).toBe('catalog-track-42');
    });

    it('formats release crate item id', () => {
      expect(catalogReleaseCrateItemId(7)).toBe('catalog-release-7');
    });
  });

  describe('getWishlistItemCount', () => {
    it('returns parsed count', async () => {
      vi.mocked(queryOne).mockResolvedValue({ c: '25' });
      const count = await getWishlistItemCount(10);
      expect(count).toBe(25);
    });
  });

  describe('getAllCrateItemIds', () => {
    it('returns a Set of feed item ids', async () => {
      vi.mocked(query).mockResolvedValue([
        { feed_item_id: 'a' },
        { feed_item_id: 'b' },
        { feed_item_id: 'c' },
      ]);
      const ids = await getAllCrateItemIds(10);
      expect(ids).toEqual(new Set(['a', 'b', 'c']));
    });
  });
});
