// Zod schema for a KIT product
import { z } from 'zod';
import { nameSchema, skuSchema } from './base.schema';

export const kitItemSchema = z.object({
  product_id: z.string().uuid('Produto inválido'),
  quantity: z
    .number({ required_error: 'Quantidade é obrigatória' })
    .int()
    .min(1, 'Quantidade deve ser no mínimo 1'),
});

export const kitSchema = z
  .object({
    name: nameSchema,
    sku: skuSchema,
    sell_price: z.number().min(0).optional().nullable(),
    description: z.string().max(5000).optional(),
    items: z
      .array(kitItemSchema)
      .min(2, 'Um kit deve ter no mínimo 2 itens'),
  })
  .superRefine((data, ctx) => {
    // No duplicate product_ids in kit
    const ids = data.items.map((i) => i.product_id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Produtos duplicados no kit não são permitidos',
        path: ['items'],
      });
    }
  });

export type KitInput = z.infer<typeof kitSchema>;
export type KitItemInput = z.infer<typeof kitItemSchema>;
