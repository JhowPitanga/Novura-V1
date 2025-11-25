// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
declare const Deno: any;

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

// AES-GCM helpers (same format as callback/refresh)
function strToUint8(str: string): Uint8Array { return new TextEncoder().encode(str); }
function uint8ToB64(bytes: Uint8Array): string { const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); return btoa(bin); }
function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext).buffer as ArrayBuffer); const ctBytes = new Uint8Array(ct); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> {
  const parts = encStr.split(":");
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format");
  const iv = b64ToUint8(parts[2]);
  const ct = b64ToUint8(parts[3]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct.buffer as ArrayBuffer);
  return new TextDecoder().decode(pt);
}

// Decode base64url (JWT payload) to bytes
function b64UrlToUint8(b64url: string): Uint8Array { let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/"); const pad = b64.length % 4; if (pad) b64 += "=".repeat(4 - pad); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }

// Extract user id (sub) from JWT without calling auth APIs
function decodeJwtSub(jwt: string): string | null { try { const parts = jwt.split("."); if (parts.length < 2) return null; const payloadBytes = b64UrlToUint8(parts[1]); const payload = JSON.parse(new TextDecoder().decode(payloadBytes)); return (payload?.sub as string) || (payload?.user_id as string) || null; } catch { return null; } }

Deno.serve(async (req) => {
  console.log(`[meli-sync-items] ${req.method} request received at ${new Date().toISOString()}`);
  
  if (req.method === "OPTIONS") {
    console.log("[meli-sync-items] Handling OPTIONS request");
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    console.log(`[meli-sync-items] Method not allowed: ${req.method}`);
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    
    console.log("[meli-sync-items] Environment variables check:", {
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SERVICE_ROLE_KEY,
      hasAnonKey: !!ANON_KEY,
      hasEncKey: !!ENC_KEY_B64
    });
    
    // Relax config requirement: allow missing ANON_KEY (skip membership check when absent)
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.log("[meli-sync-items] Missing service configuration");
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    let aesKey: CryptoKey | null = null;
    if (ENC_KEY_B64) {
      aesKey = await importAesGcmKey(ENC_KEY_B64);
      console.log("[meli-sync-items] AES key imported successfully");
    }
    
    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("apikey") || "";
    const isInternalCall = req.headers.get("x-internal-call") === "1" && !!apiKeyHeader && apiKeyHeader === SERVICE_ROLE_KEY;
    if (!authHeader && !isInternalCall) {
      console.log("[meli-sync-items] Missing Authorization header and not internal call");
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }
    console.log("[meli-sync-items] Authorization present?", !!authHeader, "internal?", isInternalCall);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    let userIdFromJwt: string | null = null;
    console.log("[meli-sync-items] Supabase admin client created");

    // Accept seller_id via query or POST body; accept organizationId via body
    const url = new URL(req.url);
    let body: any = null;
    if (req.method === "POST") {
      try {
        body = await req.json();
        console.log("[meli-sync-items] Request body parsed");
      } catch (e) {
        body = null;
      }
    }
    const sellerIdFromQuery = url.searchParams.get("seller_id") || url.searchParams.get("sellerId");
    const debugParam = url.searchParams.get("debug") || req.headers.get("x-debug") || undefined;
    const debug = Boolean(
      body?.debug === true || body?.debug === "1" || body?.debug === "true" ||
      (debugParam && ["1", "true", "yes", "on"].includes(debugParam.toLowerCase()))
    );

    console.log("[meli-sync-items] Request parameters:", {
      url: req.url,
      sellerIdFromQuery,
      debug
    });

    let siteId: string = (body?.siteId as string) || "MLB";
    let organizationId: string | undefined = body?.organizationId as string | undefined;
    const sellerIdInput: string | undefined = (body?.seller_id as string) || (body?.sellerId as string) || sellerIdFromQuery || undefined;
    const forceParam = url.searchParams.get("force") || url.searchParams.get("resync") || url.searchParams.get("ignore_recent") || url.searchParams.get("bypass_cache");
    const force = Boolean(
      body?.force === true || body?.force === "1" ||
      (forceParam && forceParam.toLowerCase() !== "0" && forceParam.toLowerCase() !== "false")
    );
    const itemIdInput: string | undefined = (body?.itemId as string) || url.searchParams.get("item_id") || url.searchParams.get("id") || undefined;

    console.log("[meli-sync-items] Parsed parameters:", {
      siteId,
      organizationId,
      sellerIdInput,
      force,
      itemIdInput
    });

    if (!organizationId && !sellerIdInput) {
      console.log("[meli-sync-items] Missing organizationId or seller_id");
      return jsonResponse({ error: "Missing organizationId or seller_id" }, 400);
    }

    // If only seller_id provided, resolve organizationId from marketplace_integrations
    if (!organizationId && sellerIdInput) {
      console.log(`[meli-sync-items] Resolving organizationId for seller_id: ${sellerIdInput}`);
      const { data: orgLookup, error: orgLookupErr } = await admin
        .from("marketplace_integrations")
        .select("organizations_id")
        .eq("meli_user_id", sellerIdInput)
        .eq("marketplace_name", "Mercado Livre")
        .limit(1)
        .single();
      
      if (orgLookupErr || !orgLookup?.organizations_id) {
        console.log("[meli-sync-items] Integration not found for seller_id:", orgLookupErr?.message);
        return jsonResponse({ error: orgLookupErr?.message || "Integration not found for seller_id" }, 404);
      }
      organizationId = orgLookup.organizations_id as string;
      console.log(`[meli-sync-items] Resolved organizationId: ${organizationId}`);
    }

    // Validate membership using JWT subject and rpc_get_member_permissions (no refresh)
    if (!isInternalCall) {
      const tokenValue = authHeader!.replace(/^Bearer\s+/i, "").trim();
      userIdFromJwt = decodeJwtSub(tokenValue);
      console.log(`[meli-sync-items] JWT decoded userId: ${userIdFromJwt}`);
      if (!userIdFromJwt) {
        console.log("[meli-sync-items] Invalid Authorization token - could not decode userId");
        return jsonResponse({ error: "Invalid Authorization token" }, 401);
      }
      console.log(`[meli-sync-items] Checking permissions for userId: ${userIdFromJwt}, organizationId: ${organizationId}`);
      const { data: permData, error: permErr } = await admin.rpc("rpc_get_member_permissions", {
        p_user_id: userIdFromJwt,
        p_organization_id: organizationId,
      });
      if (permErr) {
        return jsonResponse({ error: permErr.message }, 500);
      }
      const permRow = Array.isArray(permData) ? (permData[0] as any) : (permData as any);
      console.log("[meli-sync-items] Permission check result:", { role: permRow?.role, permissions: permRow?.permissions });
      if (!permRow?.role) {
        console.log("[meli-sync-items] User does not belong to organization");
        return jsonResponse({
          error: "Forbidden: You don't belong to this organization",
          details: { requested: organizationId, role: permRow?.role ?? null, userId: userIdFromJwt },
        }, 403);
      }
    } else {
      console.log("[meli-sync-items] Internal call: skipping membership check");
    }

    // Get integration for Mercado Livre in this org
    console.log(`[meli-sync-items] Fetching integration for organizationId: ${organizationId}`);
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name, organizations_id, company_id")
      .eq("organizations_id", organizationId as string)
      .eq("marketplace_name", "Mercado Livre")
      .order("expires_in", { ascending: false })
      .limit(1)
      .single();
    
    if (integErr || !integration) {
      console.log("[meli-sync-items] Integration not found:", integErr?.message);
      return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);
    }
    
    console.log("[meli-sync-items] Integration found for organization");

    // Resolve company id: prefer integration.company_id, fallback to org company
    let finalCompanyId: string | null = integration.company_id || null;
    if (!finalCompanyId) {
      const { data: company, error: companyErr } = await admin
        .from("companies")
        .select("id")
        .eq("organization_id", organizationId as string)
        .limit(1)
        .single();
      if (companyErr || !company?.id) return jsonResponse({ error: companyErr?.message || "Company not found" }, 404);
      finalCompanyId = company.id;
    }

    // Decrypt access token
    console.log("[meli-sync-items] Decrypting access token...");
    
    let accessToken: string = "";
    const accessEnc = String(integration.access_token || "");
    const isEncAccess = accessEnc.startsWith("enc:gcm:");
    if (isEncAccess) {
      if (!aesKey) return jsonResponse({ error: "Missing encryption key for access_token" }, 500);
      try {
        accessToken = await aesGcmDecryptFromString(aesKey, accessEnc);
        console.log("[meli-sync-items] Access token decrypted successfully");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonResponse({ error: `Failed to decrypt access token: ${msg}` }, 500);
      }
    } else {
      accessToken = accessEnc;
      console.log("[meli-sync-items] Using plain access token");
    }

    const sellerId = integration.meli_user_id;
    if (!sellerId) {
      console.log("[meli-sync-items] Missing meli_user_id");
      return jsonResponse({ error: "Missing meli_user_id" }, 400);
    }
    console.log(`[meli-sync-items] Seller ID: ${sellerId}`);

    // Check if token is expired and refresh if necessary
    const now = new Date();
    const expiresAt = new Date(integration.expires_in);
    const isExpired = now >= expiresAt;
    
    console.log("[meli-sync-items] Token expiration check:", {
      now: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isExpired
    });
    
    if (isExpired) {
      console.log("[meli-sync-items] Token expired, attempting refresh...");
      
      // Get app credentials for refresh
      console.log("[meli-sync-items] Fetching app credentials for refresh...");
      const { data: appRow, error: appErr } = await admin
        .from("apps")
        .select("client_id, client_secret")
        .eq("name", "Mercado Livre")
        .single();

      let clientId = appRow?.client_id || Deno.env.get("MERCADO_LIVRE_CLIENT_ID") || null;
      let clientSecret = appRow?.client_secret || Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") || null;
      if (appErr && !clientId && !clientSecret) {
        console.log("[meli-sync-items] App credentials not found:", appErr?.message);
      }
      if (!clientId || !clientSecret) {
        return jsonResponse({ error: "App credentials not found for token refresh" }, 404);
      }
      
      console.log("[meli-sync-items] App credentials found");

      // Decrypt refresh token
      console.log("[meli-sync-items] Decrypting refresh token...");
      
      let refreshTokenPlain: string;
      const refreshEnc = String(integration.refresh_token || "");
      const isEncRefresh = refreshEnc.startsWith("enc:gcm:");
      if (isEncRefresh) {
        if (!aesKey) return jsonResponse({ error: "Missing encryption key for refresh_token" }, 500);
        try {
          refreshTokenPlain = await aesGcmDecryptFromString(aesKey, refreshEnc);
          console.log("[meli-sync-items] Refresh token decrypted successfully");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log("[meli-sync-items] Failed to decrypt refresh token:", msg);
          return jsonResponse({ error: `Failed to decrypt refresh token: ${msg}` }, 500);
        }
      } else {
        refreshTokenPlain = refreshEnc;
        console.log("[meli-sync-items] Using plain refresh token");
      }

      // Refresh the token
      console.log("[meli-sync-items] Attempting token refresh with Mercado Livre API...");
      const form = new URLSearchParams();
      form.append("grant_type", "refresh_token");
      form.append("client_id", clientId);
      form.append("client_secret", clientSecret);
      form.append("refresh_token", refreshTokenPlain);

      const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const refreshJson = await refreshResp.json();
      console.log("[meli-sync-items] Token refresh response received", { status: refreshResp.status, ok: refreshResp.ok });
      
      if (!refreshResp.ok) {
        return jsonResponse({ 
          error: "Token refresh failed", 
          details: { 
            meli: refreshJson,
            original_error: "Token expired and refresh failed"
          } 
        }, refreshResp.status);
      }

      const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in, user_id } = refreshJson;
      const newExpiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
      
      console.log("[meli-sync-items] Token refresh successful");

      // Avoid logging token material

      // Re-encrypt and save new tokens
      console.log("[meli-sync-items] Encrypting and saving new tokens...");
      const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
      const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);
      
      console.log("[meli-sync-items] New tokens encrypted");

      const { error: updErr } = await admin
        .from("marketplace_integrations")
        .update({ 
          access_token: newAccessTokenEnc, 
          refresh_token: newRefreshTokenEnc, 
          expires_in: newExpiresAtIso,
          meli_user_id: user_id 
        })
        .eq("id", integration.id);

      if (updErr) {
        return jsonResponse({ error: `Failed to save refreshed tokens: ${updErr.message}` }, 500);
      }

      // Use the new access token
      accessToken = newAccessToken;
      console.log("[meli-sync-items] Token refreshed successfully and saved to database");
    }

    // Resolve siteId from seller profile if not provided
    if (!body?.siteId) {
      console.log(`[meli-sync-items] Resolving siteId from seller profile: ${sellerId}`);
      try {
        const profResp = await fetch(`https://api.mercadolibre.com/users/${sellerId}`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (profResp.ok) {
          const prof = await profResp.json();
          if (typeof prof?.site_id === "string" && prof.site_id.length > 0) {
            siteId = prof.site_id;
            console.log(`[meli-sync-items] SiteId resolved from profile: ${siteId}`);
          }
        }
        else {
          console.log(`[meli-sync-items] Error resolving siteId from seller profile: ${profResp.status}`);
        }
      } 
      catch (e) {
        console.log(`[meli-sync-items] Error resolving siteId from seller profile: ${e}`);
      }
    }

    // Paginated fetch from Mercado Livre: /users/{USER_ID}/items/search (recomendado)
    console.log(`[meli-sync-items] Starting paginated fetch for sellerId: ${sellerId}`);
    const items: any[] = [];
    // If a specific itemId was requested, seed the list with it and skip pagination
    if (itemIdInput) {
      items.push(String(itemIdInput));
      console.log(`[meli-sync-items] Single item sync requested: ${itemIdInput}`);
    }
    let offset = 0;
    const limit = 50;
    // Cache/skip: load recently synced items to avoid refetching
    const RECENT_SYNC_TTL_MS = 60 * 60 * 1000; // 1h
    const recentSinceIso = new Date(Date.now() - RECENT_SYNC_TTL_MS).toISOString();
    const { data: recentRows } = await admin
      .from("marketplace_items")
      .select("marketplace_item_id")
      .eq("organizations_id", organizationId as string)
      .eq("marketplace_name", "Mercado Livre")
      .gte("last_synced_at", recentSinceIso)
      .limit(5000);
    const recentlySynced = force
      ? new Set<string>()
      : new Set<string>((recentRows || []).map((r: any) => String(r.marketplace_item_id)));
    const idSet = new Set<string>();
    
    // Only paginate when not syncing a single item
    for (let page = 0; !itemIdInput && page < 200; page++) { // safety cap
      // Usar endpoint recomendado para obter itens da conta do vendedor
      const urlMl = new URL(`https://api.mercadolibre.com/users/${sellerId}/items/search`);
      // Não filtrar por status para incluir ativos, pausados e inativos
      urlMl.searchParams.set("offset", String(offset));
      urlMl.searchParams.set("limit", String(limit));
      urlMl.searchParams.set("orders", "last_updated_desc"); // Ordenar por última atualização

      const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

      console.log(`[meli-sync-items] Fetching page ${page + 1}, offset: ${offset}`);
      console.log(`[meli-sync-items] Request URL: ${urlMl.toString()}`);
      console.log(`[meli-sync-items] Fetched item IDs. URL: ${urlMl.toString()}`);

      const resp = await fetch(urlMl.toString(), { headers });
      const text = await resp.text().catch(() => '');
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      
      console.log(`[meli-sync-items] Response status: ${resp.status}, ok: ${resp.ok}`);
      
      if (!resp.ok) {
        let tokenUserId: string | null = null;
        try {
          const meResp = await fetch("https://api.mercadolibre.com/users/me", { headers });
          if (meResp.ok) { const me = await meResp.json(); tokenUserId = me?.id ? String(me.id) : null; }
        } catch { /* ignore */ }
        if (resp.status === 403) {
          // Try to refresh token if we get 403 with authenticated request
          console.log("[meli-sync-items] Got 403, attempting token refresh...");
          
          try {
            // Re-fetch integration data for retry (integration variable not in scope here)
            console.log("[meli-sync-items] Re-fetching integration data for retry...");
            const { data: retryIntegration, error: retryIntegErr } = await admin
              .from("marketplace_integrations")
              .select("id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name, organizations_id, company_id")
              .eq("organizations_id", organizationId)
              .eq("marketplace_name", "Mercado Livre")
              .single();

            if (retryIntegErr || !retryIntegration) {
              throw new Error(`Failed to fetch integration for retry: ${retryIntegErr?.message || 'Integration not found'}`);
            }

            console.log("[meli-sync-items] Integration re-fetched for retry");

            // Get app credentials for refresh
            const { data: appRow, error: appErr } = await admin
              .from("apps")
              .select("client_id, client_secret")
              .eq("name", "Mercado Livre")
              .single();

            if (!appErr && appRow) {
              // Decrypt refresh token
              console.log("[meli-sync-items] Decrypting refresh token for retry...");
              
              let refreshTokenPlain: string | null = null;
              try {
                refreshTokenPlain = await aesGcmDecryptFromString(aesKey, retryIntegration.refresh_token);
                console.log("[meli-sync-items] Refresh token decrypted successfully (retry)");
              } catch (e) {
              }

              if (refreshTokenPlain) {
                // Refresh the token
                const form = new URLSearchParams();
                form.append("grant_type", "refresh_token");
                form.append("client_id", appRow.client_id);
                form.append("client_secret", appRow.client_secret);
                form.append("refresh_token", refreshTokenPlain);

                const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", {
                  method: "POST",
                  headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
                  body: form.toString(),
                });

                const refreshJson = await refreshResp.json();
                console.log("[meli-sync-items] Token refresh response (retry) received", { status: refreshResp.status, ok: refreshResp.ok });
                
                if (refreshResp.ok) {
                  const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in, user_id } = refreshJson;
                  const newExpiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();

                  // Avoid logging token material

                  // Re-encrypt and save new tokens
                  console.log("[meli-sync-items] Encrypting and saving new tokens (retry)...");
                  const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
                  const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);
                  
                  console.log("[meli-sync-items] New tokens encrypted (retry)");

                  const { error: updErr } = await admin
                    .from("marketplace_integrations")
                    .update({ 
                      access_token: newAccessTokenEnc, 
                      refresh_token: newRefreshTokenEnc, 
                      expires_in: newExpiresAtIso,
                      meli_user_id: user_id 
                    })
                    .eq("id", retryIntegration.id);

                  if (!updErr) {
                    // Use the new access token and retry the request
                    accessToken = newAccessToken;
                    console.log("[meli-sync-items] Using new access token for retry");
                    
                    const newHeaders: Record<string, string> = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
                    console.log("[meli-sync-items] Retrying request with new token...");
                    const retryResp = await fetch(urlMl.toString(), { headers: newHeaders });
                    const retryText = await retryResp.text().catch(() => '');
                    let retryJson: any = null;
                    try { retryJson = retryText ? JSON.parse(retryText) : null; } catch {}
                    
                    console.log("[meli-sync-items] Retry response:", {
                      status: retryResp.status,
                      ok: retryResp.ok,
                      resultsCount: Array.isArray(retryJson?.results) ? retryJson.results.length : 0
                    });
                    
                    if (retryResp.ok) {
                      console.log("[meli-sync-items] Token refreshed and request succeeded");
                      const batch = Array.isArray(retryJson?.results) ? retryJson.results : [];
                      for (const id of batch) {
                        const idStr = String(id);
                        if (!recentlySynced.has(idStr) && !idSet.has(idStr)) {
                          idSet.add(idStr);
                          items.push(idStr);
                        }
                      }
                      const total = Number(retryJson?.paging?.total || 0);
                      offset += batch.length;
                      if (offset >= total || batch.length === 0) break;
                      continue;
                    }
                  }
                }
              }
            }
          } catch (refreshErr) {
            // Token refresh failed, continue with fallback
          }

          // No fallback to unauthenticated endpoints to ensure compliance
        }
        const details = {
          meli: json,
          request: { sellerId: String(sellerId), offset, limit },
          context: { organizationId: organizationId as string, userIdFromJwt },
          diagnostics: { token_user_id: tokenUserId, integration_meli_user_id: String(sellerId) },
        };
        return jsonResponse({ error: json?.error || json?.message || "Failed to list items", details }, resp.status);
      }

      const batch = Array.isArray(json?.results) ? json.results : [];
      console.log(`[meli-sync-items] Page ${page + 1} results: ${batch.length} items`);
      for (const id of batch) {
        const idStr = String(id);
        if (!recentlySynced.has(idStr) && !idSet.has(idStr)) {
          idSet.add(idStr);
          items.push(idStr);
        }
      }
      const total = Number(json?.paging?.total || 0);
      offset += batch.length;
      console.log(`[meli-sync-items] Total items so far: ${items.length}, offset: ${offset}, total available: ${total}`);
      if (offset >= total || batch.length === 0) break;
    }

    console.log(`[meli-sync-items] Finished fetching item IDs. Total item IDs: ${items.length}`);
    if (force) {
      console.log(`[meli-sync-items] Force mode enabled: ignoring recently synced filter`);
    }

    // Obter dados completos dos itens
    const completeItems: any[] = [];
    if (itemIdInput && items.length === 1) {
      // Quando um item específico foi solicitado, use o endpoint single para obter atributos completos
      console.log(`[meli-sync-items] Fetching single item details for ${itemIdInput} (include_attributes=all)`);
      try {
        const singleUrl = `https://api.mercadolibre.com/items/${itemIdInput}?include_attributes=all`;
        const singleResp = await fetch(singleUrl, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
        });
        if (singleResp.ok) {
          const singleData = await singleResp.json();
          completeItems.push(singleData);
          console.log(`[meli-sync-items] Added single item: ${singleData?.id} - ${singleData?.title}`);
          // Logs de depuração para investigar atributos de variações
          if (Array.isArray(singleData?.variations)) {
            console.log(`[meli-sync-items] Variations count: ${singleData.variations.length}`);
            const firstVar = singleData.variations[0];
            if (firstVar) {
              const attrs = Array.isArray(firstVar?.attributes) ? firstVar.attributes.map((a: any) => ({ id: a?.id, name: a?.name, value_name: a?.value_name })) : [];
              const combos = Array.isArray(firstVar?.attribute_combinations) ? firstVar.attribute_combinations.map((a: any) => ({ id: a?.id, name: a?.name, value_name: a?.value_name })) : [];
              console.log(`[meli-sync-items] First variation attributes:`, attrs);
              console.log(`[meli-sync-items] First variation attribute_combinations:`, combos);
            }
          }
        } else {
          console.log(`[meli-sync-items] Single item fetch failed: ${singleResp.status}`);
          completeItems.push({ id: itemIdInput });
        }
      } catch (e) {
        console.log(`[meli-sync-items] Error fetching single item: ${e}`);
        completeItems.push({ id: itemIdInput });
      }
    } else {
      // Multiget (apenas IDs não sincronizados recentemente)
      console.log("[meli-sync-items] Fetching complete item details using Multiget...");
      const batchSize = 20; // Multiget permite até 20 itens por vez
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const itemIds = batch.join(',');
        console.log(`[meli-sync-items] Fetching details for batch ${Math.floor(i/batchSize) + 1}: ${batch.length} items`);
        try {
          const multigetUrl = `https://api.mercadolibre.com/items?ids=${itemIds}`;
          const multigetResp = await fetch(multigetUrl, { 
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } 
          });
          if (multigetResp.ok) {
            const multigetData = await multigetResp.json();
            console.log(`[meli-sync-items] Multiget response status: ${multigetResp.status}`);
            for (const itemResponse of multigetData) {
              if (itemResponse.code === 200 && itemResponse.body) {
                completeItems.push(itemResponse.body);
                console.log(`[meli-sync-items] Added item: ${itemResponse.body.id} - ${itemResponse.body.title}`);
              }
            }
          } else {
            completeItems.push(...batch.map(id => ({ id })));
          }
        } catch (e) {
          completeItems.push(...batch.map(id => ({ id })));
        }
      }
    }

    console.log(`[meli-sync-items] Finished fetching complete item details. Total complete items: ${completeItems.length}`);

    // Map items to marketplace_items rows
    console.log("[meli-sync-items] Mapping items to database format...");
    const nowIso = new Date().toISOString();
    // Helpers to derive SKU at variation level according to ML docs (attribute SELLER_SKU)
    function getSkuFromAttrArray(arr: any[] | null | undefined): string | null {
      if (!Array.isArray(arr)) return null;
      for (const a of arr) {
        const id = (a?.id || '').toString().toUpperCase();
        const name = (a?.name || '').toString().toUpperCase();
        // Mais tolerante: aceita qualquer atributo cujo id ou nome contenha "SKU"
        if (id === 'SELLER_SKU' || id === 'SKU' || id.includes('SKU') || name.includes('SKU')) {
          const v = a?.value_name
            ?? a?.value
            ?? a?.values?.[0]?.name
            ?? (typeof a?.value_struct?.number !== 'undefined' ? String(a.value_struct.number) : null)
            ?? null;
          if (typeof v === 'string' && v.trim().length > 0) return v.trim();
        }
      }
      return null;
    }
    // Deriva SKU da variação com fallback similar ao usado em /orders:
    // 1- SELLER_SKU de atributos de variação
    // 2- seller_custom_field de variação
    // 3- SELLER_SKU de atributos de item
    // 4- seller_custom_field de item
    function deriveVariationSku(v: any, itemLevel: { itemAttrs?: any[]; itemSellerSku?: string | null; itemSellerCustomField?: string | null } = {}): string | null {
      // Preferir campos explícitos se presentes na variação
      const direct = (v?.seller_sku ?? v?.sku ?? v?.seller_custom_field ?? null);
      if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
      // Procurar em attribute_combinations e attributes (variação)
      const fromCombos = getSkuFromAttrArray(v?.attribute_combinations);
      if (fromCombos) return fromCombos;
      const fromAttrs = getSkuFromAttrArray(v?.attributes);
      if (fromAttrs) return fromAttrs;
      // Fallback para nível item
      const itemAttrSku = getSkuFromAttrArray(itemLevel.itemAttrs);
      if (itemAttrSku) return itemAttrSku;
      const itemField = (itemLevel.itemSellerSku ?? itemLevel.itemSellerCustomField ?? null);
      if (typeof itemField === 'string' && itemField.trim().length > 0) return itemField.trim();
      return null;
    }
    const upserts = completeItems.map((it) => {
      const pictures = Array.isArray(it?.pictures) ? it.pictures : [];
      const attributes = Array.isArray(it?.attributes) ? it.attributes : [];
      const rawVariations = Array.isArray(it?.variations) ? it.variations : null;
      // Normalize variations to include a canonical seller_sku/sku when available
      const variations = Array.isArray(rawVariations)
        ? rawVariations.map((v: any) => {
            const vsku = deriveVariationSku(v, {
              itemAttrs: attributes,
              itemSellerSku: typeof it?.seller_sku === 'string' ? it.seller_sku : null,
              itemSellerCustomField: typeof it?.seller_custom_field === 'string' ? it.seller_custom_field : null,
            });
            return {
              ...v,
              // Include both keys to make downstream consumption simpler
              seller_sku: vsku ?? v?.seller_sku ?? v?.seller_custom_field ?? null,
              sku: vsku ?? v?.sku ?? v?.seller_custom_field ?? null,
            };
          })
        : null;
      const tags = Array.isArray(it?.tags) ? it.tags : null;
      
      return {
        organizations_id: organizationId as string,
        company_id: finalCompanyId,
        marketplace_name: "Mercado Livre",
        marketplace_item_id: it?.id || String(it?.id || ""),
        title: it?.title || null,
        sku: it?.seller_custom_field || it?.seller_sku || it?.catalog_product_id || null,
        condition: it?.condition || null,
        status: it?.status || null,
        price: typeof it?.price === "number" ? it.price : (Number(it?.price) || null),
        available_quantity: typeof it?.available_quantity === "number" ? it.available_quantity : null,
        sold_quantity: typeof it?.sold_quantity === "number" ? it.sold_quantity : null,
        category_id: it?.category_id || null,
        permalink: it?.permalink || null,
        attributes,
        variations,
        pictures,
        tags,
        seller_id: it?.seller?.id ? String(it.seller.id) : String(sellerId),
        data: it || null,
        published_at: it?.stop_time ? null : (it?.date_created ? it.date_created : null),
        last_synced_at: nowIso,
        updated_at: nowIso,
      };
    });

    // Upsert into marketplace_items
    console.log(`[meli-sync-items] Upserting ${upserts.length} items to marketplace_items table...`);
    const { error: upErr } = await admin
      .from("marketplace_items")
      .upsert(upserts, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });
    
    if (upErr) {
      return jsonResponse({ error: upErr.message }, 500);
    }
    
    console.log(`[meli-sync-items] Successfully synced ${upserts.length} items`);
    return jsonResponse({ ok: true, synced: upserts.length });
  } catch (e) {
    console.error("[meli-sync-items] Unhandled error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});