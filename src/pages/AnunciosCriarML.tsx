import { useEffect, useMemo, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { NavigationButtons } from "@/components/produtos/criar/NavigationButtons";
import { CleanNavigation } from "@/components/CleanNavigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageUpload } from "@/components/produtos/criar/ImageUpload";

export default function AnunciosCriarML() {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const maxSteps = 8;
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [marketplaceSelection, setMarketplaceSelection] = useState<string>("");
  const [siteId, setSiteId] = useState("MLB");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [currencyId, setCurrencyId] = useState("BRL");
  const [condition, setCondition] = useState("new");
  const [attributes, setAttributes] = useState<any[]>([]);
  const [pictures, setPictures] = useState<string[]>([]);
  const [variations, setVariations] = useState<any[]>([]);
  const [listingTypeId, setListingTypeId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
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
  const [attrTab, setAttrTab] = useState<"required" | "tech">("required");
  const variationAttrs = useMemo(() => {
    const isPackagingId = (id: string) => /^PACKAGE_|^PACKAGING_|^SELLING_FORMAT_DIMENSIONS_/i.test(id);
    const isPackagingName = (name: string) => /\bembalagem\b|\bpackage\b|\bpackaging\b|\bpeso da embalagem\b|\blargura da embalagem\b|\baltura da embalagem\b|\bcomprimento da embalagem\b/i.test(name);
    const isHiddenAdmin = (id: string, name: string) => {
      const up = id.toUpperCase();
      if (/^(VAT|IVA|IMPORT_TAX|HAZMAT|HAZMAT_TRANSPORTABILITY|CATALOG_TITLE|SYI_PYMES_ID|IS_NEW_OFFER|PRODUCT_SOURCE|COMPATIBILITIES|HAS_COMPATIBILITIES|IS_SUITABLE_FOR_SHIPPING|DESCRIPTIVE_TAGS|IS_FLAMMABLE)$/i.test(up)) return true;
      return /\btags?\s*vertical\b|\bimposto\s+de\s+importa[cç][aã]o\b|\borigem\s+do\s+dado\s+do\s+pacote\s+de\s+env[ií]o\b|\bimposto\s+sobre\s+o\s+valor\s+acrescentado\b|\bvat\b|\biva\b|\bqu[ií]mic|\bchemical\b|\balimentos?\b|\bbebidas?\b|\bmedicamentos?\b|\bbatter(y|ia)s?\b|\binforma[cç][aã]o\s+adicional\s+requerida\b|\badequad[oa]\s+para\s+o\s+env[ií]o\b|\badecuad[oa]\s+para\s+el?\s+env[ií]o\b|\bapto\s+para\s+el?\s+env[ií]o\b|\bsuitable\s+for\s+shipping\b|\bhazmat\b|\btransportabilit(y|ade)\b|\bsyi\s+pymes\s+id\b|\bt[íi]tulo\s+de\s+cat[aá]logo\b|\bcatalog\s+title\b|\bnova\s+oferta\b|\bnew\s+offer\b|\bcompatibilidades?\b|\bcompatibilit(y|ies)\b|\bfonte\s+do\s+produto\b|\bproduct\s+source\b|\bimpacto\s+positivo\b|\bpositive\s+impact\b|\bcon\s+impacto\s+positivo\b/i.test(name);
    };
    const filtered = (attrsMeta || []).filter((a: any) => {
      const tags = (a?.tags || {}) as any;
      const allowVar = Array.isArray(tags) ? tags.includes("allow_variations") || tags.includes("variation_attribute") : !!(tags?.allow_variations) || !!(tags?.variation_attribute);
      const id = String(a?.id || "").toUpperCase();
      const name = String(a?.name || "");
      if (id === "MAIN_COLOR" || id === "GTIN" || id === "SELLER_SKU") return false;
      return !!allowVar && !isPackagingId(id) && !isPackagingName(name) && id !== "MPN" && !isHiddenAdmin(id, name);
    });
    return filtered;
  }, [attrsMeta]);
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
      return /\btags?\s*vertical\b|\bimposto\s+de\s+importa[cç][aã]o\b|\borigem\s+do\s+dado\s+do\s+pacote\s+de\s+env[ií]o\b|\bimposto\s+sobre\s+o\s+valor\s+acrescentado\b|\bvat\b|\biva\b|\bqu[ií]mic|\bchemical\b|\balimentos?\b|\bbebidas?\b|\bmedicamentos?\b|\bbatter(y|ia)s?\b|\binforma[cç][aã]o\s+adicional\s+requerida\b|\badequad[oa]\s+para\s+o\s+env[ií]o\b|\badecuad[oa]\s+para\s+el?\s+env[ií]o\b|\bapto\s+para\s+el?\s+env[ií]o\b|\bsuitable\s+for\s+shipping\b|\bhazmat\b|\btransportabilit(y|ade)\b|\bsyi\s+pymes\s+id\b|\bt[íi]tulo\s+de\s+cat[aá]logo\b|\bcatalog\s+title\b|\bnova\s+oferta\b|\bnew\s+offer\b|\bcompatibilidades?\b|\bcompatibilit(y|ies)\b|\bfonte\s+do\s+produto\b|\bproduct\s+source\b|\bimpacto\s+positivo\b|\bpositive\s+impact\b|\bcon\s+impacto\s+positivo\b/i.test(String(name || ""));
    };
    const base = (attrsMeta || []).filter((a: any) => {
      const idUp = String(a?.id || "").toUpperCase();
      const nameStr = String(a?.name || "");
      if (idUp === "GTIN" || idUp === "SELLER_SKU") return false;
      return !isPackaging(String(a?.id || ""), nameStr) && !isHiddenAdmin(String(a?.id || ""), nameStr);
    });
    const reqSet = new Set<string>();
    base.forEach((a: any) => {
      const tags = (a?.tags || {}) as any;
      const isReq = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
      const id = String(a?.id || "").toUpperCase();
      if (isReq && id !== "MPN") reqSet.add(String(a?.id || ""));
    });
    ["BRAND", "MODEL"].forEach((id) => reqSet.add(id));
    (conditionalRequiredIds || []).forEach((id) => reqSet.add(String(id)));
    const required = base.filter((a: any) => reqSet.has(String(a?.id || "")) && !variationAttrs.find((v: any) => String(v?.id || "") === String(a?.id || "")));
    const tech = base.filter((a: any) => !reqSet.has(String(a?.id || "")) && !variationAttrs.find((v: any) => String(v?.id || "") === String(a?.id || "")));
    return { required, tech } as { required: any[]; tech: any[] };
  }, [attrsMeta, variationAttrs, conditionalRequiredIds]);
  const steps = useMemo(() => ([
    { id: 1, title: "Marketplace", description: "Selecione onde publicar" },
    { id: 2, title: "Título e Categoria", description: "Informe título e escolha a categoria" },
    { id: 3, title: "Descrição e Atributos", description: "Preencha os dados obrigatórios" },
    { id: 4, title: "Variações e Mídia", description: "Configure variações, fotos e estoque" },
    { id: 5, title: "Ficha Técnica", description: "Atributos técnicos complementares" },
    { id: 6, title: "Preço e Publicação", description: "Preço e tipo de anúncio" },
    { id: 7, title: "Envio", description: "Dimensões e logística" },
    { id: 8, title: "Revisão", description: "Verifique e publique" },
  ]), []);

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

  useEffect(() => {
    const loadApps = async () => {
      if (!organizationId) return;
      const { data, error } = await (supabase as any)
        .from("marketplace_integrations")
        .select("marketplace_name")
        .eq("organizations_id", organizationId);
      if (error) return;
      const names = (data || []).map((r: any) => String(r?.marketplace_name || ""));
      const clean = Array.from(new Set(names.map((n) => n === "mercado_livre" ? "Mercado Livre" : n).filter(Boolean)));
      setConnectedApps(clean);
      if (!marketplaceSelection && clean.includes("Mercado Livre")) setMarketplaceSelection("Mercado Livre");
    };
    loadApps();
  }, [organizationId]);

  useEffect(() => {
    const fetchAttrs = async () => {
      if (!organizationId || !categoryId) return;
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
  }, [organizationId, categoryId]);

  useEffect(() => {
    const fetchTechInput = async () => {
      if (!organizationId || !categoryId) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-technical-specs-input", {
          body: { organizationId, categoryId }
        });
        if (!error) setTechSpecsInput(data || null);
      } catch {}
    };
    fetchTechInput();
  }, [organizationId, categoryId]);

  useEffect(() => {
    const fetchSaleTermsMeta = async () => {
      if (!organizationId || !categoryId) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-sale-terms", {
          body: { organizationId, categoryId }
        });
        if (!error) setSaleTermsMeta(Array.isArray((data as any)?.terms) ? (data as any).terms : []);
      } catch {}
    };
    fetchSaleTermsMeta();
  }, [organizationId, categoryId]);

  useEffect(() => {
    const evalConditional = async () => {
      if (!organizationId || !categoryId) return;
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
  }, [organizationId, categoryId, attributes]);

  useEffect(() => {
    const fetchListingTypes = async () => {
      if (!organizationId || !categoryId || !siteId) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-available-listing-types", {
          body: { organizationId, categoryId }
        });
        let arr = Array.isArray(data?.types) ? data.types : [];
        if (!error && arr.length === 0) {
          try {
            const res = await fetch(`https://api.mercadolibre.com/sites/${siteId}/listing_types`);
            const json = await res.json();
            if (Array.isArray(json)) arr = json;
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
      } catch {}
    };
    fetchListingTypes();
  }, [organizationId, categoryId, siteId]);

  useEffect(() => {
    if (!listingTypeId && Array.isArray(listingTypes) && listingTypes.length > 0) {
      const first = listingTypes[0];
      const id = String(first?.id || first);
      if (id) setListingTypeId(id);
    }
  }, [listingTypes]);

  useEffect(() => {
    const fetchListingPrices = async () => {
      const p = Number(price);
      if (!organizationId || !categoryId || !siteId || !p) return;
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
  }, [organizationId, siteId, categoryId, price]);

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
        const modesSet = new Set<string>();
        methods.forEach((m: any) => {
          const arr = Array.isArray(m?.shipping_modes) ? m.shipping_modes : [];
          arr.forEach((x: any) => modesSet.add(String(x)));
        });
        let modes = Array.from(modesSet);
        try {
          const { data: prefRow } = await (supabase as any)
            .from("marketplace_integrations")
            .select("flex_enabled, envios_enabled, correios_enabled, full_enabled")
            .eq("organizations_id", organizationId)
            .eq("marketplace_name", "Mercado Livre")
            .order("expires_in", { ascending: false })
            .limit(1)
            .single();
          if (prefRow) {
            const filtered = new Set(modes);
            if (prefRow.full_enabled === false) {
              filtered.delete("fulfillment");
            }
            if (prefRow.correios_enabled === false) {
              filtered.delete("me1");
            }
            if (prefRow.envios_enabled === false) {
              filtered.delete("me2");
            }
            modes = Array.from(filtered);
          }
        } catch {}
        setShippingModesAvailable(modes);
        if (!shipping?.mode || !modes.includes(String((shipping as any)?.mode || ""))) {
          const preferred = modes.includes("me2") ? "me2" : (modes.includes("me1") ? "me1" : (modes[0] || ""));
          if (preferred) setShipping({ ...(shipping || {}), mode: preferred });
        }
      } catch {}
    };
    fetchShippingModes();
  }, [organizationId, siteId, currentStep]);

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
    if (domainSuggestions.length > 0) run();
  }, [domainSuggestions]);

  const canProceed = () => {
    if (currentStep === 1) return !!marketplaceSelection;
    if (currentStep === 2) return !!title && !!categoryId && !!condition;
    if (currentStep === 3) {
      const reqIds = new Set<string>(filteredAttrs.required.map((a: any) => String(a.id)));
      const filled = new Set<string>((attributes || []).map((a: any) => String(a.id)).filter(Boolean));
      const missing = Array.from(reqIds).filter((id) => !filled.has(id));
      return description.length > 0 && missing.length === 0;
    }
    if (currentStep === 6) {
      const ok = !!listingTypeId && !!price;
      const isGoldPro = String(listingTypeId || '').toLowerCase() === 'gold_pro';
      if (isGoldPro) {
        const hasAtLeastOneImage = (variations || []).some((v: any) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) || (pictures || []).length > 0;
        return ok && hasAtLeastOneImage;
      }
      return ok;
    }
    return true;
  };

  const nextStep = () => { if (currentStep < maxSteps && canProceed()) setCurrentStep(currentStep + 1); };
  const backStep = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  const handlePublish = async () => {
    if (!organizationId) { toast({ title: "Sessão necessária", description: "Entre na sua conta.", variant: "destructive" }); return; }
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
    const uploadVariationFiles: any[] = [];
    if ((variations || []).length > 0) {
      for (let i = 0; i < variations.length; i++) {
        const v = variations[i];
        const files = Array.isArray(v?.pictureFiles) ? v.pictureFiles : [];
        const arr: any[] = [];
        for (const f of files) {
          let toUpload = f;
          if (/^image\//.test(f.type)) { try { toUpload = await compressImage(f, 0.85, 1280); } catch {} }
          const b64 = await fileToBase64(toUpload);
          arr.push({ filename: toUpload.name, type: toUpload.type, data_b64: b64 });
          if (arr.length >= 10) break;
        }
        uploadVariationFiles.push(arr);
      }
    }
    const pictureUrls = variations.length > 0 ? [] : pictures;
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
      const sku = String(v?.seller_custom_field || '').trim();
      if (sku) obj.seller_custom_field = sku;
      const gtinVal = String(v?.gtin || '').trim();
      if (gtinVal) obj.attributes = [{ id: 'GTIN', value_name: gtinVal }];
      return obj;
    }) : [];
    if (hasVariations) {
      const invalid = (variations || []).find((v: any) => !Array.isArray(v?.attribute_combinations) || v.attribute_combinations.length === 0 || typeof v?.available_quantity !== "number" || v.available_quantity <= 0 || !(Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0));
      if (invalid) { toast({ title: "Dados de variação inválidos", description: "Cada variação precisa de atributos, quantidade e ao menos uma foto.", variant: "destructive" }); return; }
      if (!priceNum) { toast({ title: "Preço obrigatório", description: "Informe o preço para variações.", variant: "destructive" }); return; }
      if (Array.isArray(variationRequiredIds) && variationRequiredIds.length > 0) {
        const missingAny = sanitizedVariations.find((vv: any) => {
          const idsSet = new Set((vv?.attribute_combinations || []).map((c: any) => String(c?.id || "").toUpperCase()));
          return variationRequiredIds.some((rid) => !idsSet.has(String(rid || "").toUpperCase()));
        });
        if (missingAny) {
          const namesMap = new Map<string, string>();
          variationAttrs.forEach((a: any) => { namesMap.set(String(a?.id || "").toUpperCase(), String(a?.name || String(a?.id || ""))); });
          const reqNames = variationRequiredIds.map((id) => namesMap.get(String(id).toUpperCase()) || String(id)).join(", ");
          toast({ title: "Atributos de variação obrigatórios", description: `Informe: ${reqNames}`, variant: "destructive" });
          return;
        }
      }
    }
    const condId = condition === "new" ? "2230284" : (condition === "used" ? "2230581" : "");
    const condName = String(siteId).toUpperCase() === "MLB" ? (condition === "new" ? "Novo" : (condition === "used" ? "Usado" : condition)) : condition;
    const payload: any = {
      site_id: siteId,
      title,
      category_id: categoryId,
      currency_id: currencyId,
      attributes: [
        { id: "ITEM_CONDITION", ...(condId ? { value_id: condId } : {}), ...(condName ? { value_name: condName } : {}) },
        ...((attributes || []).filter((x: any) => String(x?.id || "").toUpperCase() !== "ITEM_CONDITION"))
      ],
      pictures: pictureUrls.slice(0, 6).map((url) => ({ source: url })),
    };
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
      payload.shipping = ship;
    }
    if (saleTerms.length > 0) payload.sale_terms = saleTerms;
    const { data, error } = await (supabase as any).functions.invoke("mercado-livre-publish-item", {
      body: { organizationId, payload, description: { plain_text: description }, upload_variation_files: uploadVariationFiles }
    });
    if (error || (data && (data as any)?.error)) {
      const msg = error?.message || ((data as any)?.meli?.message || (data as any)?.error || "Falha ao publicar");
      const cause = Array.isArray((data as any)?.meli?.cause) ? ((data as any)?.meli?.cause as any[]).map((c: any) => c?.message || c?.code || "").filter(Boolean).join("; ") : "";
      const desc = cause ? `${msg}: ${cause}` : msg;
      toast({ title: "Falha ao publicar", description: desc, variant: "destructive" });
      return;
    }
    toast({ title: "Anúncio publicado", description: `ID: ${data?.item_id || ""}` });
    navigate("/anuncios");
  };
  const runPredict = async () => {
    if (!organizationId) return;
    if (!title.trim()) return;
    try {
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
            <div className="p-6 max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Criar Anúncio</h1>
                  <p className="text-gray-600">Modo Mercado Livre</p>
                </div>
              </div>
              <StepIndicator steps={steps as any} currentStep={currentStep} />
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
                      <div className="flex items-center justify-between">
                        <Select value={siteId} onValueChange={setSiteId}>
                          <SelectTrigger className="w-32"><SelectValue placeholder="Site" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MLB">MLB</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        placeholder="Digite o título do produto"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select value={condition} onValueChange={setCondition}>
                          <SelectTrigger><SelectValue placeholder="Condição" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Novo</SelectItem>
                            <SelectItem value="used">Usado</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={runPredict}>Buscar categoria</Button>
                      </div>
                      <div className="space-y-2">
                        {categorySuggestions.length === 0 ? (
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
                            <Button variant="outline" onClick={() => setDumpOpen(true)}>NÃO ACHEI A CATEGORIA</Button>
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
                    </div>
                  )}
                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição em texto plano" className="min-h-[160px]" />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredAttrs.required.map((a: any) => {
                          const id = String(a?.id || "");
                          const name = String(a?.name || id || "Atributo");
                          const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                          const current = (attributes || []).find((x: any) => String(x?.id) === id);
                          if (String(a?.value_type || "").toLowerCase() === "number_unit") {
                            const allowed = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
                            const defUnit = String((a as any)?.default_unit || "");
                            const currNum = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "");
                            const currUnit = typeof (current as any)?.value_struct?.unit === "string" ? String((current as any).value_struct.unit) : (String((current as any)?.value_name || "").split(" ")[1] || defUnit);
                            return (
                              <div key={id} className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                            );
                          }
                          if (id === "BRAND") {
                            return (
                              <Input key={id} placeholder={name} value={String(current?.value_name || "")} onChange={(e) => {
                                const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                setAttributes([ ...next, { id, name, value_name: e.target.value } ]);
                              }} />
                            );
                          }
                          if (hasValues) {
                            return (
                              <Select key={id} value={String(current?.value_id || "")} onValueChange={(val) => {
                                const vname = a.values.find((v: any) => String(v?.id || "") === String(val))?.name || "";
                                const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                setAttributes([ ...next, { id, name, value_id: val, value_name: vname } ]);
                              }}>
                                <SelectTrigger><SelectValue placeholder={name} /></SelectTrigger>
                                <SelectContent>
                                  {a.values.map((v: any) => (
                                    <SelectItem key={String(v?.id || v?.name || Math.random())} value={String(v?.id || "")}>{String(v?.name || v?.value || v?.id || "")}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          }
                          return (
                            <Input key={id} placeholder={name} value={String(current?.value_name || "")} onChange={(e) => {
                              const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                              setAttributes([ ...next, { id, name, value_name: e.target.value } ]);
                            }} />
                          );
                        })}
                        <Select value={condition} onValueChange={setCondition}>
                          <SelectTrigger><SelectValue placeholder="Condição do item" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Novo</SelectItem>
                            <SelectItem value="used">Usado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {currentStep === 4 && (
                    <div className="space-y-4">
                      <div className="text-sm text-gray-700">Configure variações (opcional)</div>
                      <Button variant="outline" onClick={() => setVariations([...(variations || []), { attribute_combinations: [], available_quantity: 0, pictureFiles: [] }] )}>Adicionar variação</Button>
                      {(variations || []).map((v: any, idx: number) => (
                        <div key={idx} className="border rounded-lg p-4 bg-white space-y-3">
                          <div className="text-sm text-gray-700">Variação {idx + 1}</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {variationAttrs.map((a: any) => {
                              const id = String(a?.id || "");
                              const name = String(a?.name || id || "Atributo");
                              const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                              const currentCombo = (v?.attribute_combinations || []).find((c: any) => String(c?.id) === id);
                              if (hasValues) {
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
                                <Input key={id} placeholder={name} value={String(currentCombo?.value_name || "")} onChange={(e) => {
                                  const combos = (v?.attribute_combinations || []).filter((c: any) => String(c?.id) !== id);
                                  const nextVar = { ...v, attribute_combinations: [ ...combos, { id, name, value_name: e.target.value } ] };
                                  const buf = [...variations];
                                  buf[idx] = nextVar;
                                  setVariations(buf);
                                }} />
                              );
                            })}
                            <Input value={String(v?.available_quantity ?? "")} placeholder="Quantidade" onChange={(e) => {
                              const buf = [...variations];
                              buf[idx] = { ...v, available_quantity: Number(e.target.value) };
                              setVariations(buf);
                            }} />
                            <Input value={String(v?.seller_custom_field ?? "")} placeholder="SKU da variação" onChange={(e) => {
                              const buf = [...variations];
                              buf[idx] = { ...v, seller_custom_field: e.target.value };
                              setVariations(buf);
                            }} />
                            <Input value={String(v?.gtin ?? "")} placeholder="Código de barras (EAN/GTIN)" onChange={(e) => {
                              const buf = [...variations];
                              buf[idx] = { ...v, gtin: e.target.value };
                              setVariations(buf);
                            }} />
                            
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
                          <div className="flex justify-end">
                            <Button variant="outline" onClick={() => {
                              const buf = [...variations];
                              buf.splice(idx, 1);
                              setVariations(buf);
                            }}>Remover variação</Button>
                          </div>
                        </div>
                      ))}
                      
                    </div>
                  )}
                  {currentStep === 5 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredAttrs.tech.map((a: any) => {
                          const id = String(a?.id || "");
                          const name = String(a?.name || id || "Atributo");
                          const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                          const current = (attributes || []).find((x: any) => String(x?.id) === id);
                          if (String(a?.value_type || "").toLowerCase() === "number_unit") {
                            const allowed = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
                            const defUnit = String((a as any)?.default_unit || "");
                            const currNum = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "");
                            const currUnit = typeof (current as any)?.value_struct?.unit === "string" ? String((current as any).value_struct.unit) : (String((current as any)?.value_name || "").split(" ")[1] || defUnit);
                            return (
                              <div key={id} className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                            );
                          }
                          if (hasValues) {
                            return (
                              <Select key={id} value={String(current?.value_id || "")} onValueChange={(val) => {
                                const vname = a.values.find((v: any) => String(v?.id || "") === String(val))?.name || "";
                                const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                setAttributes([ ...next, { id, name, value_id: val, value_name: vname } ]);
                              }}>
                                <SelectTrigger><SelectValue placeholder={name} /></SelectTrigger>
                                <SelectContent>
                                  {a.values.map((v: any) => (
                                    <SelectItem key={String(v?.id || v?.name || Math.random())} value={String(v?.id || "")}>{String(v?.name || v?.value || v?.id || "")}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          }
                          return (
                            <Input key={id} placeholder={name} value={String(current?.value_name || "")} onChange={(e) => {
                              const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                              setAttributes([ ...next, { id, name, value_name: e.target.value } ]);
                            }} />
                          );
                        })}
                      </div>
                      
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço" />
                        <Select value={listingTypeId} onValueChange={setListingTypeId}>
                          <SelectTrigger><SelectValue placeholder="Tipo de publicação" /></SelectTrigger>
                          <SelectContent>
                            {(Array.isArray(listingTypes) ? listingTypes : []).map((t: any) => {
                              const id = String(t?.id || t);
                              const name = String(t?.name || t?.listing_type_name || id);
                              return <SelectItem key={id} value={id}>{name}</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {wType ? (
                              <Select value={String(currentType?.value_id || "")} onValueChange={(val) => {
                                const vname = ((wType?.values || []) as any[]).find((v: any) => String(v?.id || "") === String(val))?.name || String(val || "");
                                const next = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TYPE");
                                setSaleTerms([ ...next, { id: "WARRANTY_TYPE", value_id: val, value_name: vname } ]);
                              }}>
                                <SelectTrigger><SelectValue placeholder="Tipo de garantia" /></SelectTrigger>
                                <SelectContent>
                                  {(Array.isArray(wType?.values) ? wType.values : []).map((v: any) => (
                                    <SelectItem key={String(v?.id || v?.name || Math.random())} value={String(v?.id || "")}>{String(v?.name || v?.value || v?.id || "")}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                            {wTime ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input value={String(currentTimeNumber || "")} placeholder="Tempo de garantia" onChange={(e) => {
                                  const num = e.target.value;
                                  const unit = currentTimeUnit || String((wTime as any)?.default_unit || "");
                                  const next = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TIME");
                                  const n = Number(num) || 0;
                                  const name = unit ? `${n} ${unit}` : String(n);
                                  setSaleTerms([ ...next, { id: "WARRANTY_TIME", value_name: name, value_struct: { number: n, unit } } ]);
                                }} />
                                <Select value={String(currentTimeUnit || (wTime as any)?.default_unit || "")} onValueChange={(val) => {
                                  const unit = String(val || (wTime as any)?.default_unit || "");
                                  const prev = (saleTerms || []).find((s: any) => String(s?.id || "") === "WARRANTY_TIME");
                                  const numStr = typeof (prev as any)?.value_struct?.number === "number" ? String((prev as any).value_struct.number) : (String((prev as any)?.value_name || "").split(" ")[0] || "");
                                  const n = Number(numStr) || 0;
                                  const name = unit ? `${n} ${unit}` : String(n);
                                  const next = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TIME");
                                  setSaleTerms([ ...next, { id: "WARRANTY_TIME", value_name: name, value_struct: { number: n, unit } } ]);
                                }}>
                                  <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                                  <SelectContent>
                                    {(Array.isArray(wTime?.allowed_units) ? wTime.allowed_units : []).map((u: any) => (
                                      <SelectItem key={String(u?.id || u?.name || Math.random())} value={String(u?.id || "")}>{String(u?.name || u?.id || "")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(() => {
                          const sel = (listingPriceOptions || []).find((p: any) => String(p?.listing_type_id || "") === String(listingTypeId || ""));
                          if (!sel) return null;
                          const currency = String(sel?.currency_id || currencyId || "BRL");
                          const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
                          const commission = typeof sel?.sale_fee_amount === "number" ? sel.sale_fee_amount : (typeof sel?.selling_fee_amount === "number" ? sel.selling_fee_amount : (typeof sel?.sale_fee_details?.gross_amount === "number" ? sel.sale_fee_details.gross_amount : 0));
                          const listingFee = typeof sel?.listing_fee_amount === "number" ? sel.listing_fee_amount : (typeof sel?.listing_fee_details?.gross_amount === "number" ? sel.listing_fee_details.gross_amount : 0);
                          const total = Number(commission || 0) + Number(listingFee || 0);
                          return (
                            <div className="border rounded-lg p-4 bg-white">
                              <div className="text-sm text-gray-700">Custos estimados</div>
                              <div className="mt-2 text-sm text-gray-900">Comissão: {fmt.format(commission || 0)}</div>
                              <div className="mt-1 text-sm text-gray-900">Taxa de publicação: {fmt.format(listingFee || 0)}</div>
                              <div className="mt-2 font-semibold">Total: {fmt.format(total || 0)}</div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                  {currentStep === 7 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select value={String((shipping as any)?.mode || "")} onValueChange={(val) => setShipping({ ...(shipping || {}), mode: val })}>
                          <SelectTrigger><SelectValue placeholder="Modo de envio" /></SelectTrigger>
                          <SelectContent>
                            {(shippingModesAvailable || []).map((m) => (
                              <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={String((shipping as any)?.package_type || "")} onValueChange={(val) => setShipping({ ...(shipping || {}), package_type: val })}>
                          <SelectTrigger><SelectValue placeholder="Tipo da embalagem do vendor" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="box">Caixa</SelectItem>
                            <SelectItem value="envelope">Envelope</SelectItem>
                            <SelectItem value="tube">Tubo</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center space-x-3">
                          <label className="flex items-center space-x-2">
                            <Checkbox checked={!!(shipping as any)?.free_shipping} onCheckedChange={(v) => setShipping({ ...(shipping || {}), free_shipping: !!v })} />
                            <span className="text-sm">Frete grátis</span>
                          </label>
                          <label className="flex items-center space-x-2">
                            <Checkbox checked={!!(shipping as any)?.local_pick_up} onCheckedChange={(v) => setShipping({ ...(shipping || {}), local_pick_up: !!v })} />
                            <span className="text-sm">Retirada local</span>
                          </label>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input type="number" step="1" min="1" placeholder="Peso da embalagem do vendor (g)" onChange={(e) => setShipping({ ...(shipping || {}), weight: Number(e.target.value) })} />
                        <Input type="number" step="1" min="1" placeholder="Altura da embalagem do vendor (cm)" onChange={(e) => {
                          const dims = (shipping as any)?.dimensions || {};
                          setShipping({ ...(shipping || {}), dimensions: { ...dims, height: Number(e.target.value) || 0 } })
                        }} />
                        <Input type="number" step="1" min="1" placeholder="Largura da embalagem do vendor (cm)" onChange={(e) => {
                          const dims = (shipping as any)?.dimensions || {};
                          setShipping({ ...(shipping || {}), dimensions: { ...dims, width: Number(e.target.value) || 0 } })
                        }} />
                        <Input type="number" step="1" min="1" placeholder="Comprimento da embalagem do vendor (cm)" onChange={(e) => {
                          const dims = (shipping as any)?.dimensions || {};
                          setShipping({ ...(shipping || {}), dimensions: { ...dims, length: Number(e.target.value) || 0 } })
                        }} />
                        
                      </div>
                    </div>
                  )}
                  {currentStep === 8 && (
                    <div className="space-y-4">
                      <div className="text-sm text-gray-700">Revise os dados e publique</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input value={title} readOnly />
                        <Input value={categoryId} readOnly />
                        <Input value={listingTypeId} readOnly />
                        <Input value={price} readOnly />
                      </div>
                      <div className="flex justify-end">
                        <Button className="bg-novura-primary hover:bg-novura-primary/90" onClick={handlePublish}>PUBLICAR</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="mt-4">
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
                onSave={nextStep}
                canProceedExternal={canProceed}
              />
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}