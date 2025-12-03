import { useEffect, useMemo, useState, useRef } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { NavigationButtons } from "@/components/produtos/criar/NavigationButtons";
import { CleanNavigation } from "@/components/CleanNavigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageUpload } from "@/components/produtos/criar/ImageUpload";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Search, Trash2, Plus, ChevronDown, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import LoadingOverlay from "@/components/LoadingOverlay";
 

const StringSuggestInput = ({
  id,
  name,
  current,
  disabled,
  onChange,
}: {
  id: string;
  name: string;
  current: any;
  suggestions: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (next: { id: string; name: string; value_id?: string; value_name?: string | null }) => void;
}) => {
  const [val, setVal] = useState<string>(String(current?.value_name || ""));
  return (
    <Input
      className="mt-2"
      placeholder={name}
      disabled={disabled}
      value={val}
      onChange={(e) => {
        const v = e.target.value;
        setVal(v);
        onChange({ id, name, value_id: undefined, value_name: v });
      }}
    />
  );
};

const MultiValuedBadgeInput = ({
  id,
  name,
  current,
  disabled,
  onChange,
}: {
  id: string;
  name: string;
  current: any;
  suggestions: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (next: { id: string; name: string; value_id?: string; value_name?: string | null }) => void;
}) => {
  const initial = String(current?.value_name || "").split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const [tokens, setTokens] = useState<{ id?: string; name: string }[]>(initial.map((n) => ({ name: n })));
  const [input, setInput] = useState("");
  const commitTokens = (list: { id?: string; name: string }[]) => {
    const joined = list.map((t) => t.name).join(", ");
    onChange({ id, name, value_id: undefined, value_name: joined || null });
  };
  const addToken = (t: { id?: string; name: string }) => {
    if (disabled) return;
    const next = [ ...tokens, t ];
    setTokens(next);
    commitTokens(next);
    setInput("");
  };
  const removeAt = (idx: number) => {
    if (disabled) return;
    const next = tokens.filter((_, i) => i !== idx);
    setTokens(next);
    commitTokens(next);
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2 mb-2">
        {tokens.map((t, idx) => (
          <Badge key={`${t.name}-${idx}`} variant="outline" className="flex items-center gap-1">
            <span>{t.name}</span>
            <button type="button" onClick={() => removeAt(idx)} disabled={disabled} className="ml-1 inline-flex items-center justify-center">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder={name}
        disabled={disabled}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            const v = String(input || "").replace(/,/g, "").trim();
            if (v) addToken({ name: v });
            e.preventDefault();
          }
        }}
      />
    </div>
  );
};

export default function AnunciosCriarML() {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const maxSteps = 8;
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [marketplaceSelection, setMarketplaceSelection] = useState<string>("");
  const [fetchGate, setFetchGate] = useState<{ s1: boolean; s3: boolean; s6: boolean; s7: boolean }>({ s1: false, s3: false, s6: false, s7: false });
  const [lastCategoryLoaded, setLastCategoryLoaded] = useState<string>("");
  const [siteId, setSiteId] = useState("MLB");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [currencyId, setCurrencyId] = useState("BRL");
  const [attributes, setAttributes] = useState<any[]>([]);
  const [pictures, setPictures] = useState<string[]>([]);
  const [variations, setVariations] = useState<any[]>([]);
  const [listingTypeId, setListingTypeId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [debouncedPrice, setDebouncedPrice] = useState<string>("");
  const [shipping, setShipping] = useState<any>({});
  const [saleTerms, setSaleTerms] = useState<any[]>([]);
  const [saleTermsMeta, setSaleTermsMeta] = useState<any[]>([]);
  const [description, setDescription] = useState<string>("");
  const [attrsMeta, setAttrsMeta] = useState<any[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);
  const [techSpecsInput, setTechSpecsInput] = useState<any>(null);
  const [techSpecsOutput, setTechSpecsOutput] = useState<any>(null);
  const [conditionalRequiredIds, setConditionalRequiredIds] = useState<string[]>([]);
  const [listingTypes, setListingTypes] = useState<any[]>([]);
  const [listingPriceOptions, setListingPriceOptions] = useState<any[]>([]);
  const [loadingListing, setLoadingListing] = useState(false);
  const [shippingModesAvailable, setShippingModesAvailable] = useState<string[]>([]);
  const [shippingLogisticsByMode, setShippingLogisticsByMode] = useState<Record<string, string[]>>({});
  const [shippingLogisticsDefaults, setShippingLogisticsDefaults] = useState<Record<string, string>>({});
  const [availableLogisticTypes, setAvailableLogisticTypes] = useState<string[]>([]);
  const [selectedLogisticType, setSelectedLogisticType] = useState<string>("");
  const [freeShipMandatoryCfg, setFreeShipMandatoryCfg] = useState<boolean>(false);
  const [freeShippingMandatory, setFreeShippingMandatory] = useState<boolean>(false);
  const [categorySuggestions, setCategorySuggestions] = useState<any[]>([]);
  const [domainSuggestions, setDomainSuggestions] = useState<any[]>([]);
  const [availableQuantity, setAvailableQuantity] = useState<number>(0);
  const [dumpOpen, setDumpOpen] = useState(false);
  const [dumpLoading, setDumpLoading] = useState(false);
  const [dumpQuery, setDumpQuery] = useState("");
  const [dumpRoots, setDumpRoots] = useState<any[]>([]);
  const [dumpChildrenById, setDumpChildrenById] = useState<Record<string, any[]>>({});
  const [dumpSelected, setDumpSelected] = useState<any[]>([]);
  const [pathsByCategoryId, setPathsByCategoryId] = useState<Record<string, string>>({});
  const [pendingCategoryId, setPendingCategoryId] = useState<string>("");
  const [pendingCategoryName, setPendingCategoryName] = useState<string>("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [maxVisitedStep, setMaxVisitedStep] = useState<number>(1);
  const [publishing, setPublishing] = useState(false);
  const [errorSteps, setErrorSteps] = useState<number[]>([]);
  const getStepTitle = (id: number) => {
    const it = (steps as any).find((s: any) => Number(s?.id) === Number(id));
    return String(it?.title || id);
  };
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(searchParams.get('draft_id'));
  const sessionCacheRef = useRef<{ attrsMetaByCategory: Record<string, any[]>; techInputByCategory: Record<string, any>; saleTermsMetaByCategory: Record<string, any[]>; listingTypesByCategory: Record<string, any[]>; listingPriceOptionsByKey: Record<string, any[]> }>({ attrsMetaByCategory: {}, techInputByCategory: {}, saleTermsMetaByCategory: {}, listingTypesByCategory: {}, listingPriceOptionsByKey: {} });
  const [apiCache, setApiCache] = useState<any>({});
  const [hasSearchedCategory, setHasSearchedCategory] = useState(false);
  const [showAllTechAttrs, setShowAllTechAttrs] = useState(false);
  const [attrTab, setAttrTab] = useState<"required" | "tech">("required");
  const [primaryVariationIndex, setPrimaryVariationIndex] = useState<number | null>(null);
  const [preferFlex, setPreferFlex] = useState<boolean>(false);
  const attrSig = useMemo(() => {
    const base = (attributes || []).map((a: any) => ({ id: String(a?.id || ""), vid: (a as any)?.value_id ?? null, vn: (a as any)?.value_name ?? null }));
    try { return JSON.stringify(base); } catch { return String(base.length); }
  }, [attributes]);
  const [debouncedAttrSig, setDebouncedAttrSig] = useState<string>(attrSig);
  const [conditionalTrigger, setConditionalTrigger] = useState<number>(0);
  const lastSavedSigRef = useRef<string>("");
  const saveDraftTimerRef = useRef<any>(null);
  const hasUnsavedData = useMemo(() => {
    const s = shipping || {};
    return !!(title || categoryId || description || price || listingTypeId || availableQuantity || (attributes || []).length || (variations || []).length || (pictures || []).length || (saleTerms || []).length || Object.keys(s).length);
  }, [title, categoryId, description, price, listingTypeId, availableQuantity, attributes, variations, pictures, saleTerms, shipping]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedData && !publishing) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedData, publishing]);

  useEffect(() => {
    const clickHandler = (e: MouseEvent) => {
      if (!hasUnsavedData || publishing) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || anchor.href || '';
      if (!href) return;
      const url = href.startsWith('http') ? new URL(href) : new URL(href, window.location.origin);
      const isInternal = url.origin === window.location.origin;
      if (isInternal) {
        e.preventDefault();
        setConfirmExit(true);
      }
    };
    document.addEventListener('click', clickHandler, true);
    return () => document.removeEventListener('click', clickHandler, true);
  }, [hasUnsavedData, publishing]);

  const allowNavRef = useRef<boolean>(false);
  useEffect(() => {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    (history as any).pushState = function (...args: any[]) {
      if (hasUnsavedData && !allowNavRef.current && !publishing) {
        setConfirmExit(true);
        return;
      }
      return origPush.apply(this, args as any);
    } as any;
    (history as any).replaceState = function (...args: any[]) {
      if (hasUnsavedData && !allowNavRef.current && !publishing) {
        setConfirmExit(true);
        return;
      }
      return origReplace.apply(this, args as any);
    } as any;
    return () => {
      (history as any).pushState = origPush as any;
      (history as any).replaceState = origReplace as any;
    };
  }, [hasUnsavedData, publishing]);

  useEffect(() => {
    const draftId = searchParams.get('draft_id');
    if (!draftId || !organizationId) return;
    const run = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('marketplace_drafts')
          .select('*')
          .eq('id', draftId)
          .eq('organizations_id', organizationId)
          .limit(1)
          .single();
        if (error) return;
        const d: any = data || {};
        if (d.site_id) setSiteId(String(d.site_id));
        if (d.title) setTitle(String(d.title));
        if (d.category_id) { setCategoryId(String(d.category_id)); setLastCategoryLoaded(String(d.category_id)); }
        if (Array.isArray(d.attributes)) setAttributes(d.attributes);
        if (Array.isArray(d.variations)) setVariations(d.variations);
        if (Array.isArray(d.pictures)) setPictures(d.pictures as any);
        if (d.price != null) setPrice(String(d.price));
        if (d.listing_type_id) setListingTypeId(String(d.listing_type_id));
        if (d.shipping) setShipping(d.shipping);
        if (Array.isArray(d.sale_terms)) setSaleTerms(d.sale_terms);
        if (typeof d.description === 'string') setDescription(d.description);
        if (typeof d.available_quantity === 'number') setAvailableQuantity(d.available_quantity);
        if (d.api_cache && typeof d.api_cache === 'object') {
          setApiCache(d.api_cache);
          const cat = String(d.category_id || '');
          if (Array.isArray(d.api_cache.attrsMeta)) {
            setAttrsMeta(d.api_cache.attrsMeta);
            if (cat) sessionCacheRef.current.attrsMetaByCategory[cat] = d.api_cache.attrsMeta;
          }
          if (d.api_cache.techSpecsInput) {
            setTechSpecsInput(d.api_cache.techSpecsInput);
            if (cat) sessionCacheRef.current.techInputByCategory[cat] = d.api_cache.techSpecsInput;
          }
          if (Array.isArray(d.api_cache.saleTermsMeta)) {
            setSaleTermsMeta(d.api_cache.saleTermsMeta);
            if (cat) sessionCacheRef.current.saleTermsMetaByCategory[cat] = d.api_cache.saleTermsMeta;
          }
          if (Array.isArray(d.api_cache.listingTypes)) {
            setListingTypes(d.api_cache.listingTypes);
            if (cat) sessionCacheRef.current.listingTypesByCategory[cat] = d.api_cache.listingTypes;
          }
          if (Array.isArray(d.api_cache.listingPriceOptions)) {
            const key = `${String(d.site_id || siteId)}:${String(d.category_id || categoryId)}:${Number(d.price || 0)}`;
            setListingPriceOptions(d.api_cache.listingPriceOptions);
            sessionCacheRef.current.listingPriceOptionsByKey[key] = d.api_cache.listingPriceOptions;
          }
        }
        if (typeof d.last_step === 'number' && d.last_step >= 1 && d.last_step <= maxSteps) {
          setCurrentStep(d.last_step);
          setMaxVisitedStep(d.last_step);
        }
      } catch {}
    };
    run();
  }, [searchParams, organizationId]);

  useEffect(() => {
    const cat = String(categoryId || '');
    if (!cat) return;
    if (lastCategoryLoaded && lastCategoryLoaded !== cat) {
      sessionCacheRef.current = { attrsMetaByCategory: {}, techInputByCategory: {}, saleTermsMetaByCategory: {}, listingTypesByCategory: {}, listingPriceOptionsByKey: {} };
      setLastCategoryLoaded('');
    }
  }, [categoryId]);
  
  const variationAttrs = useMemo(() => {
    const isPackagingId = (id: string) => /^PACKAGE_|^PACKAGING_|^SELLING_FORMAT_DIMENSIONS_/i.test(id);
    const isPackagingName = (name: string) => /\bembalagem\b|\bpackage\b|\bpackaging\b|\bpeso da embalagem\b|\blargura da embalagem\b|\baltura da embalagem\b|\bcomprimento da embalagem\b/i.test(name);
    const isHiddenAdmin = (id: string, name: string) => {
      const up = id.toUpperCase();
      if (/^(VAT|IVA|IMPORT_TAX|HAZMAT|HAZMAT_TRANSPORTABILITY|CATALOG_TITLE|SYI_PYMES_ID|IS_NEW_OFFER|PRODUCT_SOURCE|COMPATIBILITIES|HAS_COMPATIBILITIES|IS_SUITABLE_FOR_SHIPPING|DESCRIPTIVE_TAGS|IS_FLAMMABLE)$/i.test(up)) return true;
      return /\btags?\s*vertical\b|\bimposto\s+de\s+importa[cç][aã]o\b|\borigem\s+do\s+dado\s+do\s+pacote\s+de\s+env[ií]o\b|\bimposto\s+sobre\s+o\s+valor\s+acrescentado\b|\bvat\b|\biva\b|\bqu[ií]mic|\bchemical\b|\balimentos?\b|\bbebidas?\b|\bmedicamentos?\b|\bbatter(y|ia)s?\b|\binforma[cç][aã]o\s+adicional\s+requerida\b|\badequad[oa]\s+para\s+o\s+env[ií]o\b|\badecuad[oa]\s+para\s+el?\s+env[ií]o\b|\bapto\s+para\s+el?\s+env[ií]o\b|\bsuitable\s+for\s+shipping\b|\bhazmat\b|\btransportabilit(y|ade)\b|\bsyi\s+pymes\s+id\b|\bt[íi]tulo\s+de\s+cat[aá]logo\b|\bcatalog\s+title\b|\bnova\s+oferta\b|\bnew\s+offer\b|\bcompatibilidades?\b|\bcompatibilit(y|ies)\b|\bfonte\s+do\s+produto\b|\bproduct\s+source\b|\bimpacto\s+positivo\b|\bpositive\s+impact\b|\bcon\s+impacto\s+positivo\b/i.test(name);
    };
    const isHiddenExtra = (name: string) => /\bcor\s+filtr[aá]vel\b|\bfilter\s*color\b|\bcolor\s*filterable\b|\bmodelo\s+detalhado\b|\bdetailed\s+model\b|\bmotivo\b.*\bgtin\b|\bgtin\b.*\bvazio\b|\bmotivo\b.*\bc[oó]digo\b.*\bbarras\b/i.test(name);
    const filtered = (attrsMeta || []).filter((a: any) => {
      const tags = (a?.tags || {}) as any;
      const isAllowVar = Array.isArray(tags) ? tags.includes("allow_variations") : !!(tags?.allow_variations);
      const id = String(a?.id || "").toUpperCase();
      const name = String(a?.name || "");
      if (id === "GTIN" || id === "SELLER_SKU") return false;
      return !!isAllowVar && !isPackagingId(id) && !isPackagingName(name) && id !== "MPN" && !isHiddenAdmin(id, name) && !isHiddenExtra(name);
    });
    return filtered;
  }, [attrsMeta]);

  const allowVariationAttrs = useMemo(() => {
    const isPackagingId = (id: string) => /^PACKAGE_|^PACKAGING_|^SELLING_FORMAT_DIMENSIONS_/i.test(id);
    const isPackagingName = (name: string) => /\bembalagem\b|\bpackage\b|\bpackaging\b|\bpeso da embalagem\b|\blargura da embalagem\b|\baltura da embalagem\b|\bcomprimento da embalagem\b/i.test(name);
    const isHiddenAdmin = (id: string, name: string) => {
      const up = id.toUpperCase();
      if (/^(VAT|IVA|IMPORT_TAX|HAZMAT|HAZMAT_TRANSPORTABILITY|CATALOG_TITLE|SYI_PYMES_ID|IS_NEW_OFFER|PRODUCT_SOURCE|COMPATIBILITIES|HAS_COMPATIBILITIES|IS_SUITABLE_FOR_SHIPPING|DESCRIPTIVE_TAGS|IS_FLAMMABLE)$/i.test(up)) return true;
      return /\btags?\s*vertical\b|\bimposto\s+de\s+importa[cç][aã]o\b|\borigem\s+do\s+dado\s+do\s+pacote\s+de\s+env[ií]o\b|\bimposto\s+sobre\s+o\s+valor\s+acrescentado\b|\bvat\b|\biva\b|\bqu[ií]mic|\bchemical\b|\balimentos?\b|\bbebidas?\b|\bmedicamentos?\b|\bbatter(y|ia)s?\b|\binforma[cç][aã]o\s+adicional\s+requerida\b|\badequad[oa]\s+para\s+o\s+env[ií]o\b|\badecuad[oa]\s+para\s+el?\s+env[ií]o\b|\bapto\s+para\s+el?\s+env[ií]o\b|\bsuitable\s+for\s+shipping\b|\bhazmat\b|\btransportabilit(y|ade)\b|\bsyi\s+pymes\s+id\b|\bt[íi]tulo\s+de\s+cat[aá]logo\b|\bcatalog\s+title\b|\bnova\s+oferta\b|\bnew\s+offer\b|\bcompatibilidades?\b|\bcompatibilit(y|ies)\b|\bfonte\s+do\s+produto\b|\bproduct\s+source\b|\bimpacto\s+positivo\b|\bpositive\s+impact\b|\bcon\s+impacto\s+positivo\b/i.test(name);
    };
    const isHiddenExtra = (name: string) => /\bcor\s+filtr[aá]vel\b|\bfilter\s*color\b|\bcolor\s*filterable\b|\bmodelo\s+detalhado\b|\bdetailed\s+model\b|\bmotivo\b.*\bgtin\b|\bgtin\b.*\bvazio\b|\bmotivo\b.*\bc[oó]digo\b.*\bbarras\b/i.test(name);
    const filtered = (attrsMeta || []).filter((a: any) => {
      const tags = (a?.tags || {}) as any;
      const isVarAttr = Array.isArray(tags) ? tags.includes("variation_attribute") : !!(tags?.variation_attribute);
      const id = String(a?.id || "").toUpperCase();
      const name = String(a?.name || "");
      if (!isVarAttr) return false;
      if (variationAttrs.find((v: any) => String(v?.id || "").toUpperCase() === id)) return false;
      return !isPackagingId(id) && !isPackagingName(name) && id !== "MPN" && !isHiddenAdmin(id, name) && !isHiddenExtra(name);
    });
    return filtered;
  }, [attrsMeta, variationAttrs]);
  const variationRequiredIds = useMemo(() => {
    const list = (attrsMeta || []).filter((a: any) => {
      const tags = (a?.tags || {}) as any;
      const allowVar = Array.isArray(tags) ? tags.includes("allow_variations") || tags.includes("variation_attribute") : !!(tags?.allow_variations) || !!(tags?.variation_attribute);
      const isReq = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
      const id = String(a?.id || "").toUpperCase();
      const name = String(a?.name || "");
      const isPackagingId = (id: string) => /^PACKAGE_|^PACKAGING_|^SELLING_FORMAT_DIMENSIONS_/i.test(id);
      const isPackagingName = (name: string) => /\bembalagem\b|\bpackage\b|\bpackaging\b|\bpeso da embalagem\b|\blargura da embalagem\b|\baltura da embalagem\b|\bcomprimento da embalagem\b/i.test(name);
      const isHiddenAdmin = (id: string, name: string) => {
        const up = id.toUpperCase();
        if (/^(VAT|IVA|IMPORT_TAX|HAZMAT|HAZMAT_TRANSPORTABILITY|CATALOG_TITLE|SYI_PYMES_ID|IS_NEW_OFFER|PRODUCT_SOURCE|COMPATIBILITIES|HAS_COMPATIBILITIES|IS_SUITABLE_FOR_SHIPPING)$/i.test(up)) return true;
        return /\btags?\s*vertical\b|\bimposto\s+de\s+importa[cç][aã]o\b|\borigem\s+do\s+dado\s+do\s+pacote\s+de\s+env[ií]o\b|\bimposto\s+sobre\s+o\s+valor\s+acrescentado\b|\bvat\b|\biva\b|\bqu[ií]mic|\bchemical\b|\balimentos?\b|\bbebidas?\b|\bmedicamentos?\b|\bbatter(y|ia)s?\b|\binforma[cç][aã]o\s+adicional\s+requerida\b|\badequad[oa]\s+para\s+o\s+env[ií]o\b|\badecuad[oa]\s+para\s+el?\s+env[ií]o\b|\bapto\s+para\s+el?\s+env[ií]o\b|\bsuitable\s+for\s+shipping\b|\bhazmat\b|\btransportabilit(y|ade)\b|\bsyi\s+pymes\s+id\b|\bt[íi]tulo\s+de\s+cat[aá]logo\b|\bcatalog\s+title\b|\bnova\s+oferta\b|\bnew\s+offer\b|\bcompatibilidades?\b|\bcompatibilit(y|ies)\b|\bfonte\s+do\s+produto\b|\bproduct\s+source\b|\bimpacto\s+positivo\b|\bpositive\s+impact\b|\bcon\s+impacto\s+positivo\b/i.test(name);
      };
      // Não exigir GTIN/SELLER_SKU/MAIN_COLOR nas combinações de variação
      if (id === "GTIN" || id === "SELLER_SKU" || id === "MAIN_COLOR") return false;
      return allowVar && isReq && !isPackagingId(id) && !isPackagingName(name) && id !== "MPN" && !isHiddenAdmin(id, name);
    }).map((a: any) => String(a?.id || ""));
    return list;
  }, [attrsMeta]);
  const filteredAttrs = useMemo(() => {
    const isPackaging = (id: string, name?: string) => /^PACKAGE_|^PACKAGING_|^SELLING_FORMAT_DIMENSIONS_/i.test(id) || /\bembalagem\b|\bpackage\b|\bpackaging\b|\bpeso da embalagem\b|\blargura da embalagem\b|\baltura da embalagem\b|\bcomprimento da embalagem\b/i.test(String(name || ""));
    const isHiddenAdmin = (id: string, name?: string) => {
      const up = String(id || "").toUpperCase();
      if (/^(VAT|IVA|IMPORT_TAX|HAZMAT|HAZMAT_TRANSPORTABILITY|CATALOG_TITLE|SYI_PYMES_ID|IS_NEW_OFFER|PRODUCT_SOURCE|COMPATIBILITIES|HAS_COMPATIBILITIES|IS_SUITABLE_FOR_SHIPPING|DESCRIPTIVE_TAGS|IS_FLAMMABLE)$/i.test(up)) return true;
      return /\btags?\s*vertical\b|\bimposto\s+de\s+importa[cç][aã]o\b|\borigem\s+do\s+dado\s+do\s+pacote\s+de\s+env[ií]o\b|\bimposto\s+sobre\s+o\s+valor\s+acrescentado\b|\bvat\b|\biva\b|\bqu[ií]mic|\bchemical\b|\balimentos?\b|\bbebidas?\b|\bmedicamentos?\b|\bbatter(y|ia)s?\b|\binforma[cç][aã]o\s+adicional\s+requerida\b|\badequad[oa]\s+para\s+o\s+env[ií]o\b|\badecuad[oa]\s+para\s+el?\s+env[ií]o\b|\bapto\s+para\s+el?\s+env[ií]o\b|\bsuitable\s+for\s+shipping\b|\bhazmat\b|\btransportabilit(y|ade)\b|\bsyi\s+pymes\s+id\b|\bt[íi]tulo\s+de\s+cat[aá]logo\b|\bcatalog\s+title\b|\bnova\s+oferta\b|\bnew\s+offer\b|\bcompatibilidades?\b|\bcompatibilit(y|ies)\b|\bfonte\s+do\s+produto\b|\bproduct\s+source\b|\bimpacto\s+positivo\b|\bpositive\s+impact\b|\bcon\s+impacto\s+positivo\b|\bcaracter[íi]sticas?\s+das?\s+baterias?\b|\bcaracter[íi]sticas?\s+do\s+produto\b/i.test(String(name || ""));
    };
    const isNotModifiable = (tags: any) => {
      if (!tags) return false;
      const arr = Array.isArray(tags) ? tags : Object.keys(tags).filter((k) => !!(tags as any)[k]);
      const low = new Set<string>(arr.map((t: any) => String(t).toLowerCase()));
      if (low.has("read_only") || low.has("readonly")) return true;
      if (low.has("fixed")) return true;
      if (low.has("inferred") || low.has("vip_hidden") || low.has("hidden")) return true;
      return false;
    };
    const allowedTechIds = (() => {
      const s = new Set<string>();
      try {
        const a1 = Array.isArray((techSpecsInput as any)?.attributes) ? (techSpecsInput as any).attributes : [];
        a1.forEach((x: any) => { const id = String((x as any)?.id || x || ""); if (id) s.add(id); });
        const groups = Array.isArray((techSpecsInput as any)?.groups) ? (techSpecsInput as any).groups : [];
        groups.forEach((g: any) => {
          const fields = Array.isArray(g?.fields) ? g.fields : [];
          fields.forEach((f: any) => { const id = String((f as any)?.id || f || ""); if (id) s.add(id); });
        });
      } catch {}
      return s;
    })();
    const isHiddenExtra = (name?: string) => /\bcor\s+filtr[aá]vel\b|\bfilter\s*color\b|\bcolor\s*filterable\b|\bmodelo\s+detalhado\b|\bdetailed\s+model\b|\bmotivo\b.*\bgtin\b|\bgtin\b.*\bvazio\b|\bmotivo\b.*\bc[oó]digo\b.*\bbarras\b|\bvisibilidade\s+limitada\b|\bplataformas?\s+exclu[ií]das\b/i.test(String(name || ""));
    const base = (attrsMeta || []).filter((a: any) => {
      const idUp = String(a?.id || "").toUpperCase();
      const nameStr = String(a?.name || "");
      if (idUp === "GTIN" || idUp === "SELLER_SKU") return false;
      const tags = (a?.tags || {}) as any;
      const notMod = isNotModifiable(tags);
      const allowedByInput = allowedTechIds.size > 0 ? (allowedTechIds.has(String(a?.id || "")) || idUp === "ITEM_CONDITION") : true;
      return !isPackaging(String(a?.id || ""), nameStr) && !isHiddenAdmin(String(a?.id || ""), nameStr) && !isHiddenExtra(nameStr) && (!notMod || idUp === "ITEM_CONDITION") && allowedByInput;
    });
    const reqSet = new Set<string>();
    base.forEach((a: any) => {
      const tags = (a?.tags || {}) as any;
      const isReq = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
      const id = String(a?.id || "").toUpperCase();
      if (isReq && id !== "MPN") reqSet.add(String(a?.id || ""));
    });
    ["BRAND", "MODEL"].forEach((id) => reqSet.add(id));
    const baseIds = new Set<string>(base.map((a: any) => String(a?.id || "")));
    const hasItemCondition = (attrsMeta || []).some((a: any) => String(a?.id || "").toUpperCase() === "ITEM_CONDITION");
    if (baseIds.has("ITEM_CONDITION") || hasItemCondition) reqSet.add("ITEM_CONDITION");
    (conditionalRequiredIds || []).forEach((id) => reqSet.add(String(id)));
    let required = base.filter((a: any) => {
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
    return { required, tech } as { required: any[]; tech: any[] };
  }, [attrsMeta, variationAttrs, allowVariationAttrs, conditionalRequiredIds, techSpecsInput]);
  const steps = useMemo(() => ([
    { id: 1, title: "Marketplace", description: "Escolha o marketplace" },
    { id: 2, title: "Categoria", description: "Defina Categoria" },
    { id: 3, title: "Atributos", description: "Dados obrigatórios" },
    { id: 4, title: "Variações", description: "Variações e Mídia" },
    { id: 5, title: "Ficha Técnica", description: "Ficha técnica" },
    { id: 6, title: "Preço e Publicação", description: "Preço e publicação" },
    { id: 7, title: "Envio", description: "Envio e dimensões" },
    { id: 8, title: "Revisão", description: "Revisão e publicação" },
  ].sort((a, b) => a.id - b.id)), []);

  const compressImage = async (file: File, quality = 0.8, maxDim = 1280): Promise<File> => {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });
    const canvas = document.createElement('canvas');
    let { width, height } = img;
    if (width > height && width > maxDim) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else if (height > maxDim) {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', quality));
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  };

  const uploadImageToStorage = async (file: File): Promise<string | null> => {
    let toUpload = file;
    if (/^image\//.test(toUpload.type)) {
      try { toUpload = await compressImage(toUpload, 0.8, 1280); } catch {}
    }
    const safeName = (toUpload.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '-');
    const folder = `${organizationId ? `org_${organizationId}` : 'org_anon'}/${currentDraftId ? `draft_${currentDraftId}` : 'temp'}/${crypto.randomUUID()}`;
    const path = `${folder}/${safeName}`;
    const { error: upErr } = await supabase.storage.from('ad-images').upload(path, toUpload, { upsert: true, contentType: toUpload.type });
    if (upErr) return null;
    const { data } = supabase.storage.from('ad-images').getPublicUrl(path);
    return data?.publicUrl || null;
  };

  useEffect(() => {
    if (currentStep < 7) return;
    if (String((shipping as any)?.mode || '').toLowerCase() !== 'me2') return;
    try {
      const opt = (listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || '') === String(listingTypeId || '')) || {};
      let mandatory = false;
      const scan = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const [k, v] of Object.entries(obj)) {
          const key = String(k).toLowerCase();
          if (key.includes('free') && key.includes('ship')) {
            if (typeof v === 'boolean' && v === true) mandatory = true;
            if (typeof v === 'string') {
              const s = v.toLowerCase();
              if (s.includes('mandatory') || s.includes('obrig') || s === 'true' || s === 'enabled' || s === 'active') mandatory = true;
            }
          }
          if (v && typeof v === 'object') scan(v as any);
        }
      };
      scan(opt);
      if (mandatory && !(shipping as any)?.free_shipping) setShipping({ ...(shipping || {}), free_shipping: true });
    } catch {}
  }, [listingPriceOptions, listingTypeId, shipping, currentStep]);
  useEffect(() => {
    const loadApps = async () => {
      if (!organizationId) return;
      if (currentStep !== 1) return;
      const { data, error } = await (supabase as any)
        .from("marketplace_integrations")
        .select("marketplace_name")
        .eq("organizations_id", organizationId);
      if (error) return;
      const names: string[] = (data || []).map((r: any) => String(r?.marketplace_name || ""));
      const mapped: string[] = names.map((n) => (n === "mercado_livre" ? "Mercado Livre" : n));
      const clean: string[] = Array.from(new Set<string>(mapped)).filter((n): n is string => !!n);
      setConnectedApps(clean);
      if (!marketplaceSelection && clean.includes("Mercado Livre")) setMarketplaceSelection("Mercado Livre");
    };
    loadApps();
  }, [organizationId, currentStep]);

  useEffect(() => {
    const fetchAttrs = async () => {
      if (!organizationId || !categoryId) return;
      if (currentStep !== 3) return;
      if (!fetchGate.s3) return;
      if (Array.isArray(attrsMeta) && attrsMeta.length > 0 && lastCategoryLoaded === String(categoryId || "")) return;
      setLoadingAttrs(true);
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-attributes", {
          body: { organizationId, categoryId }
        });
        if (!error) setAttrsMeta(Array.isArray(data?.attributes) ? data.attributes : []);
      } finally {
        setLoadingAttrs(false);
      }
    };
    fetchAttrs();
  }, [organizationId, categoryId, currentStep, fetchGate.s3, lastCategoryLoaded]);

  useEffect(() => {
    const fetchTechInput = async () => {
      if (!organizationId || !categoryId) return;
      if (currentStep !== 5) return;
      if (!fetchGate.s3) return;
      if (techSpecsInput && lastCategoryLoaded === String(categoryId || "")) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-technical-specs-input", {
          body: { organizationId, categoryId }
        });
        if (!error) setTechSpecsInput(data || null);
      } catch {}
    };
    fetchTechInput();
  }, [organizationId, categoryId, currentStep, fetchGate.s3, lastCategoryLoaded]);

  useEffect(() => {
    const fetchSaleTermsMeta = async () => {
      if (!organizationId || !categoryId) return;
      if (currentStep !== 6) return;
      if (!fetchGate.s6) return;
      const cat = String(categoryId || "");
      const cached = sessionCacheRef.current.saleTermsMetaByCategory[cat];
      if (Array.isArray(cached)) { setSaleTermsMeta(cached); return; }
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-sale-terms", {
          body: { organizationId, categoryId }
        });
        if (!error) setSaleTermsMeta(Array.isArray((data as any)?.terms) ? (data as any).terms : []);
      } catch {}
    };
    fetchSaleTermsMeta();
  }, [organizationId, categoryId, currentStep, fetchGate.s6]);

  useEffect(() => {
    const evalConditional = async () => {
      if (!organizationId || !categoryId) return;
      if (!fetchGate.s3) return;
      if (!conditionalTrigger) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-attributes-conditional", {
          body: { organizationId, categoryId, attributes }
        });
        if (!error) setConditionalRequiredIds(Array.isArray((data as any)?.required_ids) ? (data as any).required_ids : []);
      } catch {
        setConditionalRequiredIds([]);
      }
    };
    evalConditional();
  }, [organizationId, categoryId, conditionalTrigger, fetchGate.s3]);

  useEffect(() => {
    const fetchListingTypes = async () => {
      if (!organizationId || !categoryId || !siteId) return;
      if (currentStep !== 6) return;
      if (!fetchGate.s6) return;
      const cat = String(categoryId || "");
      let arr = Array.isArray(sessionCacheRef.current.listingTypesByCategory[cat]) ? sessionCacheRef.current.listingTypesByCategory[cat] : [];
      if (!Array.isArray(arr) || arr.length === 0) {
        try {
          const { data, error } = await (supabase as any).functions.invoke("mercado-livre-available-listing-types", {
            body: { organizationId, categoryId }
          });
          arr = Array.isArray(data?.types) ? data.types : [];
          if (!error && arr.length === 0) {
            try {
              const res = await fetch(`https://api.mercadolibre.com/sites/${siteId}/listing_types`);
              const json = await res.json();
              if (Array.isArray(json)) arr = json;
            } catch {}
          }
        } catch {}
      }
      if (String(siteId).toUpperCase() === "MLB") {
        const pick = new Set(["gold_special", "gold_pro"]);
        arr = (arr || []).filter((t: any) => pick.has(String(t?.id || t))).map((t: any) => {
          const id = String(t?.id || t);
          const name = id === "gold_special" ? "Clássico" : (id === "gold_pro" ? "Premium" : String(t?.name || t?.listing_type_name || id));
          return { id, name };
        });
      }
      setListingTypes(arr);
    };
    fetchListingTypes();
  }, [organizationId, categoryId, siteId, currentStep, fetchGate.s6]);

  useEffect(() => {
    if (currentStep < 6) return;
    if (!listingTypeId && Array.isArray(listingTypes) && listingTypes.length > 0) {
      const first = listingTypes[0];
      const id = String(first?.id || first);
      if (id) setListingTypeId(id);
    }
  }, [listingTypes, currentStep]);

  useEffect(() => {
    const fetchListingPrices = async () => {
      const p = Number(debouncedPrice);
      if (!organizationId || !categoryId || !siteId || !p) return;
      if (currentStep !== 6) return;
      if (!fetchGate.s6) return;
      setLoadingListing(true);
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-listing-prices", {
          body: { organizationId, siteId, price: p, categoryId }
        });
        if (!error) setListingPriceOptions(Array.isArray(data?.prices) ? data.prices : []);
      } finally {
        setLoadingListing(false);
      }
    };
    fetchListingPrices();
  }, [organizationId, siteId, categoryId, debouncedPrice, currentStep, fetchGate.s6]);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedPrice(price), 500);
    return () => clearTimeout(h);
  }, [price]);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedAttrSig(attrSig), 600);
    return () => clearTimeout(h);
  }, [attrSig]);

  useEffect(() => {
    const fetchShippingModes = async () => {
      if (!organizationId || !siteId) return;
      if (currentStep < 6) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-shipping-methods", {
          body: { organizationId, siteId }
        });
        if (error) return;
        const methods = Array.isArray(data?.methods) ? data.methods : [];
        const prefs = data?.preferences && typeof data.preferences === "object" ? data.preferences : null;
        let modes: string[] = [];
        const modesRaw: any = prefs ? (prefs as any).modes : null;
        let modesArr: any[] | null = null;
        if (Array.isArray(modesRaw)) modesArr = modesRaw as any[];
        else if (typeof modesRaw === "string") { try { modesArr = JSON.parse(modesRaw); } catch { modesArr = null; } }
        if (Array.isArray(modesArr)) {
          modes = modesArr.map((m) => String(m));
        } else {
          const set = new Set<string>();
          methods.forEach((m: any) => {
            const arr = Array.isArray(m?.shipping_modes) ? m.shipping_modes : [];
            arr.forEach((x: any) => set.add(String(x)));
          });
          modes = Array.from(set);
        }
        const logisticsMap: Record<string, string[]> = {};
        const defaultsMap: Record<string, string> = {};
        const logisticsRaw: any = prefs ? (prefs as any).logistics : null;
        let logisticsArr: any[] | null = null;
        if (Array.isArray(logisticsRaw)) logisticsArr = logisticsRaw as any[];
        else if (typeof logisticsRaw === "string") { try { logisticsArr = JSON.parse(logisticsRaw); } catch { logisticsArr = null; } }
        if (Array.isArray(logisticsArr)) {
          logisticsArr.forEach((entry: any) => {
            const mode = String(entry?.mode || "");
            const types = Array.isArray(entry?.types) ? entry.types.map((t: any) => String(t?.type || t)) : [];
            logisticsMap[mode] = types;
            const def = Array.isArray(entry?.types) ? entry.types.find((t: any) => t?.default === true) : null;
            if (def && def.type) defaultsMap[mode] = String(def.type);
          });
        }
        // Determinar modo preferido a partir de mandatorySettings antes de calcular os tipos
        const mandatoryRaw: any = prefs ? (prefs as any).mandatorySettings : null;
        let mandatoryObj: any = null;
        if (mandatoryRaw && typeof mandatoryRaw === "object") mandatoryObj = mandatoryRaw;
        else if (typeof mandatoryRaw === "string") { try { mandatoryObj = JSON.parse(mandatoryRaw); } catch { mandatoryObj = null; } }
        const preferredMode = mandatoryObj?.mode ? String(mandatoryObj.mode) : (modes.includes("me2") ? "me2" : (modes.includes("me1") ? "me1" : (modes[0] || "")));
        let freeMandatory = false;
        const scanMandatory = (obj: any) => {
          if (!obj || typeof obj !== "object") return;
          for (const [k, v] of Object.entries(obj)) {
            const key = String(k).toLowerCase();
            if (key.includes("free") && key.includes("ship")) {
              if (typeof v === "boolean" && v === true) freeMandatory = true;
              if (typeof v === "string") {
                const s = v.toLowerCase();
                if (s.includes("mandatory") || s.includes("obrig") || s === "true" || s === "enabled" || s === "active") freeMandatory = true;
              }
            }
            if (v && typeof v === "object") scanMandatory(v as any);
          }
        };
        scanMandatory(mandatoryObj);
        const priceVal = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
        const isPriceMandatoryMLB = String(siteId).toUpperCase() === "MLB" && priceVal >= 79 && preferredMode === "me2";
        const cfgMandatory = freeMandatory && preferredMode === "me2";
        setFreeShipMandatoryCfg(cfgMandatory);
        setFreeShippingMandatory(cfgMandatory || isPriceMandatoryMLB);

        setShippingModesAvailable(modes);
        setShippingLogisticsByMode(logisticsMap);
        setShippingLogisticsDefaults(defaultsMap);

        const modeForTypes = preferredMode || "me2";
        const knownTypes = ["drop_off", "xd_drop_off", "self_service"];
        const typesForMode = (logisticsMap[modeForTypes] || []).filter((t: string) => t !== "fulfillment");
        try {
          const { data: capsRow } = await (supabase as any)
            .from("marketplace_integrations")
            .select("drop_off, xd_drop_off, self_service")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", "Mercado Livre")
            .order("expires_in", { ascending: false })
            .limit(1)
            .single();
          const allowedSet = new Set<string>();
          if (capsRow?.drop_off) allowedSet.add("drop_off");
          if (capsRow?.xd_drop_off) allowedSet.add("xd_drop_off");
          if (capsRow?.self_service) allowedSet.add("self_service");
          const baseFiltered = typesForMode.length > 0 ? typesForMode : knownTypes;
          const toShow = baseFiltered.filter((t) => allowedSet.has(String(t)));
          setAvailableLogisticTypes(toShow);
          const defType = String((defaultsMap as any)[modeForTypes] || "");
          const nonFlex = toShow.filter((t) => String(t || "") !== "self_service");
          const primaryPick = nonFlex.includes(defType) ? defType : (nonFlex[0] || "");
          const hasFlex = toShow.includes("self_service");
          if (!selectedLogisticType && primaryPick) setSelectedLogisticType(primaryPick);
        } catch {}
        if (!shipping?.mode || !modes.includes(String((shipping as any)?.mode || ""))) {
          let next = { ...(shipping || {}), mode: preferredMode } as any;
          try {
            const fcRaw: any = prefs ? (prefs as any).freeConfigurations : null;
            let fcArr: any[] | null = null;
            if (Array.isArray(fcRaw)) fcArr = fcRaw as any[];
            else if (typeof fcRaw === "string") { try { fcArr = JSON.parse(fcRaw); } catch { fcArr = null; } }
            if (preferredMode === "me2" && Array.isArray(fcArr)) {
              const def = fcArr.find((r: any) => r?.rule?.default === true);
              if (def && def.rule && def.rule.free_shipping_flag === true) next.free_shipping = true;
            }
          } catch {}
          const modeNow = preferredMode;
          const priceValNow = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
          const priceRule = String(siteId).toUpperCase() === "MLB" && priceValNow >= 79 && modeNow === "me2";
          const cfgRule = freeShipMandatoryCfg && modeNow === "me2";
          if (cfgRule || priceRule) next.free_shipping = true;
          if (preferredMode) setShipping(next);
        }
      } catch {}
    };
    fetchShippingModes();
  }, [organizationId, siteId, currentStep]);

  useEffect(() => {
    if (!freeShippingMandatory) return;
    if (!(shipping as any)?.free_shipping) setShipping({ ...(shipping || {}), free_shipping: true });
  }, [freeShippingMandatory]);

  useEffect(() => {
    const mode = String((shipping as any)?.mode || '').toLowerCase();
    const priceVal = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
    const isPriceMandatoryMLB = String(siteId).toUpperCase() === 'MLB' && priceVal >= 79 && mode === 'me2';
    const mandatoryNow = !!(freeShipMandatoryCfg || isPriceMandatoryMLB);
    setFreeShippingMandatory(mandatoryNow);
    if (!mandatoryNow && (shipping as any)?.free_shipping) {
      setShipping({ ...(shipping || {}), free_shipping: false });
    }
  }, [price, siteId, shipping, freeShipMandatoryCfg]);

  useEffect(() => {
    const loadRoots = async () => {
      setDumpLoading(true);
      try {
        const res = await fetch(`https://api.mercadolibre.com/sites/${siteId}/categories`);
        const data = await res.json();
        const roots = Array.isArray(data) ? data.map((c: any) => ({ id: String(c?.id || ""), name: String(c?.name || "") })) : [];
        if (roots.length > 0) {
          setDumpRoots(roots);
        } else {
          try {
            const resAll = await fetch(`https://api.mercadolibre.com/sites/${siteId}/categories/all`);
            const dataAll = await resAll.json();
            const rootMap = new Map<string, string>();
            const visit = (node: any) => {
              const p = Array.isArray((node as any)?.path_from_root) ? (node as any)?.path_from_root : [];
              if (p.length > 0 && p[0]?.id) {
                const rid = String(p[0].id);
                const rname = String(p[0].name || "");
                if (!rootMap.has(rid)) rootMap.set(rid, rname);
              }
              const children = Array.isArray((node as any)?.children_categories) ? (node as any)?.children_categories : [];
              children.forEach(visit);
            };
            if (Array.isArray(dataAll)) {
              dataAll.forEach(visit);
            } else if (Array.isArray((dataAll as any)?.categories)) {
              (dataAll as any).categories.forEach(visit);
            } else if (dataAll && typeof dataAll === "object") {
              Object.values(dataAll as any).forEach((v: any) => { if (v && typeof v === "object") visit(v); });
            }
            const rootsArr = Array.from(rootMap.entries()).map(([id, name]) => ({ id, name }));
            setDumpRoots(rootsArr);
          } catch {
            setDumpRoots([]);
          }
        }
      } catch {
        setDumpRoots([]);
      } finally {
        setDumpLoading(false);
      }
    };
    if (dumpOpen && dumpRoots.length === 0) loadRoots();
  }, [dumpOpen, siteId]);

  const loadChildren = async (id: string): Promise<any[]> => {
    try {
      const res = await fetch(`https://api.mercadolibre.com/categories/${id}`);
      const data = await res.json();
      const children = Array.isArray((data as any)?.children_categories) ? (data as any)?.children_categories : [];
      setDumpChildrenById((prev) => ({ ...prev, [id]: children.map((c: any) => ({ id: String(c?.id || ""), name: String(c?.name || "") })) }));
      const pathArr = Array.isArray((data as any)?.path_from_root) ? (data as any)?.path_from_root : [];
      const fullPath = pathArr.map((p: any) => String(p?.name || "")).filter(Boolean).join(" › ");
      if (fullPath) setPathsByCategoryId((prev) => ({ ...prev, [String((data as any)?.id || id)]: fullPath }));
      return children.map((c: any) => ({ id: String(c?.id || ""), name: String(c?.name || "") }));
    } catch {
      return [];
    }
  };

  const getColumnItems = (level: number) => {
    if (level === 0) return dumpRoots.filter((it) => {
      const q = dumpQuery.trim().toLowerCase();
      if (!q) return true;
      return String(it?.name || "").toLowerCase().includes(q);
    });
    const parent = dumpSelected[level - 1];
    if (!parent) return [];
    const items = dumpChildrenById[parent.id] || [];
    return items.filter((it: any) => {
      const q = dumpQuery.trim().toLowerCase();
      if (!q) return true;
      return String(it?.name || "").toLowerCase().includes(q);
    });
  };

  const handleSelectLevel = async (level: number, item: any) => {
    const next = [...dumpSelected].slice(0, level);
    next[level] = item;
    setDumpSelected(next);
    const children = await loadChildren(String(item?.id || ""));
    if (!children || children.length === 0) {
      setPendingCategoryId(String(item?.id || ""));
      setPendingCategoryName(String(item?.name || ""));
    } else {
      setPendingCategoryId("");
      setPendingCategoryName("");
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const next = [...dumpSelected].slice(0, index + 1);
    setDumpSelected(next);
    setPendingCategoryId("");
    setPendingCategoryName("");
  };

  useEffect(() => {
    const run = async () => {
      const ids = (domainSuggestions || []).map((d: any) => String(d?.category_id || "")).filter(Boolean);
      const unique = Array.from(new Set(ids)).filter((id) => !pathsByCategoryId[id]);
      for (const id of unique) {
        try {
          const res = await fetch(`https://api.mercadolibre.com/categories/${id}`);
          const data = await res.json();
          const pathArr = Array.isArray((data as any)?.path_from_root) ? (data as any)?.path_from_root : [];
          const fullPath = pathArr.map((p: any) => String(p?.name || "")).filter(Boolean).join(" › ");
          if (fullPath) setPathsByCategoryId((prev) => ({ ...prev, [id]: fullPath }));
        } catch {}
      }
    };
    if (domainSuggestions.length > 0 && currentStep === 2) run();
  }, [domainSuggestions, currentStep]);

  const canProceed = () => {
    if (currentStep === 1) return !!marketplaceSelection;
    if (currentStep === 2) return !!title && !!categoryId;
    if (currentStep === 3) {
      const reqIds = new Set<string>(filteredAttrs.required.map((a: any) => String(a.id)));
      const filled = new Set<string>((attributes || []).map((a: any) => String(a.id)).filter(Boolean));
      const missing = Array.from(reqIds).filter((id) => !filled.has(id));
      return description.length > 0 && missing.length === 0;
    }
    if (currentStep === 4) {
      return (Array.isArray(variations) ? variations.length : 0) > 0;
    }
    if (currentStep === 7) {
      const isMe2 = String((shipping as any)?.mode || "").toLowerCase() === "me2";
      if (!isMe2) return true;
      const dims = (shipping as any)?.dimensions || {};
      const h = Number(dims?.height || 0);
      const l = Number(dims?.length || 0);
      const w = Number(dims?.width || 0);
      const g = Number((shipping as any)?.weight || 0);
      return h > 0 && l > 0 && w > 0 && g > 0;
    }
    if (currentStep === 6) {
      const ok = !!listingTypeId && !!price;
      const opt = (listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || '') === String(listingTypeId || ''));
      const requiresPic = !!(opt as any)?.requires_picture || ['gold_pro','gold_special'].includes(String(listingTypeId || '').toLowerCase());
      if (requiresPic) {
        const hasAtLeastOneImage = (variations || []).some((v: any) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) || (pictures || []).length > 0;
        return ok && hasAtLeastOneImage;
      }
      return ok;
    }
    return true;
  };

  const nextStep = async () => {
    if (currentStep >= maxSteps) return;
    if (canProceed()) {
      try {
        if (currentStep === 1) {
          if (!fetchGate.s1) {
            try {
              const { data, error } = await (supabase as any)
                .from("marketplace_integrations")
                .select("marketplace_name, site_id, drop_off, xd_drop_off, self_service, shipping_preferences, preferences_fetched_at")
                .eq("organizations_id", organizationId);
              if (!error) {
                const names: string[] = (data || []).map((r: any) => String(r?.marketplace_name || "")).map((n) => (n === "mercado_livre" ? "Mercado Livre" : n));
                const clean = Array.from(new Set(names)).filter(Boolean);
                setConnectedApps(clean);
                if (!marketplaceSelection && clean.includes("Mercado Livre")) setMarketplaceSelection("Mercado Livre");
              }
            } catch {}
            setFetchGate((g) => ({ ...g, s1: true }));
          }
        }
        if (currentStep === 2) {
          if (lastCategoryLoaded !== String(categoryId || "")) {
            try {
              const cat = String(categoryId || "");
              const cachedAttrs = sessionCacheRef.current.attrsMetaByCategory[cat];
              const cachedTech = sessionCacheRef.current.techInputByCategory[cat];
              if (Array.isArray(cachedAttrs)) {
                setAttrsMeta(cachedAttrs);
              } else {
                const [attrsRes, techRes] = await Promise.all([
                  (supabase as any).functions.invoke("mercado-livre-categories-attributes", { body: { organizationId, categoryId } }),
                  (supabase as any).functions.invoke("mercado-livre-technical-specs-input", { body: { organizationId, categoryId } }),
                ]);
                if (!attrsRes.error) {
                  const arr = Array.isArray(attrsRes.data?.attributes) ? attrsRes.data.attributes : [];
                  setAttrsMeta(arr);
                  sessionCacheRef.current.attrsMetaByCategory[cat] = arr;
                }
                if (!techRes.error) {
                  const inpt = techRes.data || null;
                  setTechSpecsInput(inpt);
                  sessionCacheRef.current.techInputByCategory[cat] = inpt;
                }
              }
              setLastCategoryLoaded(String(categoryId || ""));
            } catch {}
          }
          setFetchGate((g) => ({ ...g, s3: true }));
        }
        if (currentStep === 3) {
          setConditionalTrigger((n) => n + 1);
        }
        if (currentStep === 5) {
          try {
            const cat = String(categoryId || "");
            const cachedTerms = sessionCacheRef.current.saleTermsMetaByCategory[cat];
            const cachedTypes = sessionCacheRef.current.listingTypesByCategory[cat];
            let arr = Array.isArray(cachedTypes) ? cachedTypes : [];
            if (!Array.isArray(cachedTerms) || !Array.isArray(cachedTypes)) {
              const [termsRes, typesRes] = await Promise.all([
                (supabase as any).functions.invoke("mercado-livre-categories-sale-terms", { body: { organizationId, categoryId } }),
                (supabase as any).functions.invoke("mercado-livre-available-listing-types", { body: { organizationId, categoryId } }),
              ]);
              if (!termsRes.error) {
                const terms = Array.isArray((termsRes.data as any)?.terms) ? (termsRes.data as any).terms : [];
                setSaleTermsMeta(terms);
                sessionCacheRef.current.saleTermsMetaByCategory[cat] = terms;
              }
              arr = Array.isArray(typesRes.data?.types) ? typesRes.data.types : [];
            }
            if (String(siteId).toUpperCase() === "MLB") {
              const pick = new Set(["gold_special", "gold_pro"]);
              arr = (arr || []).filter((t: any) => pick.has(String(t?.id || t))).map((t: any) => {
                const id = String(t?.id || t);
                const name = id === "gold_special" ? "Clássico" : (id === "gold_pro" ? "Premium" : String(t?.name || t?.listing_type_name || id));
                return { id, name };
              });
            }
            setListingTypes(arr);
            sessionCacheRef.current.listingTypesByCategory[cat] = arr;
            setFetchGate((g) => ({ ...g, s6: true }));
          } catch {}
        }
        if (currentStep === 6) {
          const p = Number(price);
          if (p > 0) {
            try {
              const key = `${String(siteId)}:${String(categoryId)}:${p}`;
              const cached = sessionCacheRef.current.listingPriceOptionsByKey[key];
              if (Array.isArray(cached)) {
                setListingPriceOptions(cached);
              } else {
                const { data, error } = await (supabase as any).functions.invoke("mercado-livre-listing-prices", {
                  body: { organizationId, siteId, price: p, categoryId }
                });
                if (!error) {
                  const arr = Array.isArray(data?.prices) ? data.prices : [];
                  setListingPriceOptions(arr);
                  sessionCacheRef.current.listingPriceOptionsByKey[key] = arr;
                }
              }
            } catch {}
          }
        }
        if (currentStep === 6) setFetchGate((g) => ({ ...g, s7: true }));
      } finally {
        const next = currentStep + 1;
        setCurrentStep(next);
        setMaxVisitedStep((prev) => Math.max(prev, next));
      }
      return;
    }
    if (currentStep === 6) {
      const okBasic = !!listingTypeId && !!price;
      if (!okBasic) {
        toast({ title: "Complete esta etapa", description: "Selecione o tipo de publicação e informe o preço.", variant: "destructive" });
        return;
      }
      const opt = (listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || '') === String(listingTypeId || ''));
      const requiresPic = !!(opt as any)?.requires_picture || ['gold_pro','gold_special'].includes(String(listingTypeId || '').toLowerCase());
      if (requiresPic) {
        const hasAtLeastOneImage = (variations || []).some((v: any) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) || (pictures || []).length > 0;
        if (!hasAtLeastOneImage) {
          toast({ title: "Foto obrigatória no Premium", description: "Adicione pelo menos uma foto nas variações ou nas fotos gerais.", variant: "destructive" });
          return;
        }
      }
    } else if (currentStep === 7) {
      const isMe2 = String((shipping as any)?.mode || '').toLowerCase() === 'me2';
      if (isMe2) {
        toast({ title: "Dimensões e peso obrigatórios", description: "Informe altura, largura, comprimento e peso do pacote.", variant: "destructive" });
        return;
      }
    } else if (currentStep === 4) {
      toast({ title: "Variação obrigatória", description: "Adicione ao menos uma variação.", variant: "destructive" });
      return;
    } else if (currentStep === 3) {
      toast({ title: "Preencha os obrigatórios", description: "Preencha os atributos obrigatórios e a descrição.", variant: "destructive" });
      return;
    } else if (currentStep === 2) {
      toast({ title: "Título e categoria", description: "Informe o título e selecione a categoria.", variant: "destructive" });
      return;
    } else if (currentStep === 1) {
      toast({ title: "Marketplace necessário", description: "Selecione um marketplace conectado.", variant: "destructive" });
      return;
    }
  };
  const backStep = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  const saveDraftAndExit = async () => {
    try {
      const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result || "");
          const b64 = s.includes(",") ? s.split(",")[1] : s;
          resolve(b64);
        };
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const ensureFile = async (f: any): Promise<File | null> => {
        if (f instanceof File) return f;
        if (f instanceof Blob) return new File([f], "upload.jpg", { type: (f as any).type || "application/octet-stream" });
        if (f && typeof f === "object") {
          if ((f as any).file instanceof File) return (f as any).file as File;
          const src = typeof (f as any).preview === "string" ? (f as any).preview : (typeof (f as any).url === "string" ? (f as any).url : null);
          if (src) {
            try {
              const res = await fetch(src);
              const blob = await res.blob();
              const name = (src.split("/").pop() || "upload").split("?")[0];
              return new File([blob], name, { type: blob.type || "application/octet-stream" });
            } catch {}
          }
        }
        if (typeof f === "string") {
          try {
            const res = await fetch(f);
            const blob = await res.blob();
            const name = (f.split("/").pop() || "upload").split("?")[0];
            return new File([blob], name, { type: blob.type || "application/octet-stream" });
          } catch {}
        }
        return null;
      };
      const serializeImages = async (items: any[]): Promise<string[]> => {
        const out: string[] = [];
        for (const it of items) {
          const f = await ensureFile(it);
          if (f) {
            const url = await uploadImageToStorage(f);
            if (url) out.push(url);
            else {
              const b64 = await fileToBase64(f);
              out.push(`data:${f.type};base64,${b64}`);
            }
          } else if (typeof it === "string") {
            out.push(it);
          } else if (it && typeof it === "object") {
            const src = (typeof (it as any).preview === "string" ? (it as any).preview : (typeof (it as any).url === "string" ? (it as any).url : null)) as string | null;
            if (src) out.push(src);
          }
          if (out.length >= 8) break;
        }
        return out;
      };
      const normalizedVariations = await Promise.all((variations || []).map(async (v: any) => {
        const files = Array.isArray((v as any)?.pictureFiles) ? (v as any).pictureFiles : [];
        const imgs = await serializeImages(files);
        return { ...v, pictureFiles: imgs };
      }));
      const draft: any = {
        organizations_id: organizationId,
        marketplace_name: "Mercado Livre",
        site_id: siteId,
        title,
        category_id: categoryId,
        attributes,
        variations: normalizedVariations,
        pictures,
        price: Number(price || 0),
        listing_type_id: listingTypeId,
        shipping,
        sale_terms: saleTerms,
        description,
        available_quantity: availableQuantity,
        last_step: currentStep,
        status: "draft",
        api_cache: {
          attrsMeta: (lastCategoryLoaded === String(categoryId || '')) ? attrsMeta : undefined,
          techSpecsInput,
          saleTermsMeta,
          listingTypes,
          listingPriceOptions: sessionCacheRef.current.listingPriceOptionsByKey[`${String(siteId)}:${String(categoryId)}:${Number(price || 0)}`] || listingPriceOptions,
        }
      };
      const sig = JSON.stringify(draft);
      if (lastSavedSigRef.current && lastSavedSigRef.current === sig) {
        setConfirmExit(false);
        allowNavRef.current = true;
        navigate('/anuncios/rascunhos');
        setTimeout(() => { allowNavRef.current = false; }, 300);
        return;
      }
      if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
      saveDraftTimerRef.current = setTimeout(async () => {
        try {
          if (currentDraftId) {
            await (supabase as any)
              .from('marketplace_drafts')
              .update(draft)
              .eq('id', currentDraftId)
              .eq('organizations_id', organizationId);
          } else {
            const { data, error } = await (supabase as any)
              .from('marketplace_drafts')
              .insert(draft)
              .select('id')
              .single();
            if (!error && data?.id) setCurrentDraftId(String(data.id));
          }
          lastSavedSigRef.current = sig;
          setConfirmExit(false);
          allowNavRef.current = true;
          navigate('/anuncios/rascunhos');
          setTimeout(() => { allowNavRef.current = false; }, 300);
        } catch (err: any) {
          toast({ title: 'Falha ao salvar rascunho', description: err?.message || String(err), variant: 'destructive' });
        }
      }, 300);
    } catch (e: any) {
      toast({ title: 'Falha ao salvar rascunho', description: e?.message || String(e), variant: 'destructive' });
    }
  };

  const handlePublish = async () => {
    if (!organizationId) { toast({ title: "Sessão necessária", description: "Entre na sua conta.", variant: "destructive" }); return; }
    setErrorSteps([]);
    const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || "");
        const b64 = s.includes(",") ? s.split(",")[1] : s;
        resolve(b64);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const ensureFile = async (f: any): Promise<File | null> => {
      if (f instanceof File) return f;
      if (f instanceof Blob) return new File([f], "upload.jpg", { type: f.type || "application/octet-stream" });
      if (f && typeof f === "object") {
        if (f.file instanceof File) return f.file as File;
        const src = typeof f.preview === "string" ? f.preview : (typeof f.url === "string" ? f.url : null);
        if (src) {
          try {
            const res = await fetch(src);
            const blob = await res.blob();
            const name = (src.split("/").pop() || "upload").split("?")[0];
            return new File([blob], name, { type: blob.type || "application/octet-stream" });
          } catch {}
        }
      }
      if (typeof f === "string") {
        try {
          const res = await fetch(f);
          const blob = await res.blob();
          const name = (f.split("/").pop() || "upload").split("?")[0];
          return new File([blob], name, { type: blob.type || "application/octet-stream" });
        } catch {}
      }
      return null;
    };
    const uploadVariationFiles: any[] = [];
    if ((variations || []).length > 0) {
      for (let i = 0; i < variations.length; i++) {
        const v = variations[i];
        const files = Array.isArray(v?.pictureFiles) ? v.pictureFiles : [];
        const arr: any[] = [];
        for (const f of files) {
          let fileObj = await ensureFile(f);
          if (!fileObj) continue;
          if (/^image\//.test(fileObj.type)) { try { fileObj = await compressImage(fileObj, 0.85, 1280); } catch {} }
          const b64 = await fileToBase64(fileObj);
          arr.push({ filename: fileObj.name || "upload", type: fileObj.type || "application/octet-stream", data_b64: b64 });
          if (arr.length >= 10) break;
        }
        uploadVariationFiles.push(arr);
      }
    }
    let pictureUrls = variations.length > 0 ? [] : pictures;
    const opt2 = (listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || '') === String(listingTypeId || ''));
    const requiresPic2 = !!(opt2 as any)?.requires_picture || String(listingTypeId || '').toLowerCase() === 'gold_pro' || String(listingTypeId || '').toLowerCase() === 'gold_special';
    if (variations.length > 0 && requiresPic2 && pictureUrls.length === 0) {
      for (let i = 0; i < variations.length; i++) {
        const v = variations[i];
        const files = Array.isArray(v?.pictureFiles) ? v.pictureFiles : [];
        if (files.length > 0) {
          const first = await ensureFile(files[0]);
          if (first) {
            const url = await uploadImageToStorage(first);
            if (url) pictureUrls = [url];
          }
          break;
        }
      }
    }
    const priceNum = (() => {
      const raw = String(price || "").trim();
      if (!raw) return 0;
      const norm = raw.replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
      const val = Number(norm);
      return isNaN(val) ? 0 : val;
    })();
    const hasVariations = (variations || []).length > 0;
    const sanitizedVariations = hasVariations ? (variations || []).map((v: any) => {
      let combos = Array.isArray(v?.attribute_combinations) ? (v.attribute_combinations as any[]).filter((c: any) => !!c?.id && (!!c?.value_id || !!c?.value_name)) : [];
      if (String(categoryId).toUpperCase() === 'MLB33388') {
        const bad = new Set(['GTIN','DETAILED_MODEL','MAIN_COLOR','SELLER_SKU']);
        combos = combos.filter((c: any) => !bad.has(String(c?.id || '').toUpperCase()));
      }
      const qty = Number(v?.available_quantity) || 0;
      const obj: any = { attribute_combinations: combos, available_quantity: qty };
      if (priceNum) obj.price = priceNum;
      const varAttrs = Array.isArray(v?.attributes) ? (v.attributes as any[]).filter((a: any) => {
        const hasVal = !!a?.id && (!!a?.value_id || !!a?.value_name || !!a?.value_struct);
        const isMainColor = String(a?.id || '').toUpperCase() === 'MAIN_COLOR';
        return hasVal && !isMainColor;
      }) : [];
      if (varAttrs.length > 0) obj.attributes = varAttrs;
      return obj;
    }) : [];
    if (hasVariations) {
      const invalid = (variations || []).find((v: any) => !Array.isArray(v?.attribute_combinations) || v.attribute_combinations.length === 0 || typeof v?.available_quantity !== "number" || v.available_quantity <= 0 || !(Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0));
      if (invalid) { setErrorSteps(Array.from(new Set([ ...errorSteps, 4 ]))); setCurrentStep(4); toast({ title: "Dados de variação inválidos", description: "Cada variação precisa de atributos, quantidade e ao menos uma foto.", variant: "destructive" }); return; }
      if (!priceNum) { setErrorSteps(Array.from(new Set([ ...errorSteps, 6 ]))); setCurrentStep(6); toast({ title: "Preço obrigatório", description: "Informe o preço para variações.", variant: "destructive" }); return; }
      if (Array.isArray(variationRequiredIds) && variationRequiredIds.length > 0) {
        const missingAny = sanitizedVariations.find((vv: any) => {
          const idsSet = new Set((vv?.attribute_combinations || []).map((c: any) => String(c?.id || "").toUpperCase()));
          return variationRequiredIds.some((rid) => !idsSet.has(String(rid || "").toUpperCase()));
        });
        if (missingAny) {
          const namesMap = new Map<string, string>();
          variationAttrs.forEach((a: any) => { namesMap.set(String(a?.id || "").toUpperCase(), String(a?.name || String(a?.id || ""))); });
          const reqNames = variationRequiredIds.map((id) => namesMap.get(String(id).toUpperCase()) || String(id)).join(", ");
          setErrorSteps(Array.from(new Set([ ...errorSteps, 4 ])));
          setCurrentStep(4);
          toast({ title: "Atributos de variação obrigatórios", description: `Informe: ${reqNames}`, variant: "destructive" });
          return;
        }
      }
    }
    const condAttr = (attributes || []).find((x: any) => String(x?.id || "").toUpperCase() === "ITEM_CONDITION");
    let normalizedCondition: string | undefined = undefined;
    if (condAttr) {
      const vid = String((condAttr as any)?.value_id || "");
      const vname = String((condAttr as any)?.value_name || "").toLowerCase();
      if (vid === "2230284" || /\bnovo\b|\bnew\b/.test(vname)) normalizedCondition = "new";
      else if (vid === "2230581" || /\busado\b|\bused\b/.test(vname)) normalizedCondition = "used";
      else if (vid === "2230580" || /\bn[aã]o\s*especificado\b|\bnot\s*specified\b|\bnot_specified\b/.test(vname)) normalizedCondition = "not_specified";
      else if (/\brecondicionad[oa]\b|\breacondicionad[oa]\b|\brefurbished\b|\bremanufactured\b|\bre\s*manufactured\b/.test(vname)) normalizedCondition = "refurbished";
    }
    const payload: any = {
      site_id: siteId,
      title,
      category_id: categoryId,
      currency_id: currencyId,
      attributes: [],
      pictures: pictureUrls.slice(0, 6).map((url) => ({ source: url })),
    };
    const supportedConditions = new Set(["new","used","not_specified","refurbished"]);
    if (normalizedCondition && supportedConditions.has(normalizedCondition)) {
      payload.condition = normalizedCondition;
      payload.attributes = [
        ...((attributes || []).filter((x: any) => String(x?.id || "").toUpperCase() !== "ITEM_CONDITION"))
      ];
    } else {
      payload.attributes = [ ...(attributes || []) ];
    }
    if (sanitizedVariations.length > 0) payload.variations = sanitizedVariations;
    if (variations.length === 0 && availableQuantity) payload.available_quantity = Number(availableQuantity);
    if (!hasVariations && priceNum) payload.price = priceNum;
    if (listingTypeId) payload.listing_type_id = listingTypeId;
    if (shipping && Object.keys(shipping).length > 0) {
      const dimsObj = (shipping as any)?.dimensions || null;
      const w = dimsObj?.width || 0;
      const h = dimsObj?.height || 0;
      const l = dimsObj?.length || 0;
      const weight = (shipping as any)?.weight || 0;
      const ih = Math.round(h);
      const il = Math.round(l);
      const iw = Math.round(w);
      const ig = Math.round(weight);
      const sellerAttrs: any[] = [];
      if (ih > 0) sellerAttrs.push({ id: "SELLER_PACKAGE_HEIGHT", value_name: `${ih} cm` });
      if (il > 0) sellerAttrs.push({ id: "SELLER_PACKAGE_LENGTH", value_name: `${il} cm` });
      if (iw > 0) sellerAttrs.push({ id: "SELLER_PACKAGE_WIDTH", value_name: `${iw} cm` });
      if (ig > 0) sellerAttrs.push({ id: "SELLER_PACKAGE_WEIGHT", value_name: `${ig} g` });
      if (sellerAttrs.length > 0) {
        const baseAttrs = (payload.attributes || []).filter((x: any) => !/^(SELLER_PACKAGE_HEIGHT|SELLER_PACKAGE_LENGTH|SELLER_PACKAGE_WIDTH|SELLER_PACKAGE_WEIGHT)$/i.test(String(x?.id || "")));
        payload.attributes = [ ...baseAttrs, ...sellerAttrs ];
      }
      const isMe2 = String((shipping as any)?.mode || "").toLowerCase() === "me2";
      if (isMe2) {
        if (!(ih > 0 && il > 0 && iw > 0 && ig > 0)) {
          setErrorSteps(Array.from(new Set([ ...errorSteps, 7 ])));
          setCurrentStep(7);
          toast({ title: "Dimensões do pacote obrigatórias", description: "Informe altura, comprimento, largura e peso do pacote em inteiros (cm/g).", variant: "destructive" });
          return;
        }
      }
      const cl = Math.round(l);
      const ch = Math.round(h);
      const cw = Math.round(w);
      const cg = Math.round(weight);
      const dimsStr = cl && ch && cw && cg ? `${cl}x${ch}x${cw},${cg}` : undefined;
      const ship: any = {};
      if ((shipping as any)?.mode) ship.mode = (shipping as any).mode;
      if (typeof (shipping as any)?.local_pick_up !== "undefined") ship.local_pick_up = !!(shipping as any).local_pick_up;
      if (typeof (shipping as any)?.free_shipping !== "undefined") ship.free_shipping = !!(shipping as any).free_shipping;
      if (dimsStr) ship.dimensions = dimsStr;
      if (ship.mode && Array.isArray(shippingModesAvailable) && shippingModesAvailable.length > 0) {
        const mm = String(ship.mode || "").toLowerCase();
        const avail = shippingModesAvailable.map((m) => String(m).toLowerCase());
        if (!avail.includes(mm)) {
          if (avail.includes("me2")) ship.mode = "me2";
          else ship.mode = shippingModesAvailable[0];
        }
      }
      payload.shipping = ship;
    }
    if (saleTerms.length > 0) payload.sale_terms = saleTerms;
    const sellerShippingPreferences = preferFlex ? { prefer_flex: true } : undefined;
    setPublishing(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("mercado-livre-publish-item", {
        body: { organizationId, payload, description: { plain_text: description }, upload_variation_files: uploadVariationFiles, seller_shipping_preferences: sellerShippingPreferences }
      });
      if (error || (data && (data as any)?.error)) {
        const rawMsg = error?.message || ((data as any)?.meli?.message || (data as any)?.error || "Erro");
        const rawCauses: string[] = Array.isArray((data as any)?.meli?.cause)
          ? ((data as any)?.meli?.cause as any[]).map((c: any) => String(c?.message || c?.code || "")).filter(Boolean)
          : [];
        const merged = [rawMsg, ...rawCauses].join(" \n ").toLowerCase();
        const find = (kw: string | RegExp) => {
          if (typeof kw === 'string') return merged.includes(kw.toLowerCase());
          return kw.test(merged);
        };
        let stepId = 8;
        let field = "Revisão";
        if (find(/categor(y|ia)/i)) { stepId = 2; field = "Categoria"; }
        else if (find(/title|título/i)) { stepId = 2; field = "Título"; }
        else if (find(/description|descri[cç][aã]o/i)) { stepId = 3; field = "Descrição"; }
        else if (find(/item[_-]?condition|condi[cç][aã]o/i)) { stepId = 3; field = "Condição"; }
        else if (find(/attribute|atributo/i) && !find(/variation|varia[cç][aã]o/i)) { stepId = 3; field = "Atributos"; }
        else if (find(/ficha|technical|t[eé]cnica/i)) { stepId = 5; field = "Ficha técnica"; }
        else if (find(/variation|varia[cç][aã]o|attribute[_-]?combinations/i)) { stepId = 4; field = "Variações"; }
        else if (find(/picture|pictures|image|foto|thumbnail/i) || find(/pictures\s+are\s+mandatory|fotos\s+obrigat[oó]rias/i)) { stepId = 4; field = "Imagens"; }
        else if (find(/price|pre[cç]o|listing[_-]?type/i)) { stepId = 6; field = "Preço/Publicação"; }
        else if (find(/shipping|envio|dimensions|dimens[oõ]es|weight|peso|me2|mercado\s*envios/i)) { stepId = 7; field = "Envio e dimensões"; }
        else if (find(/available[_-]?quantity|estoque/i)) { stepId = 4; field = "Estoque da variação"; }
        setErrorSteps(Array.from(new Set([ ...errorSteps, stepId ])));
        setCurrentStep(stepId);
        toast({ title: "Corrija o campo", description: `${field} no passo ${getStepTitle(stepId)}`, variant: "destructive" });
        return;
      }
      toast({ title: "Anúncio cadastrado com sucesso" });
      if (currentDraftId) {
        try {
          await (supabase as any)
            .from('marketplace_drafts')
            .delete()
            .eq('id', currentDraftId)
            .eq('organizations_id', organizationId);
        } catch {}
      }
      setConfirmExit(false);
      allowNavRef.current = true;
      navigate("/anuncios/ativos");
      setTimeout(() => { allowNavRef.current = false; }, 300);
    } finally {
      setPublishing(false);
    }
  };
  const runPredict = async () => {
    if (!organizationId) return;
    if (!title.trim()) return;
    try {
      setHasSearchedCategory(true);
      const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-predict", {
        body: { organizationId, siteId, title: title.trim() }
      });
      if (error) { toast({ title: "Falha no preditor", description: error.message || String(error), variant: "destructive" }); return; }
      const preds = Array.isArray(data?.predictions) ? data.predictions : [];
      setCategorySuggestions(preds);
      const doms = Array.isArray(data?.domain_discovery) ? data.domain_discovery : [];
      setDomainSuggestions(doms);
    } catch (e: any) {
      toast({ title: "Erro no preditor", description: e?.message || String(e), variant: "destructive" });
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 overflow-auto">
            <div className="relative p-6 max-w-6xl mx-auto">
              {publishing && (
                <LoadingOverlay messages={[
                  "Estamos publicando seu anúncio",
                  "Só um minutinho, estamos validando seu anúncio e checando erros",
                  "Em breve seu anúncio estará disponível"
                ]} />
              )}
              <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
                <DialogContent className="w-full max-w-lg md:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Fechar sem salvar?</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="text-sm text-gray-700">Você perderá todos os dados se fechar agora. Deseja salvar um rascunho?</div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { allowNavRef.current = true; setConfirmExit(false); navigate('/anuncios'); setTimeout(() => { allowNavRef.current = false; }, 300); }}>Fechar sem salvar</Button>
                      <Button
                        variant={maxVisitedStep >= 4 ? "default" : "outline"}
                        className={maxVisitedStep >= 4 ? "rounded-2xl bg-novura-primary hover:bg-novura-primary/90" : "border rounded-2xl"}
                        disabled={maxVisitedStep < 4}
                        onClick={saveDraftAndExit}
                      >Salvar rascunho</Button>
                      <Button className="bg-novura-primary hover:bg-novura-primary/90 text-white" onClick={() => { setConfirmExit(false); }}>Terminar o anúncio</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Criar um anúncio</h1>
                  <p className="text-gray-600">Modo Mercado Livre</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={maxVisitedStep >= 4 ? "default" : "outline"}
                    className={maxVisitedStep >= 4 ? "rounded-2xl bg-novura-primary hover:bg-novura-primary/90" : "border-2 rounded-2xl"}
                    disabled={maxVisitedStep < 4}
                    onClick={saveDraftAndExit}
                  >Salvar rascunho</Button>
                  <Button variant="ghost" className="text-gray-700" onClick={() => setConfirmExit(true)}>✕</Button>
                </div>
              </div>
              <StepIndicator steps={steps as any} currentStep={currentStep} clickable maxVisitedStep={maxVisitedStep} onStepClick={(id) => { if (id <= maxVisitedStep) setCurrentStep(id); }} errorSteps={errorSteps} />
              <Card className="mt-6 border border-gray-200 shadow-sm">
                <CardContent className="p-6 space-y-6">
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <div className="text-sm text-gray-700">Selecione um marketplace conectado</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {connectedApps.map((name) => {
                          const selected = marketplaceSelection === name;
                          return (
                            <button
                              key={name}
                              className={`border rounded-lg px-4 py-3 text-left ${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"}`}
                              onClick={() => setMarketplaceSelection(name)}
                            >
                              <div className="font-medium text-gray-900">{name}</div>
                              <div className="text-xs text-gray-600">Conectado</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <div>
                        <RequiredLabel text="Título do produto" required />
                        <div className="relative mt-2">
                          <Input
                            id="ml-title"
                            placeholder="Digite o título do produto"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') runPredict(); }}
                            className="pr-40"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-novura-primary text-sm flex items-center gap-1"
                            onClick={runPredict}
                          >
                            <Search className="w-4 h-4" /> Buscar categoria
                          </button>
                        </div>
                      </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" />
                      <div className="space-y-2">
                        {hasSearchedCategory && categorySuggestions.length === 0 && domainSuggestions.length === 0 ? (
                          <div className="text-sm text-gray-600">Nenhuma sugestão de categoria</div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2">
                            {categorySuggestions.map((sug: any, idx: number) => {
                              const path: any[] = Array.isArray(sug?.path_from_root) ? sug.path_from_root : [];
                              const leaf = path.length ? path[path.length - 1] : null;
                              const leafId = leaf?.id || sug?.category_id || "";
                              const leafName = leaf?.name || sug?.category_name || "Categoria";
                              const fullPath = path.map((p: any) => p?.name).filter(Boolean).join(" › ");
                              return (
                                <button
                                  key={String(leafId || idx)}
                                  className="border border-gray-200 rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50"
                                  onClick={() => setCategoryId(String(leafId || ""))}
                                >
                                  <div className="font-medium text-gray-900">{leafName}</div>
                                  <div className="text-xs text-gray-600">{fullPath || leafName}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {domainSuggestions.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-700">Sugestões por domínio</div>
                            <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => setDumpOpen(true)}>Não é essa categoria</Button>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {domainSuggestions.map((d: any, i: number) => {
                              const leafId = String(d?.category_id || "");
                              const leafName = String(d?.category_name || "Categoria");
                              const domain = String(d?.domain_name || d?.domain_id || "");
                              const subtitle = pathsByCategoryId[leafId] || domain;
                              const selected = leafId === String(categoryId || "");
                              return (
                                <button
                                  key={leafId || i}
                                  className={`${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"} border rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50`}
                                  onClick={() => setCategoryId(leafId)}
                                >
                                  <div className="font-medium text-gray-900">{leafName}</div>
                                  <div className="text-xs text-gray-600">{subtitle}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {categoryId && domainSuggestions.length === 0 && (
                        <div className="space-y-2">
                          <div className="text-sm text-gray-700">Categoria selecionada manualmente</div>
                          <div className="border border-novura-primary rounded-lg px-6 py-5 md:px-8 md:py-6 bg-purple-50">
                            <div className="text-base font-medium text-novura-primary">{pathsByCategoryId[String(categoryId)] || categoryId}</div>
                          </div>
                        </div>
                      )}
                      <Dialog open={dumpOpen} onOpenChange={setDumpOpen}>
                        <DialogContent className="max-w-6xl w-[95vw]">
                          <DialogHeader>
                            <DialogTitle>Selecionar categoria manualmente</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Input placeholder="Buscar" value={dumpQuery} onChange={(e) => setDumpQuery(e.target.value)} />
                            
                            <div className="flex items-center flex-wrap gap-2 text-sm text-novura-primary">
                              {(() => {
                                const lastSel = dumpSelected[dumpSelected.length - 1];
                                const includePending = pendingCategoryId && String(lastSel?.id || "") !== String(pendingCategoryId || "");
                                const arr = includePending ? [...dumpSelected, { id: pendingCategoryId, name: pendingCategoryName }] : [...dumpSelected];
                                return arr.map((s, idx) => (
                                  <span key={String(s?.id || idx)} className="flex items-center gap-2">
                                    <button className="text-novura-primary hover:underline" onClick={() => handleBreadcrumbClick(idx)}>{String(s?.name || "")}</button>
                                    {idx < arr.length - 1 ? <span className="text-novura-primary">&gt;</span> : null}
                                  </span>
                                ));
                              })()}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="border rounded-md bg-white h-[420px]">
                                <ScrollArea className="h-[420px] p-2">
                                  {dumpLoading ? (
                                    <div className="p-4 text-sm text-gray-600">Carregando categorias...</div>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-2">
                                      {getColumnItems(0).map((it: any, idx: number) => {
                                        const selected = String(dumpSelected[0]?.id || "") === String(it?.id || "");
                                        return (
                                          <button
                                            key={String(it?.id || idx)}
                                            className={`${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"} border rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50`}
                                            onClick={async () => { await handleSelectLevel(0, it); }}
                                          >
                                            <div className="font-medium text-gray-900">{String(it?.name || "Categoria")}</div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </ScrollArea>
                              </div>
                              <div className="border rounded-md bg-white h-[420px]">
                                <ScrollArea className="h-[420px] p-2">
                                  <div className="grid grid-cols-1 gap-2">
                                    {getColumnItems(1).map((it: any, idx: number) => {
                                      const selected = String(dumpSelected[1]?.id || "") === String(it?.id || "");
                                      return (
                                        <button
                                          key={String(it?.id || idx)}
                                          className={`${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"} border rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50`}
                                          onClick={async () => { await handleSelectLevel(1, it); }}
                                        >
                                          <div className="font-medium text-gray-900">{String(it?.name || "Categoria")}</div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                              </div>
                              <div className="border rounded-md bg-white h-[420px]">
                                <ScrollArea className="h-[420px] p-2">
                                  <div className="grid grid-cols-1 gap-2">
                                    {getColumnItems(2).map((it: any, idx: number) => {
                                      const selected = String(dumpSelected[2]?.id || "") === String(it?.id || "");
                                      return (
                                        <button
                                          key={String(it?.id || idx)}
                                          className={`${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"} border rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50`}
                                          onClick={async () => { await handleSelectLevel(2, it); }}
                                        >
                                          <div className="font-medium text-gray-900">{String(it?.name || "Categoria")}</div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                              </div>
                              <div className="border rounded-md bg-white h-[420px]">
                                <ScrollArea className="h-[420px] p-2">
                                  <div className="grid grid-cols-1 gap-2">
                                    {getColumnItems(3).map((it: any, idx: number) => {
                                      const selected = String(pendingCategoryId || "") === String(it?.id || "");
                                      return (
                                        <button
                                          key={String(it?.id || idx)}
                                          className={`${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"} border rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50`}
                                          onClick={() => { setPendingCategoryId(String(it?.id || "")); setPendingCategoryName(String(it?.name || "")); }}
                                        >
                                          <div className="font-medium text-gray-900">{String(it?.name || "Categoria")}</div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                              </div>
                            </div>
                            <div className="flex justify-end items-center space-x-2">
                              <Button variant="outline" onClick={() => { setDumpSelected([]); setPendingCategoryId(""); setPendingCategoryName(""); setDumpChildrenById({}); setDumpOpen(false); }}>Cancelar</Button>
                              <Button className="bg-novura-primary hover:bg-novura-primary/90" disabled={!pendingCategoryId} onClick={async () => {
                                if (pendingCategoryId) {
                                  try {
                                    const res = await fetch(`https://api.mercadolibre.com/categories/${pendingCategoryId}`);
                                    const data = await res.json();
                                    const pathArr = Array.isArray((data as any)?.path_from_root) ? (data as any)?.path_from_root : [];
                                    const fullPath = pathArr.map((p: any) => String(p?.name || "")).filter(Boolean).join(" › ");
                                    if (fullPath) setPathsByCategoryId((prev) => ({ ...prev, [pendingCategoryId]: fullPath }));
                                  } catch {}
                                  setCategoryId(pendingCategoryId);
                                  setDomainSuggestions([]);
                                }
                                setDumpSelected([]);
                                setPendingCategoryId("");
                                setPendingCategoryName("");
                                setDumpChildrenById({});
                                setDumpOpen(false);
                              }}>Salvar</Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      {/* Dialog de saída movido para nível superior */}
                    </div>
                  )}
                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredAttrs.required.map((a: any) => {
                          const id = String(a?.id || "");
                          const name = String(a?.name || id || "Atributo");
                          const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                          const current = (attributes || []).find((x: any) => String(x?.id) === id);
                          const tags = (a?.tags || {}) as any;
                          const isRequired = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
                          const isNA = String((current as any)?.value_id || "") === "-1" && ((current as any)?.value_name ?? null) === null;
                          const canNA = !isRequired && String(id).toUpperCase() !== "SELLER_SKU";
                          const isString = String(a?.value_type || "").toLowerCase() === "string";
                          const isMulti = Array.isArray(tags) ? (tags.includes("multivalued") || tags.includes("repeated")) : (!!(tags?.multivalued) || !!(tags?.repeated));
                          if (String(a?.value_type || "").toLowerCase() === "number_unit") {
                            const allowed = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
                            const defUnit = String((a as any)?.default_unit || "");
                            const currNum = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "");
                            const currUnit = typeof (current as any)?.value_struct?.unit === "string" ? String((current as any).value_struct.unit) : (String((current as any)?.value_name || "").split(" ")[1] || defUnit);
                            return (
                              <div key={id}>
                                <RequiredLabel text={name} required={isRequired} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                  <Input value={String(currNum || "")} placeholder={name} onChange={(e) => {
                                  const num = Number(e.target.value) || 0;
                                  const unit = currUnit || defUnit || (allowed[0]?.id || allowed[0] || "");
                                  const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                  const vname = unit ? `${num} ${unit}` : String(num);
                                  setAttributes([ ...next, { id, name, value_name: vname, value_struct: { number: num, unit } } ]);
                                }} />
                                  <Select value={String(currUnit || defUnit || "")} onValueChange={(val) => {
                                  const unit = String(val || defUnit || "");
                                  const numStr = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "0");
                                  const num = Number(numStr) || 0;
                                  const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                  const vname = unit ? `${num} ${unit}` : String(num);
                                  setAttributes([ ...next, { id, name, value_name: vname, value_struct: { number: num, unit } } ]);
                                }}>
                                    <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                                    <SelectContent>
                                      {(allowed || []).map((u: any, idx: number) => {
                                        const uid = String((u as any)?.id || u || idx);
                                        const uname = String((u as any)?.name || (u as any)?.id || u || uid);
                                        return <SelectItem key={uid} value={uid}>{uname}</SelectItem>;
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            );
                          }
                          if (isString) {
                            const suggestions = (Array.isArray(a?.values) ? a.values : []).map((v: any) => ({ id: String(v?.id || ""), name: String(v?.name || v?.value || v?.id || "") }));
                            return (
                              <div key={id}>
                                <RequiredLabel text={name} required={isRequired} />
                                {isMulti ? (
                                  <MultiValuedBadgeInput
                                    id={id}
                                    name={name}
                                    current={current}
                                    suggestions={suggestions}
                                    disabled={isNA}
                                    onChange={(obj) => {
                                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                      setAttributes([ ...next, obj ]);
                                    }}
                                  />
                                ) : (
                                  <StringSuggestInput
                                    id={id}
                                    name={name}
                                    current={current}
                                    suggestions={suggestions}
                                    disabled={isNA}
                                    onChange={(obj) => {
                                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                      setAttributes([ ...next, obj ]);
                                    }}
                                  />
                                )}
                                {canNA && (
                                  <div className="mt-1 flex items-center gap-2">
                                    <Checkbox
                                      className="h-[16px] w-[16px]"
                                      checked={isNA}
                                      onCheckedChange={(checked) => {
                                        const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                        const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                        setAttributes(naAttr ? [ ...next, naAttr ] : next);
                                      }}
                                    />
                                    <span className="text-xs text-gray-600">Não se aplica</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (hasValues) {
                            return (
                              <div key={id}>
                                <RequiredLabel text={name} required={isRequired} />
                                <Select value={String(current?.value_id || "")} onValueChange={(val) => {
                                const vname = a.values.find((v: any) => String(v?.id || "") === String(val))?.name || "";
                                const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                setAttributes([ ...next, { id, name, value_id: val, value_name: vname } ]);
                              }}>
                                  <SelectTrigger className="mt-2"><SelectValue placeholder={name} /></SelectTrigger>
                                  <SelectContent>
                                    {a.values.map((v: any) => (
                                      <SelectItem key={String(v?.id || v?.name || Math.random())} value={String(v?.id || "")}>{String(v?.name || v?.value || v?.id || "")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }
                          return (
                            <div key={id}>
                              <RequiredLabel text={name} required={isRequired} />
                              <StringSuggestInput
                                id={id}
                                name={name}
                                current={current}
                                suggestions={[]}
                                disabled={isNA}
                                onChange={(obj) => {
                                  const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                  setAttributes([ ...next, obj ]);
                                }}
                              />
                              {canNA && (
                                <div className="mt-1 flex items-center gap-2">
                                  <Checkbox
                                    className="h-[16px] w-[16px]"
                                    checked={isNA}
                                    onCheckedChange={(checked) => {
                                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                      const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                      setAttributes(naAttr ? [ ...next, naAttr ] : next);
                                    }}
                                  />
                                  <span className="text-xs text-gray-600">Não se aplica</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        
                      </div>
                      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição em texto plano" className="min-h-[160px]" />
                    </div>
                  )}
                  {currentStep === 4 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-gray-700">Configure ao menos uma variação</div>
                        <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => {
                          const next = [...(variations || []), { attribute_combinations: [], available_quantity: 0, pictureFiles: [] }];
                          setVariations(next);
                          if (primaryVariationIndex === null && next.length === 1) setPrimaryVariationIndex(0);
                        }}>
                          <Plus className="w-4 h-4 mr-1" /> Adicionar variação
                        </Button>
                      </div>
                      <Accordion type="multiple" className="mt-3">
                        {(variations || []).map((v: any, idx: number) => (
                          <AccordionItem key={idx} value={`var-${idx}`} className="border rounded-lg bg-white">
                            <AccordionTrigger className="px-4 text-novura-primary">
                              <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const combos = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [];
                                    const colorCombo = combos.find((c: any) => {
                                      const cid = String(c?.id || "").toUpperCase();
                                      const cname = String(c?.name || "");
                                      return cid === "COLOR" || cid === "MAIN_COLOR" || /\bcor\b/i.test(cname);
                                    });
                                    const valName = String(colorCombo?.value_name || "");
                                    if (valName) return <span>{valName}</span>;
                                    return <span>Variação {idx + 1}</span>;
                                  })()}
                                  {primaryVariationIndex === idx && (
                                    <span className="inline-flex items-center rounded-md bg-novura-primary text-white px-2 py-0.5 text-xs">Variação principal</span>
                                  )}
                                </div>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="cursor-pointer text-novura-primary hover:text-red-600 transition-colors mr-4"
                                  title="Remover variação"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const buf = [...variations];
                                    buf.splice(idx, 1);
                                    setVariations(buf);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const buf = [...variations];
                                      buf.splice(idx, 1);
                                      setVariations(buf);
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {variationAttrs.map((a: any) => {
                                  const id = String(a?.id || "");
                                  const name = String(a?.name || id || "Atributo");
                                  const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                                  const currentCombo = (v?.attribute_combinations || []).find((c: any) => String(c?.id) === id);
                                  if (hasValues && String(a?.value_type || "").toLowerCase() !== "string") {
                                    return (
                                      <Select key={id} value={String(currentCombo?.value_id || "")} onValueChange={(val) => {
                                        const vname = a.values.find((vv: any) => String(vv?.id || "") === String(val))?.name || "";
                                        const combos = (v?.attribute_combinations || []).filter((c: any) => String(c?.id) !== id);
                                        const nextVar = { ...v, attribute_combinations: [ ...combos, { id, name, value_id: val, value_name: vname } ] };
                                        const buf = [...variations];
                                        buf[idx] = nextVar;
                                        setVariations(buf);
                                      }}>
                                        <SelectTrigger><SelectValue placeholder={name} /></SelectTrigger>
                                        <SelectContent>
                                          {a.values.map((vv: any) => (
                                            <SelectItem key={String(vv?.id || vv?.name || Math.random())} value={String(vv?.id || "")}>{String(vv?.name || vv?.value || vv?.id || "")}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    );
                                  }
                                  return (
                                    <div key={id}>
                                      <Label>{name}</Label>
                                      <StringSuggestInput
                                        id={id}
                                        name={name}
                                        current={currentCombo}
                                        suggestions={(Array.isArray(a?.values) ? a.values : []).map((vv: any) => ({ id: String(vv?.id || ""), name: String(vv?.name || vv?.value || vv?.id || "") }))}
                                        disabled={false}
                                        onChange={(obj) => {
                                          const combos = (v?.attribute_combinations || []).filter((c: any) => String(c?.id) !== id);
                                          const nextVar = { ...v, attribute_combinations: [ ...combos, obj ] };
                                          const buf = [...variations];
                                          buf[idx] = nextVar;
                                          setVariations(buf);
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                                {allowVariationAttrs.map((a: any) => {
                                  const id = String(a?.id || "");
                                  const name = String(a?.name || id || "Atributo");
                                  const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                                  const currentAttr = (v?.attributes || []).find((x: any) => String(x?.id) === id);
                                  const tags = (a?.tags || {}) as any;
                                  const isRequired = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
                                  const isNA = String((currentAttr as any)?.value_id || "") === "-1" && ((currentAttr as any)?.value_name ?? null) === null;
                                  const canNA = !isRequired && String(id).toUpperCase() !== "SELLER_SKU";
                                  if (String(id).toUpperCase() === "MAIN_COLOR") {
                                    return (
                                      <div key={id} className="flex items-center gap-2 md:col-span-2">
                                        <Checkbox
                                          checked={primaryVariationIndex === idx}
                                          onCheckedChange={(checked) => {
                                            setPrimaryVariationIndex(checked ? idx : null);
                                          }}
                                        />
                                        <span className="text-sm">Definir como principal</span>
                                      </div>
                                    );
                                  }
                                  if (String(id).toUpperCase() === "GTIN") {
                                    const isNAAttr = String((currentAttr as any)?.value_id || "") === "-1";
                                    return (
                                      <div key={id}>
                                        <Label>{name}</Label>
                                        {hasValues ? (
                                          <Select value={String((currentAttr as any)?.value_id || "")} onValueChange={(val) => {
                                            if (isNAAttr) return;
                                            const vname = a.values.find((vv: any) => String(vv?.id || "") === String(val))?.name || "";
                                            const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                            const nextVar = { ...v, attributes: [ ...attrs, { id, name, value_id: val, value_name: vname } ] };
                                            const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                          }}>
                                            <SelectTrigger className={`mt-2 ${isNAAttr ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder={name} /></SelectTrigger>
                                            <SelectContent>
                                              {a.values.map((vv: any) => (
                                                <SelectItem key={String(vv?.id || vv?.name || Math.random())} value={String(vv?.id || "")}>{String(vv?.name || vv?.value || vv?.id || "")}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Input className="mt-2" placeholder={name} disabled={isNAAttr} value={String((currentAttr as any)?.value_name || "")} onChange={(e) => {
                                            if (isNAAttr) return;
                                            const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                            const nextVar = { ...v, attributes: [ ...attrs, { id, name, value_name: e.target.value } ] };
                                            const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                          }} />
                                        )}
                                        <div className="mt-1 flex items-center gap-2">
                                          <Checkbox
                                            className="h-[16px] w-[16px]"
                                            checked={isNAAttr}
                                            onCheckedChange={(checked) => {
                                              const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                              const nextAttr = checked ? { id, name, value_id: "-1", value_name: isRequired ? String((currentAttr as any)?.value_name || "") : null } : undefined;
                                              const nextVar = { ...v, attributes: nextAttr ? [ ...attrs, nextAttr ] : attrs };
                                              const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                            }}
                                          />
                                          <span className="text-xs text-gray-600">Não possui código de barras</span>
                                        </div>
                                        {(isRequired && isNAAttr) && (
                                          <Input
                                            className="mt-1"
                                            placeholder="Motivo de GTIN vazio"
                                            value={String((currentAttr as any)?.value_name || "")}
                                            onChange={(e) => {
                                              const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                              const nextVar = { ...v, attributes: [ ...attrs, { id, name, value_id: "-1", value_name: e.target.value } ] };
                                              const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                            }}
                                          />
                                        )}
                                      </div>
                                    );
                                  }
                                  if (String(a?.value_type || "").toLowerCase() === "number_unit") {
                                    const allowed = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
                                    const defUnit = String((a as any)?.default_unit || "");
                                    const currNum = typeof (currentAttr as any)?.value_struct?.number === "number" ? String((currentAttr as any).value_struct.number) : (String((currentAttr as any)?.value_name || "").split(" ")[0] || "");
                                    const currUnit = typeof (currentAttr as any)?.value_struct?.unit === "string" ? String((currentAttr as any).value_struct.unit) : (String((currentAttr as any)?.value_name || "").split(" ")[1] || defUnit);
                                    return (
                                      <div key={id}>
                                        <Label>{name}</Label>
                                        <div className="relative mt-2">
                                          <Input value={String(currNum || "")} placeholder={name} className="pr-24" disabled={isNA} onChange={(e) => {
                                            const num = Number(e.target.value) || 0;
                                            const unit = currUnit || defUnit || (allowed[0]?.id || allowed[0] || "");
                                            const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                            const vname = unit ? `${num} ${unit}` : String(num);
                                            const nextVar = { ...v, attributes: [ ...attrs, { id, name, value_name: vname, value_struct: { number: num, unit } } ] };
                                            const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                          }} />
                                          <Select value={String(currUnit || defUnit || "")} onValueChange={(val) => {
                                            const unit = String(val || defUnit || "");
                                            const numStr = typeof (currentAttr as any)?.value_struct?.number === "number" ? String((currentAttr as any).value_struct.number) : (String((currentAttr as any)?.value_name || "").split(" ")[0] || "0");
                                            const num = Number(numStr) || 0;
                                            const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                            const vname = unit ? `${num} ${unit}` : String(num);
                                            const nextVar = { ...v, attributes: [ ...attrs, { id, name, value_name: vname, value_struct: { number: num, unit } } ] };
                                            const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                          }}>
                                            <SelectTrigger className={`absolute right-2 top-1/2 -translate-y-1/2 h-8 w-20 border-none bg-transparent shadow-none text-novura-primary hover:text-novura-primary/80 focus-visible:ring-0 ${isNA ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder="Un" /></SelectTrigger>
                                            <SelectContent>
                                              {(allowed || []).map((u: any, i2: number) => {
                                                const uid = String((u as any)?.id || u || i2);
                                                const uname = String((u as any)?.name || (u as any)?.id || u || uid);
                                                return <SelectItem key={uid} value={uid}>{uname}</SelectItem>;
                                              })}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        {canNA && (
                                          <div className="mt-1 flex items-center gap-2">
                                            <Checkbox
                                              className="h-[16px] w-[16px]"
                                              checked={isNA}
                                              onCheckedChange={(checked) => {
                                                const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                                const nextAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                                const nextVar = { ...v, attributes: nextAttr ? [ ...attrs, nextAttr ] : attrs };
                                                const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                              }}
                                            />
                                            <span className="text-xs text-gray-600">Não se aplica</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  if (hasValues) {
                                    return (
                                      <div key={id}>
                                        <Label>{name}</Label>
                                        <Select value={String((currentAttr as any)?.value_id || "")} onValueChange={(val) => {
                                          if (isNA) return;
                                          const vname = a.values.find((vv: any) => String(vv?.id || "") === String(val))?.name || "";
                                          const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                          const nextVar = { ...v, attributes: [ ...attrs, { id, name, value_id: val, value_name: vname } ] };
                                          const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                        }}>
                                          <SelectTrigger className={`mt-2 ${isNA ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder={name} /></SelectTrigger>
                                          <SelectContent>
                                            {a.values.map((vv: any) => (
                                              <SelectItem key={String(vv?.id || vv?.name || Math.random())} value={String(vv?.id || "")}>{String(vv?.name || vv?.value || vv?.id || "")}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        {canNA && (
                                          <div className="mt-1 flex items-center gap-2">
                                            <Checkbox
                                              className="h-[16px] w-[16px]"
                                              checked={isNA}
                                              onCheckedChange={(checked) => {
                                                const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                                const nextAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                                const nextVar = { ...v, attributes: nextAttr ? [ ...attrs, nextAttr ] : attrs };
                                                const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                              }}
                                            />
                                            <span className="text-xs text-gray-600">Não se aplica</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                      <div key={id}>
                                        <Label>{name}</Label>
                                        <Input className="mt-2" placeholder={name} disabled={isNA} value={String((currentAttr as any)?.value_name || "")} onChange={(e) => {
                                          const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                          const nextVar = { ...v, attributes: [ ...attrs, { id, name, value_name: e.target.value } ] };
                                          const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                        }} />
                                        {canNA && (
                                          <div className="mt-1 flex items-center gap-2">
                                            <Checkbox
                                              className="h-[16px] w-[16px]"
                                              checked={isNA}
                                              onCheckedChange={(checked) => {
                                                const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                                const nextAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                                const nextVar = { ...v, attributes: nextAttr ? [ ...attrs, nextAttr ] : attrs };
                                                const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                              }}
                                            />
                                            <span className="text-xs text-gray-600">Não se aplica</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                })}
                                <div>
                                  <Label>Estoque</Label>
                                  <Input value={String(v?.available_quantity ?? "")} placeholder="Estoque" onChange={(e) => {
                                    const buf = [...variations];
                                    buf[idx] = { ...v, available_quantity: Number(e.target.value) };
                                    setVariations(buf);
                                  }} />
                                </div>
                                <div className="md:col-span-2">
                                  <ImageUpload
                                    selectedImages={Array.isArray(v?.pictureFiles) ? v.pictureFiles : []}
                                    onImagesChange={(files) => {
                                      const buf = [...variations];
                                      buf[idx] = { ...v, pictureFiles: files };
                                      setVariations(buf);
                                    }}
                                  />
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </div>
                  )}
                  {currentStep === 5 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(() => {
                          const base = (showAllTechAttrs ? filteredAttrs.tech : filteredAttrs.tech.slice(0, 6));
                          const others = base.filter((a: any) => {
                            const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                            const isBoolean = String(a?.value_type || "").toLowerCase() === "boolean" || (hasValues && a.values.some((v: any) => /^(yes|no|sim|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || ""))));
                            return !isBoolean;
                          });
                          return others.map((a: any) => {
                          const id = String(a?.id || "");
                          const name = String(a?.name || id || "Atributo");
                          const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                          const current = (attributes || []).find((x: any) => String(x?.id) === id);
                          const tags = (a?.tags || {}) as any;
                          const isRequired = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
                          const isNA = String((current as any)?.value_id || "") === "-1" && ((current as any)?.value_name ?? null) === null;
                          const canNA = !isRequired;
                          const isString = String(a?.value_type || "").toLowerCase() === "string";
                          const isMulti = Array.isArray(tags) ? (tags.includes("multivalued") || tags.includes("repeated")) : (!!(tags?.multivalued) || !!(tags?.repeated));
                          const isBoolean = String(a?.value_type || "").toLowerCase() === "boolean" || (hasValues && a.values.some((v: any) => /^(yes|no|sim|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || ""))));
                          if (isBoolean) {
                            const yesVal = hasValues ? ((a.values || []).find((v: any) => /^(yes|sim)$/i.test(String((v as any)?.id || (v as any)?.name || "")))) : null;
                            const noVal = hasValues ? ((a.values || []).find((v: any) => /^(no|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || "")))) : null;
                            const currentValue = (() => {
                              const vid = String((current as any)?.value_id || "").toLowerCase();
                              const vname = String((current as any)?.value_name || "").toLowerCase();
                              if (vid) return /^(yes|sim)$/i.test(vid) ? "yes" : (/^(no|não|nao)$/i.test(vid) ? "no" : "");
                              if (vname) return /^(yes|sim)$/i.test(vname) ? "yes" : (/^(no|não|nao)$/i.test(vname) ? "no" : "");
                              return "";
                            })();
                            return (
                              <div key={id}>
                                <RequiredLabel text={name} required={isRequired} />
                                <div className="mt-2">
                                  <ToggleGroup type="single" value={currentValue} onValueChange={(val) => {
                                    if (!val) return;
                                    const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                    if (val === "yes") {
                                      if (yesVal) setAttributes([ ...next, { id, name, value_id: String((yesVal as any)?.id || "yes"), value_name: String((yesVal as any)?.name || "Sim") } ]);
                                      else setAttributes([ ...next, { id, name, value_name: "Sim" } ]);
                                    } else if (val === "no") {
                                      if (noVal) setAttributes([ ...next, { id, name, value_id: String((noVal as any)?.id || "no"), value_name: String((noVal as any)?.name || "Não") } ]);
                                      else setAttributes([ ...next, { id, name, value_name: "Não" } ]);
                                    }
                                  }}>
                                    <ToggleGroupItem value="yes" className="rounded-l-md border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white">Sim</ToggleGroupItem>
                                    <ToggleGroupItem value="no" className="rounded-r-md border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white">Não</ToggleGroupItem>
                                  </ToggleGroup>
                                </div>
                              </div>
                            );
                          }
                          if (String(a?.value_type || "").toLowerCase() === "number_unit") {
                            const allowed = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
                            const defUnit = String((a as any)?.default_unit || "");
                            const currNum = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "");
                            const currUnit = typeof (current as any)?.value_struct?.unit === "string" ? String((current as any).value_struct.unit) : (String((current as any)?.value_name || "").split(" ")[1] || defUnit);
                            return (
                              <div key={id}>
                                <RequiredLabel text={name} required={isRequired} />
                                <div className="relative mt-2">
                                  <Input value={String(currNum || "")} placeholder={name} className="pr-24" disabled={isNA} onChange={(e) => {
                                    const num = Number(e.target.value) || 0;
                                    const unit = currUnit || defUnit || (allowed[0]?.id || allowed[0] || "");
                                    const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                    const vname = unit ? `${num} ${unit}` : String(num);
                                    setAttributes([ ...next, { id, name, value_name: vname, value_struct: { number: num, unit } } ]);
                                  }} />
                                  <Select value={String(currUnit || defUnit || "")} onValueChange={(val) => {
                                    const unit = String(val || defUnit || "");
                                    const numStr = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "0");
                                    const num = Number(numStr) || 0;
                                    const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                    const vname = unit ? `${num} ${unit}` : String(num);
                                    setAttributes([ ...next, { id, name, value_name: vname, value_struct: { number: num, unit } } ]);
                                  }}>
                                    <SelectTrigger className={`absolute right-2 top-1/2 -translate-y-1/2 h-8 w-20 border-none bg-transparent shadow-none text-novura-primary hover:text-novura-primary/80 focus-visible:ring-0 ${isNA ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder="Un" /></SelectTrigger>
                                    <SelectContent>
                                      {(allowed || []).map((u: any, idx: number) => {
                                        const uid = String((u as any)?.id || u || idx);
                                        const uname = String((u as any)?.name || (u as any)?.id || u || uid);
                                        return <SelectItem key={uid} value={uid}>{uname}</SelectItem>;
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>
                                {canNA && (
                                  <div className="mt-1 flex items-center gap-2">
                                    <Checkbox
                                      className="h-[16px] w-[16px]"
                                      checked={isNA}
                                      onCheckedChange={(checked) => {
                                        const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                        const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                        setAttributes(naAttr ? [ ...next, naAttr ] : next);
                                      }}
                                    />
                                    <span className="text-xs text-gray-600">Não se aplica</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (isString) {
                            const suggestions = (Array.isArray(a?.values) ? a.values : []).map((v: any) => ({ id: String(v?.id || ""), name: String(v?.name || v?.value || v?.id || "") }));
                            return (
                              <div key={id}>
                                <RequiredLabel text={name} required={isRequired} />
                                {isMulti ? (
                                  <MultiValuedBadgeInput
                                    id={id}
                                    name={name}
                                    current={current}
                                    suggestions={suggestions}
                                    disabled={isNA}
                                    onChange={(obj) => {
                                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                      setAttributes([ ...next, obj ]);
                                    }}
                                  />
                                ) : (
                                  <StringSuggestInput
                                    id={id}
                                    name={name}
                                    current={current}
                                    suggestions={suggestions}
                                    disabled={isNA}
                                    onChange={(obj) => {
                                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                      setAttributes([ ...next, obj ]);
                                    }}
                                  />
                                )}
                                {canNA && (
                                  <div className="mt-1 flex items-center gap-2">
                                    <Checkbox
                                      className="h-[16px] w-[16px]"
                                      checked={isNA}
                                      onCheckedChange={(checked) => {
                                        const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                        const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                        setAttributes(naAttr ? [ ...next, naAttr ] : next);
                                      }}
                                    />
                                    <span className="text-xs text-gray-600">Não se aplica</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (hasValues) {
                            return (
                              <div key={id}>
                                <RequiredLabel text={name} required={isRequired} />
                                <Select value={String(current?.value_id || "")} onValueChange={(val) => {
                                  if (isNA) return;
                                  const vname = a.values.find((v: any) => String(v?.id || "") === String(val))?.name || "";
                                  const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                  setAttributes([ ...next, { id, name, value_id: val, value_name: vname } ]);
                                }}>
                                  <SelectTrigger className={`mt-2 ${isNA ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder={name} /></SelectTrigger>
                                  <SelectContent>
                                    {a.values.map((v: any) => (
                                      <SelectItem key={String(v?.id || v?.name || Math.random())} value={String(v?.id || "")}>{String(v?.name || v?.value || v?.id || "")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {canNA && (
                                  <div className="mt-1 flex items-center gap-2">
                                    <Checkbox
                                      className="h-[16px] w-[16px]"
                                      checked={isNA}
                                      onCheckedChange={(checked) => {
                                        const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                        const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                        setAttributes(naAttr ? [ ...next, naAttr ] : next);
                                      }}
                                    />
                                    <span className="text-xs text-gray-600">Não se aplica</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div key={id}>
                              <RequiredLabel text={name} required={isRequired} />
                              <StringSuggestInput
                                id={id}
                                name={name}
                                current={current}
                                suggestions={[]}
                                disabled={isNA}
                                onChange={(obj) => {
                                  const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                  setAttributes([ ...next, obj ]);
                                }}
                              />
                              {canNA && (
                                <div className="mt-1 flex items-center gap-2">
                                  <Checkbox
                                    className="h-[16px] w-[16px]"
                                    checked={isNA}
                                    onCheckedChange={(checked) => {
                                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                      const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                      setAttributes(naAttr ? [ ...next, naAttr ] : next);
                                    }}
                                  />
                                  <span className="text-xs text-gray-600">Não se aplica</span>
                                </div>
                              )}
                            </div>
                          );
                          });
                        })()}
                      </div>
                      {(() => {
                        const booleans = (showAllTechAttrs ? filteredAttrs.tech : filteredAttrs.tech.slice(0, 6)).filter((a: any) => {
                          const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                          return String(a?.value_type || "").toLowerCase() === "boolean" || (hasValues && a.values.some((v: any) => /^(yes|no|sim|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || ""))));
                        });
                        if (!booleans.length) return null;
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {booleans.map((a: any) => {
                              const id = String(a?.id || "");
                              const name = String(a?.name || id || "Atributo");
                              const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                              const current = (attributes || []).find((x: any) => String(x?.id) === id);
                              const yesVal = hasValues ? ((a.values || []).find((v: any) => /^(yes|sim)$/i.test(String((v as any)?.id || (v as any)?.name || "")))) : null;
                              const noVal = hasValues ? ((a.values || []).find((v: any) => /^(no|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || "")))) : null;
                              const currentValue = (() => {
                                const vid = String((current as any)?.value_id || "").toLowerCase();
                                const vname = String((current as any)?.value_name || "").toLowerCase();
                                if (vid) return /^(yes|sim)$/i.test(vid) ? "yes" : (/^(no|não|nao)$/i.test(vid) ? "no" : "");
                                if (vname) return /^(yes|sim)$/i.test(vname) ? "yes" : (/^(no|não|nao)$/i.test(vname) ? "no" : "");
                                return "";
                              })();
                              const tagsBool = (a?.tags || {}) as any;
                              const isRequiredBool = Array.isArray(tagsBool) ? tagsBool.includes("required") : !!(tagsBool?.required);
                              return (
                                <div key={id}>
                                  <RequiredLabel text={name} required={isRequiredBool} />
                                  <div className="mt-2">
                                    <ToggleGroup type="single" value={currentValue} onValueChange={(val) => {
                                      if (!val) return;
                                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                      if (val === "yes") {
                                        if (yesVal) setAttributes([ ...next, { id, name, value_id: String((yesVal as any)?.id || "yes"), value_name: String((yesVal as any)?.name || "Sim") } ]);
                                        else setAttributes([ ...next, { id, name, value_name: "Sim" } ]);
                                      } else if (val === "no") {
                                        if (noVal) setAttributes([ ...next, { id, name, value_id: String((noVal as any)?.id || "no"), value_name: String((noVal as any)?.name || "Não") } ]);
                                        else setAttributes([ ...next, { id, name, value_name: "Não" } ]);
                                      }
                                    }} className="gap-0">
                                      <ToggleGroupItem value="yes" className="rounded-l-md px-3 py-1 text-sm border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white">Sim</ToggleGroupItem>
                                      <ToggleGroupItem value="no" className="rounded-r-md px-3 py-1 text-sm border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white">Não</ToggleGroupItem>
                                    </ToggleGroup>
                                  </div>
                                  {(() => {
                                    const isNA2 = String((current as any)?.value_id || "") === "-1" && ((current as any)?.value_name ?? null) === null;
                                    const canNA2 = !isRequiredBool;
                                    if (!canNA2) return null;
                                    return (
                                      <div className="mt-1 flex items-center gap-2">
                                        <Checkbox
                                          className="h-[16px] w-[16px]"
                                          checked={isNA2}
                                          onCheckedChange={(checked) => {
                                            const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                            const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                            setAttributes(naAttr ? [ ...next, naAttr ] : next);
                                          }}
                                        />
                                        <span className="text-xs text-gray-600">Não se aplica</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                        })}
                        
                      </div>
                        );
                      })()}
                      {(!showAllTechAttrs && filteredAttrs.tech.length > 6) && (
                        <div className="flex justify-center">
                          <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => setShowAllTechAttrs(true)}>
                            <ChevronDown className="w-4 h-4 mr-1" /> Preencher mais campos
                          </Button>
                        </div>
                      )}
                      {(showAllTechAttrs && filteredAttrs.tech.length > 6) && (
                        <div className="flex justify-center">
                          <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => setShowAllTechAttrs(false)}>
                            Mostrar menos
                          </Button>
                        </div>
                      )}
                      
                      {techSpecsOutput && (
                        <div className="border rounded-lg p-4 bg-white">
                          {Array.isArray((techSpecsOutput as any)?.sections) ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {(techSpecsOutput as any).sections.map((s: any, i: number) => (
                                <div key={i} className="space-y-1">
                                  <div className="text-sm text-gray-700">{String(s?.title || "")}</div>
                                  {Array.isArray(s?.rows) && s.rows.map((r: any, j: number) => (
                                    <div key={j} className="text-sm text-gray-900">{String(r?.name || "")}: {String(r?.value || "")}</div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {Array.isArray((techSpecsOutput as any)?.preview) && (techSpecsOutput as any).preview.map((r: any, j: number) => (
                                <div key={j} className="text-sm text-gray-900">{String(r?.name || "")}: {String(r?.value || "")}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {currentStep === 6 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <RequiredLabel text="Preço" required />
                          <div className="relative mt-2">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                            <Input id="ml-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço" className="pl-10" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm text-gray-700">Tipo de publicação</div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(([...((Array.isArray(listingTypes) ? listingTypes : []))] as any[]).sort((a: any, b: any) => {
                          const aid = String(a?.id || a);
                          const bid = String(b?.id || b);
                          const arank = aid === "gold_special" ? 0 : 1;
                          const brank = bid === "gold_special" ? 0 : 1;
                          return arank - brank;
                        })).map((t: any) => {
                          const id = String(t?.id || t);
                          const name = String(t?.name || t?.listing_type_name || id);
                          const opt = (listingPriceOptions || []).find((p: any) => String(p?.listing_type_id || "") === id);
                          const priceNum = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
                          const currency = String(opt?.currency_id || currencyId || "BRL");
                          const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
                          const pct = typeof opt?.sale_fee_details?.percentage_fee === "number" ? opt.sale_fee_details.percentage_fee : (typeof opt?.sale_fee_details?.meli_percentage_fee === "number" ? opt.sale_fee_details.meli_percentage_fee : undefined);
                          const commissionAmt = typeof pct === "number" && priceNum > 0 ? (priceNum * pct) / 100 : (typeof opt?.sale_fee_amount === "number" ? opt.sale_fee_amount : (typeof opt?.sale_fee_details?.gross_amount === "number" ? opt.sale_fee_details.gross_amount : 0));
                          const exposure = String(opt?.listing_exposure || "").toLowerCase();
                          const exposureLabel = exposure === "highest" ? "Exposição máxima" : (exposure === "high" ? "Exposição alta" : (exposure === "mid" ? "Exposição média" : (exposure === "low" ? "Exposição baixa" : "Exposição")));
                          const requiresPic = !!opt?.requires_picture;
                          const selected = String(listingTypeId || "") === id;
                          return (
                            <div key={id} className={`border-2 rounded-3xl p-5 bg-white cursor-pointer transition-all ${selected ? "border-novura-primary" : "border-gray-300 hover:border-novura-primary hover:bg-novura-light"} shadow-md`} onClick={() => setListingTypeId(id)}>
                              <div className="flex items-center justify-between">
                                <div className="text-2xl font-bold text-novura-primary">{name}</div>
                                {selected ? <span className="text-xs px-2 py-0.5 rounded-full bg-novura-primary text-white">Selecionado</span> : null}
                              </div>
                              <div className="mt-2 text-sm text-gray-700">
                                <ul className="space-y-1">
                                  {(id === "gold_special" ? [
                                    "Indicado para Compra à Vista",
                                    "Estoque com Alta Rotatividade",
                                    "Maximização da Margem Bruta",
                                    "Produtos Baratos",
                                  ] : [
                                    "Produtos Alto Ticket",
                                    "Oferecer 12x Sem Juros",
                                    "Itens Sazonais/Tendências",
                                    "Maior Taxa de Conversão",
                                  ]).map((tip: string, i: number) => (
                                    <li key={i} className="flex items-start">
                                      <span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span>
                                      <span>{tip}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="mt-4">
                                <div className="text-sm font-semibold text-novura-primary">Tarifa de venda</div>
                                <div className="mt-1 text-sm text-gray-900">Comissão cobrada {typeof pct === "number" && pct > 0 ? `${pct.toFixed(2)}%` : "-"}</div>
                                <div className="text-sm text-gray-900">Valor a ser pago {fmt.format(Number(commissionAmt || 0))}</div>
                              </div>
                              {!selected && (
                                <div className="mt-4">
                                  <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => setListingTypeId(id)}>Selecionar {name}</Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {(() => {
                        const wType = (saleTermsMeta || []).find((x: any) => String(x?.id || "").toUpperCase() === "WARRANTY_TYPE");
                        const wTime = (saleTermsMeta || []).find((x: any) => String(x?.id || "").toUpperCase() === "WARRANTY_TIME");
                        const currentType = (saleTerms || []).find((x: any) => String(x?.id || "") === "WARRANTY_TYPE");
                        const currentTime = (saleTerms || []).find((x: any) => String(x?.id || "") === "WARRANTY_TIME");
                        const currentTimeNumber = typeof (currentTime as any)?.value_struct?.number === "number" ? String((currentTime as any).value_struct.number) : (String((currentTime as any)?.value_name || "").split(" ")[0] || "");
                        const currentTimeUnit = typeof (currentTime as any)?.value_struct?.unit === "string" ? String((currentTime as any).value_struct.unit) : (String((currentTime as any)?.value_name || "").split(" ")[1] || String((wTime as any)?.default_unit || ""));
                        if (!wType && !wTime) return null;
                        return (
                          <div className="space-y-2">
                            <div className="text-sm text-gray-700">Tipo de garantia</div>
                            <div className="space-y-2">
                              {(Array.isArray(wType?.values) ? wType.values : []).map((v: any) => {
                                const vid = String(v?.id || "");
                                const vname = String(v?.name || v?.value || v?.id || vid);
                                const checked = String(currentType?.value_id || "") === vid;
                                return (
                                  <div key={vid} className="p-3 border border-gray-200 rounded-lg">
                                    <label className="flex items-center gap-2">
                                      <Checkbox checked={checked} onCheckedChange={(isC) => {
                                        const nextBase = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TYPE" && String(s?.id || "") !== "WARRANTY_TIME");
                                        if (isC) {
                                          const obj = { id: "WARRANTY_TYPE", value_id: vid, value_name: vname } as any;
                                          setSaleTerms([ ...nextBase, obj ]);
                                        } else {
                                          setSaleTerms(nextBase);
                                        }
                                      }} />
                                      <span className="text-sm">{vname}</span>
                                    </label>
                                    {checked && wTime ? (
                                      <div className="mt-3">
                                        <div className="flex border border-gray-300 rounded-md overflow-hidden bg-white w-[340px]">
                                          <Input className="flex-1 border-0 rounded-none focus-visible:ring-0" value={String(currentTimeNumber || "")} placeholder="Tempo" onChange={(e) => {
                                            const num = e.target.value;
                                            const unit = currentTimeUnit || String((wTime as any)?.default_unit || "");
                                            const n = Number(num) || 0;
                                            const name = unit ? `${n} ${unit}` : String(n);
                                            const base = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TIME");
                                            setSaleTerms([ ...base, { id: "WARRANTY_TIME", value_name: name, value_struct: { number: n, unit } } ]);
                                          }} />
                                          <Select value={String(currentTimeUnit || (wTime as any)?.default_unit || "")} onValueChange={(val) => {
                                            const unit = String(val || (wTime as any)?.default_unit || "");
                                            const prev = (saleTerms || []).find((s: any) => String(s?.id || "") === "WARRANTY_TIME");
                                            const numStr = typeof (prev as any)?.value_struct?.number === "number" ? String((prev as any).value_struct.number) : (String((prev as any)?.value_name || "").split(" ")[0] || "");
                                            const n = Number(numStr) || 0;
                                            const name = unit ? `${n} ${unit}` : String(n);
                                            const base = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TIME");
                                            setSaleTerms([ ...base, { id: "WARRANTY_TIME", value_name: name, value_struct: { number: n, unit } } ]);
                                          }}>
                                            <SelectTrigger className="border-0 rounded-none text-novura-primary px-2 w-[120px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
                                            <SelectContent>
                                              {(Array.isArray(wTime?.allowed_units) ? wTime.allowed_units : []).map((u: any) => (
                                                <SelectItem key={String(u?.id || u?.name || Math.random())} value={String(u?.id || "")}>{String(u?.name || u?.id || "")}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {currentStep === 7 && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="text-sm text-gray-700">Tipos de logística disponíveis</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(availableLogisticTypes || []).map((t) => {
              if (String(t || "") === "self_service") return null;
              const singlePrincipal = (availableLogisticTypes || []).filter((x) => x !== "self_service").length <= 1;
              const clickable = !singlePrincipal;
              const label = (
                t === "drop_off" ? "Correios" :
                t === "xd_drop_off" ? "Mercado Envios" :
                String(t || "").toUpperCase()
              );
              const selected = String(selectedLogisticType || "") === String(t || "");
              return (
                <div
                  key={String(t || "")}
                  className={`border-2 rounded-3xl p-5 bg-white ${clickable ? "cursor-pointer transition-all" : "cursor-default"} ${selected ? "border-novura-primary" : (clickable ? "border-gray-300 hover:border-novura-primary hover:bg-novura-light" : "border-gray-300")} shadow-md`}
                  onClick={clickable ? () => { setSelectedLogisticType(String(t || "")); } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-novura-primary">{label}</div>
                    {selected && !clickable ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-novura-primary text-white">Selecionado automaticamente</span>
                    ) : null}
                  </div>
                  <ul className="mt-3 space-y-1">
                    {[
                      "O custo de entrega é igual ao definido pelo Envios no Mercado Livre.",
                      "Se você oferece frete grátis, o custo do frete é por sua conta.",
                      "Se você não oferecer frete grátis, vai receber até R$15,90 por envio."
                    ].map((tip, i) => (
                      <li key={i} className="flex items-start text-sm text-gray-700">
                        <span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm text-gray-700">Preferências</div>
                        <div className="flex items-center space-x-3">
                          {String((shipping as any)?.mode || "").toLowerCase() === "me2" && (
                            <label className="flex items-center space-x-2">
                              <Checkbox checked={!!(shipping as any)?.free_shipping} disabled={freeShippingMandatory} onCheckedChange={(v) => { if (freeShippingMandatory) return; setShipping({ ...(shipping || {}), free_shipping: !!v }); }} />
                              <span className="text-sm">Frete grátis</span>
                              {freeShippingMandatory ? <span className="inline-flex items-center rounded-full bg-novura-primary text-white px-2 py-0.5 text-[10px]">Obrigatório</span> : null}
                            </label>
                          )}
                          <label className="flex items-center space-x-2">
                            <Checkbox checked={!!(shipping as any)?.local_pick_up} onCheckedChange={(v) => setShipping({ ...(shipping || {}), local_pick_up: !!v })} />
                            <span className="text-sm">Retirada local</span>
                          </label>
                        </div>
                        
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-gray-700">Dimensões e peso</div>
                          {String((shipping as any)?.mode || "").toLowerCase() === "me2" ? (
                            <span className="inline-flex items-center rounded-full bg-novura-primary text-white px-2 py-0.5 text-[10px]">Obrigatório</span>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input type="number" step="1" min="1" placeholder="Peso (g)" onChange={(e) => setShipping({ ...(shipping || {}), weight: Number(e.target.value) })} />
                          <Input type="number" step="1" min="1" placeholder="Altura (cm)" onChange={(e) => {
                            const dims = (shipping as any)?.dimensions || {};
                            setShipping({ ...(shipping || {}), dimensions: { ...dims, height: Number(e.target.value) || 0 } })
                          }} />
                          <Input type="number" step="1" min="1" placeholder="Largura (cm)" onChange={(e) => {
                            const dims = (shipping as any)?.dimensions || {};
                            setShipping({ ...(shipping || {}), dimensions: { ...dims, width: Number(e.target.value) || 0 } })
                          }} />
                          <Input type="number" step="1" min="1" placeholder="Comprimento (cm)" onChange={(e) => {
                            const dims = (shipping as any)?.dimensions || {};
                            setShipping({ ...(shipping || {}), dimensions: { ...dims, length: Number(e.target.value) || 0 } })
                          }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {currentStep === 8 && (
                    <div className="space-y-6">
                      <div className="text-sm text-gray-700">Revise os dados e publique</div>
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-novura-primary">{pathsByCategoryId[String(categoryId || '')] || String(categoryId || '')}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Título do anúncio</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Edite o título do anúncio" />
                          </div>
                          <div>
                            <Label>Tipo de publicação</Label>
                            <Input value={(listingTypes || []).find((t: any) => String(t?.id || t) === String(listingTypeId))?.name || String(listingTypeId)} readOnly />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Tipo de envio</Label>
                            {(() => {
                              const t = String(selectedLogisticType || '');
                              const label = t === 'drop_off' ? 'Correios' : t === 'xd_drop_off' ? 'Mercado Envios' : t === 'self_service' ? 'Flex' : (t ? t.toUpperCase() : 'Não definido');
                              const tips = [
                                'O custo de entrega é igual ao definido pelo Envios no Mercado Livre.',
                                'Se você oferece frete grátis, o custo do frete é por sua conta.',
                                'Se você não oferecer frete grátis, vai receber até R$15,90 por envio.'
                              ];
                              return (
                                <div className={`mt-2 border-2 rounded-3xl p-5 bg-white shadow-md ${t ? 'border-novura-primary' : 'border-gray-300'}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="text-2xl font-bold text-novura-primary">{label}</div>
                                    {t ? <span className="text-xs px-2 py-0.5 rounded-full bg-novura-primary text-white">Selecionado</span> : null}
                                  </div>
                                  <ul className="mt-3 space-y-1">
                                    {tips.map((tip, i) => (
                                      <li key={i} className="flex items-start text-sm text-gray-700">
                                        <span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span>
                                        {tip}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      <div>
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="variacoes">
                            <AccordionTrigger>Variações</AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-2">
                                {(variations || []).length === 0 ? (
                                  <div className="text-sm text-gray-600">Sem variações</div>
                                ) : (
                                  (variations || []).map((v: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between border rounded-lg p-3">
                                      <div>
                                        <div className="font-medium text-gray-900">{v.name || `Variação ${idx + 1}`}</div>
                                        <div className="text-xs text-gray-500">SKU: {v.sku || '-'}</div>
                                      </div>
                                      <div className="flex -space-x-2">
                                        {(Array.isArray(v?.pictureFiles) ? v.pictureFiles : []).slice(0, 4).map((f: any, i: number) => (
                                          <img key={i} src={typeof f === 'string' ? f : (f?.preview || f?.url || '/placeholder.svg')} className="w-8 h-8 rounded object-cover border" />
                                        ))}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                          <AccordionItem value="fotos">
                            <AccordionTrigger>Fotos</AccordionTrigger>
                            <AccordionContent>
                              <div className="flex flex-wrap gap-2">
                                {(pictures || []).length === 0 ? (
                                  <div className="text-sm text-gray-600">Sem fotos</div>
                                ) : (
                                  (pictures || []).map((src: string, i: number) => (
                                    <img key={i} src={src} className="w-16 h-16 rounded object-cover border" />
                                  ))
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" className="border-2 rounded-2xl" onClick={backStep}>Voltar</Button>
                        <Button className="bg-novura-primary hover:bg-novura-primary/90" onClick={handlePublish}>Publicar anúncio</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="mt-4">
              {currentStep !== 8 && (
              <NavigationButtons
                currentStep={currentStep}
                maxSteps={maxSteps}
                productType={"ml" as any}
                variationEtapa={"" as any}
                canProceedVariation={() => true}
                loading={false}
                onNext={currentStep === maxSteps ? handlePublish : nextStep}
                onBack={backStep}
                kitEtapa={"" as any}
                onSave={currentStep === maxSteps ? () => navigate('/anuncios') : nextStep}
                canProceedExternal={canProceed}
                saveLabel={currentStep === 7 ? "Avançar" : (currentStep === 8 ? "Fazer depois" : undefined)}
              />
              )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
const RequiredLabel = ({ text, required }: { text: string; required?: boolean }) => {
  return (
    <div className="flex items-center gap-2">
      <Label>{text}</Label>
      {required ? (
        <span className="inline-flex items-center rounded-full bg-novura-primary text-white px-2 py-0.5 text-[10px]">Obrigatório</span>
      ) : null}
    </div>
  );
};
