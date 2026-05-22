/**
 * Access context cache & refresh tuning for tenant module switches.
 * Kept short so admin enable/disable reflects quickly in the ERP shell.
 */
export const ACCESS_CONTEXT_CACHE_TTL_MS = 30_000;

/** Background poll while the tab is visible (fallback when realtime misses an event). */
export const ACCESS_CONTEXT_POLL_INTERVAL_MS = 30_000;

/** Debounce burst postgres_changes before refetching RPC context. */
export const ACCESS_CONTEXT_REALTIME_DEBOUNCE_MS = 400;
