/**
 * Persists and loads column visibility preferences from localStorage.
 * Extracted from useOrdersPageController (lines 43-69).
 * localStorage key: `pedidos_columns_${organizationId}` — invariant, do not change.
 */
import { useEffect, useState } from "react";

export type ColumnPref = { id: string; enabled: boolean };

export function useColumnPreferences(
  organizationId: string | null | undefined,
): {
  columnPrefs: ColumnPref[] | null;
  setColumnPrefs: React.Dispatch<React.SetStateAction<ColumnPref[] | null>>;
} {
  const [columnPrefs, setColumnPrefs] = useState<ColumnPref[] | null>(() => {
    if (!organizationId) return null;
    try {
      const raw = localStorage.getItem(`pedidos_columns_${organizationId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ColumnPref[]) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (!organizationId) return;
    try {
      const raw = localStorage.getItem(`pedidos_columns_${organizationId}`);
      if (!raw) { setColumnPrefs(null); return; }
      const parsed = JSON.parse(raw);
      setColumnPrefs(Array.isArray(parsed) ? (parsed as ColumnPref[]) : null);
    } catch { /* silently ignore */ }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !columnPrefs) return;
    try {
      localStorage.setItem(`pedidos_columns_${organizationId}`, JSON.stringify(columnPrefs));
    } catch { /* silently ignore */ }
  }, [columnPrefs, organizationId]);

  return { columnPrefs, setColumnPrefs };
}
