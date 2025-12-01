import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function strToUint8(str: string): Uint8Array { return new TextEncoder().encode(str); }
function uint8ToB64(bytes: Uint8Array): string { const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); return btoa(bin); }
function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64OrHexKey: string): Promise<CryptoKey> {
  const cleaned = base64OrHexKey.trim().replace(/^0x/i, "").replace(/[\s-]/g, "");
  let keyBytes: Uint8Array | null = null;
  try { const b64Bytes = b64ToUint8(cleaned); if (b64Bytes.length === 16 || b64Bytes.length === 24 || b64Bytes.length === 32) keyBytes = b64Bytes; else keyBytes = null; } catch { keyBytes = null; }
  if (!keyBytes) {
    const isHex = /^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0;
    if (!isHex) throw new Error("Invalid key format");
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < cleaned.length; i += 2) bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
    if (!(bytes.length === 16 || bytes.length === 24 || bytes.length === 32)) throw new Error("Invalid key length");
    keyBytes = bytes;
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]);
}
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-credentials": "true",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);

  try {
    const rid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let parsed: any = {}; try { parsed = await req.json(); } catch { parsed = {}; }
    const organizationId: string | undefined = parsed?.organizationId;
    const categoryId: string | undefined = parsed?.categoryId;
    if (!organizationId || !categoryId) return jsonResponse({ error: "organizationId and categoryId required", rid }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const aesKey = await importAesGcmKey(ENC_KEY_B64);

    const { data: integ, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, marketplace_name, access_token")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    if (integErr || !integ) return jsonResponse({ error: integErr?.message || "Integration not found", rid }, 404);

    let accessToken: string; try { accessToken = await aesGcmDecryptFromString(aesKey, integ.access_token); } catch { accessToken = String(integ.access_token || ""); }

    const url = `https://api.mercadolibre.com/categories/${encodeURIComponent(categoryId)}/sale_terms`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    const json = await resp.json();
    if (!resp.ok) return jsonResponse({ error: "sale_terms fetch failed", rid, meli: json }, resp.status || 400);
    return jsonResponse({ ok: true, terms: Array.isArray(json) ? json : [] }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});