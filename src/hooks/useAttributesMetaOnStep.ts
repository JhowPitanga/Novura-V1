import { useEffect, useState } from "react";

export interface UseAttributesMetaOnStepParams {
  itemRow: any;
  currentStep: number;
}

/**
 * Populates attrsMeta from itemRow.attributes when on step 5 (ficha técnica).
 */
export function useAttributesMetaOnStep({ itemRow, currentStep }: UseAttributesMetaOnStepParams) {
  const [attrsMeta, setAttrsMeta] = useState<any[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);

  useEffect(() => {
    if (currentStep !== 5) return;
    setLoadingAttrs(true);
    try {
      const arr = Array.isArray(itemRow?.attributes) ? itemRow.attributes : [];
      setAttrsMeta(arr);
    } finally {
      setLoadingAttrs(false);
    }
  }, [itemRow?.attributes, currentStep]);

  return { attrsMeta, setAttrsMeta, loadingAttrs };
}
