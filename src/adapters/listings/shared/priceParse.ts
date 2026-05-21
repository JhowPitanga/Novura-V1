/** Parses a price string in pt-BR format (e.g. "1.299,90") or plain number to a number. */
export function parsePriceToNumber(price: string | number): number {
  if (typeof price === 'number') return Number.isFinite(price) ? price : 0;
  const s = String(price || '').replace(/\./g, '').replace(/,/g, '.');
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
