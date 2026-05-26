// Server-side paginated product list hook (T08)
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ProductsListParams {
  type: 'UNICO' | 'VARIACAO_PAI' | 'KIT';
  search?: string;
  categoryIds?: string[];
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export interface ProductListItem {
  id: string;
  name: string;
  sku: string;
  type: string;
  cost_price: number;
  sell_price: number | null;
  image_urls: string[];
  product_images?: Array<{
    public_url: string;
    is_cover: boolean;
    position: number;
    created_at: string;
    deleted_at: string | null;
  }>;
  category_id: string | null;
  categories: { id: string; name: string } | null;
  products_stock: Array<{
    current: number;
    reserved: number;
    in_transit: number;
    storage: { id: string; name: string } | null;
  }>;
  totalStock: number;
  created_at: string;
}

export interface UseProductsListResult {
  products: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

const STALE_TIME = 2 * 60 * 1000; // 2 minutes for listings

export function useProductsList(params: ProductsListParams): UseProductsListResult {
  const { organizationId } = useAuth();
  const {
    type,
    search = '',
    categoryIds = [],
    page = 1,
    pageSize = 20,
    orderBy = 'name',
    orderDir = 'asc',
  } = params;

  const queryKey = ['products-list', type, search, categoryIds, page, pageSize, orderBy, orderDir, organizationId];

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!organizationId) return { data: [], count: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('products')
        .select(
          `
          id, name, sku, type, cost_price, sell_price,
          image_urls, category_id, created_at,
          product_images (public_url, is_cover, position, created_at, deleted_at),
          categories (id, name),
          products_stock (
            current, reserved, in_transit,
            storage (id, name)
          )
        `,
          { count: 'exact' }
        )
        .eq('organizations_id', organizationId)
        .eq('type', type)
        .is('deleted_at', null)
        .order(orderBy, { ascending: orderDir === 'asc' })
        .range(from, to);

      // Server-side search
      if (search && search.trim().length > 0) {
        query = query.or(`name.ilike.%${search.trim()}%,sku.ilike.%${search.trim()}%`);
      }

      // Category filter
      if (categoryIds.length > 0) {
        query = query.in('category_id', categoryIds);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const mapped: ProductListItem[] = (data ?? []).map((p: any) => {
        const stockRows = Array.isArray(p.products_stock) ? p.products_stock : [];
        const totalStock = stockRows.reduce((sum: number, s: any) => sum + (s.current || 0), 0);
        const validImageUrls = Array.isArray(p.image_urls)
          ? p.image_urls.filter((url: string) => typeof url === 'string' && /^https?:\/\//i.test(url))
          : [];
        const productImages = Array.isArray(p.product_images)
          ? p.product_images
              .filter((img: any) => !img?.deleted_at && typeof img?.public_url === 'string')
              .sort((a: any, b: any) => {
                if ((a?.is_cover ? 1 : 0) !== (b?.is_cover ? 1 : 0)) {
                  return (b?.is_cover ? 1 : 0) - (a?.is_cover ? 1 : 0);
                }
                if ((a?.position ?? 0) !== (b?.position ?? 0)) {
                  return (a?.position ?? 0) - (b?.position ?? 0);
                }
                return String(a?.created_at ?? '').localeCompare(String(b?.created_at ?? ''));
              })
          : [];
        const mergedImages = Array.from(
          new Set([
            ...(productImages[0]?.public_url ? [productImages[0].public_url] : []),
            ...validImageUrls,
          ])
        );
        return { ...p, image_urls: mergedImages, totalStock };
      });

      return { data: mapped, count: count ?? 0 };
    },
    enabled: !!organizationId,
    staleTime: STALE_TIME,
    placeholderData: (prev) => prev,
  });

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    products: data?.data ?? [],
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    isError,
    error: error as Error | null,
  };
}
