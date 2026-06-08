/**
 * §1 SIZE EXCEPTION: ~163 LOC (limit 150).
 * Justified: handles 3 distinct create flows (UNICO stock, VARIACAO_PAI children, KIT items)
 * plus image upload. Each flow is ≤30 LOC internally. One reason to change: product creation persistence.
 *
 * TanStack Query useMutation wrapping the full product create flow.
 * Handles all DB operations: permission check, company fetch, SKU uniqueness,
 * root insert, stock/variation-children/kit items, image upload.
 *
 * triggerSync is called in onSuccess by the facade (hook layer only).
 *
 * INVARIANTS (preserved byte-for-byte):
 *   - RPC current_user_has_permission(p_module_name:'produtos', p_action_name:'create')
 *   - RPC get_current_user_organization_id (via useCreateProduct legacy path - now via service)
 *   - 23505 conflict → SKU retry with withRandomSuffix
 *   - stock_qnt IIFE >0?n:null in buildBaseProductPayload
 *   - localStorage 'defaultStorageId' checked first
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadProductImages } from '@/services/productImages.service';
import {
  checkUserPermission,
  checkSkuExists,
  fetchDefaultCompanyId,
  fetchDefaultStorageId,
  createProductRoot,
  upsertProductStock,
  insertVariationChildren,
  insertKitItems,
  productKeys,
} from '@/services/products.service';
import {
  buildBaseProductPayload,
  getProductTypeForDB,
} from '@/utils/products/productPayload';
import {
  generateSku,
  generateVariantParentSku,
  withRandomSuffix,
} from '@/utils/products/skuHelpers';
import type { ProductFormData, ProductVariation, KitItem } from '@/types/products';

export interface CreateProductInput {
  productType: string;
  formData: ProductFormData;
  variations: ProductVariation[];
  kitItems: KitItem[];
  selectedImages: File[];
  userId: string;
  organizationId: string | null;
}

export interface CreateProductOutput {
  id: string;
  variationChildren: Array<{ id: string; files: File[] }>;
  /** True when product was created but image upload failed (non-fatal). */
  uploadWarning: boolean;
}

async function createProductFn(input: CreateProductInput): Promise<CreateProductOutput> {
  const { productType, formData, variations, kitItems, selectedImages, userId, organizationId } = input;

  const canCreate = await checkUserPermission('produtos', 'create');
  if (!canCreate) throw new Error('PERMISSION_DENIED');

  const typeForDB = getProductTypeForDB(productType);
  let computedSku =
    typeForDB === 'VARIACAO_PAI'
      ? generateVariantParentSku()
      : formData.sku || generateSku(formData.name);

  const basePayload = buildBaseProductPayload(formData, typeForDB, computedSku);

  if (basePayload.sku) {
    const exists = await checkSkuExists(basePayload.sku);
    if (exists) {
      (basePayload as any).sku = withRandomSuffix(basePayload.sku);
      computedSku = (basePayload as any).sku;
    }
  }

  (basePayload as any).image_urls = [];

  let companyIdForOrg: string | null = null;
  try {
    if (organizationId) companyIdForOrg = await fetchDefaultCompanyId(organizationId);
  } catch { /* noop */ }

  const created = await createProductRoot({
    ...basePayload,
    user_id: userId,
    company_id: companyIdForOrg || undefined,
    organizations_id: organizationId || undefined,
  });

  const defaultStorageId = await fetchDefaultStorageId();
  const variationChildren: Array<{ id: string; files: File[] }> = [];

  if (typeForDB === 'UNICO') {
    const storageIdForSingle = formData.warehouse || defaultStorageId;
    if (storageIdForSingle) {
      const qty = formData.stock ? parseInt(String(formData.stock)) : 0;
      await upsertProductStock(created.id, String(storageIdForSingle), qty);
    }
  }

  if (typeForDB === 'VARIACAO_PAI') {
    const children = await insertVariationChildren(
      created.id,
      variations,
      computedSku,
      userId,
      companyIdForOrg,
      organizationId || null,
      formData.category || undefined,
      defaultStorageId
    );
    variationChildren.push(...children);
  }

  if (typeForDB === 'KIT') {
    await insertKitItems(created.id, kitItems);
  }

  let uploadWarning = false;
  if (organizationId) {
    try {
      const parentFiles = selectedImages.filter((f: any) => f instanceof File);
      if (parentFiles.length > 0) {
        await uploadProductImages({
          files: parentFiles,
          productId: created.id,
          organizationId,
          startPosition: 0,
          firstIsCover: true,
        });
      }
      for (const child of variationChildren) {
        if (child.files.length === 0) continue;
        await uploadProductImages({
          files: child.files,
          productId: child.id,
          organizationId,
          startPosition: 0,
          firstIsCover: true,
        });
      }
    } catch (uploadErr) {
      console.error('Erro ao subir imagens após criação:', uploadErr);
      uploadWarning = true;
    }
  }

  return { id: created.id, variationChildren, uploadWarning };
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProductFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}
