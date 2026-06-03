// SECURITY-SENSITIVE: certificate password handling — reviewed
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { parsePfxCertificate } from '@/utils/certificate';
import { formatDateBR } from '@/utils/companyFormat';

export type CertVerifyStatus = 'idle' | 'checking' | 'valid' | 'invalid';

interface UseCertVerificationOptions {
  senha: string;
  onValidityFound: (dateBR: string) => void;
}

interface UseCertVerificationReturn {
  certVerifyStatus: CertVerifyStatus;
  pfxFileRef: React.MutableRefObject<File | null>;
  handlePfxSelected: (file: File | null, clearValidade: () => void) => void;
  handleVerifyCertPassword: () => Promise<void>;
}

/**
 * Manages PFX file selection and cert password verification.
 * Translates CertParseResult into certVerifyStatus + PT toasts.
 * SECURITY: certificado_senha is read-only here; never persisted.
 */
export const useCertVerification = ({ senha, onValidityFound }: UseCertVerificationOptions): UseCertVerificationReturn => {
  const [certVerifyStatus, setCertVerifyStatus] = useState<CertVerifyStatus>('idle');
  const pfxFileRef = useRef<File | null>(null);

  const handlePfxSelected = (file: File | null, clearValidade: () => void) => {
    pfxFileRef.current = file;
    setCertVerifyStatus('idle');
    if (file) clearValidade();
  };

  const handleVerifyCertPassword = async () => {
    if (!pfxFileRef.current) {
      toast.error('Selecione um arquivo .pfx para verificar');
      return;
    }
    if (!senha) {
      toast.error('Informe a senha do certificado');
      return;
    }
    setCertVerifyStatus('checking');
    const buf = await pfxFileRef.current.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const result = await parsePfxCertificate(bytes, senha);
    if (result.ok) {
      onValidityFound(formatDateBR(result.notAfter));
      setCertVerifyStatus('valid');
      toast.success('Senha verificada e validade preenchida');
    } else if (result.reason === 'no-validity') {
      setCertVerifyStatus('invalid');
      toast.error('Não foi possível identificar a validade do certificado');
    } else {
      console.error('Falha ao verificar senha do PFX');
      setCertVerifyStatus('invalid');
      toast.error('Senha inválida ou arquivo .pfx não pôde ser lido');
    }
  };

  return {
    certVerifyStatus,
    pfxFileRef,
    handlePfxSelected,
    handleVerifyCertPassword,
  };
};
