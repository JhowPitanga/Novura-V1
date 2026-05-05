// Base field-level Zod validators shared across all product types
import { z } from 'zod';
import { validateEanChecksum } from '@/utils/eanChecksum';

export const nameSchema = z
  .string()
  .min(3, 'Nome deve ter no mínimo 3 caracteres')
  .max(120, 'Nome deve ter no máximo 120 caracteres')
  // No control characters
  .regex(/^[^\x00-\x1F\x7F]+$/, 'Nome contém caracteres inválidos');

export const skuSchema = z
  .string()
  .min(3, 'SKU deve ter no mínimo 3 caracteres')
  .max(40, 'SKU deve ter no máximo 40 caracteres')
  .regex(/^[A-Z0-9._-]+$/, 'SKU deve conter apenas letras maiúsculas, números e os caracteres . _ -');

// Optional EAN/barcode — validates format+checksum when provided
export const barcodeSchema = z
  .string()
  .optional()
  .refine(
    (val) => {
      if (!val || val.trim() === '') return true;
      const digits = val.trim();
      if (digits.length !== 13) return false;
      return validateEanChecksum(digits);
    },
    {
      message: 'Código de barras inválido. Informe um EAN-13 com dígito verificador correto.',
    }
  );

// NCM: exactly 8 numeric digits
export const ncmSchema = z
  .string()
  .regex(/^\d{8}$/, 'NCM deve ter exatamente 8 dígitos numéricos');

// CEST: optional, exactly 7 numeric digits when provided
export const cestSchema = z
  .string()
  .optional()
  .refine(
    (val) => !val || val.trim() === '' || /^\d{7}$/.test(val.trim()),
    { message: 'CEST deve ter exatamente 7 dígitos numéricos' }
  );

// Origin (código de origem ICMS): 0–8
export const taxOriginSchema = z
  .number({ required_error: 'Origem tributária é obrigatória' })
  .int()
  .min(0, 'Código de origem inválido')
  .max(8, 'Código de origem inválido (0–8)');

export const costPriceSchema = z
  .number({ required_error: 'Preço de custo é obrigatório' })
  .min(0, 'Preço de custo deve ser maior ou igual a zero');

export const sellPriceSchema = z.number().optional().nullable();

export const dimensionSchema = z
  .number({ required_error: 'Campo obrigatório' })
  .positive('Deve ser maior que zero');

export const weightSchema = z
  .number({ required_error: 'Peso é obrigatório' })
  .positive('Peso deve ser maior que zero');

export const categoryIdSchema = z
  .string({ required_error: 'Categoria é obrigatória' })
  .uuid('Categoria inválida');
