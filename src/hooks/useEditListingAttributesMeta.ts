import { useEffect, useState } from 'react';
import type { MarketplaceAdapter, AdapterAttribute } from '@/adapters/listings/types';

export interface UseEditListingAttributesMetaParams {
  adapter: MarketplaceAdapter | null;
  organizationId: string | undefined;
  categoryId: string;
  currentStep: number;
}

/**
 * Fetches category attribute schema from the marketplace API on steps 4–5.
 */
export function useEditListingAttributesMeta({
  adapter,
  organizationId,
  categoryId,
  currentStep,
}: UseEditListingAttributesMetaParams) {
  const [attrsMeta, setAttrsMeta] = useState<AdapterAttribute[]>([]);
  const [brandList, setBrandList] = useState<any[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);

  useEffect(() => {
    if (!adapter || !organizationId || !categoryId) return;
    if (currentStep !== 4 && currentStep !== 5) return;

    let cancelled = false;
    (async () => {
      setLoadingAttrs(true);
      try {
        const result = await adapter.fetchAttributes(organizationId, categoryId);
        if (!cancelled) {
          setAttrsMeta(result.attrs || []);
          setBrandList(result.brandList || []);
        }
      } catch (e) {
        console.error('[useEditListingAttributesMeta]', e);
        if (!cancelled) {
          setAttrsMeta([]);
          setBrandList([]);
        }
      } finally {
        if (!cancelled) setLoadingAttrs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adapter, organizationId, categoryId, currentStep]);

  return { attrsMeta, brandList, loadingAttrs, setAttrsMeta };
}
