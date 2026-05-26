import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { resolveAdapter } from '@/adapters/listings/resolveAdapter';
import type { MarketplaceAdapter } from '@/adapters/listings/types';

interface UseCreateListingCategoriesBase {
  organizationId: string | null | undefined;
  siteId: string;
  categoryId: string;
  setCategoryId: (id: string) => void;
  title: string;
  currentStep: number;
}

/** New flow: pass adapter directly. */
export type UseCreateListingCategoriesParams =
  | (UseCreateListingCategoriesBase & { adapter: MarketplaceAdapter })
  | (UseCreateListingCategoriesBase & { isShopeeMode: boolean });

interface UseCreateListingCategoriesResult {
  categorySuggestions: any[];
  domainSuggestions: any[];
  hasSearchedCategory: boolean;
  isLoadingPredict: boolean;
  runPredict: () => Promise<void>;
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

const SHOPEE_ERROR_MAP: Record<string, string> = {
  error_param: 'Parâmetros inválidos ou ausentes.',
  error_auth: 'Falha de autenticação.',
  error_sign: 'Assinatura inválida.',
  error_network: 'Falha de rede interna.',
  error_data: 'Erro ao processar dados.',
  error_server: 'Erro no servidor Shopee.',
  error_shop: 'Shop ID inválido.',
  error_inner: 'Sistema da Shopee indisponível.',
  error_item_not_found: 'Produto não encontrado.',
  error_system_busy: 'Sistema ocupado, tente novamente.',
  error_image_unavailable: 'Imagem indisponível.',
  error_param_shop_id_not_found: 'Shop_id não encontrado.',
};

export function useCreateListingCategories(
  params: UseCreateListingCategoriesParams,
): UseCreateListingCategoriesResult {
  const {
    organizationId,
    siteId,
    categoryId,
    setCategoryId,
    title,
    currentStep,
  } = params;

  const adapter = useMemo(() => {
    if ('adapter' in params && params.adapter) return params.adapter;
    const slug = params.isShopeeMode ? 'shopee' : 'mercado-livre';
    return resolveAdapter(slug)!;
  }, [params]);

  const { toast } = useToast();
  const isShopee = adapter.channel === 'shopee';

  const [categorySuggestions, setCategorySuggestions] = useState<any[]>([]);
  const [domainSuggestions, setDomainSuggestions] = useState<any[]>([]);
  const [hasSearchedCategory, setHasSearchedCategory] = useState(false);
  const [isLoadingPredict, setIsLoadingPredict] = useState(false);

  const [dumpOpen, setDumpOpen] = useState(false);
  const [dumpLoading, setDumpLoading] = useState(false);
  const [dumpQuery, setDumpQuery] = useState('');
  const [dumpRoots, setDumpRoots] = useState<Array<{ id: string; name: string }>>([]);
  const [dumpChildrenById, setDumpChildrenById] = useState<Record<string, any[]>>({});
  const [dumpSelected, setDumpSelected] = useState<any[]>([]);
  const [pendingCategoryId, setPendingCategoryId] = useState('');
  const [pendingCategoryName, setPendingCategoryName] = useState('');
  const [pathsByCategoryId, setPathsByCategoryId] = useState<Record<string, string>>({});
  const [shopeeCategoriesRaw, setShopeeCategoriesRaw] = useState<any[]>([]);

  // Load roots when picker opens (via adapter)
  useEffect(() => {
    if (!dumpOpen || dumpRoots.length > 0 || !organizationId) return;
    const run = async () => {
      setDumpLoading(true);
      try {
        const result = await adapter.loadCategoryRoots(String(organizationId), {
          shopeeCategoriesRaw,
        });
        setDumpRoots(result.roots);
        if (result.shopeeCategoriesRaw?.length) {
          setShopeeCategoriesRaw(result.shopeeCategoriesRaw);
        }
      } catch {
        setDumpRoots([]);
      } finally {
        setDumpLoading(false);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dumpOpen, organizationId, adapter]);

  // Load paths for ML domain suggestions
  useEffect(() => {
    if (domainSuggestions.length === 0 || currentStep !== 2 || isShopee) return;
    const run = async () => {
      const ids = domainSuggestions
        .map((d: any) => String(d?.category_id || ''))
        .filter(Boolean);
      const unique = Array.from(new Set(ids)).filter((id) => !pathsByCategoryId[id]);
      for (const id of unique) {
        try {
          const res = await fetch(`https://api.mercadolibre.com/categories/${id}`);
          const data = await res.json();
          const pathArr = Array.isArray(data?.path_from_root) ? data.path_from_root : [];
          const fullPath = pathArr.map((p: any) => String(p?.name || '')).filter(Boolean).join(' › ');
          if (fullPath) setPathsByCategoryId((prev) => ({ ...prev, [id]: fullPath }));
        } catch {
          /* ignore */
        }
      }
    };
    run();
  }, [domainSuggestions, currentStep, isShopee, pathsByCategoryId]);

  const loadChildren = async (id: string): Promise<any[]> => {
    const result = await adapter.loadCategoryChildren(String(organizationId || ''), id, {
      shopeeCategoriesRaw,
    });
    setDumpChildrenById((prev) => ({ ...prev, [id]: result.children }));
    if (result.pathById) setPathsByCategoryId((prev) => ({ ...prev, ...result.pathById }));
    return result.children;
  };

  const getColumnItems = (level: number): any[] => {
    const q = dumpQuery.trim().toLowerCase();
    if (level === 0) {
      return dumpRoots.filter((it) => !q || String(it?.name || '').toLowerCase().includes(q));
    }
    const parent = dumpSelected[level - 1];
    if (!parent) return [];
    const items = dumpChildrenById[parent.id] || [];
    return items.filter((it: any) => !q || String(it?.name || '').toLowerCase().includes(q));
  };

  const handleSelectLevel = async (level: number, item: any) => {
    const next = [...dumpSelected].slice(0, level);
    next[level] = item;
    setDumpSelected(next);
    const children = await loadChildren(String(item?.id || ''));
    if (!children || children.length === 0) {
      setPendingCategoryId(String(item?.id || ''));
      setPendingCategoryName(String(item?.name || ''));
    } else {
      setPendingCategoryId('');
      setPendingCategoryName('');
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    setDumpSelected((prev) => prev.slice(0, index + 1));
    setPendingCategoryId('');
    setPendingCategoryName('');
  };

  const confirmPickerCategory = async () => {
    if (!pendingCategoryId) return;
    try {
      if (isShopee) {
        const path = [...dumpSelected.map((s: any) => String(s?.name || '')), pendingCategoryName]
          .filter(Boolean)
          .join(' › ');
        if (path) setPathsByCategoryId((prev) => ({ ...prev, [pendingCategoryId]: path }));
      } else {
        const fullPath = await adapter.getCategoryPath(
          String(organizationId || ''),
          pendingCategoryId,
        );
        if (fullPath) setPathsByCategoryId((prev) => ({ ...prev, [pendingCategoryId]: fullPath }));
      }
    } catch {
      /* ignore */
    }
    setCategoryId(pendingCategoryId);
    setDomainSuggestions([]);
    setDumpSelected([]);
    setPendingCategoryId('');
    setPendingCategoryName('');
    setDumpOpen(false);
  };

  const cancelPicker = () => {
    setDumpSelected([]);
    setPendingCategoryId('');
    setPendingCategoryName('');
    setDumpOpen(false);
  };

  const runPredict = async () => {
    if (!organizationId || !title.trim()) return;
    setIsLoadingPredict(true);
    setHasSearchedCategory(true);
    try {
      const result = await adapter.predictCategories(String(organizationId), title);

      if (isShopee && result.ok === false && result.errorCode) {
        const c = String(result.errorCode).toLowerCase();
        const base = SHOPEE_ERROR_MAP[c] || 'Erro na API Shopee.';
        const friendly = result.errorMessage ? `${base} ${result.errorMessage}` : base;
        toast({ title: 'Falha ao buscar categorias', description: friendly, variant: 'destructive' });
      }

      if (result.shopeeCategoriesRaw?.length) {
        setShopeeCategoriesRaw(result.shopeeCategoriesRaw);
      }
      if (result.roots?.length) {
        setDumpRoots(result.roots);
      }

      setCategorySuggestions(result.suggestions as any);
      setDomainSuggestions(result.domainSuggestions as any);
    } catch (e: any) {
      toast({
        title: 'Erro no preditor',
        description: e?.message || String(e),
        variant: 'destructive',
      });
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
