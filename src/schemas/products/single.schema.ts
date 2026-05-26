// Zod schema for a single (UNICO) product
import { z } from 'zod';
import {
  nameSchema,
  skuSchema,
  barcodeSchema,
  ncmSchema,
  cestSchema,
  taxOriginSchema,
  costPriceSchema,
  sellPriceSchema,
  dimensionSchema,
  weightSchema,
  categoryIdSchema,
} from './base.schema';

export const singleProductSchema = z
  .object({
    name: nameSchema,
    sku: skuSchema,
    category_id: categoryIdSchema,
    description: z.string().max(5000, 'Descrição muito longa').optional(),
    cost_price: costPriceSchema,
    sell_price: sellPriceSchema,
    barcode: barcodeSchema,
    ncm: ncmSchema,
    cest: cestSchema,
    tax_origin_code: taxOriginSchema,
    package_height: dimensionSchema,
    package_width: dimensionSchema,
    package_length: dimensionSchema,
    weight: weightSchema,
    weight_type: z.string().optional(),
    warehouse_id: z.string().uuid('Armazém inválido'),
    initial_stock: z.number().int().min(0, 'Estoque não pode ser negativo').optional(),
  })
  .refine(
    (data) => !data.sell_price || data.sell_price >= data.cost_price,
    {
      message: 'Preço de venda deve ser maior ou igual ao preço de custo',
      path: ['sell_price'],
    }
  );

export type SingleProductInput = z.infer<typeof singleProductSchema>;
