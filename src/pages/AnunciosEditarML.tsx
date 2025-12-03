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
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { ImageUpload } from "@/components/produtos/criar/ImageUpload";
import { VideoUpload } from "@/components/produtos/criar/VideoUpload";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { X, ChevronLeft, ChevronRight, Search, AlertCircle, Plus, Trash2, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type VariationLite = { 
  id: string | number; 
  sku?: string | null; 
  available_quantity: number; 
  image?: string | null; 
  attribute_combinations?: any[];
  price?: number;
  pictureFiles?: File[]; // For new uploads in variations
  attributes?: any[]; // Add attributes to VariationLite
};

const RequiredLabel = ({ text, required }: { text: string, required?: boolean }) => (
  <Label className="flex items-center gap-1">
    {text}
    {required && <span className="text-red-500">*</span>}
  </Label>
);

const StringSuggestInput = ({
  id,
  name,
  current,
  disabled,
  onChange,
  suggestions = []
}: {
  id: string;
  name: string;
  current: any;
  suggestions: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (next: { id: string; name: string; value_id?: string; value_name?: string | null }) => void;
}) => {
  const [val, setVal] = useState<string>(String(current?.value_name || ""));
  
  useEffect(() => {
    setVal(String(current?.value_name || ""));
  }, [current]);

  return (
    <div className="relative">
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
      {suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-40 overflow-auto hidden group-focus-within:block">
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100"
              onClick={() => {
                setVal(s.name);
                onChange({ id, name, value_id: s.id, value_name: s.name });
              }}
            >
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MultiValuedBadgeInput = ({
  id,
  name,
  current,
  disabled,
  onChange,
  suggestions = []
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

  useEffect(() => {
     const curr = String(current?.value_name || "").split(",").map((t) => t.trim()).filter((t) => t.length > 0);
     setTokens(curr.map(n => ({ name: n })));
  }, [current]);

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

export default function AnunciosEditarML() {
  const { organizationId } = useAuth();
  const { itemId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  
  // Category Selection States
  const [categorySuggestions, setCategorySuggestions] = useState<any[]>([]);
  const [domainSuggestions, setDomainSuggestions] = useState<any[]>([]);
  const [hasSearchedCategory, setHasSearchedCategory] = useState(false);
  const [dumpOpen, setDumpOpen] = useState(false);
  const [dumpLoading, setDumpLoading] = useState(false);
  const [dumpQuery, setDumpQuery] = useState("");
  const [dumpRoots, setDumpRoots] = useState<any[]>([]);
  const [dumpChildrenById, setDumpChildrenById] = useState<Record<string, any[]>>({});
  const [dumpSelected, setDumpSelected] = useState<any[]>([]);
  const [pathsByCategoryId, setPathsByCategoryId] = useState<Record<string, string>>({});
  const [pendingCategoryId, setPendingCategoryId] = useState<string>("");
  const [pendingCategoryName, setPendingCategoryName] = useState<string>("");
  
  // Data states
  const [itemRow, setItemRow] = useState<any>(null);
  const [soldQty, setSoldQty] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [attributes, setAttributes] = useState<any[]>([]);
  const [variations, setVariations] = useState<VariationLite[]>([]);
  const [pictures, setPictures] = useState<(string | File)[]>([]);
  const [shipping, setShipping] = useState<any>({});
  const [status, setStatus] = useState<string>("");
  const [attrsMeta, setAttrsMeta] = useState<any[]>([]);
  const [saleTerms, setSaleTerms] = useState<any[]>([]);
  const [saleTermsMeta, setSaleTermsMeta] = useState<any[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);
  const [videoId, setVideoId] = useState<string>("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [showAllTechAttrs, setShowAllTechAttrs] = useState(false);
  const [primaryVariationIndex, setPrimaryVariationIndex] = useState<number | null>(null);

  const [listingTypes, setListingTypes] = useState<any[]>([]);
  const [listingTypeId, setListingTypeId] = useState<string>("");
  const [availableLogisticTypes, setAvailableLogisticTypes] = useState<string[]>([]);
  const [selectedLogisticType, setSelectedLogisticType] = useState<string>("");
  const [preferFlex, setPreferFlex] = useState<boolean>(false);
  const [canUseFlex, setCanUseFlex] = useState<boolean>(false);
  const [listingPriceOptions, setListingPriceOptions] = useState<any[]>([]);
  const [loadingListing, setLoadingListing] = useState(false);
  const [debouncedPrice, setDebouncedPrice] = useState<string>(price);
  const [priceEditable, setPriceEditable] = useState(true);

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
      return false;
    };

    const required: any[] = [];
    const tech: any[] = [];

    (attrsMeta || []).forEach((a: any) => {
      const id = String(a?.id || "").toUpperCase();
      const name = String(a?.name || "");
      const tags = (a?.tags || {}) as any;
      const isReq = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
      const isFixed = Array.isArray(tags) ? tags.includes("fixed") : !!(tags?.fixed);
      const isHidden = Array.isArray(tags) ? tags.includes("hidden") : !!(tags?.hidden);
      
      if (id === "GTIN" || id === "SELLER_SKU") return; // Treated separately or ignored
      if (isPackaging(id, name)) return;
      if (isHiddenAdmin(id, name)) return;
      if (isNotModifiable(tags)) return;
      if (isFixed || isHidden) return;
      if (variationAttrs.find((v: any) => String(v?.id || "").toUpperCase() === id)) return;
      if (allowVariationAttrs.find((v: any) => String(v?.id || "").toUpperCase() === id)) return;

      if (isReq) required.push(a);
      else tech.push(a);
    });
    return { required, tech };
  }, [attrsMeta, variationAttrs, allowVariationAttrs]);

  const steps = [
    { id: 1, title: "Preço e condições", description: "Preço e tipo de publicação" },
    { id: 2, title: "Envio", description: "Logística e dimensões" },
    { id: 3, title: "Título e Descrição", description: "Conteúdo do anúncio" },
    { id: 4, title: "Variações, fotos e Vídeo", description: "Variações e mídia" },
    { id: 5, title: "Ficha técnica", description: "Atributos e características" },
  ];

  const canEditTitle = useMemo(() => (soldQty || 0) === 0, [soldQty]);

  // Load initial data
  useEffect(() => {
    const run = async () => {
      if (!organizationId || !itemId) return;
      setLoading(true);
      try {
        let mi: any = null;
        // Buscar da tabela unificada
        try {
          const { data, error } = await (supabase as any)
            .from("marketplace_items_unified")
            .select("*")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", "Mercado Livre")
            .eq("marketplace_item_id", String(itemId))
            .single();
          if (!error) mi = data;
        } catch {}
        
        // Fallback to base table
        if (!mi) {
          const { data, error } = await (supabase as any)
            .from("marketplace_items")
            .select("*")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", "Mercado Livre")
            .eq("marketplace_item_id", String(itemId))
            .single();
          if (error) throw error;
          mi = data;
        }

        setItemRow(mi);
        setSoldQty(typeof mi?.sold_quantity === "number" ? mi.sold_quantity : 0);
        setTitle(String(mi?.title || ""));
        setPrice(String(typeof mi?.price === "number" ? mi.price : Number(mi?.price) || 0));
        
        const rawVars: any[] = Array.isArray(mi?.variations) ? mi.variations : [];
        const mapped: VariationLite[] = rawVars.map((v: any) => {

          const pictureIds: string[] = Array.isArray(v?.picture_ids) ? v.picture_ids : (v?.picture_id ? [v.picture_id] : []);
          const picsArr: any[] = Array.isArray(mi?.pictures) ? mi.pictures : [];
          const resolvedUrls: string[] = pictureIds
            .map((pid) => {
              const match = picsArr.find((p: any) => String(p?.id || p?.picture_id) === String(pid));
              if (typeof match === "string") return match;
              return match?.url || match?.secure_url || "";
            })
            .filter((u: string) => !!u);
          return {
            id: v?.id ?? String(v?.attribute_combinations?.map((a: any) => a?.value_id || a?.value_name).join("-")),
            sku: v?.seller_sku || null,
            available_quantity: typeof v?.available_quantity === "number" ? v.available_quantity : 0,
            image: resolvedUrls[0] || null,
            attribute_combinations: Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [],
            price: typeof v?.price === "number" ? v.price : Number(mi?.price) || 0,
            pictureFiles: resolvedUrls
          };
        });
        setVariations(mapped);

        const picsArr = Array.isArray(mi?.pictures) ? mi.pictures : [];
        const urls = picsArr.map((p: any) => (typeof p === "string" ? p : p?.url || p?.secure_url || "")).filter((u: string) => !!u);
        setPictures(urls);

        try { setVideoId(String(mi?.data?.video_id || "")); } catch {}
        
        setShipping((prev: any) => ({
          ...(mi?.shipping || prev || {}),
          free_shipping: (typeof (mi as any)?.free_shipping === 'boolean')
            ? (mi as any).free_shipping
            : (String((mi as any)?.free_shipping || '').toLowerCase() === 'true'),
          dimensions: {
            height: (mi as any)?.package_height_cm ?? (prev?.dimensions?.height ?? ''),
            width: (mi as any)?.package_width_cm ?? (prev?.dimensions?.width ?? ''),
            length: (mi as any)?.package_length_cm ?? (prev?.dimensions?.length ?? ''),
            weight: (mi as any)?.package_weight_g ?? (prev?.dimensions?.weight ?? ''),
          }
        }));
        setStatus(String(mi?.status || ""));

        try {
          const arr = Array.isArray(mi?.attributes) ? mi.attributes : [];
          setAttributes(arr);
        } catch {}

        try {
          const plain = (mi as any)?.description_plain_text ?? "";
          setDescription(String(plain || ""));
        } catch {}

      } catch (e) {
        toast({ title: "Falha ao carregar", description: String((e as any)?.message || e), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [organizationId, itemId, toast]);

  useEffect(() => {
    const cat = String(itemRow?.category_id || "");
    if (cat) loadChildren(cat);
  }, [itemRow?.category_id]);

  useEffect(() => {
    setListingTypeId(String(itemRow?.listing_type_id || ""));
  }, [itemRow?.listing_type_id]);

  useEffect(() => {
    if (currentStep !== 1) return;
    const arr = [
      { id: "gold_special", name: "Clássico" },
      { id: "gold_pro", name: "Premium" }
    ];
    const currId = String(itemRow?.listing_type_id || "");
    const base = arr.slice();
    if (currId && !base.find((t: any) => String(t?.id || t) === currId)) {
      base.push({ id: currId, name: currId === "gold_special" ? "Clássico" : (currId === "gold_pro" ? "Premium" : currId) });
    }
    setListingTypes(base);
  }, [itemRow?.listing_type_id, currentStep]);

  useEffect(() => {
    if (currentStep !== 1) return;
    if (!listingTypeId && Array.isArray(listingTypes) && listingTypes.length > 0) {
      const first = listingTypes[0] as any;
      const id = String(first?.id || first);
      if (id) setListingTypeId(id);
    }
  }, [listingTypes, currentStep, listingTypeId]);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedPrice(price), 500);
    return () => clearTimeout(h);
  }, [price]);

  useEffect(() => {
    const fetchListingPrices = async () => {
      const p = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
      if (!organizationId || !itemRow?.category_id || !(p > 0)) return;
      const curType = String(itemRow?.listing_type_id || "");
      const selType = String(listingTypeId || "");
      if (!selType) return;
      if (selType === curType) return;
      if (currentStep !== 1) return;
      setLoadingListing(true);
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-listing-prices", {
          body: { organizationId, siteId: "MLB", price: p, categoryId: String(itemRow?.category_id || "") }
        });
        if (!error) setListingPriceOptions(Array.isArray((data as any)?.prices) ? (data as any).prices : []);
      } finally {
        setLoadingListing(false);
      }
    };
    fetchListingPrices();
  }, [organizationId, itemRow?.category_id, listingTypeId, currentStep]);

  useEffect(() => {
    const loadShippingPrefs = async () => {
      if (currentStep !== 2) return;
      if (!organizationId) return;
      try {
        const { data } = await (supabase as any)
          .from("marketplace_integrations")
          .select("shipping_preferences, drop_off, xd_drop_off, self_service, marketplace_name")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .limit(1)
          .single();
        const prefs = (data as any)?.shipping_preferences || {};
        const logistics = Array.isArray(prefs?.logistics) ? prefs.logistics : [];
        const types: string[] = [];
        let defType: string = "";
        logistics.forEach((entry: any) => {
          const arr = Array.isArray(entry?.types) ? entry.types : [];
          arr.forEach((t: any) => {
            const type = String(t?.type || "");
            const status = String(t?.status || "").toLowerCase();
            const isDefault = !!t?.default;
            if (status === "active" && type && type !== "fulfillment") types.push(type);
            if (isDefault && type && type !== "fulfillment") defType = type;
          });
        });
        const unique = Array.from(new Set(types));
        const allowed = ["xd_drop_off", "drop_off"];
        const onlyAllowed = unique.filter((u) => allowed.includes(String(u)));
        setAvailableLogisticTypes(onlyAllowed.length > 0 ? onlyAllowed : allowed);
        const sel = allowed.includes(defType) ? defType : (onlyAllowed[0] || "xd_drop_off");
        setSelectedLogisticType(sel);
        const hasSelfService = unique.includes("self_service");
        const canFlex = hasSelfService && ((data as any)?.self_service === true);
        setPreferFlex(!!(itemRow as any)?.cap_flex);
        setCanUseFlex(canFlex);
      } catch {}
    };
    loadShippingPrefs();
  }, [organizationId, itemRow, currentStep]);

  // Category Selection Logic
  const runPredict = async () => {
    if (!organizationId) return;
    if (!title.trim()) return;
    try {
      setHasSearchedCategory(true);
      const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-predict", {
        body: { organizationId, siteId: "MLB", title: title.trim() }
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

  useEffect(() => {
    const loadRoots = async () => {
      setDumpLoading(true);
      try {
        const res = await fetch(`https://api.mercadolibre.com/sites/MLB/categories`);
        const data = await res.json();
        const roots = Array.isArray(data) ? data.map((c: any) => ({ id: String(c?.id || ""), name: String(c?.name || "") })) : [];
        setDumpRoots(roots);
      } catch {
        setDumpRoots([]);
      } finally {
        setDumpLoading(false);
      }
    };
    if (dumpOpen && dumpRoots.length === 0) loadRoots();
  }, [dumpOpen]);

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

  const confirmCategory = async (newCatId: string) => {
    try { 
      setSaving("category"); 
      await callUpdate({ category_id: newCatId }); 
      toast({ title: "Categoria atualizada" }); 
      setItemRow((prev: any) => ({ ...prev, category_id: newCatId }));
      // Clear cache if needed, or trigger attribute reload
      setAttributes([]);
      setAttrsMeta([]);
    } catch (e) { 
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" }); 
    } finally { 
      setSaving(null); 
    }
  };

  // Helpers
  const uploadFileToStorage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${organizationId}/${fileName}`;
    
    const { error: uploadError } = await (supabase as any)
      .storage
      .from('marketplace_items')
      .upload(filePath, file);
      
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = (supabase as any)
      .storage
      .from('marketplace_items')
      .getPublicUrl(filePath);
      
    return publicUrl;
  };

  const callUpdate = async (updates: any) => {
    if (!organizationId || !itemId) return;
    const resp = await (supabase as any).functions.invoke("mercado-livre-update-item-fields", {
      body: { organizationId, itemId: String(itemId), updates }
    });
    const json = resp?.data || {};
    if ((resp as any)?.error || json?.error) throw new Error((resp as any)?.error?.message || json?.error || "Falha na atualização");
  };

  const confirmListingType = async () => {
    try {
      setSaving("listing_type");
      await callUpdate({ listing_type_id: listingTypeId });
      try {
        const { data: refreshed } = await (supabase as any)
          .from("marketplace_items_unified")
          .select("*")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .eq("marketplace_item_id", String(itemId))
          .limit(1)
          .single();
        const nextType = String((refreshed as any)?.listing_type_id || "");
        if (nextType && nextType === String(itemRow?.listing_type_id || "")) {
          toast({ title: "Alteração não aplicada", description: "O Mercado Livre não permitiu alterar o tipo de publicação para este anúncio.", variant: "destructive" });
        } else {
          toast({ title: "Tipo de publicação atualizado" });
          setItemRow(refreshed);
          setListingTypeId(nextType || listingTypeId);
        }
      } catch {}
    } catch (e) {
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const upsertAttr = (id: string, name: string, value_id?: string, value_name?: string | null, value_struct?: any) => {
    setAttributes((list) => {
      const base = (list || []).filter((x: any) => String(x?.id || "") !== String(id));
      const obj: any = { id, name };
      if (value_struct) obj.value_struct = value_struct;
      if (value_id != null) obj.value_id = value_id;
      if (value_name != null) obj.value_name = value_name;
      return [ ...base, obj ];
    });
  };

  // Load Meta Data
  useEffect(() => {
    const loadAttrsFromView = () => {
      if (currentStep !== 5) return;
      setLoadingAttrs(true);
      try {
        const arr = Array.isArray(itemRow?.attributes) ? itemRow.attributes : [];
        setAttrsMeta(arr);
      } finally {
        setLoadingAttrs(false);
      }
    };
    loadAttrsFromView();
  }, [itemRow?.attributes, currentStep]);

  

  // Confirm Actions
  const confirmTitle = async () => {
    if (!canEditTitle) { toast({ title: "Título bloqueado", description: "Título não pode ser alterado após vendas", variant: "destructive" }); return; }
    try { setSaving("title"); await callUpdate({ title }); toast({ title: "Título atualizado" }); } catch (e) { toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" }); } finally { setSaving(null); }
  };

  const confirmPrice = async () => {
    try {
      setSaving("price");
      const p = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/g, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
      await callUpdate({ price: isFinite(p) ? p : 0 });
      toast({ title: "Preço atualizado" });
    } catch (e) {
      const msg = String((e as any)?.message || e);
      if (/item\.price\.not_modifiable|price is not modifiable/i.test(msg)) {
        setPriceEditable(false);
        toast({ title: "Preço não editável", description: "O Mercado Livre não permite alterar o preço deste anúncio no estado atual.", variant: "destructive" });
      } else {
        toast({ title: "Erro", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(null);
    }
  };

  const confirmVariations = async () => {
    try { 
      setSaving("variations"); 
      
      const variationsPayload = await Promise.all(variations.map(async (v) => {
        const payload: any = { 
          id: v.id, 
          price: v.price, 
          available_quantity: Math.max(0, Number(v.available_quantity) || 0) 
        };

        if (v.pictureFiles && v.pictureFiles.length > 0) {
           const uploadedUrls: string[] = [];
           for (const file of v.pictureFiles) {
             if (file instanceof File) {
               const url = await uploadFileToStorage(file);
               uploadedUrls.push(url);
             } else if (typeof file === 'string') {
               uploadedUrls.push(file);
             }
           }
           if (uploadedUrls.length > 0) {
             payload.pictures = uploadedUrls.map(u => ({ source: u }));
           }
        }
        return payload;
      }));

      await callUpdate({ variations: variationsPayload }); 
      toast({ title: "Variações atualizadas" }); 
    } catch (e) { 
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" }); 
    } finally { 
      setSaving(null); 
    }
  };

  const confirmPictures = async () => {
    try {
      setSaving("pictures");
      const finalUrls: string[] = [];
      for (const item of pictures) {
        if (item instanceof File) {
          const url = await uploadFileToStorage(item);
          finalUrls.push(url);
        } else if (typeof item === "string") {
          finalUrls.push(item);
        } else if (typeof item === "object" && (item as any).url) {
          finalUrls.push((item as any).url);
        }
      }
      await callUpdate({ pictures: finalUrls.map(u => ({ source: u })) });
      setPictures(finalUrls);
      toast({ title: "Imagens atualizadas" });
    } catch (e) {
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const confirmVideo = async () => {
    try {
      setSaving("video_id");
      let finalVideoId = videoId;
      if (videoFile) {
        const url = await uploadFileToStorage(videoFile);
        finalVideoId = url; 
      }
      await callUpdate({ video_id: finalVideoId });
      toast({ title: "Vídeo atualizado" });
    } catch (e) {
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const confirmAttributes = async () => {
    try { setSaving("attributes"); await callUpdate({ attributes }); toast({ title: "Ficha técnica atualizada" }); } catch (e) { toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" }); } finally { setSaving(null); }
  };

  const confirmDescription = async () => {
    try { setSaving("description"); await callUpdate({ description: { plain_text: description } }); toast({ title: "Descrição atualizada" }); } catch (e) { toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" }); } finally { setSaving(null); }
  };

  const confirmShipping = async () => {
    // Validation for ME2
    const mode = String(shipping?.mode || "").toLowerCase();
    const isMe2 = mode === "me2" || mode === "not_specified"; // Default to validating if unsure or standard ME2
    
    if (isMe2) {
      const h = Number(shipping?.dimensions?.height);
      const w = Number(shipping?.dimensions?.width);
      const l = Number(shipping?.dimensions?.length);
      const g = Number(shipping?.dimensions?.weight);
      
      if (!shipping?.dimensions || !(h > 0 && w > 0 && l > 0 && g > 0)) {
        toast({ 
          title: "Dimensões inválidas", 
          description: "Para Mercado Envios, informe altura, largura, comprimento e peso (inteiros).", 
          variant: "destructive" 
        });
        return;
      }
    }

    try { 
      setSaving("shipping"); 
      await callUpdate({ shipping }); 
      toast({ title: "Envio atualizado" }); 
    } catch (e) { 
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" }); 
    } finally { 
      setSaving(null); 
    }
  };

  const toggleStatus = async (next: "active" | "paused" | "closed") => {
    if (!organizationId || !itemId) return;
    try {
      setSaving("status");
      const { data, error } = await (supabase as any).functions.invoke("mercado-livre-update-item-status", { body: { organizationId, itemId: String(itemId), targetStatus: next } });
      if (error || data?.error) throw new Error(error?.message || data?.error || "Falha ao atualizar status");
      setStatus(next);
      toast({ title: "Status atualizado" });
    } catch (e) {
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <Label className="text-lg font-medium">Preço</Label>
              <div className="flex gap-2 items-center">
                <span className="text-gray-500">R$</span>
                <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="max-w-[200px]" disabled={!priceEditable} />
              </div>
              {!priceEditable && (<p className="text-xs text-muted-foreground">O preço não pode ser modificado para este anúncio neste momento.</p>)}
              <div>
                <Button onClick={confirmPrice} disabled={saving === "price" || !priceEditable}>{saving === "price" ? "Salvando..." : "Salvar Preço"}</Button>
              </div>
            </div>
            <div className="space-y-4 pt-6 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-medium">Tipo de publicação</Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(listingTypes || []).map((t: any) => {
                  const id = String((t as any)?.id || t);
                  const name = String((t as any)?.name || id);
                  const opt = (listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || '') === id);
                  const selected = String(listingTypeId || "") === id;
                  const curType = String((itemRow as any)?.listing_type_id || "");
                  const isAlt = id !== curType;
                  const lp = (itemRow as any)?.listing_prices;
                  const viewEntry = Array.isArray(lp?.prices)
                    ? (lp.prices.find((p: any) => String(p?.listing_type_id || p?.id || '') === id) || lp.prices[0])
                    : lp;
                  const viewDetails = (viewEntry?.sale_fee_details || viewEntry?.sale_fee?.details || {}) as any;
                  const viewCurrency = String(viewEntry?.currency_id || "BRL");
                  const viewPct = typeof viewDetails?.percentage_fee === "number" ? viewDetails.percentage_fee : (typeof viewDetails?.meli_percentage_fee === "number" ? viewDetails.meli_percentage_fee : undefined);
                  const viewFixed = typeof viewDetails?.fixed_fee === "number" ? viewDetails.fixed_fee : 0;
                  const viewGross = typeof viewDetails?.gross_amount === "number" ? viewDetails.gross_amount : 0;
                  const optDetails = (opt as any)?.sale_fee_details || (opt as any)?.sale_fee?.details || {};
                  const optCurrency = String((opt as any)?.currency_id || viewCurrency || "BRL");
                  const optPct = typeof (optDetails as any)?.percentage_fee === "number"
                    ? (optDetails as any).percentage_fee
                    : (typeof (optDetails as any)?.meli_percentage_fee === "number" ? (optDetails as any).meli_percentage_fee : undefined);
                  const optFixed = typeof (optDetails as any)?.fixed_fee === "number" ? (optDetails as any).fixed_fee : 0;
                  const optGross = typeof (optDetails as any)?.gross_amount === "number" ? (optDetails as any).gross_amount : 0;
                  const showData = selected || (!isAlt && id === curType);
                  const currency = showData ? (selected ? optCurrency : viewCurrency) : "BRL";
                  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
                  const pct = showData ? (selected ? optPct : viewPct) : undefined;
                  const fixedFee = showData ? (selected ? optFixed : viewFixed) : 0;
                  const grossAmount = showData ? (selected ? optGross : viewGross) : 0;
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
                        <div className="mt-1 text-sm text-gray-900">Comissão cobrada {typeof pct === "number" && (pct as number) > 0 ? `${(pct as number).toFixed(2)}%` : "-"}</div>
                        <div className="text-sm text-gray-900">Valor fixo {fmt.format(Number(fixedFee || 0))}</div>
                        <div className="text-sm text-gray-900">Valor a ser pago {fmt.format(Number(grossAmount || 0))}</div>
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
              <div>
                <Button onClick={confirmListingType} disabled={saving === "listing_type"}>{saving === "listing_type" ? "Salvando..." : "Salvar Tipo"}</Button>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium">Configuração de Envio</h3>
              <div className="mt-2 grid grid-cols-1 gap-4">
                {(() => {
                  const t = String(selectedLogisticType || "");
                  if (!t) return null;
                  const label = (t === "drop_off" ? "Correios" : (t === "xd_drop_off" ? "Mercado Envios" : t.toUpperCase()));
                  return (
                    <div className={`border-2 rounded-3xl p-4 bg-white cursor-default ${"border-novura-primary"} shadow-md max-w-md`}>
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold text-novura-primary">{label}</div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-novura-primary text-white">Principal</span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {["O custo de entrega é igual ao definido pelo Envios no Mercado Livre.", "Se você oferece frete grátis, o custo do frete é por sua conta.", "Se você não oferecer frete grátis, vai receber até R$15,90 por envio."].map((tip, i) => (
                          <li key={i} className="flex items-start text-sm text-gray-700"><span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-gray-700">Preferências</div>
              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2"><Checkbox checked={!!(shipping as any)?.free_shipping} disabled={!!(itemRow as any)?.mandatory_free_shipping} onCheckedChange={(v) => { if (!!(itemRow as any)?.mandatory_free_shipping) return; setShipping({ ...(shipping || {}), free_shipping: !!v }); }} /><span className="text-sm">Frete grátis</span>{!!(itemRow as any)?.mandatory_free_shipping ? <span className="inline-flex items-center rounded-full bg-novura-primary text-white px-2 py-0.5 text-[10px]">Obrigatório</span> : null}</label>
                <label className="flex items-center space-x-2"><Checkbox checked={!!(shipping as any)?.local_pick_up} onCheckedChange={(v) => setShipping({ ...(shipping || {}), local_pick_up: !!v })} /><span className="text-sm">Retirada local</span></label>
                
              </div>
              {canUseFlex && (
                <div className={`mt-6 border rounded-xl p-3 bg-white cursor-default transition-all ${preferFlex ? "border-novura-primary" : "border-gray-300 hover:border-novura-primary hover:bg-novura-light"} w-[320px] md:w-[360px] shrink-0`}>
                  <div className="flex items-center justify-between"><div className="text-sm font-medium text-novura-primary">Flex</div>{preferFlex ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-novura-primary text-white">Selecionado</span> : null}</div>
                  <ul className="mt-2 space-y-1">{["O custo de entrega é igual ao definido pelo Envios no Mercado Livre.", "Se você oferece frete grátis, o custo do frete é por sua conta.", "Se você não oferecer frete grátis, vai receber até R$15,90 por envio."].map((tip, i) => (<li key={i} className="flex items-start text-xs text-gray-700"><span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span>{tip}</li>))}</ul>
                  <div className="mt-4 flex items-center space-x-2"><Checkbox checked={preferFlex} onCheckedChange={(checked) => setPreferFlex(checked === true)} /><span className="text-xs">Usar flex</span></div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 border p-4 rounded-lg">
                <Label className="font-medium">Dimensões do Pacote</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-xs">Altura (cm)</Label><Input type="number" value={shipping?.dimensions?.height || ""} onChange={(e) => setShipping({ ...shipping, dimensions: { ...shipping.dimensions, height: e.target.value } })} /></div>
                  <div><Label className="text-xs">Largura (cm)</Label><Input type="number" value={shipping?.dimensions?.width || ""} onChange={(e) => setShipping({ ...shipping, dimensions: { ...shipping.dimensions, width: e.target.value } })} /></div>
                  <div><Label className="text-xs">Comprimento (cm)</Label><Input type="number" value={shipping?.dimensions?.length || ""} onChange={(e) => setShipping({ ...shipping, dimensions: { ...shipping.dimensions, length: e.target.value } })} /></div>
                  <div><Label className="text-xs">Peso (g)</Label><Input type="number" value={shipping?.dimensions?.weight || ""} onChange={(e) => setShipping({ ...shipping, dimensions: { ...shipping.dimensions, weight: e.target.value } })} /></div>
                </div>
              </div>
            </div>
            <div className="flex justify-end"><Button onClick={confirmShipping} disabled={saving === "shipping"}>{saving === "shipping" ? "Salvando..." : "Salvar Envio"}</Button></div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center">
                <Label className="text-lg font-medium">Título</Label>
              </div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Edite o título do anúncio" disabled={!canEditTitle} />
              {!canEditTitle && <p className="text-sm text-muted-foreground">O título não pode ser alterado pois o anúncio já possui vendas.</p>}
              <div>
                <Button size="sm" onClick={confirmTitle} disabled={saving === "title" || !canEditTitle}>{saving === "title" ? "Salvando..." : "Salvar Título"}</Button>
              </div>
            </div>
            <div className="space-y-4 pt-6 border-t">
              <div className="flex items-center">
                <Label className="text-lg font-medium">Descrição</Label>
              </div>
              <Textarea className="min-h-[200px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva seu produto detalhadamente..." />
              <div>
                <Button size="sm" onClick={confirmDescription} disabled={saving === "description"}>{saving === "description" ? "Salvando..." : "Salvar Descrição"}</Button>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
               <Label className="text-lg font-medium">Variações e Mídia</Label>
               <div className="flex gap-2">
                 <Button size="sm" variant="outline" onClick={() => {
                   const newVar: VariationLite = {
                     id: `NEW_${Date.now()}`,
                     available_quantity: 1,
                     price: Number(price) || 0,
                     attributes: allowVariationAttrs.map(a => ({ id: a.id, name: a.name, value_name: "" }))
                   };
                   setVariations([...variations, newVar]);
                 }}>
                   <Plus className="w-4 h-4 mr-2" /> Adicionar Variação
                 </Button>
               </div>
            </div>

            {variations.length === 0 ? (
               <div className="p-8 border border-dashed rounded-lg text-center">
                 <div className="text-gray-500 mb-4">Este produto não possui variações configuradas.</div>
                 <div className="text-sm text-gray-400 mb-6">Adicione variações se o produto tiver cores, tamanhos ou outros modelos diferentes.</div>
                 
                 <div className="space-y-4 text-left">
                    <div className="flex justify-between items-center">
                       <Label className="text-lg font-medium">Imagens do Produto (Geral)</Label>
                       <Button size="sm" onClick={confirmPictures} disabled={saving === "pictures"}>
                         {saving === "pictures" ? "Salvando..." : "Salvar Imagens"}
                       </Button>
                    </div>
                    <ImageUpload 
                      selectedImages={pictures} 
                      onImagesChange={(imgs) => setPictures(imgs as any)} 
                    />
                 </div>
               </div>
            ) : (
              <div className="space-y-4">
                <Accordion type="single" collapsible className="w-full">
                  {variations.map((v, idx) => {
                    const title = v.attribute_combinations?.map(a => a.value_name).join(" / ") || 
                                  v.attributes?.map(a => a.value_name).filter(Boolean).join(" / ") || 
                                  `Variação ${idx + 1}`;
                    
                    return (
                      <AccordionItem key={v.id} value={String(v.id)}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-4 w-full">
                            <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                              {(v.image || (v.pictureFiles && v.pictureFiles.length > 0 && URL.createObjectURL(v.pictureFiles[0]))) ? (
                                <img 
                                  src={v.image || (v.pictureFiles && v.pictureFiles[0] ? URL.createObjectURL(v.pictureFiles[0]) : "")} 
                                  alt="" 
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                  <Search className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 text-left">
                              <div className="font-medium">{title}</div>
                              <div className="text-xs text-gray-500">SKU: {v.sku || "N/A"} • Estoque: {v.available_quantity}</div>
                            </div>
                            {primaryVariationIndex === idx && (
                              <Badge className="mr-4 bg-novura-primary">Principal</Badge>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 mr-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = variations.filter((_, i) => i !== idx);
                                setVariations(next);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 border-t bg-gray-50/50">
                           <div className="grid gap-4">
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                 <Label>SKU</Label>
                                 <Input 
                                   value={v.sku || ""} 
                                   onChange={(e) => {
                                     const next = [...variations];
                                     next[idx] = { ...next[idx], sku: e.target.value };
                                     setVariations(next);
                                   }} 
                                 />
                               </div>
                               <div>
                                 <Label>Estoque</Label>
                                 <Input 
                                   type="number"
                                   value={v.available_quantity} 
                                   onChange={(e) => {
                                     const next = [...variations];
                                     next[idx] = { ...next[idx], available_quantity: Number(e.target.value) };
                                     setVariations(next);
                                   }} 
                                 />
                               </div>
                             </div>
                             
                             <div>
                               <Label className="mb-2 block">Atributos da Variação</Label>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 {allowVariationAttrs.map((meta) => {
                                   const existing = v.attribute_combinations?.find(a => a.id === meta.id) || 
                                                    v.attributes?.find(a => a.id === meta.id);
                                   const suggestions = (meta.values || []).map((val: any) => ({ id: val.id, name: val.name }));
                                   
                                   return (
                                     <div key={meta.id}>
                                       <Label className="text-xs text-gray-500">{meta.name}</Label>
                                       <StringSuggestInput
                                         id={meta.id}
                                         name={meta.name}
                                         current={existing || { value_name: "" }}
                                         suggestions={suggestions}
                                         onChange={(obj) => {
                                           const next = [...variations];
                                           const currAttrs = next[idx].attributes || next[idx].attribute_combinations || [];
                                           const otherAttrs = currAttrs.filter((a: any) => a.id !== meta.id);
                                           next[idx].attributes = [...otherAttrs, obj];
                                           // Also update attribute_combinations if present to keep sync
                                           if (next[idx].attribute_combinations) {
                                             next[idx].attribute_combinations = next[idx].attributes;
                                           }
                                           setVariations(next);
                                         }}
                                       />
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                             
                             <div className="mt-4">
                               <ImageUpload
                                 selectedImages={Array.isArray(v?.pictureFiles) ? v.pictureFiles : []}
                                 onImagesChange={(files) => {
                                   const buf = [...variations];
                                   buf[idx] = { ...v, pictureFiles: files as File[] };
                                   setVariations(buf);
                                 }}
                               />
                             </div>
                             
                             <div className="flex justify-end">
                               <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 className="text-novura-primary"
                                 onClick={() => setPrimaryVariationIndex(idx)}
                                 disabled={primaryVariationIndex === idx}
                               >
                                 {primaryVariationIndex === idx ? "Já é a principal" : "Definir como principal"}
                               </Button>
                             </div>
                           </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={confirmVariations} disabled={saving === "variations"}>{saving === "variations" ? "Salvando..." : "Salvar Variações"}</Button>
            </div>

            <div className="space-y-4 pt-6 border-t">
              <div className="flex justify-between items-center">
                 <Label className="text-lg font-medium">Vídeo</Label>
                 <Button size="sm" onClick={confirmVideo} disabled={saving === "video_id"}>
                   {saving === "video_id" ? "Salvando..." : "Salvar Vídeo"}
                 </Button>
              </div>
              <VideoUpload
                video={videoFile || videoId}
                onVideoChange={(val) => {
                  if (val instanceof File) {
                    setVideoFile(val);
                  } else {
                    setVideoFile(null);
                    setVideoId(val as string || "");
                  }
                }}
              />
            </div>

            <div className="pt-6 border-t">
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
                              <div className="font-medium text-gray-900">{v.attribute_combinations?.map((a: any) => a.value_name).join(" / ") || v.attributes?.map((a: any) => a.value_name).filter(Boolean).join(" / ") || `Variação ${idx + 1}`}</div>
                              <div className="text-xs text-gray-500">SKU: {v.sku || '-'}</div>
                            </div>
                            <div className="flex -space-x-2">
                              {(Array.isArray(v?.pictureFiles) ? v.pictureFiles : []).slice(0, 4).map((f: any, i: number) => (
                                <img key={i} src={typeof f === 'string' ? f : (f?.preview || (f as any)?.url || '/placeholder.svg')} className="w-8 h-8 rounded object-cover border" />
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-3">
                      <Button size="sm" onClick={confirmVariations} disabled={saving === 'variations'}>{saving === 'variations' ? 'Salvando...' : 'Salvar Variações'}</Button>
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
                        (pictures || []).map((src: any, i: number) => (
                          <img key={i} src={typeof src === 'string' ? src : (src?.url || src?.secure_url || '')} className="w-16 h-16 rounded object-cover border" />
                        ))
                      )}
                    </div>
                    <div className="mt-3">
                      <Button size="sm" onClick={confirmPictures} disabled={saving === 'pictures'}>{saving === 'pictures' ? 'Salvando...' : 'Salvar Imagens'}</Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        );
      case 5: {
        const shownTech = showAllTechAttrs ? filteredAttrs.tech : filteredAttrs.tech.slice(0, 5);
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Ficha Técnica</h3>
              <Button onClick={confirmAttributes} disabled={saving === "attributes"}>
                {saving === "attributes" ? "Salvando..." : "Salvar Ficha Técnica"}
              </Button>
            </div>
            {loadingAttrs ? (
              <div>Carregando atributos...</div>
            ) : (
              <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="obrigatorios">
                  <AccordionTrigger className="hover:no-underline">Atributos obrigatórios</AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredAttrs.required.map((meta: any) => {
                        const curr = attributes.find(a => a.id === meta.id);
                        const isMulti = meta.tags?.multivalued;
                        const suggestions = (meta.values || []).map((v: any) => ({ id: v.id, name: v.name }));
                        return (
                          <div key={meta.id}>
                            <Label>{meta.name}</Label>
                            {isMulti ? (
                              <MultiValuedBadgeInput
                                id={meta.id}
                                name={meta.name}
                                current={curr}
                                suggestions={suggestions}
                                onChange={(obj) => upsertAttr(obj.id, obj.name, obj.value_id, obj.value_name)}
                              />
                            ) : (
                              <StringSuggestInput
                                id={meta.id}
                                name={meta.name}
                                current={curr}
                                suggestions={suggestions}
                                onChange={(obj) => upsertAttr(obj.id, obj.name, obj.value_id, obj.value_name)}
                              />
                            )}
                          </div>
                        );
                      })}
                      <div className="md:col-span-2"><Button size="sm" onClick={confirmAttributes} disabled={saving === "attributes"}>{saving === "attributes" ? "Salvando..." : "Salvar Atributos"}</Button></div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="caracteristicas">
                  <AccordionTrigger className="hover:no-underline">Características</AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {shownTech.map((meta: any) => {
                        const curr = attributes.find(a => a.id === meta.id);
                        const isMulti = meta.tags?.multivalued;
                        const suggestions = (meta.values || []).map((v: any) => ({ id: v.id, name: v.name }));
                        return (
                          <div key={meta.id}>
                            <Label>{meta.name}</Label>
                            {isMulti ? (
                              <MultiValuedBadgeInput
                                id={meta.id}
                                name={meta.name}
                                current={curr}
                                suggestions={suggestions}
                                onChange={(obj) => upsertAttr(obj.id, obj.name, obj.value_id, obj.value_name)}
                              />
                            ) : (
                              <StringSuggestInput
                                id={meta.id}
                                name={meta.name}
                                current={curr}
                                suggestions={suggestions}
                                onChange={(obj) => upsertAttr(obj.id, obj.name, obj.value_id, obj.value_name)}
                              />
                            )}
                          </div>
                        );
                      })}
                      {filteredAttrs.tech.length > 5 && (
                        <Button variant="link" onClick={() => setShowAllTechAttrs(!showAllTechAttrs)}>
                          {showAllTechAttrs ? "Mostrar menos" : `Mostrar mais (${filteredAttrs.tech.length - 5} atributos)`}
                        </Button>
                      )}
                      <div className="md:col-span-2"><Button size="sm" onClick={confirmAttributes} disabled={saving === "attributes"}>{saving === "attributes" ? "Salvando..." : "Salvar Características"}</Button></div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        );
      }
      default:
        return null;
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
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                    {(() => {
                      const it = pictures?.[0] as any;
                      let src = "";
                      try {
                        if (it instanceof File) src = URL.createObjectURL(it);
                        else if (typeof it === "string") src = it;
                        else if (it && typeof it === "object") src = String(it?.url || it?.secure_url || "");
                      } catch {}
                      return src ? (<img src={src} className="w-full h-full object-cover" alt="Capa" />) : null;
                    })()}
                  </div>
                  <div>
                    {itemRow?.permalink ? (
                      <a href={String(itemRow.permalink)} target="_blank" rel="noopener noreferrer" className="text-2xl font-bold text-novura-primary hover:underline">{title}</a>
                    ) : (
                      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-gray-600">EM: {String(itemId || "")}</span>
                      <span className="text-sm text-novura-primary">{pathsByCategoryId[String(itemRow?.category_id || '')] || String(itemRow?.category_id || '')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span>Status</span>
                    <Switch checked={String(status || '') === 'active'} onCheckedChange={(c) => toggleStatus(c ? 'active' : 'paused')} />
                  </label>
                  <Button variant="ghost" className="text-gray-700" onClick={() => navigate("/anuncios/ativos")}>
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </div>

              <StepIndicator 
                 steps={steps} 
                 currentStep={currentStep} 
                 clickable 
                 maxVisitedStep={5} 
                 onStepClick={(id) => setCurrentStep(id)} 
                 errorSteps={[]}
              />

              <Card className="mt-6 border border-gray-200 shadow-sm">
                <CardContent className="p-6 space-y-6">
                   {loading ? (
                     <div className="flex justify-center items-center h-40">
                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                     </div>
                   ) : (
                     renderStepContent()
                   )}

                   
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>

      {/* Category Manual Selection Dialog */}
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
              {/* Level 0 */}
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

              {/* Level 1 */}
              {dumpSelected.length >= 1 && (
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
              )}

              {/* Level 2 */}
              {dumpSelected.length >= 2 && (
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
              )}

              {/* Level 3+ */}
              {dumpSelected.length >= 3 && (
                <div className="border rounded-md bg-white h-[420px]">
                  <ScrollArea className="h-[420px] p-2">
                     <div className="grid grid-cols-1 gap-2">
                        {getColumnItems(3).map((it: any, idx: number) => {
                          const selected = String(dumpSelected[3]?.id || "") === String(it?.id || "");
                          return (
                            <button
                              key={String(it?.id || idx)}
                              className={`${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"} border rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50`}
                              onClick={async () => { await handleSelectLevel(3, it); }}
                            >
                              <div className="font-medium text-gray-900">{String(it?.name || "Categoria")}</div>
                            </button>
                          );
                        })}
                     </div>
                  </ScrollArea>
                </div>
              )}
            </div>
            <div className="flex justify-end items-center space-x-2">
              <Button variant="outline" onClick={() => { setDumpSelected([]); setPendingCategoryId(""); setPendingCategoryName(""); setDumpChildrenById({}); setDumpOpen(false); }}>Cancelar</Button>
              <Button className="bg-novura-primary hover:bg-novura-primary/90" disabled={!pendingCategoryId} onClick={async () => {
                if (pendingCategoryId) {
                  await confirmCategory(pendingCategoryId);
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

    </SidebarProvider>
  );
}
