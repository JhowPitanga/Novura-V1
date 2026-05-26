/**
 * Shared utilities for order normalizers (ML and Shopee). DRY: state/UF, dates, shipping shape.
 * ENGINEERING_STANDARDS: one responsibility per function; no file > 150 lines.
 */

import type { NormalizedOrderShipping } from "./orders-types.ts";

/** Extract 2-letter UF from ML state.id (e.g. BR-SP -> SP). */
export function stateIdToUf(stateId: string | null): string | null {
  if (!stateId || typeof stateId !== "string") return null;
  const s = stateId.trim();
  if (s.length === 2) return s.toUpperCase();
  if (s.includes("-")) return s.split("-").pop()?.toUpperCase() ?? null;
  return s.toUpperCase();
}

/** Map Brazilian state name to 2-letter UF (Shopee/recipient_address.region). */
export function brUfFromState(stateName: string | null): string | null {
  if (!stateName) return null;
  const k = stateName.trim().toLowerCase();
  const map: Record<string, string> = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amapá": "AP", "amazonas": "AM",
    "bahia": "BA", "ceara": "CE", "ceará": "CE", "distrito federal": "DF",
    "espirito santo": "ES", "espírito santo": "ES", "goias": "GO", "goiás": "GO",
    "maranhao": "MA", "maranhão": "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
    "minas gerais": "MG", "para": "PA", "pará": "PA", "paraiba": "PB", "paraíba": "PB",
    "parana": "PR", "paraná": "PR", "pernambuco": "PE", "piaui": "PI", "piauí": "PI",
    "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
    "rondonia": "RO", "rondônia": "RO", "roraima": "RR", "santa catarina": "SC",
    "sao paulo": "SP", "são paulo": "SP", "sergipe": "SE", "tocantins": "TO",
  };
  return map[k] ?? null;
}

/** Epoch seconds to ISO string (Shopee uses epoch in create_time, update_time). */
export function epochSecToIso(ts: string | number | null): string | null {
  if (ts == null) return null;
  const n = typeof ts === "number" ? ts : Number(ts);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

const EMPTY_SHIPPING: NormalizedOrderShipping = {
  shipment_id: null,
  logistic_type: null,
  tracking_number: null,
  carrier: null,
  status: null,
  substatus: null,
  street_name: null,
  street_number: null,
  complement: null,
  neighborhood: null,
  city: null,
  state_uf: null,
  zip_code: null,
  sla_expected_date: null,
  sla_status: null,
  estimated_delivery: null,
};

/** Build NormalizedOrderShipping with defaults for omitted fields (Factory, DRY). */
export function buildShipping(
  partial: Partial<NormalizedOrderShipping>
): NormalizedOrderShipping {
  return { ...EMPTY_SHIPPING, ...partial };
}
