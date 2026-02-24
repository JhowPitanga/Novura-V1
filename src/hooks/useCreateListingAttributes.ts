import { useMemo } from "react";
import type { FilteredAttrs } from "@/types/create-listing";

// ─── Shared attribute filter predicates ─────────────────────────────────────

function isPackagingAttr(id: string, name?: string): boolean {
  if (/^PACKAGE_|^PACKAGING_|^SELLING_FORMAT_DIMENSIONS_/i.test(id)) return true;
  return /\bembalagem\b|\bpackage\b|\bpackaging\b|\bpeso da embalagem\b|\blargura da embalagem\b|\baltura da embalagem\b|\bcomprimento da embalagem\b/i.test(String(name || ""));
}

function isHiddenAdminAttr(id: string, name?: string): boolean {
  const up = String(id || "").toUpperCase();
  if (/^(VAT|IVA|IMPORT_TAX|HAZMAT|HAZMAT_TRANSPORTABILITY|CATALOG_TITLE|SYI_PYMES_ID|IS_NEW_OFFER|PRODUCT_SOURCE|COMPATIBILITIES|HAS_COMPATIBILITIES|IS_SUITABLE_FOR_SHIPPING|DESCRIPTIVE_TAGS|IS_FLAMMABLE)$/i.test(up)) return true;
  return /\btags?\s*vertical\b|\bimposto\s+de\s+importa[cç][aã]o\b|\borigem\s+do\s+dado\s+do\s+pacote\s+de\s+env[ií]o\b|\bimposto\s+sobre\s+o\s+valor\s+acrescentado\b|\bvat\b|\biva\b|\bqu[ií]mic|\bchemical\b|\balimentos?\b|\bbebidas?\b|\bmedicamentos?\b|\bbatter(y|ia)s?\b|\binforma[cç][aã]o\s+adicional\s+requerida\b|\badequad[oa]\s+para\s+o\s+env[ií]o\b|\badecuad[oa]\s+para\s+el?\s+env[ií]o\b|\bapto\s+para\s+el?\s+env[ií]o\b|\bsuitable\s+for\s+shipping\b|\bhazmat\b|\btransportabilit(y|ade)\b|\bsyi\s+pymes\s+id\b|\bt[íi]tulo\s+de\s+cat[aá]logo\b|\bcatalog\s+title\b|\bnova\s+oferta\b|\bnew\s+offer\b|\bcompatibilidades?\b|\bcompatibilit(y|ies)\b|\bfonte\s+do\s+produto\b|\bproduct\s+source\b|\bimpacto\s+positivo\b|\bpositive\s+impact\b|\bcon\s+impacto\s+positivo\b/i.test(String(name || ""));
}

function isHiddenExtraAttr(name?: string): boolean {
  return /\bcor\s+filtr[aá]vel\b|\bfilter\s*color\b|\bcolor\s*filterable\b|\bmodelo\s+detalhado\b|\bdetailed\s+model\b|\bmotivo\b.*\bgtin\b|\bgtin\b.*\bvazio\b|\bmotivo\b.*\bc[oó]digo\b.*\bbarras\b/i.test(String(name || ""));
}

function hasTags(tags: any, ...keys: string[]): boolean {
  if (Array.isArray(tags)) return keys.some((k) => tags.includes(k));
  return keys.some((k) => !!(tags as any)?.[k]);
}

function isNotModifiable(tags: any): boolean {
  if (!tags) return false;
  const arr = Array.isArray(tags) ? tags : Object.keys(tags).filter((k) => !!(tags as any)[k]);
  const low = new Set<string>(arr.map((t: any) => String(t).toLowerCase()));
  return low.has("read_only") || low.has("readonly") || low.has("fixed") || low.has("inferred") || low.has("vip_hidden") || low.has("hidden");
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseCreateListingAttributesParams {
  attrsMeta: any[];
  conditionalRequiredIds: string[];
  techSpecsInput: any;
}

interface UseCreateListingAttributesResult {
  filteredAttrs: FilteredAttrs;
  variationAttrs: any[];
  allowVariationAttrs: any[];
  variationRequiredIds: string[];
}

export function useCreateListingAttributes({
  attrsMeta,
  conditionalRequiredIds,
  techSpecsInput,
}: UseCreateListingAttributesParams): UseCreateListingAttributesResult {

  const variationAttrs = useMemo(() => {
    return (attrsMeta || []).filter((a: any) => {
      const tags = (a?.tags || {}) as any;
      const isAllowVar = hasTags(tags, "allow_variations");
      const id = String(a?.id || "").toUpperCase();
      const name = String(a?.name || "");
      if (id === "GTIN" || id === "SELLER_SKU") return false;
      return !!isAllowVar && !isPackagingAttr(id, name) && id !== "MPN" && !isHiddenAdminAttr(id, name) && !isHiddenExtraAttr(name);
    });
  }, [attrsMeta]);

  const allowVariationAttrs = useMemo(() => {
    return (attrsMeta || []).filter((a: any) => {
      const tags = (a?.tags || {}) as any;
      const isVarAttr = hasTags(tags, "variation_attribute");
      const id = String(a?.id || "").toUpperCase();
      const name = String(a?.name || "");
      if (!isVarAttr) return false;
      if (variationAttrs.find((v: any) => String(v?.id || "").toUpperCase() === id)) return false;
      return !isPackagingAttr(id, name) && id !== "MPN" && !isHiddenAdminAttr(id, name) && !isHiddenExtraAttr(name);
    });
  }, [attrsMeta, variationAttrs]);

  const variationRequiredIds = useMemo(() => {
    return (attrsMeta || [])
      .filter((a: any) => {
        const tags = (a?.tags || {}) as any;
        const allowVar = hasTags(tags, "allow_variations", "variation_attribute");
        const isReq = hasTags(tags, "required");
        const id = String(a?.id || "").toUpperCase();
        const name = String(a?.name || "");
        if (id === "GTIN" || id === "SELLER_SKU" || id === "MAIN_COLOR") return false;
        return allowVar && isReq && !isPackagingAttr(id, name) && id !== "MPN" && !isHiddenAdminAttr(id, name);
      })
      .map((a: any) => String(a?.id || ""));
  }, [attrsMeta]);

  const filteredAttrs = useMemo((): FilteredAttrs => {
    const allowedTechIds = (() => {
      const s = new Set<string>();
      try {
        const a1 = Array.isArray((techSpecsInput as any)?.attributes) ? (techSpecsInput as any).attributes : [];
        a1.forEach((x: any) => { const id = String((x as any)?.id || x || ""); if (id) s.add(id); });
        const groups = Array.isArray((techSpecsInput as any)?.groups) ? (techSpecsInput as any).groups : [];
        groups.forEach((g: any) => {
          (Array.isArray(g?.fields) ? g.fields : []).forEach((f: any) => { const id = String((f as any)?.id || f || ""); if (id) s.add(id); });
        });
      } catch { }
      return s;
    })();

    const isHiddenExtraFull = (name?: string) =>
      /\bcor\s+filtr[aá]vel\b|\bfilter\s*color\b|\bcolor\s*filterable\b|\bmodelo\s+detalhado\b|\bdetailed\s+model\b|\bmotivo\b.*\bgtin\b|\bgtin\b.*\bvazio\b|\bmotivo\b.*\bc[oó]digo\b.*\bbarras\b|\bvisibilidade\s+limitada\b|\bplataformas?\s+exclu[ií]das\b/i.test(String(name || ""));

    const base = (attrsMeta || []).filter((a: any) => {
      const idUp = String(a?.id || "").toUpperCase();
      const nameStr = String(a?.name || "");
      if (idUp === "GTIN" || idUp === "SELLER_SKU") return false;
      const tags = (a?.tags || {}) as any;
      const notMod = isNotModifiable(tags);
      const allowedByInput = allowedTechIds.size > 0
        ? (allowedTechIds.has(String(a?.id || "")) || idUp === "ITEM_CONDITION")
        : true;
      return !isPackagingAttr(String(a?.id || ""), nameStr) && !isHiddenAdminAttr(String(a?.id || ""), nameStr) && !isHiddenExtraFull(nameStr) && (!notMod || idUp === "ITEM_CONDITION") && allowedByInput;
    });

    const reqSet = new Set<string>();
    base.forEach((a: any) => {
      const tags = (a?.tags || {}) as any;
      const isReq = hasTags(tags, "required");
      const id = String(a?.id || "").toUpperCase();
      if (isReq && id !== "MPN") reqSet.add(String(a?.id || ""));
    });
    ["BRAND", "MODEL"].forEach((id) => reqSet.add(id));
    const baseIds = new Set<string>(base.map((a: any) => String(a?.id || "")));
    const hasItemCondition = (attrsMeta || []).some((a: any) => String(a?.id || "").toUpperCase() === "ITEM_CONDITION");
    if (baseIds.has("ITEM_CONDITION") || hasItemCondition) reqSet.add("ITEM_CONDITION");
    (conditionalRequiredIds || []).forEach((id) => reqSet.add(String(id)));

    const required = base.filter((a: any) => {
      const id = String(a?.id || "");
      const isVar = !!variationAttrs.find((v: any) => String(v?.id || "") === id);
      const isAllowVar = !!allowVariationAttrs.find((v: any) => String(v?.id || "") === id);
      return reqSet.has(id) && !isVar && !isAllowVar;
    });
    const tech = base.filter((a: any) => {
      const id = String(a?.id || "");
      const isVar = !!variationAttrs.find((v: any) => String(v?.id || "") === id);
      const isAllowVar = !!allowVariationAttrs.find((v: any) => String(v?.id || "") === id);
      return !reqSet.has(id) && !isVar && !isAllowVar;
    });

    return { required, tech };
  }, [attrsMeta, variationAttrs, allowVariationAttrs, conditionalRequiredIds, techSpecsInput]);

  return { filteredAttrs, variationAttrs, allowVariationAttrs, variationRequiredIds };
}
