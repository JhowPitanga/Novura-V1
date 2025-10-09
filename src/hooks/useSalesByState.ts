import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";

type SalesByStateResult = {
  byState: { state: string; total: number }[];
  byRegion: { region: string; total: number }[];
  total: number;
};

const STATE_TO_REGION: Record<string, string> = {
  AC: "Norte", AL: "Nordeste", AP: "Norte", AM: "Norte", BA: "Nordeste",
  CE: "Nordeste", DF: "Centro-Oeste", ES: "Sudeste", GO: "Centro-Oeste",
  MA: "Nordeste", MT: "Centro-Oeste", MS: "Centro-Oeste", MG: "Sudeste",
  PA: "Norte", PB: "Nordeste", PR: "Sul", PE: "Nordeste", PI: "Nordeste",
  RJ: "Sudeste", RN: "Nordeste", RS: "Sul", RO: "Norte", RR: "Norte",
  SC: "Sul", SE: "Nordeste", SP: "Sudeste", TO: "Norte",
};

function normalizeState(raw: any): string {
  if (!raw) return "Desconhecido";
  const s = String(raw).trim().toUpperCase();
  // Try to map full names to UF
  const fullToUf: Record<string, string> = {
    "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAPÁ": "AP", "AMAZONAS": "AM",
    "BAHIA": "BA", "CEARÁ": "CE", "CEARA": "CE", "DISTRITO FEDERAL": "DF",
    "ESPÍRITO SANTO": "ES", "ESPIRITO SANTO": "ES", "GOIÁS": "GO", "GOIAS": "GO",
    "MARANHÃO": "MA", "MARANHAO": "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS",
    "MINAS GERAIS": "MG", "PARÁ": "PA", "PARA": "PA", "PARAÍBA": "PB", "PARAIBA": "PB",
    "PARANÁ": "PR", "PARANA": "PR", "PERNAMBUCO": "PE", "PIAUÍ": "PI", "PIAUI": "PI",
    "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS",
    "RONDÔNIA": "RO", "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC",
    "SERGIPE": "SE", "SÃO PAULO": "SP", "SAO PAULO": "SP", "TOCANTINS": "TO",
  };
  if (STATE_TO_REGION[s]) return s;
  if (fullToUf[s]) return fullToUf[s];
  // Extract UF from strings like "Cidade/UF" or "UF - Nome"
  const m = s.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SE|SP|TO)\b/);
  return m?.[1] || "Desconhecido";
}

export async function getSalesByState(range?: DateRange, marketplace?: string): Promise<SalesByStateResult> {
  const from = range?.from ? new Date(range.from) : undefined;
  const to = range?.to ? new Date(range.to) : undefined;

  if (!from || !to) {
    return { byState: [], byRegion: [], total: 0 };
  }

  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  let query = supabase
    .from("orders")
    .select("*, created_at, order_total, marketplace")
    .gte("created_at", fromISO)
    .lte("created_at", toISO);

  if (marketplace && marketplace !== "todos") {
    query = query.eq("marketplace", marketplace);
  }

  const { data, error } = await query;

  if (error) {
    return { byState: [], byRegion: [], total: 0 };
  }

  const mapState = new Map<string, number>();
  let total = 0;
  (data || []).forEach((o: any) => {
    const val = typeof o.order_total === "number" ? o.order_total : Number(o.order_total) || 0;
    total += val;
    const stateRaw = o.shipping_state ?? o.estado ?? o.state ?? o.customer_state ?? o.address_state;
    const uf = normalizeState(stateRaw);
    mapState.set(uf, (mapState.get(uf) || 0) + val);
  });

  const byState = Array.from(mapState.entries()).map(([state, total]) => ({ state, total }));

  const mapRegion = new Map<string, number>();
  byState.forEach(({ state, total }) => {
    const region = STATE_TO_REGION[state] || "Desconhecido";
    mapRegion.set(region, (mapRegion.get(region) || 0) + total);
  });
  const byRegion = Array.from(mapRegion.entries()).map(([region, total]) => ({ region, total }));

  return { byState, byRegion, total };
}