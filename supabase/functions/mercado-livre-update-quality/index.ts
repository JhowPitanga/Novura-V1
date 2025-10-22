// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type UpdateBody = {
  organizationId?: string; // pass '*' to update all orgs
  itemIds?: string[];
  meliAccessToken?: string; // fallback if not stored
};

serve(async (req) => {
  try {
    const { organizationId, itemIds, meliAccessToken }: UpdateBody = await req.json().catch(() => ({} as any));
    console.log('[ml-quality] body', { organizationId, itemIdsCount: itemIds?.length || 0, providedToken: !!meliAccessToken });
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organizationId required" }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || undefined;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    console.log('[ml-quality] auth header present?', !!authHeader);

    const orgIds: string[] = [];
    if (organizationId === '*') {
      const { data: orgRows, error: orgErr } = await supabase
        .from('marketplace_items')
        .select('organizations_id')
        .eq('marketplace_name', 'Mercado Livre')
        .not('organizations_id', 'is', null)
        .limit(1000);
      if (orgErr) { console.error('[ml-quality] org query error', orgErr.message); throw orgErr; }
      const distinct = new Set<string>((orgRows || []).map((r: any) => r.organizations_id));
      orgIds.push(...Array.from(distinct));
    } else {
      orgIds.push(organizationId);
    }

    const toScore = (level: string | null | undefined): number => {
      const lv = (level || '').toLowerCase();
      if (!lv) return 0;
      if (lv.includes('profissional') || lv.includes('professional')) return 100;
      if (lv.includes('satisfat') || lv.includes('estándar') || lv.includes('standard')) return 66;
      if (lv.includes('básica') || lv.includes('basic')) return 33;
      return 0;
    };

    const nowIso = new Date().toISOString();
    let updated = 0;

    // Limit concurrency to avoid rate limits
    const MAX_CONCURRENCY = 6;
    let i = 0;
    const runOne = async (id: string, accessToken: string, orgIdForUpdate: string) => {
      try {
        const url = `https://api.mercadolibre.com/item/${encodeURIComponent(id)}/performance`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          console.warn('[ml-quality] performance fetch not ok', id, resp.status, t);
          return;
        }
        if (!resp.ok) return;
        const data = await resp.json().catch(() => null as any);
        const level: string | null = data?.level_wording || data?.level || null;
        const scoreRaw = Number(data?.score);
        const score = isNaN(scoreRaw) ? toScore(level) : Math.max(0, Math.min(100, scoreRaw));
        const { error: upErr } = await supabase
          .from("marketplace_items")
          .update({ listing_quality: score, quality_level: level, last_quality_update: nowIso })
          .eq("marketplace_item_id", id)
          .eq("organizations_id", orgIdForUpdate);
        if (!upErr) updated += 1;
        else console.warn('[ml-quality] update error', id, upErr.message);
      } catch { /* ignore per item */ }
    };

    for (const orgId of orgIds) {
      console.log('[ml-quality] processing org', orgId);
      // Resolve token per org (or use provided for single-org)
      let resolvedToken = meliAccessToken || "";
      if (!resolvedToken) {
        const { data: integ, error: integErr } = await supabase
          .from("marketplace_integrations")
          .select("access_token")
          .eq("organizations_id", orgId)
          .eq("marketplace_name", "Mercado Livre")
          .maybeSingle();
        if (integErr) console.warn('[ml-quality] token lookup error', integErr.message);
        resolvedToken = (integ as any)?.access_token || "";
      }
      if (!resolvedToken) {
        console.warn('[ml-quality] skipping org, missing token', orgId);
        continue;
      }
      // Load item ids if not provided
      let ids: string[] = (itemIds || []);
      if (!ids.length) {
        const { data: rows, error } = await supabase
          .from("marketplace_items")
          .select("marketplace_item_id")
          .eq("organizations_id", orgId)
          .eq("marketplace_name", "Mercado Livre")
          .order("updated_at", { ascending: false })
          .limit(500);
        if (error) { console.error('[ml-quality] items query error', error.message); throw error; }
        ids = (rows || []).map((r: any) => r.marketplace_item_id).filter(Boolean);
      }
      console.log('[ml-quality] items', ids.length);
      if (!ids.length) continue;

      i = 0;
      const workers: Promise<void>[] = [];
      while (i < ids.length) {
        while (workers.length < MAX_CONCURRENCY && i < ids.length) {
          workers.push(runOne(ids[i++], resolvedToken, orgId));
        }
        await Promise.all(workers).catch(() => {});
        workers.length = 0;
      }
    }

    return new Response(JSON.stringify({ ok: true, updated }), { status: 200 });
  } catch (e: any) {
    console.error('[ml-quality] fatal', e?.message);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500 });
  }
});


