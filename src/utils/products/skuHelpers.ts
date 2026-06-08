/**
 * Pure SKU generation and integer clamping helpers.
 * Extracted from useProductForm.ts handleCreateProduct.
 */

export const INT_MAX = 2147483647;

export const clampInt = (val: unknown, max = INT_MAX): number => {
  const n = parseInt(String(val));
  if (Number.isNaN(n) || n < 0) return 0;
  return n > max ? max : n;
};

/**
 * Parses a barcode/EAN string to a number safe for bigint DB storage.
 * Unlike clampInt, does NOT cap at INT_MAX — EAN-13 values (up to 13 digits,
 * max 9,999,999,999,999) fit safely within Number.MAX_SAFE_INTEGER and the
 * bigint products.barcode column.
 */
export const parseBarcode = (val: unknown): number => {
  const n = Number(String(val || ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
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

/** Appends a guaranteed 2-char random alphanum suffix to avoid SKU collision after 23505. */
export const withRandomSuffix = (sku: string): string => {
  // padEnd ensures exactly 2 chars even when toString(36) produces a short string
  const rnd = Math.random().toString(36).substring(2, 4).toUpperCase().padEnd(2, "0");
  return `${sku}-${rnd}`;
};
