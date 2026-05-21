import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketplaceAdapter, NormalizedDraft, AdapterAttribute, ListingType, ListingPriceOption, ShippingPreferences } from '@/adapters/listings/types';
import { supabase } from '@/integrations/supabase/client';

// ─── Session cache (keyed by channel:categoryId to avoid contamination) ───────

interface SessionCache {
  attrsByCategory: Record<string, { attrs: AdapterAttribute[]; brandList?: any[] }>;
  techByCategory: Record<string, any>;
  saleTermsByCategory: Record<string, any[]>;
  listingTypesByCategory: Record<string, ListingType[]>;
  listingPricesByKey: Record<string, ListingPriceOption[]>;
  conditionalByCategory: Record<string, string[]>;
  shippingPrefs: ShippingPreferences | null;
}

function makeCacheKey(channel: string, ...parts: string[]) {
  return `${channel}:${parts.join(':')}`;
}

export interface CreateListingFlowState {
  // Step navigation
  currentStep: number;
  maxVisitedStep: number;
  maxSteps: number;
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  canProceedCheck: () => boolean;

  // Core draft fields
  siteId: string;
  setSiteId: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  currencyId: string;
  setCurrencyId: (v: string) => void;
  attributes: any[];
  setAttributes: (v: any[]) => void;
  pictures: (string | File)[];
  setPictures: (v: (string | File)[]) => void;
  video: File | string | null;
  setVideo: (v: File | string | null) => void;
  variations: any[];
  setVariations: (v: any[]) => void;
  variationsEnabled: boolean;
  setVariationsEnabled: (v: boolean) => void;
  listingTypeId: string;
  setListingTypeId: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  shipping: any;
  setShipping: (v: any | ((prev: any) => any)) => void;
  saleTerms: any[];
  setSaleTerms: (v: any[]) => void;
  description: string;
  setDescription: (v: string) => void;
  availableQuantity: number;
  setAvailableQuantity: (v: number) => void;
  preferFlex: boolean;
  setPreferFlex: (v: boolean) => void;

  // Fetched metadata
  attrsMeta: AdapterAttribute[];
  brandList: any[];
  techSpecsInput: any;
  techSpecsOutput: any;
  setTechSpecsOutput: (v: any) => void;
  saleTermsMeta: any[];
  listingTypes: ListingType[];
  listingPriceOptions: ListingPriceOption[];
  shippingPrefs: ShippingPreferences | null;
  conditionalRequiredIds: string[];
  variationAttrs: AdapterAttribute[];

  // Derived states
  loading: boolean;
  loadingListing: boolean;
  connectedApps: string[];
  freeShippingMandatory: boolean;
  availableLogisticTypes: string[];
  selectedLogisticType: string;
  setSelectedLogisticType: (v: string) => void;
  errorSteps: number[];
  setErrorSteps: (v: number[]) => void;

  // Draft
  currentDraftId: string | null;
  setCurrentDraftId: (v: string | null) => void;

  // Publish
  publishing: boolean;
  setPublishing: (v: boolean) => void;

  // Helpers
  buildDraft: () => NormalizedDraft;
  prefetchForNextStep: () => void;
}

export function useCreateListingFlow(
  adapter: MarketplaceAdapter | null,
  organizationId: string | undefined,
): CreateListingFlowState {
  const maxSteps = 8;
  const [currentStep, setCurrentStep] = useState(1);
  const [maxVisitedStep, setMaxVisitedStep] = useState(1);

  // Draft fields
  const [siteId, setSiteId] = useState('MLB');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [currencyId, setCurrencyId] = useState('BRL');
  const [attributes, setAttributes] = useState<any[]>([]);
  const [pictures, setPictures] = useState<(string | File)[]>([]);
  const [video, setVideo] = useState<File | string | null>(null);
  const [variations, setVariations] = useState<any[]>([]);
  const [variationsEnabled, setVariationsEnabled] = useState(false);
  const [listingTypeId, setListingTypeId] = useState('');
  const [price, setPrice] = useState('');
  const [shipping, setShipping] = useState<any>({});
  const [saleTerms, setSaleTerms] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [availableQuantity, setAvailableQuantity] = useState(0);
  const [preferFlex, setPreferFlex] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Fetched metadata
  const [attrsMeta, setAttrsMeta] = useState<AdapterAttribute[]>([]);
  const [brandList, setBrandList] = useState<any[]>([]);
  const [techSpecsInput, setTechSpecsInput] = useState<any>(null);
  const [techSpecsOutput, setTechSpecsOutput] = useState<any>(null);
  const [saleTermsMeta, setSaleTermsMeta] = useState<any[]>([]);
  const [listingTypes, setListingTypes] = useState<ListingType[]>([]);
  const [listingPriceOptions, setListingPriceOptions] = useState<ListingPriceOption[]>([]);
  const [shippingPrefs, setShippingPrefs] = useState<ShippingPreferences | null>(null);
  const [conditionalRequiredIds, setConditionalRequiredIds] = useState<string[]>([]);
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingListing, setLoadingListing] = useState(false);
  const [errorSteps, setErrorSteps] = useState<number[]>([]);

  // Cache keyed per channel to avoid contamination between ML and Shopee sessions
  const cacheRef = useRef<SessionCache>({
    attrsByCategory: {},
    techByCategory: {},
    saleTermsByCategory: {},
    listingTypesByCategory: {},
    listingPricesByKey: {},
    conditionalByCategory: {},
    shippingPrefs: null,
  });

  const lastCategoryLoadedRef = useRef('');
  const lastListingTypeLoadedRef = useRef('');

  // ── Connected apps ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('marketplace_integrations')
        .select('marketplace_name')
        .eq('organizations_id', organizationId);
      const names: string[] = (data || []).map((r: any) => String(r?.marketplace_name || ''));
      setConnectedApps(Array.from(new Set(names.map((n) => (n === 'mercado_livre' ? 'Mercado Livre' : n)).filter(Boolean))));
    })();
  }, [organizationId]);

  // ── Load attributes when category changes (step 3) ─────────────────────────

  useEffect(() => {
    if (!adapter || !organizationId || !categoryId || currentStep < 3) return;
    if (lastCategoryLoadedRef.current === categoryId) return;
    lastCategoryLoadedRef.current = categoryId;

    const cacheKey = makeCacheKey(adapter.channel, categoryId);
    if (cacheRef.current.attrsByCategory[cacheKey]) {
      const cached = cacheRef.current.attrsByCategory[cacheKey];
      setAttrsMeta(cached.attrs);
      setBrandList(cached.brandList || []);
      return;
    }

    setLoading(true);
    adapter.fetchAttributes(organizationId, categoryId).then(({ attrs, brandList: bl }) => {
      setAttrsMeta(attrs);
      setBrandList(bl || []);
      cacheRef.current.attrsByCategory[cacheKey] = { attrs, brandList: bl || [] };
    }).catch(() => { }).finally(() => setLoading(false));
  }, [adapter, organizationId, categoryId, currentStep]);

  // ── Load tech specs on step 5 ───────────────────────────────────────────────

  useEffect(() => {
    if (!adapter || !organizationId || !categoryId || currentStep < 5) return;
    if (!adapter.fetchTechSpecsInput || !adapter.capabilities.supportsTechSpecsInput) return;

    const cacheKey = makeCacheKey(adapter.channel, 'tech', categoryId);
    if (cacheRef.current.techByCategory[cacheKey]) {
      setTechSpecsInput(cacheRef.current.techByCategory[cacheKey]);
      return;
    }
    adapter.fetchTechSpecsInput(organizationId, categoryId).then((res) => {
      setTechSpecsInput(res || null);
      cacheRef.current.techByCategory[cacheKey] = res || null;
    }).catch(() => { });
  }, [adapter, organizationId, categoryId, currentStep]);

  // ── Load sale terms on step 6 ───────────────────────────────────────────────

  useEffect(() => {
    if (!adapter || !organizationId || !categoryId || currentStep < 6) return;
    if (!adapter.fetchSaleTermsMeta || !adapter.capabilities.supportsSaleTerms) return;

    const cacheKey = makeCacheKey(adapter.channel, 'sale', categoryId);
    if (cacheRef.current.saleTermsByCategory[cacheKey]) {
      setSaleTermsMeta(cacheRef.current.saleTermsByCategory[cacheKey]);
      return;
    }
    adapter.fetchSaleTermsMeta(organizationId, categoryId).then((terms) => {
      setSaleTermsMeta(terms);
      cacheRef.current.saleTermsByCategory[cacheKey] = terms;
    }).catch(() => { });
  }, [adapter, organizationId, categoryId, currentStep]);

  // ── Load listing types on step 6 ───────────────────────────────────────────

  useEffect(() => {
    if (!adapter || !organizationId || !categoryId || currentStep < 6) return;
    if (!adapter.fetchListingTypes || !adapter.capabilities.supportsListingTypes) return;

    const cacheKey = makeCacheKey(adapter.channel, 'types', categoryId);
    if (cacheRef.current.listingTypesByCategory[cacheKey]) {
      const types = cacheRef.current.listingTypesByCategory[cacheKey];
      setListingTypes(types);
      if (!listingTypeId && types.length > 0) setListingTypeId(types[0].id);
      return;
    }
    setLoadingListing(true);
    adapter.fetchListingTypes(organizationId, categoryId, siteId).then((types) => {
      setListingTypes(types);
      cacheRef.current.listingTypesByCategory[cacheKey] = types;
      // Read listingTypeId from the closure is fine here; we only set on first load
      setListingTypeId((prev) => (!prev && types.length > 0 ? types[0].id : prev));
    }).catch(() => { }).finally(() => setLoadingListing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, organizationId, categoryId, siteId, currentStep]);

  // ── Load listing prices when type or price changes (step 6) ───────────────

  useEffect(() => {
    if (!adapter || !organizationId || !categoryId || !listingTypeId || !price || currentStep < 6) return;
    if (!adapter.fetchListingPriceOptions || !adapter.capabilities.supportsListingTypes) return;

    const priceNum = Number(String(price || '').replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.]/g, ''));
    if (!priceNum) return;
    const cacheKey = makeCacheKey(adapter.channel, 'prices', categoryId, String(Math.round(priceNum)));
    if (cacheRef.current.listingPricesByKey[cacheKey]) {
      setListingPriceOptions(cacheRef.current.listingPricesByKey[cacheKey]);
      return;
    }
    adapter.fetchListingPriceOptions(organizationId, categoryId, priceNum, siteId).then((opts) => {
      setListingPriceOptions(opts);
      cacheRef.current.listingPricesByKey[cacheKey] = opts;
    }).catch(() => { });
  }, [adapter, organizationId, categoryId, siteId, listingTypeId, price, currentStep]);

  // ── Load shipping preferences on step 7 ────────────────────────────────────

  useEffect(() => {
    if (!adapter || !organizationId || currentStep < 7) return;
    if (!adapter.fetchShippingPreferences) return;
    if (cacheRef.current.shippingPrefs) {
      setShippingPrefs(cacheRef.current.shippingPrefs);
      return;
    }
    adapter.fetchShippingPreferences(organizationId, siteId).then((prefs) => {
      setShippingPrefs(prefs);
      cacheRef.current.shippingPrefs = prefs;
      setShipping((prev: any) => ({
        ...prev,
        mode: prev?.mode || prefs.defaultShippingMode,
        free_shipping: prev?.free_shipping !== undefined ? prev.free_shipping : prefs.freeConfigDefault,
      }));
    }).catch(() => { });
  }, [adapter, organizationId, siteId, currentStep]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const freeShippingMandatory = !!(shippingPrefs?.freeShippingMandatory);
  const availableLogisticTypes = shippingPrefs?.availableLogisticTypes || [];
  const [selectedLogisticType, setSelectedLogisticType] = useState('');

  // Variation attributes from attrsMeta
  const variationAttrs = attrsMeta.filter((a) => a.tags?.allow_variations);

  // ── Prefetch for next step ──────────────────────────────────────────────────

  const prefetchForNextStep = useCallback(() => {
    if (!adapter || !organizationId || !categoryId) return;
    const next = currentStep + 1;
    if (next === 3) {
      const cacheKey = makeCacheKey(adapter.channel, categoryId);
      if (!cacheRef.current.attrsByCategory[cacheKey]) {
        adapter.fetchAttributes(organizationId, categoryId).then(({ attrs, brandList: bl }) => {
          cacheRef.current.attrsByCategory[cacheKey] = { attrs, brandList: bl || [] };
          setAttrsMeta(attrs);
          setBrandList(bl || []);
          lastCategoryLoadedRef.current = categoryId;
        }).catch(() => { });
      }
    }
    if (next === 5 && adapter.fetchTechSpecsInput && adapter.capabilities.supportsTechSpecsInput) {
      const cacheKey = makeCacheKey(adapter.channel, 'tech', categoryId);
      if (!cacheRef.current.techByCategory[cacheKey]) {
        adapter.fetchTechSpecsInput(organizationId, categoryId).then((res) => {
          cacheRef.current.techByCategory[cacheKey] = res || null;
          setTechSpecsInput(res || null);
        }).catch(() => { });
      }
    }
    if (next === 6 && adapter.fetchListingTypes && adapter.capabilities.supportsListingTypes) {
      const cacheKey = makeCacheKey(adapter.channel, 'types', categoryId);
      if (!cacheRef.current.listingTypesByCategory[cacheKey]) {
        adapter.fetchListingTypes(organizationId, categoryId, siteId).then((types) => {
          cacheRef.current.listingTypesByCategory[cacheKey] = types;
          setListingTypes(types);
          if (!listingTypeId && types.length > 0) setListingTypeId(types[0].id);
        }).catch(() => { });
      }
    }
  }, [adapter, organizationId, categoryId, siteId, currentStep, listingTypeId]);

  // ── Step navigation ─────────────────────────────────────────────────────────

  const canProceedCheck = useCallback((): boolean => {
    if (currentStep === 1) return !!adapter;
    if (currentStep === 2) return !!(title.trim() && categoryId);
    if (currentStep === 3) {
      if (adapter?.channel === 'shopee') return description.trim().length > 0;
      return description.trim().length > 0;
    }
    if (currentStep === 4 && adapter?.channel !== 'shopee') {
      return variations.length > 0;
    }
    if (currentStep === 6) {
      const priceOk = !!price;
      if (adapter?.channel === 'shopee') {
        const hasImage =
          variations.some((v) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) ||
          pictures.length > 0;
        return priceOk && hasImage;
      }
      const typeOk = !!listingTypeId && priceOk;
      const opt = listingPriceOptions.find(
        (o) => String(o?.listing_type_id || '') === String(listingTypeId || ''),
      );
      const requiresPic =
        !!(opt as any)?.requires_picture ||
        ['gold_pro', 'gold_special'].includes(String(listingTypeId || '').toLowerCase());
      if (requiresPic) {
        const hasImage =
          variations.some((v) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) ||
          pictures.length > 0;
        return typeOk && hasImage;
      }
      return typeOk;
    }
    if (currentStep === 7) {
      const isMe2 = String(shipping?.mode || '').toLowerCase() === 'me2';
      if (!isMe2) return true;
      const dims = shipping?.dimensions || {};
      const h = Number(dims?.height || 0);
      const l = Number(dims?.length || 0);
      const w = Number(dims?.width || 0);
      const g = Number(shipping?.weight || dims?.weight || 0);
      return h > 0 && l > 0 && w > 0 && g > 0;
    }
    return true;
  }, [
    adapter,
    currentStep,
    title,
    categoryId,
    description,
    variations,
    pictures,
    price,
    listingTypeId,
    listingPriceOptions,
    shipping,
  ]);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
    setMaxVisitedStep((prev) => Math.max(prev, step));
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < maxSteps) {
      prefetchForNextStep();
      goToStep(currentStep + 1);
    }
  }, [currentStep, maxSteps, goToStep, prefetchForNextStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) setCurrentStep((p) => p - 1);
  }, [currentStep]);

  // ── Build draft snapshot ────────────────────────────────────────────────────

  const buildDraft = useCallback((): NormalizedDraft => ({
    channel: adapter?.channel ?? 'mercado-livre',
    siteId,
    title,
    categoryId,
    currencyId,
    attributes,
    variations,
    pictures,
    video,
    price,
    listingTypeId,
    shipping,
    saleTerms,
    description,
    availableQuantity,
    variationsEnabled,
    listingPriceOptions,
    shippingModesAvailable: shippingPrefs?.modesAvailable || [],
    variationAttrs,
    preferFlex,
    currentDraftId,
  }), [adapter, siteId, title, categoryId, currencyId, attributes, variations, pictures, video, price, listingTypeId, shipping, saleTerms, description, availableQuantity, variationsEnabled, listingPriceOptions, shippingPrefs, variationAttrs, preferFlex, currentDraftId]);

  return {
    currentStep,
    maxVisitedStep,
    maxSteps,
    goToStep,
    nextStep,
    prevStep,
    canProceedCheck,
    siteId, setSiteId,
    title, setTitle,
    categoryId, setCategoryId,
    currencyId, setCurrencyId,
    attributes, setAttributes,
    pictures, setPictures,
    video, setVideo,
    variations, setVariations,
    variationsEnabled, setVariationsEnabled,
    listingTypeId, setListingTypeId,
    price, setPrice,
    shipping, setShipping,
    saleTerms, setSaleTerms,
    description, setDescription,
    availableQuantity, setAvailableQuantity,
    preferFlex, setPreferFlex,
    attrsMeta,
    brandList,
    techSpecsInput,
    techSpecsOutput, setTechSpecsOutput,
    saleTermsMeta,
    listingTypes,
    listingPriceOptions,
    shippingPrefs,
    conditionalRequiredIds,
    variationAttrs,
    loading,
    loadingListing,
    connectedApps,
    freeShippingMandatory,
    availableLogisticTypes,
    selectedLogisticType, setSelectedLogisticType,
    errorSteps, setErrorSteps,
    currentDraftId, setCurrentDraftId,
    publishing, setPublishing,
    buildDraft,
    prefetchForNextStep,
  };
}
