// Zod schema for a variation group (VARIACAO_PAI) and its items (VARIACAO_ITEM)
import { z } from 'zod';
import {
  nameSchema,
  barcodeSchema,
  ncmSchema,
  cestSchema,
  taxOriginSchema,
  costPriceSchema,
  dimensionSchema,
  weightSchema,
  categoryIdSchema,
} from './base.schema';

export const variationItemSchema = z.object({
  name: nameSchema,
  sku: z
    .string()
    .min(3, 'SKU deve ter no mínimo 3 caracteres')
    .max(40, 'SKU deve ter no máximo 40 caracteres')
    .optional(),
  barcode: barcodeSchema,
  ncm: ncmSchema,
  cest: cestSchema,
  tax_origin_code: taxOriginSchema,
  cost_price: costPriceSchema,
  sell_price: z.number().optional().nullable(),
  package_height: dimensionSchema,
  package_width: dimensionSchema,
  package_length: dimensionSchema,
  weight: weightSchema,
  weight_type: z.string().optional(),
  color: z.string().max(50).optional(),
  size: z.string().max(50).optional(),
  voltage: z.string().max(50).optional(),
  storage_id: z.string().uuid('Armazém inválido').optional(),
  initial_stock: z.number().int().min(0).default(0),
});

export const variationGroupSchema = z.object({
  name: nameSchema,
  category_id: categoryIdSchema,
  description: z.string().max(5000).optional(),
  variations: z
    .array(variationItemSchema)
    .min(1, 'Adicione pelo menos uma variação'),
});

export type VariationItemInput = z.infer<typeof variationItemSchema>;
export type VariationGroupInput = z.infer<typeof variationGroupSchema>;
