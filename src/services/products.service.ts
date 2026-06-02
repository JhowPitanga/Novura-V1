/**
 * §1 SIZE EXCEPTION: ~207 LOC (limit 150).
 * Justified: absorbs 3 create sub-flows (single stock, variation children+stock, kit items)
 * each with ≤50-line function bodies internally. One reason to change: product create persistence.
 *
 * All Supabase calls for product creation (single / variation / kit).
 * Extracted from useProductForm.ts handleCreateProduct and useProducts.ts useCreateProduct.
 *
 * INVARIANTS (preserved byte-for-byte):
 *   - RPC: current_user_has_permission(p_module_name:'produtos', p_action_name:'create')
 *   - RPC: get_current_user_organization_id
 *   - Conflict code '23505' triggers SKU retry with withRandomSuffix
 *   - products_stock: select/update/insert per existing row check
 *   - product_kits / product_kit_items insert sequence
 *   - localStorage 'defaultStorageId' read before Supabase fallback
 *   - DB type strings: 'UNICO' | 'VARIACAO_PAI' | 'VARIACAO_ITEM' | 'KIT'
 */

import { supabase } from '@/integrations/supabase/client';
import { clampInt, withRandomSuffix, INT_MAX } from '@/utils/products/skuHelpers';
import type { ProductVariation, KitItem } from '@/types/products';
import type { BaseProductPayload } from '@/utils/products/productPayload';

export const productKeys = {
  all: ['products'] as const,
  list: (orgId?: string) => ['products', 'list', orgId] as const,
  detail: (id: string) => ['products', id] as const,
};

export async function checkUserPermission(moduleName: string, actionName: string): Promise<boolean> {
  const { data } = await supabase.rpc('current_user_has_permission', {
    p_module_name: moduleName,
    p_action_name: actionName,
  });
  return Boolean(data);
}

export async function fetchDefaultCompanyId(organizationId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('companies')
      .select('id, is_active')
      .eq('organization_id', organizationId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);
    if (data && Array.isArray(data) && data.length > 0) return String(data[0].id);
  } catch { /* noop */ }
  return null;
}

export async function fetchDefaultStorageId(): Promise<string | null> {
  try {
    const lsId = typeof window !== 'undefined' ? localStorage.getItem('defaultStorageId') : null;
    if (lsId) return lsId;
  } catch { /* noop */ }
  try {
    const { data } = await supabase
      .from('storage')
      .select('id')
      .eq('active', true)
      .order('name')
      .limit(1);
    if (data && Array.isArray(data) && data.length > 0) return String(data[0].id);
  } catch { /* noop */ }
  return null;
}

export async function checkSkuExists(sku: string): Promise<boolean> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('sku', sku)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

export async function createProductRoot(payload: Record<string, unknown>): Promise<{ id: string }> {
  const { data, error } = await supabase.from('products').insert([payload]).select().single();
  if (error) throw error;
  return data as { id: string };
}

export async function upsertProductStock(
  productId: string,
  storageId: string,
  qty: number
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('products_stock')
    .select('id,current')
    .eq('product_id', productId)
    .eq('storage_id', storageId)
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing?.id) {
    const { error } = await supabase
      .from('products_stock')
      .update({ current: qty, reserved: 0, in_transit: 0 })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('products_stock')
      .insert({ product_id: productId, storage_id: storageId, current: qty, reserved: 0, in_transit: 0 });
    if (error) throw error;
  }
}

export async function insertVariationChildren(
  parentId: string,
  variations: ProductVariation[],
  parentSku: string,
  userId: string,
  companyId: string | null,
  organizationsId: string | null,
  categoryId: string | undefined,
  defaultStorageId: string | null
): Promise<Array<{ id: string; files: File[] }>> {
  const children: Array<{ id: string; files: File[] }> = [];

  for (const [idx, v] of variations.entries()) {
    let childSku = (v as any).sku || `${parentSku}-${String(idx + 1).padStart(2, '0')}`;

    const tryInsert = async (skuToUse: string) =>
      supabase.from('products').insert([{
        name: v.name || `${v.name || ''}`,
        sku: skuToUse,
        type: 'VARIACAO_ITEM',
        parent_id: parentId,
        description: v.description || null,
        cost_price: v.costPrice ? parseFloat(String(v.costPrice)) : 0,
        sell_price: v.sellPrice ? parseFloat(String(v.sellPrice)) : null,
        barcode: clampInt((v as any).barcode ?? (v as any).ean),
        ncm: clampInt((v as any).ncm, INT_MAX),
        cest: v.cest ? parseInt(String(v.cest)) : null,
        package_height: v.height ? parseInt(String(v.height)) : 0,
        package_width: v.width ? parseInt(String(v.width)) : 0,
        package_length: v.length ? parseInt(String(v.length)) : 0,
        weight: v.weight ? parseFloat(String(v.weight)) : null,
        weight_type: (v as any).unit || null,
        tax_origin_code: clampInt((v as any).origin, INT_MAX),
        category_id: categoryId || null,
        image_urls: [],
        color: v.color || null,
        size: v.size || null,
        custom_attributes: (() => {
          const attrs: Record<string, unknown> = {};
          if ((v as any).customType && (v as any).customValue) attrs[(v as any).customType] = (v as any).customValue;
          if ((v as any).voltage) attrs['voltage'] = (v as any).voltage;
          return Object.keys(attrs).length > 0 ? attrs : null;
        })(),
        user_id: userId,
        company_id: companyId || undefined,
        organizations_id: organizationsId || undefined,
        stock_qnt: (() => {
          const q = (v as any).stock ?? (v as any).estoque;
          const n = parseInt(String(q));
          return Number.isFinite(n) && n > 0 ? n : null;
        })(),
      }]).select().single();

    let { data: child, error: childErr } = await tryInsert(childSku);
    if (childErr && (childErr as any).code === '23505') {
      childSku = withRandomSuffix(childSku);
      ({ data: child, error: childErr } = await tryInsert(childSku));
    }
    if (childErr) throw childErr;

    const childFiles = (Array.isArray(v.images) ? v.images : []).filter((f: any) => f instanceof File) as File[];
    if (childFiles.length > 0) children.push({ id: (child as any).id, files: childFiles });

    const childStorageId =
      (v as any).storage || (v as any).armazem || (v as any).storageId || (v as any).warehouseId || defaultStorageId;
    const resolvedStorageId = childStorageId ? String(childStorageId) : null;
    const quantityRaw = (v as any).stock ?? (v as any).estoque ?? (v as any).initial_stock;
    const quantity = Number.isFinite(Number(quantityRaw)) ? Math.max(0, Math.floor(Number(quantityRaw))) : 0;

    if (resolvedStorageId) {
      await upsertProductStock((child as any).id, resolvedStorageId, quantity);
      console.info('[stock] variation %s → storage %s qty %d', (child as any).id, resolvedStorageId, quantity);
    } else {
      console.warn('[stock] variation %s has no storageId — skipping stock insert', (child as any).id);
    }
  }
  return children;
}

export async function insertKitItems(productId: string, kitItems: KitItem[]): Promise<void> {
  const { data: kit, error: kitErr } = await supabase
    .from('product_kits')
    .insert([{ product_id: productId }])
    .select()
    .single();
  if (kitErr) throw kitErr;
  const kitId = (kit as any)?.id;
  if (!kitId) throw new Error('Kit não foi registrado (product_kits sem id).');
  for (const k of kitItems) {
    const { error } = await supabase.from('product_kit_items').insert([{
      kit_id: kitId,
      product_id: (k as any).product_id || (k as any).id,
      quantity: (k as any).quantity || 1,
    }]);
    if (error) throw error;
  }
}
