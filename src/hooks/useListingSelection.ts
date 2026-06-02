import { useState } from "react";
import type { ListingItem } from "@/types/listings";

export function useListingSelection() {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedVariations, setExpandedVariations] = useState<Set<string>>(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());

  function toggleSelectItem(id: string) {
    setSelectedItems((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        s.delete(id);
      } else {
        s.add(id);
      }
      return s;
    });
  }

  function toggleSelectAll(sortedAds: ListingItem[]) {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      const visibleIds = sortedAds.map((a) => a.id);
      const allSelected = visibleIds.every((id) => newSet.has(id));
      visibleIds.forEach((id) => (allSelected ? newSet.delete(id) : newSet.add(id)));
      return newSet;
    });
  }

  function toggleExpandVariation(id: string) {
    setExpandedVariations((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        s.delete(id);
      } else {
        s.add(id);
      }
      return s;
    });
  }

  function toggleSelectDraft(id: string) {
    setSelectedDraftIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        s.delete(id);
      } else {
        s.add(id);
      }
      return s;
    });
  }

  function toggleSelectAllDrafts(drafts: any[]) {
    setSelectedDraftIds((prev) => {
      const newSet = new Set(prev);
      const all = drafts.every((d: any) => newSet.has(String(d.id)));
      drafts.forEach((d: any) =>
        all ? newSet.delete(String(d.id)) : newSet.add(String(d.id)),
      );
      return newSet;
    });
  }

  function resetSelection() {
    setSelectedItems(new Set());
    setExpandedVariations(new Set());
  }

  return {
    selectedItems,
    setSelectedItems,
    expandedVariations,
    selectedDraftIds,
    setSelectedDraftIds,
    toggleSelectItem,
    toggleSelectAll,
    toggleExpandVariation,
    toggleSelectDraft,
    toggleSelectAllDrafts,
    resetSelection,
  };
}
