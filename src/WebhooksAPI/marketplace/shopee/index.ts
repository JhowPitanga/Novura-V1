import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export interface StartAuthOptions {
  organizationId: string;
  storeName: string;
  connectedByUserId?: string | null;
  redirectUri?: string | null;
}

type StartAuthResponse = {
  authorization_url?: string;
  state?: string;
  error?: string;
};

export async function startShopeeAuth(
  supabase: SupabaseClient<Database>,
  opts: StartAuthOptions,
): Promise<{ authorization_url: string; state?: string }> {
  const { data, error } = await supabase.functions.invoke<StartAuthResponse>('shopee-start-auth', {
    body: {
      organizationId: opts.organizationId,
      storeName: opts.storeName,
      connectedByUserId: opts.connectedByUserId ?? null,
      redirect_uri: opts.redirectUri ?? undefined,
    },
  });
  if (error) throw error;
  const authorization_url = data?.authorization_url;
  const state = data?.state;
  if (!authorization_url) throw new Error(data?.error || 'authorization_url ausente');
  return { authorization_url, state };
}

export function listenForShopeeOAuthSuccess(handler: (payload: unknown) => void): () => void {
  const isShopeeMessage = (data: unknown): data is { type?: string; payload?: unknown } => {
    return typeof data === 'object' && data !== null && 'type' in (data as Record<string, unknown>);
  };
  const onMessage = (event: MessageEvent) => {
    if (!isShopeeMessage(event.data)) return;
    if (event.data.type === 'shopee_oauth_success') {
      try {
        handler(event.data.payload);
      } finally {
        window.removeEventListener('message', onMessage);
      }
    }
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
