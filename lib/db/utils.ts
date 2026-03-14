/** Shared DB utilities: tag parsing, SQL fragments, and async helpers. */

export function safeParseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generates a SQL CASE expression that prefers tags from the catalog table
 * over inline tags, handling the empty-array-is-not-NULL gotcha in JSONB.
 */
export function tagsWithFallback(catalogAlias: string, fallbackAlias: string): string {
  return `CASE WHEN ${catalogAlias}.tags IS NOT NULL AND ${catalogAlias}.tags != '[]'::jsonb THEN ${catalogAlias}.tags ELSE ${fallbackAlias}.tags END`;
}
