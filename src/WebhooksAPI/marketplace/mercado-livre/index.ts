/**
 * Webhooks API - Marketplace - Mercado Livre
 *
 * Este módulo servirá para receber, validar e processar eventos de webhook do Mercado Livre,
 * além de expor utilitários para integração com a página de aplicativos.
 *
 * Próximos passos:
 * - Definir rotas/endpoints para recebimento dos webhooks
 * - Implementar verificação de assinatura/segurança
 * - Mapear tipos de eventos e normalizar payloads
 * - Integrar com marketplace_integrations usando organizations_id
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export interface MercadoLivreWebhookEvent {
  type: string;
  data: unknown;
  receivedAt: string; // ISO string
}

export function handleMercadoLivreWebhook(event: MercadoLivreWebhookEvent) {
  // TODO: Implementar processamento de eventos do Mercado Livre
  // Ex.: atualizar anúncios, sincronizar pedidos, atualizar estoque, etc.
}

// Inicia o fluxo de autorização no Mercado Livre usando a Edge Function segura
export interface StartAuthOptions {
  organizationId: string;
  storeName: string;
  marketplaceName?: string; // default: 'Mercado Livre'
  connectedByUserId?: string | null;
  redirectUri?: string | null;
}

export async function startMercadoLivreAuth(
  supabase: SupabaseClient<Database>,
  opts: StartAuthOptions,
): Promise<{ authorization_url: string; state?: string }> {
  const { data, error } = await supabase.functions.invoke('mercado-livre-start-auth', {
    body: {
      marketplaceName: opts.marketplaceName ?? 'Mercado Livre',
      organizationId: opts.organizationId,
      storeName: opts.storeName,
      connectedByUserId: opts.connectedByUserId ?? null,
      redirect_uri: opts.redirectUri ?? undefined,
    },
  });
  if (error) throw error;
  const authorization_url = (data as any)?.authorization_url as string | undefined;
  const state = (data as any)?.state as string | undefined;
  if (!authorization_url) throw new Error((data as any)?.error || 'authorization_url ausente');
  return { authorization_url, state };
}

// Escuta o postMessage de sucesso do callback (tipo 'meli_oauth_success') e retorna um unsubscribe
export function listenForMeliOAuthSuccess(handler: (payload: any) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    const type = (event?.data && typeof event.data === 'object') ? event.data.type : null;
    if (type === 'meli_oauth_success') {
      try {
        handler((event.data as any)?.payload);
      } finally {
        window.removeEventListener('message', onMessage);
      }
    }
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

// Solicita renovação de token via Edge Function segura
export async function refreshMercadoLivreToken(
  supabase: SupabaseClient<Database>,
  integrationId: string,
): Promise<{ ok: boolean; access_token?: string; expires_in?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('mercado-livre-refresh', {
    body: { integrationId },
  });
  if (error) throw error;
  return data as any;
}