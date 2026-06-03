/**
 * Characterization tests for fiscal wizard payload utilities.
 */
import { describe, it, expect } from "vitest";
import {
  applyCopiarCSOSN,
  buildDbPayload,
  buildIcmsKey,
  buildTaxPayload,
  migrateIcmsKey,
  type TaxWizardPayloadInput,
} from "@/components/settings/taxes/tax-payload";

const baseWizardInput = (): TaxWizardPayloadInput => ({
  selectedCompany: { id: "c1", razao_social: "ACME", cnpj: "00", tributacao: "SN" },
  isDefaultForCompany: true,
  naturezaSaida: "Venda",
  naturezaEntrada: "Compra",
  observacao: "Regra SP",
  icms: { saida_PF_dentro: { cfop: "5102", csosn: "102" } },
  icmsSaidaExtras: [
    { pessoa: "PF", abrangencia: "dentro", cfop: "1", csosn: "2", pjNaoContribuinte: false },
    { pessoa: "PJ", abrangencia: "fora", cfop: "3", csosn: "4" },
  ],
  icmsEntradaExtras: [{ abrangencia: "dentro", cfop: "9" }],
  ipiPF: { cst: "50" },
  ipiPJ: {},
  pisPF: { cst: "01" },
  pisPJ: {},
  cofinsPF: { cst: "01" },
  cofinsPJ: {},
  infoFisco: "fisco",
  infoComplementar: "compl",
});

describe("buildIcmsKey", () => {
  it("builds saida PF dentro key", () => {
    expect(buildIcmsKey("saida", "PF", "dentro")).toBe("saida_PF_dentro");
  });

  it("builds entrada PJ fora key", () => {
    expect(buildIcmsKey("entrada", "PJ", "fora")).toBe("entrada_PJ_fora");
  });
});

describe("buildTaxPayload", () => {
  it("includes top-level payload sections", () => {
    const payload = buildTaxPayload(baseWizardInput());
    expect(Object.keys(payload).sort()).toEqual(
      ["adicionais", "basics", "cofins", "icms", "icmsExtras", "ipi", "pis"].sort()
    );
  });

  it("strips pessoa from saidaPF extras only", () => {
    const payload = buildTaxPayload(baseWizardInput());
    const extras = payload.icmsExtras as {
      saidaPF: Array<Record<string, unknown>>;
      saidaPJ: Array<Record<string, unknown>>;
    };
    expect(extras.saidaPF).toHaveLength(1);
    expect(extras.saidaPF[0]).not.toHaveProperty("pessoa");
    expect(extras.saidaPF[0].cfop).toBe("1");
  });

  it("strips pessoa from saidaPJ extras only", () => {
    const payload = buildTaxPayload(baseWizardInput());
    const extras = payload.icmsExtras as { saidaPJ: Array<Record<string, unknown>> };
    expect(extras.saidaPJ).toHaveLength(1);
    expect(extras.saidaPJ[0]).not.toHaveProperty("pessoa");
    expect(extras.saidaPJ[0].cfop).toBe("3");
  });
});

describe("buildDbPayload", () => {
  it("contains required company_tax_configs columns", () => {
    const recordPayload = buildTaxPayload(baseWizardInput());
    const db = buildDbPayload({
      organizationId: "org-1",
      userId: "user-1",
      companyId: "c1",
      observacao: "Regra SP",
      isDefault: true,
      recordPayload,
    });
    expect(Object.keys(db).sort()).toEqual(
      ["company_id", "created_by", "is_default", "observacao", "organizations_id", "payload"].sort()
    );
  });
});

describe("migrateIcmsKey", () => {
  it("copies PF config to empty PJ key on pessoa change", () => {
    const prev = { saida_PF_dentro: { cfop: "5102", csosn: "102" } };
    const next = migrateIcmsKey(prev, "saida", "PF", "dentro", "PJ", "dentro");
    expect(next.saida_PJ_dentro).toEqual({ cfop: "5102", csosn: "102" });
    expect(next.saida_PF_dentro).toEqual({ cfop: "5102", csosn: "102" });
  });

  it("does not overwrite populated PJ key", () => {
    const prev = {
      saida_PF_dentro: { cfop: "5102", csosn: "102" },
      saida_PJ_dentro: { cfop: "9999", csosn: "500" },
    };
    const next = migrateIcmsKey(prev, "saida", "PF", "dentro", "PJ", "dentro");
    expect(next.saida_PJ_dentro).toEqual({ cfop: "9999", csosn: "500" });
  });
});

describe("applyCopiarCSOSN", () => {
  it("updates all 8 canonical ICMS keys with source csosn", () => {
    const prev = { saida_PF_dentro: { cfop: "1", csosn: "900" } };
    const next = applyCopiarCSOSN(prev, "saida_PF_dentro");
    const keys = [
      "saida_PF_dentro",
      "saida_PF_fora",
      "saida_PJ_dentro",
      "saida_PJ_fora",
      "entrada_PF_dentro",
      "entrada_PF_fora",
      "entrada_PJ_dentro",
      "entrada_PJ_fora",
    ];
    keys.forEach((k) => {
      expect(next[k]?.csosn).toBe("900");
    });
    expect(next.saida_PF_dentro?.cfop).toBe("1");
  });
});
