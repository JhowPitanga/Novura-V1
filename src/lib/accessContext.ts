/**
 * Access context cache & refresh tuning for tenant module switches.
 * 5-minute TTL avoids redundant RPCs on every route navigation while still
 * reflecting admin flag changes within a reasonable window (realtime covers urgent updates).
 */
export const ACCESS_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Background poll while the tab is visible (fallback when realtime misses an event). */
export const ACCESS_CONTEXT_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Debounce burst postgres_changes before refetching RPC context. */
export const ACCESS_CONTEXT_REALTIME_DEBOUNCE_MS = 400;
