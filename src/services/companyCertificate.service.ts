// SECURITY-SENSITIVE: This file invokes edge functions for certificate upload
// and Focus NF-e sync. Bearer token forwarding and certificado_senha handling
// must be reviewed explicitly before any change.
import { supabase } from '@/integrations/supabase/client';
import { readFileAsBase64 } from '@/utils/certificate';
import { ddmmyyyyToISO } from '@/utils/companyFormat';
import { updateCertMeta } from './company.service';

export interface CertUploadParams {
  companyId: string;
  organizationId: string | null;
  pfxFile: File;
  certificadoValidade?: string;
  accessToken?: string;
}

export interface FocusParams {
  companyId: string;
  organizationId: string | null;
  mode: 'insert' | 'update';
  certBase64?: string;
  senha?: string;
  accessToken?: string;
}

export interface CertSyncParams {
  companyId: string;
  organizationId: string | null;
  pfxFile: File | null;
  certificado_senha?: string;
  certificado_validade?: string;
  accessToken?: string;
  /** 'insert' → focus dry_run:true; 'update' → focus mode:'update', dry_run:false */
  mode: 'insert' | 'update';
  /**
   * True when the company already has a certificate stored from a previous save.
   * Used to decide whether to call Focus on `update` even when no new PFX is provided.
   */
  hasPreviousCertificate?: boolean;
}

export const invokeUploadCertificate = async (
  params: CertUploadParams,
): Promise<void> => {
  const base64 = await readFileAsBase64(params.pfxFile);
  const { error } = await supabase.functions.invoke('upload-company-certificate', {
    body: {
      company_id: params.companyId,
      organization_id: params.organizationId,
      pfx_base64: base64,
      file_name: params.pfxFile.name,
      valid_to: ddmmyyyyToISO(params.certificadoValidade) || params.certificadoValidade || null,
    },
    headers: params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : undefined,
  });
  if (error) throw error;
};

export const invokeFocusCompanyCreate = async (params: FocusParams) => {
  const body: Record<string, unknown> = {
    company_id: params.companyId,
    organization_id: params.organizationId,
    arquivo_certificado_base64: params.certBase64,
    senha_certificado: params.certBase64 ? params.senha : undefined,
  };
  if (params.mode === 'update') {
    body.mode = 'update';
    body.dry_run = false;
  } else {
    body.dry_run = true;
  }
  const { data, error } = await supabase.functions.invoke('focus-company-create', {
    body,
    headers: params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : undefined,
  });
  return { data, error };
};

/**
 * Shared helper that collapses the verbatim insert/update cert+Focus blocks.
 *
 * Dedup decision (approved):
 *   mode='insert' → focus dry_run:true, no mode key
 *   mode='update' → focus mode:'update', dry_run:false
 * The mode param is typed as a discriminated union to prevent swapping at call sites.
 *
 * SECURITY: certificado_senha is forwarded to focus-company-create only —
 * never written to the companies table.
 */
export const runCertUploadAndFocusSync = async (params: CertSyncParams): Promise<{
  focusOk: boolean;
  focusWarning: string | null;
}> => {
  let certBase64: string | undefined;

  if (params.pfxFile) {
    // Step 1: Upload PFX to secure storage via edge function
    await invokeUploadCertificate({
      companyId: params.companyId,
      organizationId: params.organizationId,
      pfxFile: params.pfxFile,
      certificadoValidade: params.certificado_validade,
      accessToken: params.accessToken,
    });

    // Step 2: Update cert metadata in companies (fire-and-forget, non-fatal)
    try {
      await updateCertMeta(params.companyId, {
        certificado_validade: ddmmyyyyToISO(params.certificado_validade) || params.certificado_validade || null,
        certificado_a1_url: params.pfxFile.name || null,
      });
    } catch (e) {
      console.warn('Exceção ao atualizar metadados do certificado na companies:', (e as any)?.message || e);
    }

    // Prepare cert for Focus (only when senha is provided)
    if (params.certificado_senha) {
      certBase64 = await readFileAsBase64(params.pfxFile);
    }
  }

  // Step 3: Invoke Focus NFe sync — only when a certificate is available.
  // Skip entirely if there is no new PFX file and no previously stored certificate,
  // to avoid spurious errors during onboarding before the cert is configured.
  const hasCert = Boolean(params.pfxFile || params.hasPreviousCertificate);
  if (!hasCert) {
    return { focusOk: false, focusWarning: null };
  }

  const { data: focusRes, error: focusErr } = await invokeFocusCompanyCreate({
    companyId: params.companyId,
    organizationId: params.organizationId,
    mode: params.mode,
    certBase64,
    senha: params.certificado_senha,
    accessToken: params.accessToken,
  });

  if (focusErr) {
    const msg = (focusErr as any)?.message || String(focusErr);
    const label = params.mode === 'update' ? '(update)' : '(insert)';
    console.warn(`Focus NFe integração ${label} falhou:`, msg);
    return {
      focusOk: false,
      focusWarning: params.mode === 'update'
        ? 'Integração com Focus NFe não foi concluída.'
        : 'Integração com Focus NFe não foi concluída (dry-run).',
    };
  }
  if (focusRes?.ok) {
    return { focusOk: true, focusWarning: null };
  }
  return {
    focusOk: false,
    focusWarning: 'Focus respondeu com aviso.',
  };
};
