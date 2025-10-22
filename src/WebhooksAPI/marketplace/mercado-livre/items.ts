import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';

export type MarketplaceItem = Database['public']['Tables']['marketplace_items']['Row'];

// Helpers para decodificar JWT (base64url)
function b64UrlToUint8(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4; if (pad) b64 += '='.repeat(4 - pad);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function decodeJwtSub(jwt: string): string | null {
  try {
    const parts = jwt.split('.'); if (parts.length < 2) return null;
    const payloadBytes = b64UrlToUint8(parts[1]);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    return (payload?.sub as string) || (payload?.user_id as string) || null;
  } catch { return null; }
}

export async function fetchMercadoLivreItems(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  opts?: { limit?: number }
): Promise<MarketplaceItem[]> {
  const limit = opts?.limit ?? 200;
  const { data, error } = await supabase
    .from('marketplace_items')
    .select('*')
    .eq('organizations_id', organizationId)
    .eq('marketplace_name', 'Mercado Livre')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function syncMercadoLivreItems(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  siteId?: string
): Promise<{ ok: boolean; synced: number }> {
  // Busca token atual da sessão para garantir Authorization
  const { data: sessionRes } = await (supabase as any).auth.getSession();
  const token: string | undefined = sessionRes?.session?.access_token;

  if (!token) {
    // Evita chamar a função sem header Authorization (gateway retornaria 401)
    throw new Error('Sessão expirada ou ausente. Faça login novamente e tente sincronizar.');
  }

  const invokeHeaders: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };

  const { data, error } = await supabase.functions.invoke('mercado-livre-sync-items', {
    body: { organizationId, siteId },
    headers: invokeHeaders,
  } as any);

  if (error) {
    // Captura status/mensagem originais do invoke para compor feedback
    const originalStatus = (error as any)?.status;
    const originalMessage = (error as any)?.message;

    // Tenta obter corpo detalhado diretamente do Functions host
    try {
      const functionsUrl = `${SUPABASE_URL}/functions/v1/mercado-livre-sync-items`;
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${token}`,
      };

      const resp = await fetch(functionsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ organizationId, siteId }),
      });

      // Tenta ler JSON; se falhar, lê texto bruto
      let json: any = null;
      try {
        json = await resp.json();
      } catch {
        try {
          const text = await resp.text();
          json = text ? { error: text } : {};
        } catch {
          json = {};
        }
      }

      if (!resp.ok) {
        const errMsg = json?.error ? String(json.error) : (json?.message ? String(json.message) : `HTTP ${resp.status}`);
        let detail = json?.details ? `: ${JSON.stringify(json.details).slice(0, 200)}` : '';
        // Se 403, ANEXA SEMPRE contexto extra (role/org/user) mesmo quando já há details
        if (resp.status === 403) {
          try {
            const userIdFromJwt = decodeJwtSub(token);
            let myRole: string | null = null;
            let myPerms: any = null;
            if (userIdFromJwt) {
              const { data: permData } = await supabase.rpc('rpc_get_member_permissions', {
                p_user_id: userIdFromJwt,
                p_organization_id: organizationId,
              });
              const row = Array.isArray(permData) ? (permData?.[0] as any) : (permData as any);
              myRole = row?.role ?? null;
              myPerms = row?.permissions ?? null;
              const extra = { myRole, hasOrg: !!organizationId, org: organizationId, userIdFromJwt };
              if (json?.details) {
                detail = `: ${JSON.stringify({ details: json.details, extra }).slice(0, 500)}`;
              } else {
                detail = `: ${JSON.stringify(extra).slice(0, 300)}`;
              }
            }
          } catch { /* ignore */ }
        }
        const base = [originalStatus ? `HTTP ${originalStatus}` : null, originalMessage].filter(Boolean).join(' - ');
        const composed = base ? `${base} — Falha ao sincronizar (${errMsg})${detail}` : `Falha ao sincronizar (${errMsg})${detail}`;
        throw new Error(composed);
      }
      return (json as any) ?? { ok: false, synced: 0 };
    } catch (fallbackErr: any) {
      // Propaga o erro do fallback (mais específico) + dados originais do invoke
      const base = [originalStatus ? `HTTP ${originalStatus}` : null, originalMessage].filter(Boolean).join(' - ');
      const msg = String(fallbackErr?.message || 'Erro ao sincronizar');
      throw new Error(base ? `${base} — ${msg}` : msg);
    }
  }
  return (data as any) ?? { ok: false, synced: 0 };
}

// Fetch quality metrics for a list of Mercado Livre items using access token from session
export async function fetchMercadoLivreQuality(
  supabase: SupabaseClient<Database>,
  itemIds: string[]
): Promise<Record<string, { score: number; level: string | null }>> {
  if (!itemIds?.length) return {};
  const { data: sessionRes } = await (supabase as any).auth.getSession();
  const token: string | undefined = sessionRes?.session?.access_token;
  if (!token) throw new Error('Sessão expirada.');

  // Use the new /item/{ITEM_ID}/performance endpoint
  // Map level_wording to a numeric score for the gauge
  const toScore = (level: string | null | undefined): number => {
    const lv = (level || '').toLowerCase();
    if (!lv) return 0;
    if (lv.includes('profissional') || lv.includes('professional')) return 100;
    if (lv.includes('satisfat') || lv.includes('estándar') || lv.includes('standard')) return 66;
    if (lv.includes('básica') || lv.includes('basic')) return 33;
    return 0;
  };

  const results: Record<string, { score: number; level: string | null }> = {};
  // Limit concurrency to avoid rate limits
  const MAX_CONCURRENCY = 6;
  let idx = 0;
  const runOne = async (id: string) => {
    try {
      const url = `https://api.mercadolibre.com/item/${encodeURIComponent(id)}/performance`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) return;
      const data = await resp.json().catch(() => null as any);
      const level: string | null = data?.level_wording || data?.level || null;
      const scoreRaw = Number(data?.score);
      const score = isNaN(scoreRaw) ? toScore(level) : scoreRaw;
      results[id] = { score: Math.max(0, Math.min(100, score)), level };
    } catch {
      // ignore errors per item
    }
  };

  const workers: Promise<void>[] = [];
  while (idx < itemIds.length) {
    while (workers.length < MAX_CONCURRENCY && idx < itemIds.length) {
      workers.push(runOne(itemIds[idx++]));
    }
    await Promise.race(workers).catch(() => {});
    // Remove settled promises
    for (let i = workers.length - 1; i >= 0; i--) {
      if ((workers[i] as any).settled) continue;
    }
    // Simpler: wait all current batch then clear
    await Promise.all(workers).catch(() => {});
    workers.length = 0;
  }

  return results;
}

export function subscribeMercadoLivreItems(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  onChange: (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: MarketplaceItem; old?: MarketplaceItem }) => void
) {
  const channel = supabase
    .channel(`marketplace_items_meli_${organizationId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'marketplace_items',
      filter: `organizations_id=eq.${organizationId}`,
    }, (payload: any) => {
      const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
      const newRow = payload.new as MarketplaceItem | undefined;
      const oldRow = payload.old as MarketplaceItem | undefined;
      if (newRow?.marketplace_name !== 'Mercado Livre' && oldRow?.marketplace_name !== 'Mercado Livre') return;
      onChange({ eventType, new: newRow, old: oldRow });
    })
    .subscribe();

  const unsubscribe = () => {
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
  };
  return { channel, unsubscribe };
}