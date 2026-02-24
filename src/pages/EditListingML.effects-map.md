# EditListingML – Map of useEffects (after refactor)

Effects 1, 3–7, 8, 9 were moved into hooks. The page now keeps only Effect 2 (sync categoryId).

| Location | Category | Purpose |
|----------|----------|---------|
| **useEditListingInitialData** | Carregamento inicial / Supabase | Load item from unified/fallback table, hydrate form state |
| **EditListingML** (Effect 2) | Sincronização | Sync `categoryId` from `itemRow.category_id` |
| **useListingTypeState** | Step 1 + Supabase | Sync listingTypeId, build listingTypes, debounce price, fetch listing prices |
| **useShippingPreferences** | Step 2 / Supabase | Load shipping prefs from `marketplace_integrations` |
| **useAttributesMetaOnStep** | Step 5 | Populate `attrsMeta` from `itemRow.attributes` |

## React Query

Migration to `useQuery` (initial load) and `useMutation` (callUpdate) was evaluated. Keeping local state and Supabase calls in hooks preserves the current flow and avoids cache invalidation complexity; React Query can be considered in a later iteration if we need cross-page invalidation or optimistic updates.

## Edge cases (step navigation)

- Effects that depend on `currentStep` use guards (`currentStep !== 1`, etc.) so they only run when the user is on that step; re-entering the step re-runs the effect (idempotent for shipping prefs and attrsMeta).
- `canEditTitle` is derived from `soldQty` (from initial data) and stays consistent after load; if the item is refreshed elsewhere, `soldQty` would need to be updated from that source.
