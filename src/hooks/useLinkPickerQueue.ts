import { useState } from "react";
import type { LinkPickerContext } from "@/components/shared/LinkPickerDrawer";
import { getVariationSkuFromItemRow, getVariationMatchHintsFromItemRow } from "@/utils/listingUtils";
import type { ListingItem } from "@/types/listings";

interface OpenLinkPickerParams {
  ad: ListingItem;
  variationId?: string;
  variationSku?: string;
  variationTypes?: string[];
  pendingVariationIds?: string[];
  itemRow?: any;
}

export function useLinkPickerQueue() {
  const [linkPickerContext, setLinkPickerContext] = useState<LinkPickerContext | null>(null);
  const [pendingLinkQueue, setPendingLinkQueue] = useState<string[]>([]);

  function openLinkPicker({
    ad,
    variationId,
    variationSku,
    variationTypes,
    pendingVariationIds,
    itemRow,
  }: OpenLinkPickerParams) {
    const queue =
      pendingVariationIds && pendingVariationIds.length > 0
        ? pendingVariationIds
        : variationId
        ? [variationId]
        : [];
    setPendingLinkQueue(queue);
    const stepIndex = variationId ? Math.max(queue.indexOf(variationId), 0) + 1 : 1;
    const resolvedSku =
      variationSku ||
      getVariationSkuFromItemRow(itemRow, variationId) ||
      (ad.sku && String(ad.sku).trim()) ||
      undefined;
    const resolvedHints =
      variationTypes && variationTypes.length > 0
        ? variationTypes
        : getVariationMatchHintsFromItemRow(itemRow, variationId);
    setLinkPickerContext({
      marketplace: ad.marketplace,
      marketplaceItemId: ad.marketplaceId,
      variationId,
      adSku: resolvedSku,
      adTitle: variationId ? `${ad.title} (variação ${variationId})` : ad.title,
      adImage: ad.image,
      matchHints: resolvedHints,
      pendingVariationIds: queue,
      currentStep: stepIndex,
      totalSteps: queue.length || 1,
      progressLabel: `${stepIndex}/${queue.length || 1}`,
    });
  }

  function advanceLinkPickerQueue(rawItems: any[]) {
    if (!linkPickerContext) return;
    if (pendingLinkQueue.length > 1) {
      const [, ...rest] = pendingLinkQueue;
      const nextVariationId = rest[0];
      setPendingLinkQueue(rest);
      const row = rawItems.find(
        (r) =>
          String(r?.marketplace_item_id || r?.id) ===
          String(linkPickerContext.marketplaceItemId),
      );
      const nextSku = getVariationSkuFromItemRow(row, nextVariationId);
      const nextHints = getVariationMatchHintsFromItemRow(row, nextVariationId);
      const nextStep = (linkPickerContext.currentStep || 1) + 1;
      setLinkPickerContext({
        ...linkPickerContext,
        variationId: nextVariationId,
        adSku: nextSku || linkPickerContext.adSku,
        matchHints: nextHints.length > 0 ? nextHints : [],
        progressLabel: `${nextStep}/${linkPickerContext.totalSteps || 1}`,
        currentStep: nextStep,
        pendingVariationIds: rest,
      });
    } else {
      setPendingLinkQueue([]);
      setLinkPickerContext(null);
    }
  }

  function closeLinkPicker() {
    setLinkPickerContext(null);
  }

  return {
    linkPickerContext,
    pendingLinkQueue,
    openLinkPicker,
    advanceLinkPickerQueue,
    closeLinkPicker,
    setLinkPickerContext,
  };
}
