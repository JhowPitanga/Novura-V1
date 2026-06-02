/**
 * Pure payload assembly and ICMS key utilities for the fiscal wizard.
 * Extracted from AddTaxModal.tsx (behavior-preserving).
 */

export interface CompanyOption {
  id: string;
  razao_social: string;
  cnpj: string;
  tributacao: string;
}

export interface TaxRecord {
  id: string;
  companyId?: string;
  companyName?: string;
  cnpj?: string;
  isDefault?: boolean;
  observacao?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type Pessoa = "PF" | "PJ";
export type DentroFora = "dentro" | "fora";

export type IcmsConfig = {
  cfop?: string;
  csosn?: string;
  pjNaoContribuinte?: boolean;
};

export type IcmsExtra = {
  pessoa?: Pessoa;
  abrangencia?: DentroFora;
  cfop?: string;
  csosn?: string;
  pjNaoContribuinte?: boolean;
};

export type IpiConfig = { cst?: string; codigoEnquadramento?: string; aliquota?: string };
export type PisCofinsConfig = { cst?: string; aliquota?: string };

export interface TaxWizardPayloadInput {
  selectedCompany?: CompanyOption;
  isDefaultForCompany: boolean;
  naturezaSaida: string;
  naturezaEntrada: string;
  observacao: string;
  icms: Record<string, IcmsConfig>;
  icmsSaidaExtras: IcmsExtra[];
  icmsEntradaExtras: IcmsExtra[];
  ipiPF: IpiConfig;
  ipiPJ: IpiConfig;
  pisPF: PisCofinsConfig;
  pisPJ: PisCofinsConfig;
  cofinsPF: PisCofinsConfig;
  cofinsPJ: PisCofinsConfig;
  infoFisco: string;
  infoComplementar: string;
}

export interface DbPayloadInput {
  organizationId: string;
  userId?: string;
  companyId?: string;
  observacao: string;
  isDefault: boolean;
  recordPayload: Record<string, unknown>;
}

export function buildIcmsKey(
  tipo: "saida" | "entrada",
  pessoa: Pessoa,
  abrang: DentroFora
): string {
  return `${tipo}_${pessoa}_${abrang}`;
}

export function buildTaxPayload(input: TaxWizardPayloadInput): Record<string, unknown> {
  const {
    selectedCompany,
    isDefaultForCompany,
    naturezaSaida,
    naturezaEntrada,
    observacao,
    icms,
    icmsSaidaExtras,
    icmsEntradaExtras,
    ipiPF,
    ipiPJ,
    pisPF,
    pisPJ,
    cofinsPF,
    cofinsPJ,
    infoFisco,
    infoComplementar,
  } = input;

  return {
    basics: {
      companyId: selectedCompany?.id,
      tributacao: selectedCompany?.tributacao,
      naturezaSaida,
      naturezaEntrada,
      observacao,
      isDefault: isDefaultForCompany,
    },
    icms,
    icmsExtras: {
      saidaPF: (icmsSaidaExtras || [])
        .filter((sc) => (sc.pessoa || "PF") === "PF")
        .map(({ pessoa: _pessoa, ...rest }) => rest),
      saidaPJ: (icmsSaidaExtras || [])
        .filter((sc) => sc.pessoa === "PJ")
        .map(({ pessoa: _pessoa, ...rest }) => rest),
      entrada: icmsEntradaExtras,
    },
    ipi: { pf: ipiPF, pj: ipiPJ },
    pis: { pf: pisPF, pj: pisPJ },
    cofins: { pf: cofinsPF, pj: cofinsPJ },
    adicionais: { infoFisco, infoComplementar },
  };
}

export function buildDbPayload(input: DbPayloadInput): Record<string, unknown> {
  return {
    organizations_id: input.organizationId,
    company_id: input.companyId,
    observacao: input.observacao,
    is_default: input.isDefault,
    payload: input.recordPayload,
    created_by: input.userId,
  };
}

/** Pure ICMS key migration from updateDefaultCardSelection (AddTaxModal lines 169-178). */
export function migrateIcmsKey(
  prevIcms: Record<string, IcmsConfig>,
  tipo: "saida" | "entrada",
  currentPessoa: Pessoa,
  currentAbrang: DentroFora,
  newPessoa: Pessoa,
  newAbrang: DentroFora
): Record<string, IcmsConfig> {
  const oldKey = `${tipo}_${currentPessoa}_${currentAbrang}`;
  const newKey = `${tipo}_${newPessoa}_${newAbrang}`;
  if (oldKey === newKey) return prevIcms;
  const nextIcms = { ...prevIcms };
  const oldCfg = nextIcms[oldKey];
  if (oldCfg && !nextIcms[newKey]) {
    nextIcms[newKey] = { ...oldCfg };
  }
  return nextIcms;
}

const CSOSN_COPY_KEYS = [
  "saida_PF_dentro",
  "saida_PF_fora",
  "saida_PJ_dentro",
  "saida_PJ_fora",
  "entrada_PF_dentro",
  "entrada_PF_fora",
  "entrada_PJ_dentro",
  "entrada_PJ_fora",
] as const;

/** Pure CSOSN copy from copiarCSOSNParaTodos (AddTaxModal lines 185-195). */
export function applyCopiarCSOSN(
  icms: Record<string, IcmsConfig>,
  fromKey: string
): Record<string, IcmsConfig> {
  const value = icms[fromKey]?.csosn || "";
  const next = { ...icms };
  CSOSN_COPY_KEYS.forEach((k) => {
    next[k] = { ...(next[k] || {}), csosn: value };
  });
  return next;
}
