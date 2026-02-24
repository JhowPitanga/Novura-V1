import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parsePriceToNumber } from "@/utils/listingUtils";

export interface UseListingTypeStateParams {
  itemRow: any;
  currentStep: number;
  price: string;
  organizationId: string | undefined;
}

/**
 * Encapsulates listing type and price-options state for EditListingML step 1:
 * syncs listingTypeId from itemRow, builds listingTypes, debounces price,
 * fetches listing price options when type/price/category change.
 */
export function useListingTypeState({
  itemRow,
  currentStep,
  price,
  organizationId,
}: UseListingTypeStateParams) {
  const [listingTypes, setListingTypes] = useState<any[]>([]);
  const [listingTypeId, setListingTypeId] = useState<string>("");
  const [listingPriceOptions, setListingPriceOptions] = useState<any[]>([]);
  const [loadingListing, setLoadingListing] = useState(false);
  const [debouncedPrice, setDebouncedPrice] = useState<string>(price);

  // Sync listingTypeId from itemRow when item loads/updates
  useEffect(() => {
    setListingTypeId(String(itemRow?.listing_type_id || ""));
  }, [itemRow?.listing_type_id]);

  // Step 1: build listingTypes (Clássico/Premium + current if missing)
  useEffect(() => {
    if (currentStep !== 1) return;
    const arr = [
      { id: "gold_special", name: "Clássico" },
      { id: "gold_pro", name: "Premium" },
    ];
    const currId = String(itemRow?.listing_type_id || "");
    const base = arr.slice();
    if (currId && !base.find((t: any) => String(t?.id || t) === currId)) {
      base.push({
        id: currId,
        name: currId === "gold_special" ? "Clássico" : currId === "gold_pro" ? "Premium" : currId,
      });
    }
    setListingTypes(base);
  }, [itemRow?.listing_type_id, currentStep]);

  // Step 1: set default listingTypeId when list is ready
  useEffect(() => {
    if (currentStep !== 1) return;
    if (!listingTypeId && Array.isArray(listingTypes) && listingTypes.length > 0) {
      const first = listingTypes[0] as any;
      const id = String(first?.id || first);
      if (id) setListingTypeId(id);
    }
  }, [listingTypes, currentStep, listingTypeId]);

  // Debounce price -> debouncedPrice (500ms)
  useEffect(() => {
    const h = setTimeout(() => setDebouncedPrice(price), 500);
    return () => clearTimeout(h);
  }, [price]);

  // Step 1: fetch listing prices by type (uses debouncedPrice)
  useEffect(() => {
    const fetchListingPrices = async () => {
      const p = parsePriceToNumber(debouncedPrice);
      if (!organizationId || !itemRow?.category_id || !(p > 0)) return;
      const curType = String(itemRow?.listing_type_id || "");
      const selType = String(listingTypeId || "");
      if (!selType) return;
      if (selType === curType) return;
      if (currentStep !== 1) return;
      setLoadingListing(true);
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-listing-prices", {
          body: {
            organizationId,
            siteId: "MLB",
            price: p,
            categoryId: String(itemRow?.category_id || ""),
          },
        });
        if (!error) setListingPriceOptions(Array.isArray((data as any)?.prices) ? (data as any).prices : []);
      } finally {
        setLoadingListing(false);
      }
    };
    fetchListingPrices();
  }, [organizationId, itemRow?.category_id, listingTypeId, currentStep, debouncedPrice]);

  return {
    listingTypes,
    listingTypeId,
    setListingTypeId,
    listingPriceOptions,
    loadingListing,
    debouncedPrice,
  };
}
