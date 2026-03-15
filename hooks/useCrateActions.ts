import { useState, useCallback } from 'react';
import {
  toggleDefaultCrate,
  toggleDefaultCrateForAlbum,
  addToCrateAction,
  addToCrateForAlbum,
  removeFromCrateAction,
} from '@/app/(app)/crates/actions';
import type { AlbumRef } from '@/app/(app)/crates/actions';
import type { CrateItemRef } from '@/lib/crate-utils';
import { releaseKey } from '@/lib/crate-utils';
import type { CrateInfo } from '@/components/TrackActions';

interface UseCrateActionsOptions {
  initialCrateItemIds?: string[];
  initialCrates?: CrateInfo[];
  initialItemCrateMap?: Record<string, number[]>;
}

export function useCrateActions({
  initialCrateItemIds = [],
  initialCrates = [],
  initialItemCrateMap = {},
}: UseCrateActionsOptions = {}) {
  const [crates] = useState<CrateInfo[]>(initialCrates);
  const [crateItemIds, setCrateItemIds] = useState<Set<string>>(() => new Set(initialCrateItemIds));
  const [itemCrateMap, setItemCrateMap] = useState<Record<string, number[]>>(initialItemCrateMap);

  const toggleCrate = useCallback(async (key: string, ref: CrateItemRef) => {
    setCrateItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      await toggleDefaultCrate(ref);
    } catch {
      setCrateItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
  }, []);

  const toggleCrateForAlbum = useCallback(async (key: string | null, album: AlbumRef) => {
    if (key) {
      setCrateItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
    try {
      const { releaseId } = await toggleDefaultCrateForAlbum(album);
      const rk = releaseKey(releaseId);
      setCrateItemIds((prev) => {
        const next = new Set(prev);
        if (key && key !== rk) next.delete(key);
        if (next.has(rk)) next.delete(rk);
        else next.add(rk);
        return next;
      });
    } catch {
      if (key) {
        setCrateItemIds((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }
    }
  }, []);

  const addToCrate = useCallback(async (key: string, ref: CrateItemRef, crateId: number) => {
    setCrateItemIds((prev) => new Set(prev).add(key));
    setItemCrateMap((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), crateId],
    }));
    try {
      await addToCrateAction(crateId, ref);
    } catch {
      setItemCrateMap((prev) => {
        const updated = (prev[key] ?? []).filter((id) => id !== crateId);
        const next = { ...prev };
        if (updated.length === 0) delete next[key];
        else next[key] = updated;
        return next;
      });
    }
  }, []);

  const addToCrateForAlbumAction = useCallback(async (key: string | null, album: AlbumRef, crateId: number) => {
    try {
      const releaseId = await addToCrateForAlbum(crateId, album);
      const rk = releaseKey(releaseId);
      setCrateItemIds((prev) => new Set(prev).add(rk));
      setItemCrateMap((prev) => ({
        ...prev,
        [rk]: [...(prev[rk] ?? []), crateId],
      }));
    } catch {
      if (key) {
        setItemCrateMap((prev) => {
          const updated = (prev[key] ?? []).filter((id) => id !== crateId);
          const next = { ...prev };
          if (updated.length === 0) delete next[key];
          else next[key] = updated;
          return next;
        });
      }
    }
  }, []);

  const removeFromCrate = useCallback(async (key: string, ref: CrateItemRef, crateId: number) => {
    const prevCrateIds = itemCrateMap[key] ?? [];
    const updated = prevCrateIds.filter((id) => id !== crateId);
    if (updated.length === 0) {
      setCrateItemIds((prevIds) => {
        const s = new Set(prevIds);
        s.delete(key);
        return s;
      });
      setItemCrateMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setItemCrateMap((prev) => ({ ...prev, [key]: updated }));
    }
    try {
      await removeFromCrateAction(crateId, ref);
    } catch {
      setCrateItemIds((prevIds) => new Set(prevIds).add(key));
      setItemCrateMap((prev) => ({ ...prev, [key]: prevCrateIds }));
    }
  }, [itemCrateMap]);

  return {
    crates,
    crateItemIds,
    itemCrateMap,
    toggleCrate,
    toggleCrateForAlbum,
    addToCrate,
    addToCrateForAlbumAction,
    removeFromCrate,
  };
}
