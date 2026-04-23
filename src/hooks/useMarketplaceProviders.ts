import { useQuery } from "@tanstack/react-query";
import {
  appsWithProviderKeys,
  fetchAppsWithProvider,
  fetchMarketplaceProviders,
  marketplaceProviderKeys,
} from "@/services/marketplace-providers.service";

/** Returns the marketplace_providers catalog (all active providers). */
export function useMarketplaceProviders() {
  return useQuery({
    queryKey: marketplaceProviderKeys.list(),
    queryFn: fetchMarketplaceProviders,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Returns apps_public_view rows joined with provider metadata. */
export function useAppsWithProvider() {
  return useQuery({
    queryKey: appsWithProviderKeys.list(),
    queryFn: fetchAppsWithProvider,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
