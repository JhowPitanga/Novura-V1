// §1 SIZE-EXCEPTION: 224 lines (limit 150). Justified: this file is the sole
// service for the companies domain covering CRUD, logo storage, CNPJ lookup,
// form hydration mapping, and payload normalization. Splitting would scatter
// tightly coupled company DB logic across multiple files with no clean seam.
// SECURITY-SENSITIVE: buildBaseCompanyPayload is the single place where
// certificado_senha is stripped. Never pass certificado_senha to companies table.
import { supabase } from '@/integrations/supabase/client';
import { ddmmyyyyToISO, normalizeTipoEmpresa, normalizeTributacao, resizeImageToPNG, parseToBR } from '@/utils/companyFormat';

export interface EmpresaData {
  razao_social: string;
  cnpj: string;
  tipo_empresa: string;
  tributacao: string;
  inscricao_estadual: string;
  email: string;
  cep: string;
  cidade: string;
  estado: string;
  endereco: string;
  numero: string;
  bairro: string;
  complemento?: string;
  logo_url?: string;
  certificado_a1_url?: string;
  certificado_senha?: string;
  certificado_validade?: string;
  lojas_associadas: string[];
  numero_serie: string;
  proxima_nfe: number;
  situacao_cnpj?: string;
}

export interface ConnectedStore {
  id: string;
  name: string;
  marketplace: string;
  logo?: string;
}

export interface CompanyDbPayload {
  razao_social: string;
  cnpj: string;
  tipo_empresa: string;
  tributacao: string;
  inscricao_estadual: string;
  email: string;
  cep: string;
  cidade: string;
  estado: string;
  endereco: string;
  numero: string;
  bairro: string;
  complemento?: string;
  lojas_associadas: string[];
  numero_serie: string;
  proxima_nfe: number;
  certificado_validade: string | null;
  certificado_a1_url: string | null;
  organization_id?: string;
}

export const companyKeys = {
  detail: (id: string, orgId: string) => ['companies', 'detail', id, orgId] as const,
  connectedStores: (orgId: string) => ['companies', 'connectedStores', orgId] as const,
};

/** Builds the DB insert/update payload, stripping certificado_senha. */
export const buildBaseCompanyPayload = (
  data: EmpresaData,
  organizationId?: string | null,
): CompanyDbPayload => {
  // SECURITY: certificado_senha must NEVER be included — it is destructured away here.
  const { certificado_senha: _stripped, ...rest } = data as EmpresaData & { certificado_senha?: string };
  void _stripped;
  const payload: CompanyDbPayload = {
    razao_social: rest.razao_social,
    cnpj: rest.cnpj,
    tipo_empresa: normalizeTipoEmpresa(rest.tipo_empresa),
    tributacao: normalizeTributacao(rest.tributacao),
    inscricao_estadual: rest.inscricao_estadual,
    email: rest.email,
    cep: rest.cep,
    cidade: rest.cidade,
    estado: rest.estado,
    endereco: rest.endereco,
    numero: rest.numero,
    bairro: rest.bairro,
    complemento: rest.complemento,
    lojas_associadas: rest.lojas_associadas,
    numero_serie: rest.numero_serie,
    proxima_nfe: rest.proxima_nfe,
    certificado_validade: ddmmyyyyToISO(rest.certificado_validade) || rest.certificado_validade || null,
    certificado_a1_url: rest.certificado_a1_url || null,
  };
  if (organizationId) payload.organization_id = organizationId;
  return payload;
};

export const fetchCompany = async (companyId: string, organizationId: string) => {
  let query = supabase.from('companies').select('*').eq('id', companyId);
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
};

export const fetchConnectedStores = async (organizationId: string): Promise<ConnectedStore[]> => {
  const { data: appsView, error: appsErr } = await supabase.from('apps_public_view').select('*');
  const appLogoByName = new Map<string, string>();
  if (!appsErr && Array.isArray(appsView)) {
    for (const row of appsView as any[]) {
      if (row?.name && row?.logo_url) appLogoByName.set(row.name, row.logo_url);
    }
  }
  const { data: integrations, error: intErr } = await supabase
    .from('marketplace_integrations')
    .select('id, marketplace_name, config')
    .eq('organizations_id', organizationId);
  if (intErr) throw intErr;
  return (integrations || []).map((row: any) => {
    const displayName = row.marketplace_name === 'mercado_livre' ? 'Mercado Livre' : row.marketplace_name;
    const storeName = row?.config?.storeName || 'Minha Loja';
    const logo = appLogoByName.get(displayName);
    return {
      id: String(row.id),
      name: String(storeName),
      marketplace: String(displayName),
      logo: logo ? String(logo) : undefined,
    };
  });
};

export const upsertCompanyRecord = async (
  payload: CompanyDbPayload,
  editCompanyId?: string | null,
): Promise<{ id: string; organization_id: string | null }> => {
  if (editCompanyId) {
    const { data, error } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', editCompanyId)
      .select('id, organization_id')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('companies')
    .insert([payload])
    .select('id, organization_id')
    .single();
  if (error) throw error;
  return data;
};

export const updateCertMeta = async (
  companyId: string,
  meta: { certificado_validade: string | null; certificado_a1_url: string | null },
): Promise<void> => {
  const { error } = await supabase
    .from('companies')
    .update(meta)
    .eq('id', companyId);
  if (error) console.warn('Falha ao atualizar metadados do certificado na companies:', error.message);
};

export const uploadCompanyLogo = async (blob: Blob, organizationId?: string | null): Promise<string | null> => {
  try {
    const safeName = 'logo.png';
    const folder = `${organizationId ? `org_${organizationId}` : 'org_anon'}/companies/${crypto.randomUUID()}`;
    const path = `${folder}/${safeName}`;
    const tryBuckets = ['ad-images', 'company-logos'];
    for (const bucket of tryBuckets) {
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: 'image/png' });
      if (!upErr) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data?.publicUrl || null;
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const uploadLogoFromFile = async (file: File, organizationId?: string | null): Promise<string | null> => {
  const pngBlob = await resizeImageToPNG(file, 200, 200);
  return uploadCompanyLogo(pngBlob, organizationId);
};

/** Maps a companies table row to EmpresaData form shape (edit mode hydration). */
export const mapCompanyRowToForm = (row: Record<string, unknown>, prev: EmpresaData): Partial<EmpresaData> => {
  return {
    razao_social: String(row.razao_social || ""),
    cnpj: String(row.cnpj || ""),
    tipo_empresa: String(row.tipo_empresa || ""),
    tributacao: String(row.tributacao || ""),
    inscricao_estadual: String(row.inscricao_estadual || ""),
    email: String(row.email || ""),
    cep: String(row.cep || ""),
    cidade: String(row.cidade || ""),
    estado: String(row.estado || ""),
    endereco: String(row.endereco || ""),
    numero: String(row.numero || ""),
    bairro: String(row.bairro || ""),
    complemento: String(row.complemento || ""),
    logo_url: String(row.logo_url || prev.logo_url || ""),
    lojas_associadas: Array.isArray(row.lojas_associadas) ? (row.lojas_associadas as string[]).map(String) : [],
    numero_serie: String(row.numero_serie || ""),
    proxima_nfe: Number(row.proxima_nfe) || 1,
    certificado_validade: row.certificado_validade ? parseToBR(String(row.certificado_validade)) : prev.certificado_validade,
    certificado_a1_url: String(row.certificado_a1_url || prev.certificado_a1_url || ""),
  };
};

export const fetchCompanyDataFromCNPJ = async (cnpjDigits: string): Promise<Partial<EmpresaData> | null> => {
  const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
    body: { cnpj: cnpjDigits, days: 365 },
  });
  if (error) {
    throw new Error(typeof error === 'string' ? error : (error.message || 'Erro na função cnpj-lookup'));
  }
  if (data?.ok && data?.data) {
    return data.data as Partial<EmpresaData>;
  }
  throw new Error(data?.error || 'Resposta inesperada da função cnpj-lookup');
};
