import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { isValidCNPJ, normalizeSituacao, getCnpjBlockInfo } from '@/utils/cnpj';
import { fetchCompanyDataFromCNPJ } from '@/services/company.service';
import type { EmpresaData } from '@/services/company.service';

interface UseCnpjLookupOptions {
  onResult: (data: Partial<EmpresaData>) => void;
}

interface UseCnpjLookupReturn {
  cnpjBlocked: boolean;
  cnpjBlockMessage: string;
  isCnpjLoading: boolean;
  lastFetchedRef: React.MutableRefObject<string>;
  triggerLookup: (cnpj: string) => void;
  setCnpjBlocked: (v: boolean) => void;
  setCnpjBlockMessage: (v: string) => void;
}

/**
 * Debounced CNPJ lookup via useMutation + useRef timer.
 * Preserves 600ms debounce, lastFetchedRef dedup, and cnpjBlocked state.
 */
export const useCnpjLookup = ({ onResult }: UseCnpjLookupOptions): UseCnpjLookupReturn => {
  const [cnpjBlocked, setCnpjBlocked] = useState(false);
  const [cnpjBlockMessage, setCnpjBlockMessage] = useState('');
  const debounceRef = useRef<number | null>(null);
  const lastFetchedRef = useRef<string>('');

  const mutation = useMutation({
    mutationFn: (digits: string) => fetchCompanyDataFromCNPJ(digits),
    onSuccess: (result, digits) => {
      if (!result) return;
      onResult(result);
      lastFetchedRef.current = digits;
      const situRaw = String((result as any).situacao_cnpj || '');
      const norm = normalizeSituacao(situRaw);
      const msg = getCnpjBlockInfo(situRaw);
      console.log('[CNPJ] avaliação situação', { situRaw, norm, msg });
      if (msg) {
        setCnpjBlocked(true);
        setCnpjBlockMessage(msg);
      } else {
        setCnpjBlocked(false);
        setCnpjBlockMessage('');
      }
      toast.success('Dados do CNPJ carregados automaticamente');
    },
    onError: (err: any) => {
      console.error('Falha na consulta do CNPJ:', err);
      const msg = String(err?.message || err);
      if (msg.includes('Failed to send a request')) {
        toast.error("Falha de rede ao acessar a Edge Function. Verifique se 'cnpj-lookup' está implantada no seu projeto Supabase.");
      } else {
        toast.error('Não foi possível consultar o CNPJ agora. Tente novamente.');
      }
    },
  });

  const triggerLookup = (cnpj: string) => {
    const digits = (cnpj || '').replace(/\D/g, '');
    if (digits.length !== 14) return;
    if (!isValidCNPJ(digits)) {
      toast.error('CNPJ inválido. Verifique os dígitos e tente novamente.');
      return;
    }
    if (digits === lastFetchedRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      mutation.mutate(digits);
    }, 600);
  };

  return {
    cnpjBlocked,
    cnpjBlockMessage,
    isCnpjLoading: mutation.isPending,
    lastFetchedRef,
    triggerLookup,
    setCnpjBlocked,
    setCnpjBlockMessage,
  };
};
