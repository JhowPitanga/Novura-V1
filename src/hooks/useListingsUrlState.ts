import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { MarketplaceNavItem } from "@/types/listings";
import { slugFromMarketplacePath } from "@/utils/listingUtils";
import { resolveMarketplacePathFromUrl, marketplaceSlugForPath } from "./listingUrlUtils";

interface UseListingsUrlStateOptions {
  navItems: MarketplaceNavItem[];
}

export function useListingsUrlState({ navItems }: UseListingsUrlStateOptions) {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeStatus, setActiveStatus] = useState<string>("todos");

  // Sync activeStatus from pathname segment
  useEffect(() => {
    const m = String(location.pathname).match(/^\/anuncios\/(ativos|inativos|rascunhos)/);
    if (m?.[1]) setActiveStatus(m[1]);
  }, [location.pathname]);

  const selectedMarketplacePath = useMemo(
    () => resolveMarketplacePathFromUrl(location.pathname, location.search, navItems),
    [location.pathname, location.search, navItems],
  );

  const marketplaceSlug = marketplaceSlugForPath(selectedMarketplacePath);

  // Persist marketplace in URL (?marketplace=) so tab switches refetch reliably
  useEffect(() => {
    if (!navItems.length) return;
    const params = new URLSearchParams(location.search);
    if (params.get("marketplace")) return;
    params.set(
      "marketplace",
      slugFromMarketplacePath(selectedMarketplacePath || navItems[0].path),
    );
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }, [navItems, selectedMarketplacePath, location.pathname, location.search, navigate]);

  const handleMarketplaceNavigate = useCallback(
    (path: string) => {
      const params = new URLSearchParams(location.search);
      params.set("marketplace", slugFromMarketplacePath(path));
      navigate({ pathname: location.pathname, search: params.toString() });
    },
    [location.pathname, location.search, navigate],
  );

  const handleStatusNavigate = useCallback(
    (path: string) => {
      const seg = path.split("/").pop() || "todos";
      setActiveStatus(seg);
      const params = new URLSearchParams(location.search);
      navigate({ pathname: path, search: params.toString() });
    },
    [location.search, navigate],
  );

  return {
    activeStatus,
    setActiveStatus,
    selectedMarketplacePath,
    marketplaceSlug,
    location,
    handleMarketplaceNavigate,
    handleStatusNavigate,
  };
}
