// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmEncryptToString, aesGcmDecryptFromString, hmacSha256Hex } from "../_shared/adapters/token-utils.ts";

function maskToken(v: string): string {
  if (!v) return "";
  const s = String(v);
  const n = s.length;
  if (n <= 8) return "*".repeat(n);
  const left = s.slice(0, 4);
  const right = s.slice(-4);
  return `${left}${"*".repeat(n - 8)}${right}`;
}

function shortHash(v: string): string {
  if (!v) return "";
  const s = String(v);
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}...${s.slice(-8)}`;
}

serve(async (req) => {
  const reqId = (crypto as any).randomUUID ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`;
  const log = (event: string, details: Record<string, unknown> = {}) => {
    try {
      console.log(JSON.stringify({ event, reqId, ...details }));
    } catch (_) {}
  };
  

  if (req.method === "OPTIONS") return handleOptions();

  if (req.method !== "POST") {
    log("method_not_allowed", { method: req.method });
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  
  try {
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!ENC_KEY_B64) {
      log("missing_service_config", { hasEncKey: !!ENC_KEY_B64 });
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }
    const admin = createAdminClient() as any;
    const aesKey = await importAesGcmKey(ENC_KEY_B64);

    let integrationId: string | undefined;
    try {
      const raw = await req.text();
      if (raw && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          integrationId = (parsed as any)?.integrationId || (parsed as any)?.integration_id; // Adicionado integration_id
        } catch (_) {
          const params = new URLSearchParams(raw);
          integrationId = params.get("integrationId") ?? undefined;
        }
      }
    } catch (_) {
      integrationId = undefined;
    }
    if (!integrationId) {
      try {
        const u = new URL(req.url);
        integrationId = u.searchParams.get("integrationId") ?? undefined;
      } catch (_) {}
    }
    
    const shopeeBrHost = "https://openplatform.shopee.com.br";
    const refreshPath = "/api/v2/auth/access_token"; 

    if (!integrationId) {
      log("cron_mode_start", {});
      
      const { data: appRow, error: appErr } = await admin
        .from("apps")
        .select("client_id, client_secret, auth_url, config")
        .eq("name", "Shopee")
        .single();
      if (appErr || !appRow) {
        log("app_credentials_not_found", { error: appErr?.message });
        return jsonResponse({ error: appErr?.message || "App credentials not found" }, 404);
      }

      const partnerId = String(appRow.client_id || "");
      const partnerKey = String(appRow.client_secret || "");
      if (!partnerId || !partnerKey) {
        log("missing_partner_credentials", { hasPartnerId: !!partnerId, hasPartnerKey: !!partnerKey });
        return jsonResponse({ error: "Missing partner credentials" }, 400);
      }



      log("cron_mode_signature_moved_to_loop", { message: "Signature calculation moved inside the loop for correct V2 POST Base String." });

      const thresholdIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { data: rows, error: listErr } = await admin
        .from("marketplace_integrations")
        .select("id, refresh_token, marketplace_name, config, meli_user_id, expires_in")
        .eq("marketplace_name", "Shopee")
        .not("refresh_token", "is", null)
        .or(`expires_in.lte.${thresholdIso},expires_in.is.null`);
      if (listErr) {
        log("list_integrations_error", { message: listErr.message });
        return jsonResponse({ error: listErr.message }, 500);
      }

      let refreshed = 0; let skipped = 0; let failed = 0;
      const results: Array<Record<string, unknown>> = [];
      

      for (const row of rows || []) {
        const id = String((row as any)?.id);
        

        let shopId: string | null = null;
        try {
          const c = (row as Record<string, unknown>)?.["config"] as Record<string, unknown> | undefined;
          const sid = c?.["shopee_shop_id"] as string | number | undefined;
          if (typeof sid === "string" || typeof sid === "number") shopId = String(sid);
        } catch (_) {}
        if (!shopId && typeof (row as any)?.meli_user_id === "number") shopId = String((row as any).meli_user_id);
        if (!shopId) { failed++; results.push({ id, error: "missing_shop_id" }); continue; }

        let refreshTokenPlain = String((row as any)?.refresh_token || "");
        const isEncRow = refreshTokenPlain.startsWith("enc:gcm:");
        if (isEncRow) {
          try { refreshTokenPlain = await aesGcmDecryptFromString(aesKey, refreshTokenPlain); } catch (e) { failed++; results.push({ id, error: "decrypt_refresh_failed" }); continue; }
        }

        let msLeft = Number.POSITIVE_INFINITY;
        try { const expiresStr = (row as any)?.expires_in as string | undefined; if (expiresStr) { msLeft = new Date(expiresStr).getTime() - Date.now(); } } catch (_) {}
        if (Number.isFinite(msLeft) && msLeft > 10 * 60 * 1000) { skipped++; results.push({ id, skipped: true }); continue; }



        const timestamp = Math.floor(Date.now() / 1000);
        const bodyData = {
            shop_id: Number(shopId), 
            partner_id: Number(partnerId),
            refresh_token: refreshTokenPlain
        };
        const bodyJson = JSON.stringify(bodyData);


        const baseString = `${partnerId}${refreshPath}${timestamp}${bodyJson}`;
        const sign = await hmacSha256Hex(partnerKey, baseString);
        log("cron_refresh_signature", { id, refreshPath, timestamp, baseString: shortHash(baseString), sign: shortHash(sign) });



        let ok = false; let tokenJson: Record<string, unknown> | null = null;
        for (const host of [shopeeBrHost]) { 
          const url = `${host}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
          log("cron_refresh_request", { id, host, url, body: { shop_id: Number(shopId), partner_id: Number(partnerId), refresh_token: maskToken(refreshTokenPlain) } });
          try {
            const resp = await fetch(url, { 
              method: "POST", 
              headers: { "content-type": "application/json" }, 
              body: bodyJson
            });
            const json = await resp.json();
            const masked = { ...json, access_token: maskToken(String((json as any)?.access_token || "")), refresh_token: maskToken(String((json as any)?.refresh_token || "")) } as Record<string, unknown>;
            log("cron_refresh_response", { id, host, status: resp.status, ok: resp.ok, body: masked });
            if (resp.ok && (json as any)?.access_token) { ok = true; tokenJson = json as Record<string, unknown>; break; }
          } catch (err) {
            log("cron_refresh_error", { id, host, message: err instanceof Error ? err.message : String(err) });
            continue;
          }
        }

        if (!ok || !tokenJson) { failed++; results.push({ id, error: "refresh_failed" }); continue; }


        const accessToken = String((tokenJson as any)?.access_token || "");
        const newRefresh = String((tokenJson as any)?.refresh_token || refreshTokenPlain);
        const ttl = Number((tokenJson as any)?.expire_in || 14400);
        const expiresAtIso = new Date(Date.now() + (Number.isFinite(ttl) ? ttl : 14400) * 1000).toISOString();
        const accessEnc = await aesGcmEncryptToString(aesKey, accessToken);
        const refreshEnc = await aesGcmEncryptToString(aesKey, newRefresh);
        const { error: updErr } = await admin
          .from("marketplace_integrations")
          .update({ access_token: accessEnc, refresh_token: refreshEnc, expires_in: expiresAtIso, meli_user_id: Number(shopId) })
          .eq("id", id);
        if (updErr) { failed++; results.push({ id, error: "db_update_error", message: updErr.message }); continue; }
        refreshed++; results.push({ id, refreshed: true, expires_in: expiresAtIso });
      }

      log("cron_mode_summary", { refreshed, skipped, failed });
      return jsonResponse({ ok: true, refreshed, skipped, failed, results });
    }




    const { data: integ, error: getErr } = await admin
      .from("marketplace_integrations")
      .select("id, refresh_token, marketplace_name, config, meli_user_id, expires_in, access_token")
      .eq("id", integrationId)
      .single();
    if (getErr || !integ) {
      log("integration_not_found", { error: getErr?.message });
      return jsonResponse({ error: getErr?.message || "Integration not found" }, 404);
    }
    if (String(integ.marketplace_name) !== "Shopee") {
      log("wrong_marketplace", { marketplace: String(integ.marketplace_name) });
      return jsonResponse({ error: "Not a Shopee integration" }, 400);
    }
    if (!integ.refresh_token) {
      log("missing_refresh_token", {});
      return jsonResponse({ error: "Missing refresh_token" }, 400);
    }

    let refreshTokenPlain: string;
    const isEnc = String(integ.refresh_token).startsWith("enc:gcm:");
    if (isEnc) {
      refreshTokenPlain = await aesGcmDecryptFromString(aesKey, String(integ.refresh_token));
    } else {
      refreshTokenPlain = String(integ.refresh_token);
    }

    

    try {
      const expiresStr = (integ as any)?.expires_in as string | undefined;
      if (expiresStr && typeof expiresStr === "string" && expiresStr.trim()) {
        const expiresAt = new Date(expiresStr);
        const now = new Date();
        const msLeft = expiresAt.getTime() - now.getTime();
        const refreshWindowMs = 10 * 60 * 1000;
        if (Number.isFinite(msLeft) && msLeft > refreshWindowMs) {
          log("skip_due_to_valid_token", { expires_in: expiresStr, ms_left: msLeft });
          return jsonResponse({ ok: true, skipped: true, expires_in: expiresStr });
        }
      }
    } catch (_) {}
    

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret, auth_url, config")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) {
      log("app_credentials_not_found", { error: appErr?.message });
      return jsonResponse({ error: appErr?.message || "App credentials not found" }, 404);
    }

    const partnerId = String(appRow.client_id || "");
    const partnerKey = String(appRow.client_secret || "");
    if (!partnerId || !partnerKey) {
      log("missing_partner_credentials", { hasPartnerId: !!partnerId, hasPartnerKey: !!partnerKey });
      return jsonResponse({ error: "Missing partner credentials" }, 400);
    }

    let shopId: string | null = null;
    try {
      const c = (integ as Record<string, unknown>)?.["config"] as Record<string, unknown> | undefined;
      const sid = c?.["shopee_shop_id"] as string | number | undefined;
      if (typeof sid === "string" || typeof sid === "number") shopId = String(sid);
    } catch (_) {}
    if (!shopId && typeof integ?.meli_user_id === "number") shopId = String(integ.meli_user_id);
    if (!shopId) {
      log("missing_shop_id", {});
      return jsonResponse({ error: "Missing shop_id" }, 400);
    }


    log("refresh_context", {
      host: shopeeBrHost,
      shopId,
      partnerId,
    });


    const timestamp = Math.floor(Date.now() / 1000);
    const bodyData = {
        shop_id: Number(shopId), 
        partner_id: Number(partnerId),
        refresh_token: refreshTokenPlain
    };
    const bodyJson = JSON.stringify(bodyData);
    

    const baseString = `${partnerId}${refreshPath}${timestamp}${bodyJson}`;
    const sign = await hmacSha256Hex(partnerKey, baseString);
    
    log("refresh_signature", {
      refreshPath,
      timestamp,
      baseString: shortHash(baseString),
      sign: shortHash(sign),
    });


    let ok = false;
    let tokenJson: Record<string, unknown> | null = null;

    for (const host of [shopeeBrHost]) { 
      const url = `${host}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
      log("refresh_request", {
        host,
        url,
        body: {
          shop_id: Number(shopId),
          partner_id: Number(partnerId),
          refresh_token: maskToken(refreshTokenPlain),
        },
      });
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bodyJson,
        });
        const json = await resp.json();
        const masked = {
          ...json,
          access_token: maskToken(String((json as any)?.access_token || "")),
          refresh_token: maskToken(String((json as any)?.refresh_token || "")),
        } as Record<string, unknown>;
        log("refresh_response", { host, status: resp.status, ok: resp.ok, body: masked });
        if (resp.ok && json && (json as any).access_token) {
          ok = true;
          tokenJson = json as Record<string, unknown>;
          break;
        }
        
      } catch (err) {
        log("refresh_request_error", { host, message: err instanceof Error ? err.message : String(err) });
        continue;
      }
    }

    if (!ok || !tokenJson) {
      log("refresh_failed", {});
      return jsonResponse({ error: "Refresh failed" }, 502);
    }


    const accessToken = String((tokenJson as any)?.access_token || "");
    const newRefresh = String((tokenJson as any)?.refresh_token || refreshTokenPlain);
    const ttl = Number((tokenJson as any)?.expire_in || 14400);
    const expiresAtIso = new Date(Date.now() + (Number.isFinite(ttl) ? ttl : 14400) * 1000).toISOString();

    const accessEnc = await aesGcmEncryptToString(aesKey, accessToken);
    const refreshEnc = await aesGcmEncryptToString(aesKey, newRefresh);

    const { error: updErr } = await admin
      .from("marketplace_integrations")
      .update({ access_token: accessEnc, refresh_token: refreshEnc, expires_in: expiresAtIso, meli_user_id: Number(shopId) })
      .eq("id", String(integrationId));
    if (updErr) {
      log("db_update_error", { message: updErr.message });
      return jsonResponse({ error: updErr.message }, 500);
    }

    log("refresh_success", { expires_in: expiresAtIso });
    return jsonResponse({ ok: true, expires_in: expiresAtIso });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { console.error(JSON.stringify({ event: "unhandled_error", msg })); } catch (_) {}
    return jsonResponse({ error: msg }, 500);
  }
});