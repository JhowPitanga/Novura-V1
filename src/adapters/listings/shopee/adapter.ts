import { supabase } from "@/integrations/supabase/client";
import { invokeFn } from '../shared/invokeFn';
import { buildShopeePublishPayload } from './payload';
import { validateShopeeDraftForPublish } from './validators';
import { mapShopeeErrorToStep } from './mapping';
import { buildShopeeCategoryTree, fetchShopeeCategoryRecommendations, fetchShopeeCategoryTree } from './categories';
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
} from '../types';

// ─── Capabilities ─────────────────────────────────────────────────────────────

const SHOPEE_CAPABILITIES: AdapterCapabilities = {
  maxImages: 9,
  maxVideos: 1,
  maxTitleLength: 120,
  descriptionFormat: 'plain',
  supportsListingTypes: false,
  supportsTechSpecsInput: false,
  supportsSaleTerms: false,
  supportsFlex: false,
  supportsConditionalAttributes: false,
  supportsFreeShippingMandatoryRule: false,
  supportsVariationPicturesPerVariation: false,
  supportsLocalPickup: false,
  supportsDomainSuggestions: false,
  titleLockedAfterFirstSale: false,
  shippingWeightUnit: 'kg',
  editableFields: ['title', 'description', 'price', 'shipping', 'variations', 'pictures', 'attributes', 'status'],
};

// ─── Step descriptors ─────────────────────────────────────────────────────────

const CREATE_STEPS: StepDescriptor[] = [
  { id: 1, title: 'Marketplace', description: 'Selecione o canal de venda' },
  { id: 2, title: 'Título e Categoria', description: 'Defina o produto' },
  { id: 3, title: 'Atributos, Fotos e Descrição', description: 'Detalhes e mídias' },
  { id: 4, title: 'Variações', description: 'Cores, tamanhos, modelos' },
  { id: 5, title: 'Ficha Técnica', description: 'Especificações da categoria' },
  { id: 6, title: 'Preço', description: 'Preço e estoque' },
  { id: 7, title: 'Envio e Dimensões', description: 'Peso e embalagem' },
  { id: 8, title: 'Revisão', description: 'Confira e publique' },
];

const EDIT_STEPS: StepDescriptor[] = [
  { id: 1, title: 'Preço', description: 'Preço e preços por modelo' },
  { id: 2, title: 'Envio', description: 'Peso e dimensões' },
  { id: 3, title: 'Título e Descrição', description: 'Texto do anúncio' },
  { id: 4, title: 'Variações e Fotos', description: 'Modelos e imagens' },
  { id: 5, title: 'Atributos', description: 'Atributos da categoria' },
];

// ─── Attribute parser ─────────────────────────────────────────────────────────

function parseShopeeAttr(a: any): AdapterAttribute {
  const idNum = typeof a?.attribute_id === 'number' ? a.attribute_id : Number(a?.attribute_id || 0);
  const idStr = Number.isFinite(idNum) ? String(idNum) : String(a?.attribute_id || '');
  const nameStr = String(a?.attribute_name || a?.name || idStr || '');
  const opts = Array.isArray(a?.option_list) ? a.option_list : Array.isArray(a?.options) ? a.options : [];
  const values = opts.map((o: any) => {
    const oidNum = typeof o?.option_id === 'number' ? o.option_id : Number(o?.id || 0);
    const oid = Number.isFinite(oidNum) ? String(oidNum) : String(o?.option_id || o?.id || '');
    const ml = Array.isArray(o?.multi_lang) ? o.multi_lang : null;
    const translated = Array.isArray(ml) ? ml.find((m: any) => String(m?.language || '').toLowerCase() === 'pt-br') : null;
    const oname = String(translated?.value || o?.option_text || o?.name || o?.value || oid || '');
    return { id: oid, name: oname };
  });
  const allowed_units = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
  const default_unit = String(a?.default_unit || '');
  const itype = String(a?.input_type || a?.value_type || '').toLowerCase();
  const vtype = values.length > 0 ? 'list' : (allowed_units.length > 0 ? 'number_unit' : (itype.includes('number') ? 'number' : 'string'));
  const mandatory = !!(a?.is_mandatory || a?.mandatory);
  const allowVar = !!(a?.is_attribute_for_variation || a?.allow_variations);
  return { id: idStr, name: nameStr, values, value_type: vtype as any, tags: { required: mandatory, allow_variations: allowVar }, allowed_units, default_unit };
}

function parseBrand(b: any, idx: number): BrandOption {
  const bidNum = typeof b?.brand_id === 'number' ? b.brand_id : Number(b?.id || 0);
  const bid = Number.isFinite(bidNum) ? String(bidNum) : String(b?.brand_id || b?.id || idx);
  const bname = String(b?.original_brand_name || b?.display_brand_name || b?.brand_name || b?.name || bid);
  return { id: bid, name: bname };
}

// ─── Adapter implementation ───────────────────────────────────────────────────

export const shopeeAdapter: MarketplaceAdapter = {
  channel: 'shopee',
  displayName: 'Shopee',
  capabilities: SHOPEE_CAPABILITIES,

  getCreateSteps: () => CREATE_STEPS,
  getEditSteps: () => EDIT_STEPS,

  // ── Categories ──────────────────────────────────────────────────────────────

  async predictCategories(orgId, title) {
    return fetchShopeeCategoryRecommendations(orgId, title);
  },

  async loadCategoryRoots(orgId, ctx) {
    if (ctx?.shopeeCategoriesRaw && ctx.shopeeCategoriesRaw.length > 0) {
      const built = buildShopeeCategoryTree(ctx.shopeeCategoriesRaw);
      return { roots: built.roots, shopeeCategoriesRaw: built.shopeeCategoriesRaw };
    }
    const tree = await fetchShopeeCategoryTree(orgId);
    return { roots: tree.roots, shopeeCategoriesRaw: tree.shopeeCategoriesRaw };
  },

  async loadCategoryChildren(orgId, parentId, ctx) {
    const rawList: any[] = ctx?.shopeeCategoriesRaw || [];
    const children: CategoryNode[] = rawList
      .filter((c: any) => String(c?.parent_category_id || '') === String(parentId))
      .map((c: any) => ({
        id: String(c?.category_id || ''),
        name: String(c?.display_category_name || c?.original_category_name || c?.category_name || ''),
      }));
    return { children };
  },

  async getCategoryPath(orgId, categoryId) {
    return categoryId;
  },

  // ── Attributes ──────────────────────────────────────────────────────────────

  async fetchAttributes(orgId, categoryId) {
    const { data, error } = await invokeFn('shopee-product-attributes', {
      organizationId: orgId, category_id: categoryId, language: 'pt-BR',
    });
    if (error) return { attrs: [], brandList: [] };

    const payload = data || {};
    const listData = Array.isArray(payload?.data?.attribute_list) ? payload.data.attribute_list
      : Array.isArray(payload?.response?.attribute_list) ? payload.response.attribute_list
      : Array.isArray(payload?.attribute_list) ? payload.attribute_list : [];

    const attrs: AdapterAttribute[] = listData.map(parseShopeeAttr);

    const brandRaw = Array.isArray(payload?.data?.brand_list) ? payload.data.brand_list
      : Array.isArray(payload?.response?.brand_list) ? payload.response.brand_list : [];
    const brandList = (brandRaw as any[]).map(parseBrand);

    return { attrs, brandList };
  },

  // ── Validation & publish ────────────────────────────────────────────────────

  validateForPublish(draft: NormalizedDraft): ValidationResult {
    return validateShopeeDraftForPublish(draft);
  },

  buildPublishPayload(draft: NormalizedDraft): unknown {
    return buildShopeePublishPayload(draft);
  },

  async publish(orgId, draft) {
    const validation = validateShopeeDraftForPublish(draft);
    if (!validation.valid) {
      return { success: false, errorStepId: validation.errorStepId, errorField: validation.errorField, errorMessage: validation.errorMessage };
    }

    const payload = buildShopeePublishPayload(draft);
    const { data, error } = await invokeFn('shopee-product-add-item', {
      organizationId: orgId,
      ...payload,
    });

    if (error || data?.error) {
      const rawMsg = error?.message || data?.message || data?.error || 'Erro ao publicar no Shopee';
      const rawCauses: string[] = Array.isArray(data?.response?.error_list)
        ? data.response.error_list.map((e: any) => String(e?.message || e?.error_msg || '')).filter(Boolean)
        : [];
      const { stepId, field } = mapShopeeErrorToStep({ message: rawMsg, causes: rawCauses });
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
    return mapShopeeErrorToStep(error);
  },

  // ── Edit flow ───────────────────────────────────────────────────────────────

  async loadItem(orgId, itemId) {
    const { fetchListingDetailRow } = await import('@/services/listingDetail.service');
    const mi = await fetchListingDetailRow(orgId, 'Shopee', String(itemId));
    if (!mi) throw new Error('Anúncio não encontrado');

    const rawVars: any[] = Array.isArray(mi?.variations) ? mi.variations : [];
    const picsArr: any[] = Array.isArray(mi?.pictures) ? mi.pictures : [];

    // Normalize Shopee tier_variation / model_list → canonical variations
    const variations = rawVars.map((v: any) => {
      const attributes = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [];
      let combinations = attributes;
      // Shopee may store them as model_name or tier combination
      if (combinations.length === 0 && typeof v?.model_name === 'string' && v.model_name) {
        combinations = [{ id: 'variation', name: 'Variação', value_name: v.model_name }];
      }
      const imageUrl =
        (typeof v?.image_url === 'string' && v.image_url) ? v.image_url
        : (typeof v?.model_image_url === 'string' && v.model_image_url) ? v.model_image_url
        : (typeof v?.image === 'string' && v.image) ? v.image
        : (typeof v?.model_img_url === 'string' && v.model_img_url) ? v.model_img_url
        : null;
      return {
        id: v?.model_id || v?.id || String(Math.random()),
        sku: v?.model_sku || v?.seller_sku || null,
        available_quantity: (() => {
          const sellerInfoList = Array.isArray(v?.stock_info_v2?.seller_stock) ? v.stock_info_v2.seller_stock : null;
          if (sellerInfoList) return sellerInfoList.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
          const raw = v?.seller_stock;
          if (typeof raw === 'number') return raw;
          if (Array.isArray(raw)) return raw.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
          return Number(v?.available_quantity) || 0;
        })(),
        price: (() => {
          const pi0 = Array.isArray(v?.price_info) ? v.price_info[0] : null;
          return Number(pi0?.current_price ?? pi0?.inflated_price_of_current_price ?? v?.current_price ?? v?.price ?? 0);
        })(),
        attribute_combinations: combinations,
        image: imageUrl,
        pictureFiles: imageUrl ? [imageUrl] : [],
      };
    });

    const pictures = picsArr
      .map((p: any) => (typeof p === 'string' ? p : p?.url || p?.image_url || ''))
      .filter((u: string) => !!u);

    const item: NormalizedListingItem = {
      id: String(mi?.marketplace_item_id || itemId),
      marketplace: 'shopee',
      title: String(mi?.title || ''),
      description: String(mi?.description || ''),
      price: resolveUniversalSalePrice(mi, variations),
      status: String(mi?.status || ''),
      categoryId: String(mi?.category_id || ''),
      attributes: Array.isArray(mi?.attributes) ? mi.attributes : [],
      variations,
      pictures,
      shipping: normalizeEditShipping(mi, 'shopee'),
      soldQty: 0,
      permalink: mi?.permalink || null,
      raw: mi,
    };
    return item;
  },

  async updateFields(orgId, itemId, patch) {
    const { error } = await invokeFn('shopee-update-item-fields', {
      organizationId: orgId,
      itemId,
      updates: patch,
    });
    if (error) throw error;
  },

  async updateStatus(orgId, itemId, status) {
    const shopeeStatus = status === 'active' ? 'NORMAL' : 'UNLIST';
    const { error } = await invokeFn('shopee-update-item-status', {
      organizationId: orgId,
      itemId,
      status: shopeeStatus,
    });
    if (error) throw error;
  },
};
