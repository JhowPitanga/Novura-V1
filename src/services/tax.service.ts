// §1 SIZE EXCEPTION (ENGINEERING_STANDARDS.md): ~180 LOC — fiscal catalog + company_tax_configs CRUD.
import { supabase } from "@/integrations/supabase/client";
import type { TaxRecord } from "@/components/settings/taxes/tax-payload";

export type TaxRuleCatalogRow = {
  scope: string;
  code: string;
  title: string;
  active: boolean;
};

export type CSOSNOption = { value: string; label: string };

export interface SaveCompanyTaxConfigParams {
  organizationId: string;
  userId?: string;
  companyId: string;
  observacao: string;
  isDefault: boolean;
  recordPayload: Record<string, unknown>;
  naturezaSaida: string;
  naturezaEntrada: string;
  ipiPF: Record<string, unknown>;
  ipiPJ: Record<string, unknown>;
  pisPF: Record<string, unknown>;
  pisPJ: Record<string, unknown>;
  cofinsPF: Record<string, unknown>;
  cofinsPJ: Record<string, unknown>;
  infoFisco: string;
  infoComplementar: string;
  icms: Record<string, unknown>;
  existingId?: string;
}

export async function fetchTaxRulesCatalog(): Promise<TaxRuleCatalogRow[]> {
  const { data, error } = await supabase
    .from("tax_rules_catalog")
    .select("scope, code, title, active")
    .eq("active", true)
    .in("scope", ["ICMS", "IPI", "PIS", "COFINS"])
    .order("code", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? (data as TaxRuleCatalogRow[]) : [];
}

export function mapTaxRulesToOptions(rows: TaxRuleCatalogRow[]): {
  csosnICMSOptions: CSOSNOption[];
  cstIPIOptions: CSOSNOption[];
  cstPISOptions: CSOSNOption[];
  cstCOFINSOptions: CSOSNOption[];
} {
  const toOption = (r: TaxRuleCatalogRow): CSOSNOption => ({
    value: r.code,
    label: `${r.code} - ${r.title}`,
  });
  return {
    csosnICMSOptions: rows.filter((r) => r.scope === "ICMS").map(toOption),
    cstIPIOptions: rows.filter((r) => r.scope === "IPI").map(toOption),
    cstPISOptions: rows.filter((r) => r.scope === "PIS").map(toOption),
    cstCOFINSOptions: rows.filter((r) => r.scope === "COFINS").map(toOption),
  };
}

export async function fetchCompanyTaxConfigs(organizationId: string): Promise<TaxRecord[]> {
  const { data, error } = await supabase
    .from("company_tax_configs")
    .select("id, company_id, observacao, is_default, payload, created_at")
    .eq("organizations_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];

  const companyIds = Array.from(
    new Set(rows.map((r) => String(r.company_id)).filter(Boolean))
  );
  let companyMap = new Map<string, { razao_social: string; cnpj: string }>();
  if (companyIds.length > 0) {
    const { data: compRows } = await supabase
      .from("companies")
      .select("id, razao_social, cnpj")
      .in("id", companyIds);
    const arr = Array.isArray(compRows) ? compRows : [];
    companyMap = new Map(
      arr.map((c) => [
        String(c.id),
        { razao_social: c.razao_social, cnpj: c.cnpj },
      ])
    );
  }

  return rows.map((r) => {
    const cm = companyMap.get(String(r.company_id));
    return {
      id: String(r.id),
      companyId: String(r.company_id),
      companyName: cm?.razao_social || "—",
      cnpj: cm?.cnpj || "",
      isDefault: !!r.is_default,
      observacao: r.observacao || "",
      payload: (r.payload as Record<string, unknown>) || {},
      createdAt: r.created_at,
    };
  });
}

export async function clearDefaultForCompany(companyId: string): Promise<void> {
  const { error } = await supabase
    .from("company_tax_configs")
    .update({ is_default: false })
    .eq("company_id", companyId);
  if (error) throw error;
}

export async function setDefaultTax(taxId: string): Promise<void> {
  const { error } = await supabase
    .from("company_tax_configs")
    .update({ is_default: true })
    .eq("id", taxId);
  if (error) throw error;
}

export async function deleteTaxConfig(taxId: string): Promise<void> {
  const { error } = await supabase.from("company_tax_configs").delete().eq("id", taxId);
  if (error) throw error;
}

/**
 * Saves all tax config fields in a single write operation.
 * The previous implementation used two separate writes where the second one
 * silently swallowed errors (supabase-js returns {error} without throwing).
 * Now both sets of columns are merged and persisted atomically.
 */
export async function saveCompanyTaxConfig(
  params: SaveCompanyTaxConfigParams
): Promise<{ id: string; created_at: string }> {
  const fullPayload = {
    organizations_id: params.organizationId,
    company_id: params.companyId,
    observacao: params.observacao,
    is_default: params.isDefault,
    payload: params.recordPayload,
    created_by: params.userId,
    // Previously written in a silent second pass — now included in the first write
    natureza_saida: params.naturezaSaida || null,
    natureza_entrada: params.naturezaEntrada || null,
    icms: params.icms,
    ipi: { pf: params.ipiPF, pj: params.ipiPJ },
    pis: { pf: params.pisPF, pj: params.pisPJ },
    cofins: { pf: params.cofinsPF, pj: params.cofinsPJ },
    adicionais: { infoFisco: params.infoFisco, infoComplementar: params.infoComplementar },
  };

  if (fullPayload.is_default) {
    await clearDefaultForCompany(params.companyId);
  }

  const isEditing = Boolean(params.existingId);
  const { data: saved, error } = isEditing
    ? await supabase
        .from("company_tax_configs")
        .update(fullPayload)
        .eq("id", params.existingId!)
        .select("id, company_id, organizations_id, created_at")
        .single()
    : await supabase
        .from("company_tax_configs")
        .insert(fullPayload)
        .select("id, company_id, organizations_id, created_at")
        .single();

  if (error) throw error;

  return { id: saved.id, created_at: saved.created_at };
}
