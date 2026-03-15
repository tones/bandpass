import { useState, useCallback } from 'react';
import { toggleDefaultCrate, addToCrateAction, removeFromCrateAction } from '@/app/(app)/crates/actions';
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

  const toggleCrate = useCallback(async (id: string) => {
    setCrateItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await toggleDefaultCrate(id);
    } catch {
      setCrateItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  }, []);

  const addToCrate = useCallback(async (itemId: string, crateId: number) => {
    setCrateItemIds((prev) => new Set(prev).add(itemId));
    setItemCrateMap((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), crateId],
    }));
    try {
      await addToCrateAction(crateId, itemId);
    } catch {
      setItemCrateMap((prev) => {
        const updated = (prev[itemId] ?? []).filter((id) => id !== crateId);
        const next = { ...prev };
        if (updated.length === 0) delete next[itemId];
        else next[itemId] = updated;
        return next;
      });
    }
  }, []);

  const removeFromCrate = useCallback(async (itemId: string, crateId: number) => {
    const prevCrateIds = itemCrateMap[itemId] ?? [];
    const updated = prevCrateIds.filter((id) => id !== crateId);
    if (updated.length === 0) {
      setCrateItemIds((prevIds) => {
        const s = new Set(prevIds);
        s.delete(itemId);
        return s;
      });
      setItemCrateMap((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } else {
      setItemCrateMap((prev) => ({ ...prev, [itemId]: updated }));
    }
    try {
      await removeFromCrateAction(crateId, itemId);
    } catch {
      setCrateItemIds((prevIds) => new Set(prevIds).add(itemId));
      setItemCrateMap((prev) => ({ ...prev, [itemId]: prevCrateIds }));
    }
  }, [itemCrateMap]);

  return { crates, crateItemIds, itemCrateMap, toggleCrate, addToCrate, removeFromCrate };
}
