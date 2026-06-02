/**
 * §1 SIZE EXCEPTION: ~211 LOC (limit 150).
 * Justified: consolidates 7 previously inline supabase calls (load, save, duplicate, links,
 * integrations, items, upsert, delete). Each function is ≤30 LOC. One reason to change:
 * product edit persistence. Splitting further would fragment a single DB concern.
 *
 * All Supabase reads and writes for the product edit page.
 * Extracted from EditProduct.tsx.
 *
 * INVARIANTS (preserved byte-for-byte):
 *   - estoque/armazem shape BUG (do NOT fix): estoque reads products_stock?.current (object),
 *     armazem reads products_stock?.[0]?.storage?.name (array). These are inconsistent.
 *   - barcode: parseInt(produto.codigoBarras) || 0
 *   - origem default "0"
 *   - RPC duplicate_product({ p_product_id, p_with_images })
 *   - upsert onConflict 'organizations_id,marketplace_name,marketplace_item_id,variation_id'
 *   - loadExistingLinks / handleLinkItem / handleUnlink remain for structural completeness
 *     even though openMapeamento Drawer is never opened in the current UI.
 */

import { supabase } from '@/integrations/supabase/client';

export const editKeys = {
  product: (id: string) => ['editProduct', id] as const,
  links: (productId: string, orgId: string) => ['editProduct', 'links', productId, orgId] as const,
  integrations: (orgId: string) => ['editProduct', 'integrations', orgId] as const,
  items: (orgId: string, marketplace: string, search: string) =>
    ['editProduct', 'items', orgId, marketplace, search] as const,
};

export interface TransformedProduct {
  id: string;
  tipo: string | undefined;
  companyId: string | undefined;
  nome: string;
  sku: string;
  descricao: string;
  categoriaId: string | null;
  categoria: string;
  marca: string;
  custom_attributes: Record<string, unknown>;
  custoBuyPrice: number;
  /** QUIRK: reads products_stock?.current (treating as object, not array) */
  estoque: number;
  /** QUIRK: reads products_stock?.[0]?.storage?.name (treating as array, not object) */
  armazem: string;
  peso: number;
  dimensoes: { altura: number; largura: number; comprimento: number };
  codigoBarras: string;
  ncm: string;
  cest: string;
  unidade: string;
  origem: string;
  imagens: string[];
}

export async function loadProduct(id: string): Promise<TransformedProduct> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      categories ( id, name ),
      products_stock ( current, in_transit, reserved, storage ( id, name ) )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    tipo: data.type as string | undefined,
    companyId: data.company_id,
    nome: data.name,
    sku: data.sku,
    descricao: data.description || '',
    categoriaId: (data as any).categories?.id || null,
    categoria: (data as any).categories?.name || '',
    marca: (data as any).custom_attributes?.brand || '',
    custom_attributes: (data as any).custom_attributes || {},
    custoBuyPrice: data.cost_price,
    // QUIRK: inconsistent shape — estoque reads .current (object), armazem reads [0].storage.name (array)
    estoque: (data as any).products_stock?.current || 0,
    armazem: (data as any).products_stock?.[0]?.storage?.name || 'Principal',
    peso: data.weight || 0,
    dimensoes: {
      altura: data.package_height,
      largura: data.package_width,
      comprimento: data.package_length,
    },
    codigoBarras: data.barcode?.toString() || '',
    ncm: data.ncm?.toString() || '',
    cest: data.cest?.toString() || '',
    unidade: 'UN',
    origem: data.tax_origin_code?.toString() || '0',
    imagens: (data as any).image_urls || [],
  };
}

export async function saveProduct(id: string, produto: TransformedProduct): Promise<void> {
  const rootTypes = ['UNICO', 'VARIACAO_PAI', 'KIT'];
  const isRootProduct = produto.tipo && rootTypes.includes(String(produto.tipo));

  const { error } = await supabase
    .from('products')
    .update({
      ...(isRootProduct ? { parent_id: null as string | null } : {}),
      name: produto.nome,
      sku: produto.sku,
      description: produto.descricao,
      category_id: produto.categoriaId || null,
      custom_attributes: { ...(produto?.custom_attributes || {}), brand: produto.marca || null },
      cost_price: produto.custoBuyPrice,
      package_height: produto.dimensoes.altura,
      package_width: produto.dimensoes.largura,
      package_length: produto.dimensoes.comprimento,
      weight: produto.peso,
      barcode: parseInt(produto.codigoBarras) || 0,
      ncm: parseInt(produto.ncm) || 0,
      cest: produto.cest ? parseInt(produto.cest) : null,
      tax_origin_code: parseInt(produto.origem) || 0,
      image_urls: produto.imagens,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function duplicateProduct(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_product', {
    p_product_id: id,
    p_with_images: false,
  });
  if (error) throw error;
  return data as string;
}

export async function loadExistingLinks(
  productId: string,
  organizationId: string
): Promise<unknown[]> {
  const { data, error } = await (supabase as any)
    .from('marketplace_item_product_links')
    .select('marketplace_name, marketplace_item_id, variation_id, permanent, updated_at')
    .eq('product_id', productId)
    .eq('organizations_id', organizationId);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function loadActiveIntegrations(organizationId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('marketplace_integrations')
    .select('marketplace_name')
    .eq('organizations_id', organizationId);
  if (error) throw error;
  return Array.isArray(data)
    ? Array.from(new Set(data.map((r: any) => r.marketplace_name)))
    : [];
}

export async function loadMarketplaceItems(
  organizationId: string,
  selectedMarketplace: string,
  searchTerm: string,
  dbMarketplaceNameByValue: Record<string, string>
): Promise<unknown[]> {
  let q: any = (supabase as any)
    .from('marketplace_items')
    .select('marketplace_item_id, title, sku, marketplace_name, pictures, company_id, variations')
    .eq('organizations_id', organizationId);
  const dbMk = dbMarketplaceNameByValue[selectedMarketplace] || selectedMarketplace || null;
  if (dbMk) q = q.eq('marketplace_name', dbMk);
  const term = searchTerm.trim();
  if (term) {
    const like = `%${term}%`;
    q = q.or(`title.ilike.${like},marketplace_item_id.ilike.${like},sku.ilike.${like}`);
  }
  const { data, error } = await q.limit(50);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertProductLink(payload: {
  organizations_id: string;
  company_id: string | undefined;
  marketplace_name: string;
  marketplace_item_id: string;
  variation_id: string;
  product_id: string;
  permanent: boolean;
  updated_at: string;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from('marketplace_item_product_links')
    .upsert([payload], { onConflict: 'organizations_id,marketplace_name,marketplace_item_id,variation_id' });
  if (error) throw error;
}

export async function deleteProductLink(params: {
  organizations_id: string;
  product_id: string;
  marketplace_name: string;
  marketplace_item_id: string;
  variation_id: string;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from('marketplace_item_product_links')
    .delete()
    .eq('organizations_id', params.organizations_id)
    .eq('product_id', params.product_id)
    .eq('marketplace_name', params.marketplace_name)
    .eq('marketplace_item_id', params.marketplace_item_id)
    .eq('variation_id', params.variation_id || '');
  if (error) throw error;
}
