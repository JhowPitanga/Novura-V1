import { supabase } from "@/integrations/supabase/client";
import { getCompanyIdForOrg } from "./supabase-helpers";
import type { Tables } from "@/integrations/supabase/types";

export type Storage = Tables<"storage">;

interface ProductFromDB {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
  sell_price?: number;
  image_urls: string[];
  type?: "UNICO" | "VARIACAO_ITEM" | string;
  parent_product_id?: string | null;
  category_id?: string | null;
  categories?: { id: string; name: string } | null;
  products_stock:
    | Array<{
        id: number;
        storage_id: string;
        current: number;
        reserved?: number;
        in_transit?: number;
        storage: { name: string; organizations_id?: string } | null;
      }>
    | {
        id: number;
        storage_id: string;
        current: number;
        reserved?: number;
        in_transit?: number;
        storage: { name: string; organizations_id?: string } | null;
      }
    | null;
}

export interface FormattedProductStockData extends ProductFromDB {
  total_current_stock: number;
  total_reserved_stock: number;
  total_available_stock: number;
  parent_product_name?: string | null;
  stock_by_location: Array<{
    stock_id: number;
    storage_name: string;
    storage_id: string;
    current: number;
    reserved: number;
    in_transit: number;
    available: number;
  }>;
}

export async function fetchProductsWithDetailedStock(
  userId?: string,
  organizationId?: string
): Promise<FormattedProductStockData[]> {
  try {
    let query = supabase
      .from("products")
      .select(
        `
        id,
        name,
        sku,
        cost_price,
        sell_price,
        image_urls,
        type,
        parent_id,
        category_id,
        categories (
          id,
          name
        ),
        products_stock (
          id,
          storage_id,
          current,
          reserved,
          in_transit,
          storage (
            name,
            organizations_id
          )
        )
      `
      )
      .in("type", ["UNICO", "VARIACAO_ITEM"]);

    if (organizationId) {
      const companyId = await getCompanyIdForOrg(organizationId);
      if (companyId) {
        query = query.eq("company_id", companyId);
      } else if (userId) {
        query = query.eq("user_id", userId);
      }
    } else if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: productsData, error: productsError } = await query;

    if (productsError) throw productsError;

    const parentIds = Array.from(
      new Set(
        ((productsData || []) as any[])
          .filter((p: any) => p.type === "VARIACAO_ITEM" && p.parent_id)
          .map((p: any) => String(p.parent_id))
      )
    ) as string[];

    const parentNameMap = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: parents, error: parentsError } = await supabase
        .from("products")
        .select("id, name")
        .in("id", parentIds);
      if (!parentsError && parents) {
        (parents as any[]).forEach((pp) => {
          if (pp?.id) parentNameMap.set(pp.id, pp.name);
        });
      }
    }

    return ((productsData || []) as ProductFromDB[]).map((product) => {
      const rawStockData = product.products_stock;
      let stockArray = rawStockData
        ? Array.isArray(rawStockData)
          ? rawStockData
          : [rawStockData]
        : [];

      if (organizationId) {
        stockArray = stockArray.filter(
          (s: any) => s?.storage?.organizations_id === organizationId
        );
      }

      const totalCurrent = stockArray.reduce(
        (sum, stock) => sum + (stock.current || 0),
        0
      );
      const totalReserved = stockArray.reduce(
        (sum, stock) => sum + (stock.reserved || 0),
        0
      );

      return {
        ...product,
        total_current_stock: totalCurrent,
        total_reserved_stock: totalReserved,
        total_available_stock: totalCurrent - totalReserved,
        parent_product_name:
          product.type === "VARIACAO_ITEM"
            ? parentNameMap.get(
                String((product as any).parent_id || "")
              ) || null
            : null,
        category_name: product.categories?.name ?? null,
        stock_by_location: stockArray.map((stock) => ({
          stock_id: stock.id,
          storage_name: stock.storage?.name || "Armazém Desconhecido",
          storage_id: stock.storage_id,
          current: stock.current || 0,
          reserved: stock.reserved || 0,
          in_transit: stock.in_transit || 0,
          available: (stock.current || 0) - (stock.reserved || 0),
        })),
      };
    }) as FormattedProductStockData[];
  } catch (err) {
    console.error("Error in fetchProductsWithDetailedStock:", err);
    return [];
  }
}

export async function fetchStorageLocations(
  organizationId?: string | null
): Promise<Storage[]> {
  let query = supabase
    .from("storage")
    .select("*")
    .eq("active", true)
    .order("name");

  if (organizationId) {
    query = query.eq("organizations_id", organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
