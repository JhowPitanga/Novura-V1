/**
 * Pure utilities for order column preference merging.
 * Extracted from useOrdersPageController (columns useMemo, lines 361-380).
 */

export type ColumnPref = { id: string; enabled: boolean };

export interface ColumnLike {
  id: string;
  alwaysVisible?: boolean;
  enabled?: boolean;
  [k: string]: unknown;
}

/**
 * Merge saved column preferences with freshly-built column definitions.
 *
 * Rules (verbatim from controller):
 * - null prefs → return freshCols as-is.
 * - Prefs referencing unknown column ids are skipped.
 * - col.alwaysVisible overrides pref.enabled=false (column stays visible).
 * - Columns not referenced by any pref are appended after prefs-ordered cols.
 */
export function columnPrefsMerge<T extends ColumnLike>(
  freshCols: T[],
  columnPrefs: ColumnPref[] | null,
): T[] {
  if (!columnPrefs) return freshCols;
  const freshMap = new Map(freshCols.map(c => [c.id, c]));
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const pref of columnPrefs) {
    const col = freshMap.get(pref.id);
    if (!col) continue;
    merged.push({ ...col, enabled: col.alwaysVisible ? true : pref.enabled });
    seen.add(pref.id);
  }
  for (const col of freshCols) {
    if (!seen.has(col.id)) merged.push(col);
  }
  return merged;
}
