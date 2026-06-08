/**
 * Builds the typed products table insert payload from create-form data.
 * Extracted from useProductForm.ts handleCreateProduct.
 *
 * Notes:
 *   - barcode stored via parseBarcode — preserves full EAN-13 (bigint column).
 *   - stock_qnt IIFE: ">0?n:null" — 0 maps to null (stock row not created on 0).
 *   - parent_id always null for UNICO / VARIACAO_PAI / KIT root products.
 *   - image_urls always [] on create (images uploaded after product is persisted).
 */

import { clampInt, INT_MAX, parseBarcode } from './skuHelpers';
import type { ProductFormData } from '@/types/products';

export type ProductTypeDB = 'UNICO' | 'VARIACAO_PAI' | 'VARIACAO_ITEM' | 'KIT';

export interface BaseProductPayload {
  parent_id: null;
  name: string;
  sku: string;
  type: ProductTypeDB;
  description: string | undefined;
  cost_price: number;
  sell_price: number | undefined;
  barcode: number;
  ncm: number;
  cest: number | undefined;
  package_height: number;
  package_width: number;
  package_length: number;
  weight: number | undefined;
  weight_type: string | undefined;
  tax_origin_code: number;
  category_id: string | undefined;
  brand_id: undefined;
  color: undefined;
  size: undefined;
  image_urls: never[];
  custom_attributes: undefined;
  stock_qnt: number | null;
}

export function buildBaseProductPayload(
  formData: ProductFormData,
  typeForDB: ProductTypeDB,
  computedSku: string
): BaseProductPayload {
  return {
    parent_id: null,
    name: formData.name,
    sku: computedSku,
    type: typeForDB,
    description: formData.description || undefined,
    cost_price: formData.costPrice ? parseFloat(String(formData.costPrice)) : 0,
    sell_price: formData.sellPrice ? parseFloat(String(formData.sellPrice)) : undefined,
    barcode: parseBarcode(formData.barcode),
    ncm: clampInt(formData.ncm, INT_MAX),
    cest: formData.cest ? parseInt(String(formData.cest)) : undefined,
    package_height: formData.height ? parseInt(String(formData.height)) : 0,
    package_width: formData.width ? parseInt(String(formData.width)) : 0,
    package_length: formData.length ? parseInt(String(formData.length)) : 0,
    weight: formData.weight ? parseFloat(String(formData.weight)) : undefined,
    weight_type: formData.unitType || undefined,
    tax_origin_code: clampInt(formData.origin, INT_MAX),
    category_id: formData.category || undefined,
    brand_id: undefined,
    color: undefined,
    size: undefined,
    image_urls: [],
    custom_attributes: undefined,
    stock_qnt: (() => {
      const n = parseInt(String(formData.stock));
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
  };
}

export function getProductTypeForDB(type: string): ProductTypeDB {
  switch (type) {
    case 'single': return 'UNICO';
    case 'variation': return 'VARIACAO_PAI';
    case 'kit': return 'KIT';
    default: return 'UNICO';
  }
}
