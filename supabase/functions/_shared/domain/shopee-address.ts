/**
 * Brazilian address parsing and date helpers for Shopee/order flows.
 */

export interface BrAddressParts {
  street_name: string | null;
  street_number: string | null;
  neighborhood_name: string | null;
}

export function parseBrAddress(addr: string | null): BrAddressParts {
  if (!addr) {
    return { street_name: null, street_number: null, neighborhood_name: null };
  }
  const s = addr.trim();
  let street_name: string | null = null;
  let street_number: string | null = null;
  let neighborhood_name: string | null = null;
  const cepMatch = s.match(/\b\d{5}-?\d{3}\b/);
  const cleaned = (cepMatch ? s.replace(cepMatch[0], "") : s).trim();
  const parts = cleaned.split(/\s*-\s*/);
  const firstSeg = (parts[0] || cleaned).trim();
  const m = firstSeg.match(/^(.+?)[, ]+(\d+\w*)/);
  if (m) {
    street_name = m[1].trim();
    street_number = m[2].trim();
  } else {
    const m2 = firstSeg.match(/^(.+?)(?:,|$)/);
    if (m2) street_name = m2[1].trim();
    const m3 = firstSeg.match(/(\d+\w*)/);
    if (m3) street_number = m3[1].trim();
  }
  const neighSeg = parts.length > 1 ? parts[1] : null;
  if (neighSeg) neighborhood_name = String(neighSeg).trim();
  if (neighborhood_name && /\b(cidade|estado|uf)\b/i.test(neighborhood_name)) {
    neighborhood_name = null;
  }
  return {
    street_name: street_name || null,
    street_number: street_number || null,
    neighborhood_name: neighborhood_name || null,
  };
}

/** Converts Unix epoch seconds (string or number) to ISO date string. */
export function toIsoFromEpochSec(s: string | null): string | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}
