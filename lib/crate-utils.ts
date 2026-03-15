/**
 * Pure utility types and functions for crate item identification.
 * Kept separate from lib/db/crates.ts to avoid pulling in pg
 * when imported from client components.
 */

export type CrateItemRef = { releaseId: number } | { trackId: number };

export function crateKey(ref: CrateItemRef): string {
  if ('trackId' in ref) return `track:${ref.trackId}`;
  return `release:${ref.releaseId}`;
}

export function releaseKey(id: number): string {
  return `release:${id}`;
}

export function trackKey(id: number): string {
  return `track:${id}`;
}
