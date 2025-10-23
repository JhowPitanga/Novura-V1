// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); const ctBytes = new Uint8Array(ct); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

// Decode base64url (JWT payload) to bytes
function b64UrlToUint8(b64url: string): Uint8Array { let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/"); const pad = b64.length % 4; if (pad) b64 += "=".repeat(4 - pad); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }

// Extract user id (sub) from JWT without calling auth APIs
function decodeJwtSub(jwt: string): string | null { try { const parts = jwt.split("."); if (parts.length < 2) return null; const payloadBytes = b64UrlToUint8(parts[1]); const payload = JSON.parse(new TextDecoder().decode(payloadBytes)); return (payload?.sub as string) || (payload?.user_id as string) || null; } catch { return null; } }

serve(async (req) => {
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
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
      console.log("[meli-sync-items] Missing service configuration");
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    console.log("[meli-sync-items] AES key imported successfully");
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[meli-sync-items] Missing Authorization header");
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }
    console.log("[meli-sync-items] Authorization header present");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    console.log("[meli-sync-items] Supabase admin client created");

    // Accept seller_id via query or POST body; accept organizationId via body
    const url = new URL(req.url);
    const sellerIdFromQuery = url.searchParams.get("seller_id");
    const debug = url.searchParams.get("debug") === "1";

    console.log("[meli-sync-items] Request parameters:", {
      url: req.url,
      sellerIdFromQuery,
      debug
    });

    let body: any = null;
    if (req.method === "POST") {
      try { 
        body = await req.json(); 
        console.log("[meli-sync-items] Request body:", body);
      } catch (e) { 
        body = null; 
      }
    }

    let siteId: string = (body?.siteId as string) || "MLB";
    let organizationId: string | undefined = body?.organizationId as string | undefined;
    const sellerIdInput: string | undefined = (body?.seller_id as string) || (body?.sellerId as string) || sellerIdFromQuery || undefined;

    console.log("[meli-sync-items] Parsed parameters:", {
      siteId,
      organizationId,
      sellerIdInput
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
    const tokenValue = authHeader.replace(/^Bearer\s+/i, "").trim();
    const userIdFromJwt = decodeJwtSub(tokenValue);
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
    
    console.log("[meli-sync-items] Integration found:", {
      id: integration.id,
      meli_user_id: integration.meli_user_id,
      expires_in: integration.expires_in,
      has_access_token: !!integration.access_token,
      has_refresh_token: !!integration.refresh_token,
      allFields: integration
    });

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
    console.log("[meli-sync-items] Encrypted access token format:", {
      isEncrypted: integration.access_token?.startsWith('enc:gcm:'),
      length: integration.access_token?.length,
      preview: integration.access_token?.substring(0, 20) + '...'
    });
    
    let accessToken: string;
    try {
      accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
      console.log("[meli-sync-items] Access token decrypted successfully");
      console.log("[meli-sync-items] Decrypted access token:", {
        length: accessToken.length,
        preview: accessToken.substring(0, 20) + '...',
        endsWith: accessToken.substring(accessToken.length - 10)
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: `Failed to decrypt access token: ${msg}` }, 500);
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

      if (appErr || !appRow) {
        console.log("[meli-sync-items] App credentials not found:", appErr?.message);
        return jsonResponse({ error: "App credentials not found for token refresh" }, 404);
      }
      
      console.log("[meli-sync-items] App credentials found:", {
        hasClientId: !!appRow.client_id,
        hasClientSecret: !!appRow.client_secret
      });

      // Decrypt refresh token
      console.log("[meli-sync-items] Decrypting refresh token...");
      console.log("[meli-sync-items] Encrypted refresh token format:", {
        isEncrypted: integration.refresh_token?.startsWith('enc:gcm:'),
        length: integration.refresh_token?.length,
        preview: integration.refresh_token?.substring(0, 20) + '...'
      });
      
      let refreshTokenPlain: string;
      try {
        refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token);
        console.log("[meli-sync-items] Refresh token decrypted successfully");
        console.log("[meli-sync-items] Decrypted refresh token:", {
          length: refreshTokenPlain.length,
          preview: refreshTokenPlain.substring(0, 20) + '...',
          endsWith: refreshTokenPlain.substring(refreshTokenPlain.length - 10)
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log("[meli-sync-items] Failed to decrypt refresh token:", msg);
        console.log("[meli-sync-items] Encrypted refresh token that failed:", integration.refresh_token);
        return jsonResponse({ error: `Failed to decrypt refresh token: ${msg}` }, 500);
      }

      // Refresh the token
      console.log("[meli-sync-items] Attempting token refresh with Mercado Livre API...");
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
      console.log("[meli-sync-items] Token refresh response:", {
        status: refreshResp.status,
        ok: refreshResp.ok,
        response: refreshJson
      });
      
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
      
      console.log("[meli-sync-items] Token refresh successful:", {
        hasNewAccessToken: !!newAccessToken,
        hasNewRefreshToken: !!newRefreshToken,
        expires_in,
        user_id,
        newExpiresAtIso
      });

      console.log("[meli-sync-items] New tokens received:", {
        newAccessToken: {
          length: newAccessToken?.length,
          preview: newAccessToken?.substring(0, 20) + '...',
          endsWith: newAccessToken?.substring(newAccessToken.length - 10)
        },
        newRefreshToken: {
          length: newRefreshToken?.length,
          preview: newRefreshToken?.substring(0, 20) + '...',
          endsWith: newRefreshToken?.substring(newRefreshToken.length - 10)
        }
      });

      // Re-encrypt and save new tokens
      console.log("[meli-sync-items] Encrypting and saving new tokens...");
      const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
      const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);
      
      console.log("[meli-sync-items] New tokens encrypted:", {
        newAccessTokenEnc: {
          length: newAccessTokenEnc?.length,
          preview: newAccessTokenEnc?.substring(0, 20) + '...',
          isEncrypted: newAccessTokenEnc?.startsWith('enc:gcm:')
        },
        newRefreshTokenEnc: {
          length: newRefreshTokenEnc?.length,
          preview: newRefreshTokenEnc?.substring(0, 20) + '...',
          isEncrypted: newRefreshTokenEnc?.startsWith('enc:gcm:')
        }
      });

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
    let offset = 0;
    const limit = 50;
    let usePublicSearch = false;
    
    for (let page = 0; page < 200; page++) { // safety cap
      // Usar endpoint recomendado para obter itens da conta do vendedor
      const urlMl = new URL(`https://api.mercadolibre.com/users/${sellerId}/items/search`);
      // Não filtrar por status para incluir ativos, pausados e inativos
      urlMl.searchParams.set("offset", String(offset));
      urlMl.searchParams.set("limit", String(limit));
      urlMl.searchParams.set("orders", "last_updated_desc"); // Ordenar por última atualização

      const headers: Record<string, string> = usePublicSearch
        ? { Accept: "application/json" }
        : { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

      console.log(`[meli-sync-items] Fetching page ${page + 1}, offset: ${offset}, usePublicSearch: ${usePublicSearch}`);
      console.log(`[meli-sync-items] Request URL: ${urlMl.toString()}`);

      const resp = await fetch(urlMl.toString(), { headers });
      const json = await resp.json();
      
      console.log(`[meli-sync-items] Response status: ${resp.status}, ok: ${resp.ok}`);
      
      if (!resp.ok) {
        let tokenUserId: string | null = null;
        try {
          const meResp = await fetch("https://api.mercadolibre.com/users/me", { headers });
          if (meResp.ok) { const me = await meResp.json(); tokenUserId = me?.id ? String(me.id) : null; }
        } catch { /* ignore */ }
        if (!usePublicSearch && resp.status === 403) {
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

            console.log("[meli-sync-items] Integration re-fetched for retry:", {
              id: retryIntegration.id,
              hasAccessToken: !!retryIntegration.access_token,
              hasRefreshToken: !!retryIntegration.refresh_token,
              meliUserId: retryIntegration.meli_user_id,
              allFields: retryIntegration
            });

            // Get app credentials for refresh
            const { data: appRow, error: appErr } = await admin
              .from("apps")
              .select("client_id, client_secret")
              .eq("name", "Mercado Livre")
              .single();

            if (!appErr && appRow) {
              // Decrypt refresh token
              console.log("[meli-sync-items] Decrypting refresh token for retry...");
              console.log("[meli-sync-items] Encrypted refresh token format (retry):", {
                isEncrypted: retryIntegration.refresh_token?.startsWith('enc:gcm:'),
                length: retryIntegration.refresh_token?.length,
                preview: retryIntegration.refresh_token?.substring(0, 20) + '...'
              });
              
              let refreshTokenPlain: string | null = null;
              try {
                refreshTokenPlain = await aesGcmDecryptFromString(aesKey, retryIntegration.refresh_token);
                console.log("[meli-sync-items] Refresh token decrypted successfully (retry)");
                console.log("[meli-sync-items] Decrypted refresh token (retry):", {
                  length: refreshTokenPlain.length,
                  preview: refreshTokenPlain.substring(0, 20) + '...',
                  endsWith: refreshTokenPlain.substring(refreshTokenPlain.length - 10)
                });
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
                console.log("[meli-sync-items] Token refresh response (retry):", {
                  status: refreshResp.status,
                  ok: refreshResp.ok,
                  response: refreshJson
                });
                
                if (refreshResp.ok) {
                  const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in, user_id } = refreshJson;
                  const newExpiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();

                  console.log("[meli-sync-items] New tokens received (retry):", {
                    newAccessToken: {
                      length: newAccessToken?.length,
                      preview: newAccessToken?.substring(0, 20) + '...',
                      endsWith: newAccessToken?.substring(newAccessToken.length - 10)
                    },
                    newRefreshToken: {
                      length: newRefreshToken?.length,
                      preview: newRefreshToken?.substring(0, 20) + '...',
                      endsWith: newRefreshToken?.substring(newRefreshToken.length - 10)
                    }
                  });

                  // Re-encrypt and save new tokens
                  console.log("[meli-sync-items] Encrypting and saving new tokens (retry)...");
                  const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
                  const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);
                  
                  console.log("[meli-sync-items] New tokens encrypted (retry):", {
                    newAccessTokenEnc: {
                      length: newAccessTokenEnc?.length,
                      preview: newAccessTokenEnc?.substring(0, 20) + '...',
                      isEncrypted: newAccessTokenEnc?.startsWith('enc:gcm:')
                    },
                    newRefreshTokenEnc: {
                      length: newRefreshTokenEnc?.length,
                      preview: newRefreshTokenEnc?.substring(0, 20) + '...',
                      isEncrypted: newRefreshTokenEnc?.startsWith('enc:gcm:')
                    }
                  });

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
                    console.log("[meli-sync-items] Using new access token for retry:", {
                      length: accessToken.length,
                      preview: accessToken.substring(0, 20) + '...',
                      endsWith: accessToken.substring(accessToken.length - 10)
                    });
                    
                    const newHeaders: Record<string, string> = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
                    console.log("[meli-sync-items] Retrying request with new token...");
                    const retryResp = await fetch(urlMl.toString(), { headers: newHeaders });
                    const retryJson = await retryResp.json();
                    
                    console.log("[meli-sync-items] Retry response:", {
                      status: retryResp.status,
                      ok: retryResp.ok,
                      resultsCount: Array.isArray(retryJson?.results) ? retryJson.results.length : 0
                    });
                    
                    if (retryResp.ok) {
                      console.log("[meli-sync-items] Token refreshed and request succeeded");
                      const batch = Array.isArray(retryJson?.results) ? retryJson.results : [];
                      items.push(...batch);
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

          // Fallback to public search if refresh failed
          try {
            const respPublic = await fetch(urlMl.toString(), { headers: { Accept: "application/json" } });
            if (respPublic.ok) {
              usePublicSearch = true;
              const jsonPublic = await respPublic.json();
              const batch = Array.isArray(jsonPublic?.results) ? jsonPublic.results : [];
              items.push(...batch);
              const total = Number(jsonPublic?.paging?.total || 0);
              offset += batch.length;
              if (offset >= total || batch.length === 0) break;
              continue;
            }
          } catch { /* ignore */ }
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
      items.push(...batch);
      const total = Number(json?.paging?.total || 0);
      offset += batch.length;
      console.log(`[meli-sync-items] Total items so far: ${items.length}, offset: ${offset}, total available: ${total}`);
      if (offset >= total || batch.length === 0) break;
    }

    console.log(`[meli-sync-items] Finished fetching item IDs. Total item IDs: ${items.length}`);

    // Obter dados completos dos itens usando Multiget
    console.log("[meli-sync-items] Fetching complete item details using Multiget...");
    const completeItems: any[] = [];
    const batchSize = 20; // Multiget permite até 20 itens por vez
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const itemIds = batch.join(',');
      
      console.log(`[meli-sync-items] Fetching details for batch ${Math.floor(i/batchSize) + 1}: ${batch.length} items`);
      
      try {
        const multigetUrl = `https://api.mercadolibre.com/items?ids=${itemIds}`;
        const multigetResp = await fetch(multigetUrl, { 
          headers: { 
            Authorization: `Bearer ${accessToken}`, 
            Accept: "application/json" 
          } 
        });
        
        if (multigetResp.ok) {
          const multigetData = await multigetResp.json();
          console.log(`[meli-sync-items] Multiget response status: ${multigetResp.status}`);
          
          // Processar cada item da resposta
          for (const itemResponse of multigetData) {
            if (itemResponse.code === 200 && itemResponse.body) {
              completeItems.push(itemResponse.body);
              console.log(`[meli-sync-items] Added item: ${itemResponse.body.id} - ${itemResponse.body.title}`);
            } else {
            }
          }
        } else {
          // Fallback: usar dados básicos dos IDs
          completeItems.push(...batch.map(id => ({ id })));
        }
      } catch (e) {
        // Fallback: usar dados básicos dos IDs
        completeItems.push(...batch.map(id => ({ id })));
      }
    }

    console.log(`[meli-sync-items] Finished fetching complete item details. Total complete items: ${completeItems.length}`);

    // Map items to marketplace_items rows
    console.log("[meli-sync-items] Mapping items to database format...");
    const nowIso = new Date().toISOString();
    const upserts = completeItems.map((it) => {
      const pictures = Array.isArray(it?.pictures) ? it.pictures : [];
      const attributes = Array.isArray(it?.attributes) ? it.attributes : [];
      const variations = Array.isArray(it?.variations) ? it.variations : null;
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
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});