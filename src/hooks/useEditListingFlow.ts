import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketplaceAdapter, NormalizedListingItem } from '@/adapters/listings/types';
import { resolveAdapter } from '@/adapters/listings/resolveAdapter';
import { supabase } from '@/integrations/supabase/client';

export interface EditListingFlowState {
  loading: boolean;
  saving: string | null;
  setSaving: (v: string | null) => void;
  itemRow: NormalizedListingItem | null;
  adapter: MarketplaceAdapter | null;
  currentStep: number;
  setCurrentStep: (v: number) => void;
  maxSteps: number;

  // Editable state
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  listingTypeId: string;
  setListingTypeId: (v: string) => void;
  attributes: any[];
  setAttributes: (v: any[]) => void;
  variations: any[];
  setVariations: (v: any[]) => void;
  pictures: (string | File)[];
  setPictures: (v: (string | File)[]) => void;
  shipping: any;
  setShipping: (v: any | ((prev: any) => any)) => void;
  status: string;
  setStatus: (v: string) => void;
  videoId: string;
  setVideoId: (v: string) => void;
  soldQty: number;

  // Actions
  save: (patch: Partial<NormalizedListingItem>) => Promise<void>;
  changeStatus: (status: 'active' | 'paused' | 'closed') => Promise<void>;
  reload: () => Promise<void>;
}

export function useEditListingFlow(
  organizationId: string | undefined,
  itemId: string | undefined,
  onError?: (msg: string) => void,
): EditListingFlowState {
  const maxSteps = 5;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [itemRow, setItemRow] = useState<NormalizedListingItem | null>(null);
  const [adapter, setAdapter] = useState<MarketplaceAdapter | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  // Editable state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [listingTypeId, setListingTypeId] = useState('');
  const [attributes, setAttributes] = useState<any[]>([]);
  const [variations, setVariations] = useState<any[]>([]);
  const [pictures, setPictures] = useState<(string | File)[]>([]);
  const [shipping, setShipping] = useState<any>({});
  const [status, setStatus] = useState('');
  const [videoId, setVideoId] = useState('');
  const [soldQty, setSoldQty] = useState(0);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // ── Load item ─────────────────────────────────────────────────────────────

  const loadItem = useCallback(async () => {
    if (!organizationId || !itemId) return;
    setLoading(true);
    try {
      let mktName = 'Mercado Livre';
      const { data: canonicalRow } = await (supabase as any)
        .from('marketplace_listings')
        .select('marketplace_name')
        .eq('organizations_id', organizationId)
        .eq('marketplace_item_id', String(itemId))
        .limit(1)
        .maybeSingle();
      if (canonicalRow?.marketplace_name) {
        mktName = String(canonicalRow.marketplace_name);
      } else {
        const { data: canonicalFallback } = await (supabase as any)
          .from('marketplace_listings')
          .select('marketplace_name')
          .eq('organizations_id', organizationId)
          .eq('marketplace_item_id', String(itemId))
          .limit(1)
          .maybeSingle();
        if (canonicalFallback?.marketplace_name) mktName = String(canonicalFallback.marketplace_name);
      }
      const resolved = resolveAdapter(mktName);
      if (!resolved) throw new Error(`Marketplace "${mktName}" não suportado para edição.`);
      setAdapter(resolved);

      const item = await resolved.loadItem(organizationId, itemId);
      setItemRow(item);
      setTitle(item.title);
      setDescription(item.description);
      setPrice(item.price);
      setListingTypeId(item.listing_type_id || '');
      setAttributes(item.attributes);
      setVariations(item.variations);
      setPictures(item.pictures);
      setShipping(item.shipping);
      setStatus(item.status);
      setVideoId(item.videoId || '');
      setSoldQty(item.soldQty);
    } catch (e: any) {
      onErrorRef.current?.(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [organizationId, itemId]);

  useEffect(() => { loadItem(); }, [loadItem]);

  // ── Save patch via adapter ─────────────────────────────────────────────────

  const save = useCallback(async (patch: Partial<NormalizedListingItem>) => {
    if (!adapter || !organizationId || !itemId) return;
    await adapter.updateFields(organizationId, itemId, patch);
  }, [adapter, organizationId, itemId]);

  // ── Change status via adapter ─────────────────────────────────────────────

  const changeStatus = useCallback(async (newStatus: 'active' | 'paused' | 'closed') => {
    if (!adapter || !organizationId || !itemId) return;
    await adapter.updateStatus(organizationId, itemId, newStatus);
    setStatus(newStatus);
  }, [adapter, organizationId, itemId]);

  return {
    loading,
    saving, setSaving,
    itemRow,
    adapter,
    currentStep, setCurrentStep,
    maxSteps,
    title, setTitle,
    description, setDescription,
    price, setPrice,
    listingTypeId, setListingTypeId,
    attributes, setAttributes,
    variations, setVariations,
    pictures, setPictures,
    shipping, setShipping,
    status, setStatus,
    videoId, setVideoId,
    soldQty,
    save,
    changeStatus,
    reload: loadItem,
  };
}
