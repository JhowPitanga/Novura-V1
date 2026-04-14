/**
 * Pure transformation: builds a Focus NFe payload from order + company + tax data.
 * No DB calls — all inputs are pre-fetched values.
 */
import { digits } from "../_shared/domain/focus/focus-status.ts";

export interface BuildNfePayloadInput {
  readonly order: Record<string, any>;
  readonly shipping: Record<string, any> | null;
  readonly company: Record<string, any>;
  readonly taxConf: Record<string, any> | null;
  readonly mappedItems: any[];
  readonly nfeNumber: number;
  readonly serie: string | null;
  readonly environment: "homologacao" | "producao";
  readonly packId: string | null;
  readonly refStr: string;
  readonly cfop: string;
  readonly pisCst: string;
  readonly cofinsCst: string;
  readonly pisAliquota: number | null;
  readonly cofinsAliquota: number | null;
  readonly naturezaSaida: string | null;
}

function isCpf(s: string | null | undefined): boolean {
  return digits(s).length === 11;
}

function isCnpj(s: string | null | undefined): boolean {
  return digits(s).length === 14;
}

function buildDateStr(): string {
  const dNow = new Date();
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    timeZoneName: "shortOffset",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(dNow);
  const val = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT-3";
  const sign = tzName.includes("+") ? "+" : "-";
  const m = tzName.match(/GMT([+-]\d+)/);
  const hh = m ? String(Math.abs(parseInt(String(m[1]), 10))).padStart(2, "0") : "03";
  return `${val("year")}-${val("month")}-${val("day")}T${val("hour")}:${val("minute")}:${val("second")}${sign}${hh}:00`;
}

/** Builds the Focus NFe API payload. */
export function buildNfePayload(input: BuildNfePayloadInput): Record<string, unknown> {
  const { order, shipping, company, mappedItems, nfeNumber, serie, refStr } = input;
  const dateStr = buildDateStr();

  const emitCnpj = isCnpj(company?.cnpj) ? digits(company?.cnpj) : null;
  const emitCpf = !emitCnpj && isCpf(company?.cnpj) ? digits(company?.cnpj) : null;

  const destDoc = String(order.buyer_document || "").trim();
  const destCpf = isCpf(destDoc) ? digits(destDoc) : null;
  const destCnpj = isCnpj(destDoc) ? digits(destDoc) : null;

  const itemsFocus = mappedItems.map((it: any, idx: number) => {
    const qtd = Number(it?.quantidade_comercial || 1);
    const unit = Number(it?.valor_unitario_comercial || 0);
    const ncmNum = Number(String(it?.ncm || "").replace(/\D/g, "")) || null;
    const origemNum = it?.origem !== undefined ? Number(String(it?.origem).replace(/\D/g, "")) : undefined;
    const itemOut: any = {
      numero_item: idx + 1,
      codigo_produto: String(it?.codigo || it?.descricao || ""),
      descricao: String(it?.descricao || ""),
      cfop: Number(it?.cfop || input.cfop || 0),
      unidade_comercial: String(it?.unidade_comercial || "un"),
      quantidade_comercial: qtd,
      valor_unitario_comercial: unit,
      valor_unitario_tributavel: unit,
      unidade_tributavel: String(it?.unidade_comercial || "un"),
      codigo_ncm: ncmNum,
      quantidade_tributavel: qtd,
      valor_bruto: Number((qtd || 0) * (unit || 0)),
      icms_origem: origemNum,
      pis_situacao_tributaria: String(input.pisCst),
      cofins_situacao_tributaria: String(input.cofinsCst),
    };
    if (input.pisAliquota !== null) itemOut.pis_aliquota = input.pisAliquota;
    if (input.cofinsAliquota !== null) itemOut.cofins_aliquota = input.cofinsAliquota;
    if (it?.icms_situacao_tributaria !== undefined) {
      itemOut.icms_situacao_tributaria = Number(String(it.icms_situacao_tributaria).replace(/\D/g, ""));
    }
    return itemOut;
  });

  const valorProdutos = itemsFocus.reduce((acc: number, cur: any) => acc + Number(cur?.valor_bruto || 0), 0);

  return {
    natureza_operacao: input.naturezaSaida || "Venda de mercadorias",
    data_emissao: dateStr,
    data_entrada_saida: dateStr,
    tipo_documento: 1,
    finalidade_emissao: 1,
    cnpj_emitente: emitCnpj || undefined,
    cpf_emitente: emitCpf || undefined,
    nome_emitente: String(company?.razao_social || ""),
    nome_fantasia_emitente: String(company?.nome_fantasia || company?.razao_social || ""),
    logradouro_emitente: String(company?.endereco || ""),
    numero_emitente: Number(company?.numero || 0) || undefined,
    bairro_emitente: String(company?.bairro || ""),
    municipio_emitente: String(company?.cidade || ""),
    uf_emitente: String(company?.estado || ""),
    cep_emitente: digits(String(company?.cep || "")),
    inscricao_estadual_emitente: String(company?.inscricao_estadual || "") || undefined,
    nome_destinatario: String(order.buyer_name || "Cliente"),
    cpf_destinatario: destCpf || undefined,
    cnpj_destinatario: destCnpj || undefined,
    logradouro_destinatario: String(shipping?.street_name || ""),
    numero_destinatario: Number(shipping?.street_number || 0) || undefined,
    bairro_destinatario: String(shipping?.neighborhood || ""),
    municipio_destinatario: String(shipping?.city || ""),
    uf_destinatario: String(shipping?.state_uf || ""),
    pais_destinatario: "Brasil",
    cep_destinatario: Number(digits(String(shipping?.zip_code || "")) || 0) || undefined,
    valor_frete: 0,
    valor_seguro: 0,
    valor_total: valorProdutos,
    valor_produtos: valorProdutos,
    modalidade_frete: 2,
    serie,
    numero: nfeNumber,
    ref: refStr,
    items: itemsFocus,
  };
}
