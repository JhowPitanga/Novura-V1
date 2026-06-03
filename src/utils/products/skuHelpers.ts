/**
 * Pure SKU generation and integer clamping helpers.
 * Extracted verbatim from useProductForm.ts handleCreateProduct.
 * QUIRKS (do not "fix"):
 *   - clampInt stores barcode as INT via parseInt — not the EAN-13 string
 *   - generateVariantParentSku always produces 'NV' + 5 digits (10000–99999)
 *   - withRandomSuffix appends '-XX' (2 uppercase alphanum chars)
 */

export const INT_MAX = 2147483647;

export const clampInt = (val: unknown, max = INT_MAX): number => {
  const n = parseInt(String(val));
  if (Number.isNaN(n) || n < 0) return 0;
  return n > max ? max : n;
};

export const generateSku = (name?: string, suffix?: string): string => {
  const base = (name || 'PROD')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return [base || 'PROD', suffix, rand].filter(Boolean).join('-');
};

/** SKU for the parent of a variation group: 'NV' + 5 random digits (10000–99999). */
export const generateVariantParentSku = (): string => {
  const num = Math.floor(Math.random() * 90000) + 10000;
  return `NV${num}`;
};

/** Appends a 2-char random alphanum suffix to avoid SKU collision after 23505. */
export const withRandomSuffix = (sku: string): string => {
  const rnd = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `${sku}-${rnd}`;
};
