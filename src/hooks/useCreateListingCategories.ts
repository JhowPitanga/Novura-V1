import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  loadCategoryRoots,
  loadCategoryChildren,
  getCategoryPath,
  predictCategoriesML,
  predictCategoriesShopee,
} from "@/services/create-listing.service";
import type { CategorySuggestion, DomainSuggestion } from "@/types/create-listing";

interface UseCreateListingCategoriesParams {
  organizationId: string | null | undefined;
  siteId: string;
  isShopeeMode: boolean;
  categoryId: string;
  setCategoryId: (id: string) => void;
  title: string;
  currentStep: number;
}

interface UseCreateListingCategoriesResult {
  // Predictions
  categorySuggestions: CategorySuggestion[];
  domainSuggestions: DomainSuggestion[];
  hasSearchedCategory: boolean;
  isLoadingPredict: boolean;
  runPredict: () => Promise<void>;
  // Picker dialog
  dumpOpen: boolean;
  setDumpOpen: (v: boolean) => void;
  dumpLoading: boolean;
  dumpQuery: string;
  setDumpQuery: (q: string) => void;
  dumpRoots: Array<{ id: string; name: string }>;
  dumpSelected: any[];
  pendingCategoryId: string;
  pendingCategoryName: string;
  pathsByCategoryId: Record<string, string>;
  shopeeCategoriesRaw: any[];
  getColumnItems: (level: number) => any[];
  handleSelectLevel: (level: number, item: any) => void;
  handleBreadcrumbClick: (index: number) => void;
  confirmPickerCategory: () => Promise<void>;
  cancelPicker: () => void;
}

export function useCreateListingCategories({
  organizationId,
  siteId,
  isShopeeMode,
  categoryId,
  setCategoryId,
  title,
  currentStep,
}: UseCreateListingCategoriesParams): UseCreateListingCategoriesResult {
  const { toast } = useToast();

  // Prediction state
  const [categorySuggestions, setCategorySuggestions] = useState<CategorySuggestion[]>([]);
  const [domainSuggestions, setDomainSuggestions] = useState<DomainSuggestion[]>([]);
  const [hasSearchedCategory, setHasSearchedCategory] = useState(false);
  const [isLoadingPredict, setIsLoadingPredict] = useState(false);

  // Picker dialog state
  const [dumpOpen, setDumpOpen] = useState(false);
  const [dumpLoading, setDumpLoading] = useState(false);
  const [dumpQuery, setDumpQuery] = useState("");
  const [dumpRoots, setDumpRoots] = useState<Array<{ id: string; name: string }>>([]);
  const [dumpChildrenById, setDumpChildrenById] = useState<Record<string, any[]>>({});
  const [dumpSelected, setDumpSelected] = useState<any[]>([]);
  const [pendingCategoryId, setPendingCategoryId] = useState("");
  const [pendingCategoryName, setPendingCategoryName] = useState("");
  const [pathsByCategoryId, setPathsByCategoryId] = useState<Record<string, string>>({});
  const [shopeeCategoriesRaw, setShopeeCategoriesRaw] = useState<any[]>([]);

  // Load roots when picker opens
  useEffect(() => {
    if (!dumpOpen || dumpRoots.length > 0) return;
    const run = async () => {
      setDumpLoading(true);
      try {
        const result = await loadCategoryRoots(siteId, isShopeeMode, String(organizationId || ""));
        setDumpRoots(result.roots);
        if (result.shopeeCategoriesRaw) setShopeeCategoriesRaw(result.shopeeCategoriesRaw);
      } catch {
        setDumpRoots([]);
      } finally {
        setDumpLoading(false);
      }
    };
    run();
  }, [dumpOpen, siteId, isShopeeMode, organizationId]);

  // Load paths for domain suggestions
  useEffect(() => {
    if (domainSuggestions.length === 0 || currentStep !== 2) return;
    const run = async () => {
      const ids = domainSuggestions.map((d: any) => String(d?.category_id || "")).filter(Boolean);
      const unique = Array.from(new Set(ids)).filter((id) => !pathsByCategoryId[id]);
      for (const id of unique) {
        try {
          const res = await fetch(`https://api.mercadolibre.com/categories/${id}`);
          const data = await res.json();
          const pathArr = Array.isArray((data as any)?.path_from_root) ? (data as any).path_from_root : [];
          const fullPath = pathArr.map((p: any) => String(p?.name || "")).filter(Boolean).join(" › ");
          if (fullPath) setPathsByCategoryId((prev) => ({ ...prev, [id]: fullPath }));
        } catch { }
      }
    };
    run();
  }, [domainSuggestions, currentStep]);

  const loadChildren = async (id: string): Promise<any[]> => {
    const result = await loadCategoryChildren(id, isShopeeMode, shopeeCategoriesRaw);
    setDumpChildrenById((prev) => ({ ...prev, [id]: result.children }));
    if (result.pathById) setPathsByCategoryId((prev) => ({ ...prev, ...result.pathById }));
    return result.children;
  };

  const getColumnItems = (level: number): any[] => {
    const q = dumpQuery.trim().toLowerCase();
    if (level === 0) {
      return dumpRoots.filter((it) => !q || String(it?.name || "").toLowerCase().includes(q));
    }
    const parent = dumpSelected[level - 1];
    if (!parent) return [];
    const items = dumpChildrenById[parent.id] || [];
    return items.filter((it: any) => !q || String(it?.name || "").toLowerCase().includes(q));
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
    setDumpSelected((prev) => prev.slice(0, index + 1));
    setPendingCategoryId("");
    setPendingCategoryName("");
  };

  const confirmPickerCategory = async () => {
    if (!pendingCategoryId) return;
    // Build path before navigating away
    try {
      if (isShopeeMode) {
        const path = [...dumpSelected.map((s: any) => String(s?.name || "")), pendingCategoryName].filter(Boolean).join(" › ");
        if (path) setPathsByCategoryId((prev) => ({ ...prev, [pendingCategoryId]: path }));
      } else {
        const fullPath = await getCategoryPath(pendingCategoryId, siteId);
        if (fullPath) setPathsByCategoryId((prev) => ({ ...prev, [pendingCategoryId]: fullPath }));
      }
    } catch { }
    setCategoryId(pendingCategoryId);
    setDomainSuggestions([]);
    setDumpSelected([]);
    setPendingCategoryId("");
    setPendingCategoryName("");
    setDumpOpen(false);
  };

  const cancelPicker = () => {
    setDumpSelected([]);
    setPendingCategoryId("");
    setPendingCategoryName("");
    setDumpOpen(false);
  };

  const runPredict = async () => {
    if (!organizationId || !title.trim()) return;
    setIsLoadingPredict(true);
    setHasSearchedCategory(true);
    try {
      if (isShopeeMode) {
        const result = await predictCategoriesShopee(String(organizationId), title);
        if (!result.ok && result.errorCode) {
          const map: Record<string, string> = {
            error_param: "Parâmetros inválidos ou ausentes.",
            error_auth: "Falha de autenticação.",
            error_sign: "Assinatura inválida.",
            error_network: "Falha de rede interna.",
            error_data: "Erro ao processar dados.",
            error_server: "Erro no servidor Shopee.",
            error_shop: "Shop ID inválido.",
            error_inner: "Sistema da Shopee indisponível.",
            error_item_not_found: "Produto não encontrado.",
            error_system_busy: "Sistema ocupado, tente novamente.",
            error_image_unavailable: "Imagem indisponível.",
            error_param_shop_id_not_found: "Shop_id não encontrado.",
          };
          const c = String(result.errorCode).toLowerCase();
          const base = map[c] || "Erro na API Shopee.";
          const friendly = result.errorMessage ? `${base} ${result.errorMessage}` : base;
          toast({ title: "Falha ao buscar categorias", description: friendly, variant: "destructive" });
        }
        if (result.shopeeCategoriesRaw.length > 0) setShopeeCategoriesRaw(result.shopeeCategoriesRaw);
        if (result.roots.length > 0) setDumpRoots(result.roots);
        setCategorySuggestions(result.suggestions as any);
        setDomainSuggestions([]);
      } else {
        const result = await predictCategoriesML(String(organizationId), title, siteId);
        setCategorySuggestions(result.suggestions as any);
        setDomainSuggestions(result.domainSuggestions as any);
      }
    } catch (e: any) {
      toast({ title: "Erro no preditor", description: e?.message || String(e), variant: "destructive" });
      setCategorySuggestions([]);
      setDomainSuggestions([]);
    } finally {
      setIsLoadingPredict(false);
    }
  };

  return {
    categorySuggestions,
    domainSuggestions,
    hasSearchedCategory,
    isLoadingPredict,
    runPredict,
    dumpOpen,
    setDumpOpen,
    dumpLoading,
    dumpQuery,
    setDumpQuery,
    dumpRoots,
    dumpSelected,
    pendingCategoryId,
    pendingCategoryName,
    pathsByCategoryId,
    shopeeCategoriesRaw,
    getColumnItems,
    handleSelectLevel,
    handleBreadcrumbClick,
    confirmPickerCategory,
    cancelPicker,
  };
}
