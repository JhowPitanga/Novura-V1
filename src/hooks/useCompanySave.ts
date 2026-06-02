// SECURITY-SENSITIVE: orchestrates buildBaseCompanyPayload (strips certificado_senha)
// and runCertUploadAndFocusSync. Bearer token forwarding verified here.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import type { EmpresaData } from '@/services/company.service';
import {
  buildBaseCompanyPayload,
  upsertCompanyRecord,
  updateCertMeta,
} from '@/services/company.service';
import { runCertUploadAndFocusSync } from '@/services/companyCertificate.service';

interface UseCompanySaveOptions {
  empresaData: EmpresaData;
  editCompanyId: string | null;
  organizationId: string | null;
  session: Session | null;
  pfxFileRef: React.MutableRefObject<File | null>;
  user: { id: string } | null;
}

interface UseCompanySaveReturn {
  handleSave: () => void;
  loading: boolean;
}

export const useCompanySave = ({
  empresaData,
  editCompanyId,
  organizationId,
  session,
  pfxFileRef,
  user,
}: UseCompanySaveOptions): UseCompanySaveReturn => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnToApp = searchParams.get('returnToApp');
  const returnProviderKey = searchParams.get('providerKey');
  const [loading, setLoading] = useState(false);

  const navigateAfterSave = (newCompanyId?: string) => {
    if (returnToApp) {
      try {
        sessionStorage.setItem(
          'novura:pending_setup',
          JSON.stringify({ integrationId: returnToApp, providerKey: returnProviderKey }),
        );
      } catch {
        // sessionStorage unavailable — user will need to configure manually
      }
      navigate(`/aplicativos/conectados?company=${newCompanyId ?? ''}`);
      return;
    }
    navigate('/configuracoes');
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (!user) throw new Error('Usuário não autenticado');

      // SECURITY: buildBaseCompanyPayload strips certificado_senha
      const payload = buildBaseCompanyPayload(empresaData, organizationId);
      const saved = await upsertCompanyRecord(payload, editCompanyId);
      const isUpdate = Boolean(editCompanyId);

      // Cert metadata update (no PFX file — fire-and-forget)
      if (!pfxFileRef.current && (empresaData.certificado_validade || empresaData.certificado_a1_url)) {
        try {
          await updateCertMeta(saved.id, {
            certificado_validade: payload.certificado_validade,
            certificado_a1_url: empresaData.certificado_a1_url || null,
          });
        } catch (e) {
          console.warn('Exceção ao atualizar metadados do certificado na companies:', (e as any)?.message || e);
        }
      }

      // Cert upload + Focus sync (always; pfxFile may be null — Focus still runs)
      try {
        const { focusOk, focusWarning } = await runCertUploadAndFocusSync({
          companyId: saved.id,
          organizationId: saved.organization_id || organizationId || null,
          pfxFile: pfxFileRef.current,
          certificado_senha: empresaData.certificado_senha,
          certificado_validade: empresaData.certificado_validade,
          accessToken: session?.access_token,
          mode: isUpdate ? 'update' : 'insert',
        });
        if (focusWarning) {
          toast.warning(isUpdate ? `Empresa atualizada. ${focusWarning}` : `Empresa criada. ${focusWarning}`);
        } else if (focusOk) {
          toast.success(isUpdate
            ? 'Empresa atualizada e sincronizada com a Focus.'
            : 'Empresa criada e validada na Focus (dry-run).');
        }
      } catch (fnErr) {
        if (pfxFileRef.current) {
          console.error('Falha ao salvar certificado com segurança:', fnErr);
          toast.error(isUpdate
            ? 'Empresa atualizada, mas houve erro ao salvar o certificado A1. Tente novamente.'
            : 'Empresa criada, mas houve erro ao salvar o certificado A1. Você pode tentar novamente nas configurações.');
        } else {
          console.warn('Exceção ao integrar Focus NFe:', (fnErr as any)?.message || fnErr);
          toast.warning(isUpdate
            ? 'Empresa atualizada. Integração com Focus não pôde ser verificada.'
            : 'Empresa criada. Integração com Focus não pôde ser verificada.');
        }
      }

      toast.success(isUpdate ? 'Empresa atualizada com sucesso!' : 'Empresa cadastrada com sucesso!');
      navigateAfterSave(isUpdate ? undefined : saved.id);
    } catch (error) {
      console.error('Erro ao salvar empresa:', error);
      toast.error('Erro ao salvar empresa');
    } finally {
      setLoading(false);
    }
  };

  return { handleSave, loading };
};
