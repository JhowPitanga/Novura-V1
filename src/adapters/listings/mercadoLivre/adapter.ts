import { supabase } from "@/integrations/supabase/client";
import { invokeFn } from '../shared/invokeFn';
import { serializeImages, ensureFile, compressImage, fileToBase64 } from '../shared/imageUpload';
import { parsePriceToNumber } from '../shared/priceParse';
import { buildMLPublishPayload } from './payload';
import { validateMLDraftForPublish } from './validators';
import { mapMLErrorToStep } from './mapping';
import { fetchMLCategoryPredictions } from './categories';
import { normalizeEditShipping, resolveUniversalSalePrice } from '@/utils/editListingHelpers';
import type {
  MarketplaceAdapter,
  AdapterCapabilities,
  NormalizedDraft,
  NormalizedListingItem,
  ValidationResult,
  PublishResult,
  AdapterError,
  CategorySuggestionDTO,
  CategoryNode,
  AdapterAttribute,
  BrandOption,
  StepDescriptor,
  ListingType,
  ListingPriceOption,
  ShippingPreferences,
  SaleTermMeta,
} from '../types';

// ─── Capabilities ─────────────────────────────────────────────────────────────

const ML_CAPABILITIES: AdapterCapabilities = {
  maxImages: 8,
  maxVideos: 1,
  maxTitleLength: 60,
  descriptionFormat: 'plain',
  supportsListingTypes: true,
  supportsTechSpecsInput: true,
  supportsSaleTerms: true,
  supportsFlex: true,
  supportsConditionalAttributes: true,
  supportsFreeShippingMandatoryRule: true,
  supportsVariationPicturesPerVariation: true,
  supportsLocalPickup: true,
  supportsDomainSuggestions: true,
  titleLockedAfterFirstSale: true,
  shippingWeightUnit: 'g',
  editableFields: ['title', 'description', 'price', 'listing_type', 'shipping', 'variations', 'pictures', 'video', 'attributes', 'status'],
};

// ─── Step descriptors ─────────────────────────────────────────────────────────

const CREATE_STEPS: StepDescriptor[] = [
  { id: 1, title: 'Marketplace', description: 'Selecione o canal de venda' },
  { id: 2, title: 'Título e Categoria', description: 'Defina o produto' },
  { id: 3, title: 'Atributos, Fotos e Descrição', description: 'Detalhes e mídias' },
  { id: 4, title: 'Variações', description: 'Cores, tamanhos, modelos' },
  { id: 5, title: 'Ficha Técnica', description: 'Especificações técnicas' },
  { id: 6, title: 'Preço e Publicação', description: 'Tipo de anúncio e preço' },
  { id: 7, title: 'Envio e Dimensões', description: 'Logística e embalagem' },
  { id: 8, title: 'Revisão', description: 'Confira e publique' },
];

const EDIT_STEPS: StepDescriptor[] = [
  { id: 1, title: 'Preço e Publicação', description: 'Tarifa e tipo de anúncio' },
  { id: 2, title: 'Envio', description: 'Logística e dimensões' },
  { id: 3, title: 'Título e Descrição', description: 'Texto do anúncio' },
  { id: 4, title: 'Variações, Fotos e Vídeo', description: 'Mídias e modelos' },
  { id: 5, title: 'Ficha Técnica', description: 'Atributos do produto' },
];

// ─── Attributes helper ────────────────────────────────────────────────────────

function parseMLAttribute(a: any): AdapterAttribute {
  const values = Array.isArray(a?.values)
    ? a.values.map((v: any) => ({ id: String(v?.id || ''), name: String(v?.name || '') }))
    : [];
  const allowed_units = Array.isArray(a?.allowed_units)
    ? a.allowed_units.map((u: any) => ({ id: String(u?.id || ''), name: String(u?.name || '') }))
    : [];
  const vtype = a?.value_type || (values.length > 0 ? 'list' : (allowed_units.length > 0 ? 'number_unit' : 'string'));
  const tags = {
    required: !!(a?.tags?.required),
    allow_variations: !!(a?.tags?.allow_variations),
    multivalued: !!(a?.tags?.multivalued),
  };
  return { id: String(a?.id || ''), name: String(a?.name || ''), values, value_type: vtype, tags, allowed_units, default_unit: String(a?.default_unit || '') };
}

// ─── Shipping modes helper ────────────────────────────────────────────────────

function parseJsonSafe(raw: any): any[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { } }
  return null;
}

function scanFreeShipMandatory(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase();
    if (key.includes('free') && key.includes('ship')) {
      if (typeof v === 'boolean' && v === true) return true;
      if (typeof v === 'string') {
        const s = v.toLowerCase();
        if (s.includes('mandatory') || s === 'true') return true;
      }
    }
    if (v && typeof v === 'object' && scanFreeShipMandatory(v as any)) return true;
  }
  return false;
}

// ─── Adapter implementation ───────────────────────────────────────────────────

export const mercadoLivreAdapter: MarketplaceAdapter = {
  channel: 'mercado-livre',
  displayName: 'Mercado Livre',
  capabilities: ML_CAPABILITIES,

  getCreateSteps: () => CREATE_STEPS,
  getEditSteps: () => EDIT_STEPS,

  // ── Categories ──────────────────────────────────────────────────────────────

  async predictCategories(orgId, title) {
    const siteId = await _getMLSiteId(orgId);
    return fetchMLCategoryPredictions(orgId, title, siteId);
  },

  async loadCategoryRoots(orgId) {
    const siteId = await _getMLSiteId(orgId);
    try {
      const res = await fetch(`https://api.mercadolibre.com/sites/${siteId}/categories`);
      const data = await res.json();
      const roots: CategoryNode[] = Array.isArray(data)
        ? data.map((c: any) => ({ id: String(c?.id || ''), name: String(c?.name || '') }))
        : [];
      if (roots.length > 0) return { roots };
    } catch { }
    return { roots: [] };
  },

  async loadCategoryChildren(orgId, parentId) {
    try {
      const res = await fetch(`https://api.mercadolibre.com/categories/${parentId}`);
      const data = await res.json();
      const children: CategoryNode[] = (Array.isArray(data?.children_categories) ? data.children_categories : [])
        .map((c: any) => ({ id: String(c?.id || ''), name: String(c?.name || '') }));
      const pathArr = Array.isArray(data?.path_from_root) ? data.path_from_root : [];
      const fullPath = pathArr.map((p: any) => String(p?.name || '')).filter(Boolean).join(' › ');
      const pathById = fullPath ? { [String(data?.id || parentId)]: fullPath } : undefined;
      return { children, pathById };
    } catch {
      return { children: [] };
    }
  },

  async getCategoryPath(orgId, categoryId) {
    try {
      const res = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
      const data = await res.json();
      const pathArr = Array.isArray(data?.path_from_root) ? data.path_from_root : [];
      return pathArr.map((p: any) => String(p?.name || '')).filter(Boolean).join(' › ');
    } catch {
      return categoryId;
    }
  },

  // ── Attributes ──────────────────────────────────────────────────────────────

  async fetchAttributes(orgId, categoryId) {
    const { data, error } = await invokeFn('mercado-livre-categories-attributes', {
      organizationId: orgId, categoryId,
    });
    if (error) return { attrs: [] };
    const attrs: AdapterAttribute[] = Array.isArray(data?.attributes)
      ? data.attributes.map(parseMLAttribute)
      : [];
    return { attrs };
  },

  async fetchTechSpecsInput(orgId, categoryId) {
    const { data, error } = await invokeFn('mercado-livre-technical-specs-input', {
      organizationId: orgId, categoryId,
    });
    if (error) return null;
    return data || null;
  },

  async fetchSaleTermsMeta(orgId, categoryId) {
    const { data, error } = await invokeFn('mercado-livre-categories-sale-terms', {
      organizationId: orgId, categoryId,
    });
    if (error) return [];
    const terms: SaleTermMeta[] = Array.isArray(data?.terms) ? data.terms : [];
    return terms;
  },

  async evaluateConditionalRequired(orgId, categoryId, attrs) {
    const { data, error } = await invokeFn('mercado-livre-attributes-conditional', {
      organizationId: orgId, categoryId, attributes: attrs,
    });
    if (error) return [];
    return Array.isArray(data?.required_ids) ? data.required_ids : [];
  },

  // ── Listing types & prices ──────────────────────────────────────────────────

  async fetchListingTypes(orgId, categoryId, siteId) {
    let arr: ListingType[] = [];
    const { data, error } = await invokeFn('mercado-livre-available-listing-types', {
      organizationId: orgId, categoryId,
    });
    if (!error) arr = Array.isArray(data?.types) ? data.types : [];
    if (arr.length === 0) {
      try {
        const res = await fetch(`https://api.mercadolibre.com/sites/${siteId}/listing_types`);
        const json = await res.json();
        if (Array.isArray(json)) arr = json;
      } catch { }
    }
    if (String(siteId).toUpperCase() === 'MLB') {
      const pick = new Set(['gold_special', 'gold_pro']);
      arr = arr
        .filter((t: any) => pick.has(String(t?.id || t)))
        .map((t: any) => {
          const id = String(t?.id || t);
          const name = id === 'gold_special' ? 'Clássico' : id === 'gold_pro' ? 'Premium' : String(t?.name || id);
          return { id, name };
        });
    }
    return arr;
  },

  async fetchListingPriceOptions(orgId, categoryId, price, siteId) {
    const { data, error } = await invokeFn('mercado-livre-listing-prices', {
      organizationId: orgId, siteId, price, categoryId,
    });
    if (error) return [];
    return Array.isArray(data?.prices) ? data.prices : [];
  },

  async fetchShippingPreferences(orgId) {
    const siteId = await _getMLSiteId(orgId);
    const { data, error } = await invokeFn('mercado-livre-shipping-methods', {
      organizationId: orgId, siteId,
    });
    if (error) throw error;

    const methods = Array.isArray(data?.methods) ? data.methods : [];
    const prefs = data?.preferences || null;
    let modes: string[] = [];
    const modesArr = parseJsonSafe(prefs?.modes);
    if (Array.isArray(modesArr)) {
      modes = modesArr.map((m: any) => String(m));
    } else {
      const set = new Set<string>();
      methods.forEach((m: any) => (Array.isArray(m?.shipping_modes) ? m.shipping_modes : []).forEach((x: any) => set.add(String(x))));
      modes = Array.from(set);
    }

    const logisticsMap: Record<string, string[]> = {};
    const defaultsMap: Record<string, string> = {};
    const logisticsArr = parseJsonSafe(prefs?.logistics);
    if (Array.isArray(logisticsArr)) {
      logisticsArr.forEach((entry: any) => {
        const mode = String(entry?.mode || '');
        const types = Array.isArray(entry?.types) ? entry.types.map((t: any) => String(t?.type || t)) : [];
        logisticsMap[mode] = types;
        const def = Array.isArray(entry?.types) ? entry.types.find((t: any) => t?.default === true) : null;
        if (def?.type) defaultsMap[mode] = String(def.type);
      });
    }

    const mandatoryObj = prefs?.mandatorySettings || null;
    const preferredMode = mandatoryObj?.mode
      ? String(mandatoryObj.mode)
      : modes.includes('me2') ? 'me2' : modes[0] || '';
    const freeMandatory = scanFreeShipMandatory(mandatoryObj);

    const modeForTypes = preferredMode || 'me2';
    const typesForMode = (logisticsMap[modeForTypes] || []).filter((t: string) => t !== 'fulfillment');
    const toShow = typesForMode.length > 0 ? typesForMode : ['drop_off', 'xd_drop_off', 'self_service'];

    let freeConfigDefault = false;
    const fcArr = parseJsonSafe(prefs?.freeConfigurations);
    if (preferredMode === 'me2' && Array.isArray(fcArr)) {
      const def = fcArr.find((r: any) => r?.rule?.default === true);
      if (def?.rule?.free_shipping_flag === true) freeConfigDefault = true;
    }

    const result: ShippingPreferences = {
      modesAvailable: modes,
      logisticsByMode: logisticsMap,
      logisticsDefaults: defaultsMap,
      availableLogisticTypes: toShow,
      preferredMode,
      freeShippingMandatoryCfg: freeMandatory && preferredMode === 'me2',
      freeShippingMandatory: (freeMandatory && preferredMode === 'me2'),
      freeConfigDefault,
      defaultShippingMode: preferredMode,
    };
    return result;
  },

  // ── Validation & publish ────────────────────────────────────────────────────

  validateForPublish(draft: NormalizedDraft): ValidationResult {
    return validateMLDraftForPublish(draft);
  },

  buildPublishPayload(draft: NormalizedDraft): unknown {
    return buildMLPublishPayload(draft);
  },

  async publish(orgId, draft) {
    const validation = validateMLDraftForPublish(draft);
    if (!validation.valid) {
      return { success: false, errorStepId: validation.errorStepId, errorField: validation.errorField, errorMessage: validation.errorMessage };
    }

    // Upload variation picture files to get base64 arrays
    const uploadVariationFiles: any[][] = [];
    for (const v of draft.variations) {
      const files = Array.isArray(v.pictureFiles) ? v.pictureFiles : [];
      const arr: any[] = [];
      for (const f of files) {
        let fileObj = await ensureFile(f);
        if (!fileObj) continue;
        if (/^image\//.test(fileObj.type)) {
          try { fileObj = await compressImage(fileObj, 0.85, 1280); } catch { }
        }
        const b64 = await fileToBase64(fileObj);
        arr.push({ filename: fileObj.name || 'upload', type: fileObj.type || 'application/octet-stream', data_b64: b64 });
        if (arr.length >= 10) break;
      }
      uploadVariationFiles.push(arr);
    }

    // Resolve picture URLs
    const hasVariations = draft.variations.length > 0;
    let pictureUrls: string[] = hasVariations
      ? []
      : (draft.pictures as string[]).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));

    const opt = (draft.listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || '') === String(draft.listingTypeId || ''));
    const requiresPic = !!(opt as any)?.requires_picture || ['gold_pro', 'gold_special'].includes(String(draft.listingTypeId || '').toLowerCase());
    if (hasVariations && requiresPic && pictureUrls.length === 0) {
      for (const v of draft.variations) {
        const files = Array.isArray(v.pictureFiles) ? v.pictureFiles : [];
        if (files.length > 0) {
          const first = await ensureFile(files[0]);
          if (first) {
            const urls = await serializeImages([first], orgId, draft.currentDraftId ?? null, 1);
            if (urls.length > 0) { pictureUrls = [urls[0]]; break; }
          }
        }
      }
    }
    if (!hasVariations && draft.pictures.some((x) => x instanceof File)) {
      const resolved: string[] = [];
      for (const item of draft.pictures) {
        if (typeof item === 'string' && /^https?:\/\//i.test(item)) resolved.push(item);
        else if (item instanceof File) {
          const urls = await serializeImages([item], orgId, draft.currentDraftId ?? null, 1);
          if (urls.length > 0) resolved.push(urls[0]);
        }
      }
      if (resolved.length > 0) pictureUrls = resolved;
    }

    const draftWithUrls: NormalizedDraft = { ...draft, pictures: pictureUrls };
    const payload = buildMLPublishPayload(draftWithUrls);
    const sellerShippingPreferences = draft.preferFlex ? { prefer_flex: true } : undefined;

    const { data, error } = await invokeFn('mercado-livre-publish-item', {
      organizationId: orgId,
      payload,
      description: draft.description,
      uploadVariationFiles,
      sellerShippingPreferences,
    });

    if (error || data?.error) {
      const rawMsg = error?.message || data?.meli?.message || data?.message || data?.error || 'Erro ao publicar';
      const rawCauses: string[] = Array.isArray(data?.meli?.cause)
        ? data.meli.cause.map((c: any) => String(c?.message || c?.code || '')).filter(Boolean)
        : [];
      const { stepId, field } = mapMLErrorToStep({ message: rawMsg, causes: rawCauses });
      return { success: false, errorStepId: stepId, errorField: field, errorMessage: rawMsg };
    }

    // Remove draft on success
    if (draft.currentDraftId && orgId) {
      try {
        await (supabase as any).from('marketplace_drafts').delete()
          .eq('id', draft.currentDraftId).eq('organizations_id', orgId);
      } catch { }
    }
    return { success: true };
  },

  mapErrorToStep(error: AdapterError) {
    return mapMLErrorToStep(error);
  },

  // ── Edit flow ───────────────────────────────────────────────────────────────

  async loadItem(orgId, itemId) {
    const { fetchListingDetailRow } = await import('@/services/listingDetail.service');
    const mi = await fetchListingDetailRow(orgId, 'Mercado Livre', String(itemId));
    if (!mi) throw new Error('Anúncio não encontrado');

    const picsArr: any[] = Array.isArray(mi?.pictures) ? mi.pictures : [];
    const rawVars: any[] = Array.isArray(mi?.variations) ? mi.variations : [];

    const variations = rawVars.map((v: any) => {
      const pictureIds: string[] = Array.isArray(v?.picture_ids) ? v.picture_ids : v?.picture_id ? [v.picture_id] : [];
      const resolvedUrls = pictureIds
        .map((pid) => {
          const match = picsArr.find((p: any) => String(p?.id || p?.picture_id) === String(pid));
          if (typeof match === 'string') return match;
          return match?.url || match?.secure_url || '';
        })
        .filter((u) => !!u);
      return {
        id: v?.id ?? String((v?.attribute_combinations || []).map((a: any) => a?.value_id || a?.value_name).join('-')),
        sku: v?.seller_sku || null,
        available_quantity: typeof v?.available_quantity === 'number' ? v.available_quantity : 0,
        price: typeof v?.price === 'number' ? v.price : Number(mi?.price) || 0,
        attribute_combinations: Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [],
        image: resolvedUrls[0] || null,
        pictureFiles: resolvedUrls,
        attributes: Array.isArray(v?.attributes) ? v.attributes : [],
      };
    });

    const pictures = picsArr
      .map((p: any) => (typeof p === 'string' ? p : p?.url || p?.secure_url || ''))
      .filter((u: string) => !!u);

    const item: NormalizedListingItem = {
      id: String(mi?.marketplace_item_id || itemId),
      marketplace: 'mercado-livre',
      title: String(mi?.title || ''),
      description: String(mi?.description_plain_text || ''),
      price: resolveUniversalSalePrice(mi, variations),
      status: String(mi?.status || ''),
      categoryId: String(mi?.category_id || ''),
      listing_type_id: String(mi?.listing_type_id || ''),
      attributes: Array.isArray(mi?.attributes) ? mi.attributes : [],
      variations,
      pictures,
      shipping: normalizeEditShipping(mi, 'mercado-livre'),
      soldQty: typeof mi?.sold_quantity === 'number' ? mi.sold_quantity : 0,
      videoId: String(mi?.data?.video_id || ''),
      permalink: mi?.permalink || null,
      raw: mi,
    };
    return item;
  },

  async updateFields(orgId, itemId, patch) {
    const { error } = await invokeFn('mercado-livre-update-item-fields', {
      organizationId: orgId,
      itemId,
      updates: patch,
    });
    if (error) throw error;
  },

  async updateStatus(orgId, itemId, status) {
    const { error } = await invokeFn('mercado-livre-update-item-status', {
      organizationId: orgId,
      itemId,
      status,
    });
    if (error) throw error;
  },
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getMLSiteId(orgId: string): Promise<string> {
  try {
    const { data } = await (supabase as any)
      .from('marketplace_integrations')
      .select('site_id, extra_data')
      .eq('organizations_id', orgId)
      .eq('marketplace_name', 'Mercado Livre')
      .limit(1)
      .single();
    return String(data?.site_id || data?.extra_data?.site_id || 'MLB');
  } catch {
    return 'MLB';
  }
}
