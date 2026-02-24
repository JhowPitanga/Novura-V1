import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmEncryptToString, aesGcmDecryptFromString, hmacSha256Hex, b64ToUint8, strToUint8 } from "../_shared/adapters/token-utils.ts";

const SHOPEE_HOST = "https://openplatform.shopee.com.br";

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const admin = createAdminClient() as any;
    const rid = req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
    const internalWorker = (req.headers.get("x-internal-worker") || "").toLowerCase() === "queue-consume";
    const authHeaderPresent = !!req.headers.get("Authorization");
    if (!internalWorker && !authHeaderPresent) {
      return jsonResponse({ code: 401, message: "Missing authorization header" }, 401);
    }
    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    console.log("[SHOPEE-SUBMIT-XML] inbound", {
      rid,
      method: req.method,
      headers: {
        authorization_present: !!req.headers.get("Authorization"),
        content_type: req.headers.get("content-type") || null,
        host: req.headers.get("host") || null,
        user_agent: req.headers.get("user-agent") || null,
      },
      body_preview: (raw || "").slice(0, 256),
    });
    console.log("[SHOPEE-SUBMIT-XML] auth_mode", { rid, internal_worker: internalWorker, authorization_present: authHeaderPresent });
    const organizationId: string = String(body?.organizationId || "");
    const companyId: string = String(body?.companyId || "");
    const notaFiscalId: string = String(body?.notaFiscalId || "");
    if (!organizationId || !companyId || !notaFiscalId) return jsonResponse({ error: "Missing required fields" }, 200);
    const { data: nf } = await admin
      .from("notas_fiscais")
      .select("id, marketplace, marketplace_order_id, xml_url, xml_base64, pdf_url, pdf_base64, nfe_number, emissao_ambiente")
      .eq("id", notaFiscalId)
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();
    if (!nf) return jsonResponse({ error: "Nota fiscal not found" }, 200);
    const marketplace = String(nf?.marketplace || "").toLowerCase();
    if (!marketplace.includes("shopee")) return jsonResponse({ error: "Not a Shopee invoice" }, 200);
    const orderSn = String(nf?.marketplace_order_id || "");
    if (!orderSn) return jsonResponse({ error: "Missing Shopee order_sn" }, 200);
    console.log("[SHOPEE-SUBMIT-XML] nf", {
      rid,
      notaFiscalId,
      organizationId,
      companyId,
      marketplace: nf?.marketplace || null,
      order_sn: orderSn,
      has_xml_base64: !!nf?.xml_base64,
      has_xml_url: !!nf?.xml_url,
      emissao_ambiente: nf?.emissao_ambiente || null,
    });
    const { data: integ } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, access_token, refresh_token, expires_in, meli_user_id")
      .eq("marketplace_name", "Shopee")
      .eq("organizations_id", organizationId)
      .limit(1)
      .maybeSingle();
    if (!integ) return jsonResponse({ error: "Shopee integration not found" }, 200);
    const shopId = Number(integ?.meli_user_id || 0);
    let accessToken = String(integ?.access_token || "");
    let expiresStr: string | undefined = (integ as any)?.expires_in as string | undefined;
    accessToken = accessToken.trim();
    let partnerId = "";
    let partnerKey = "";
    try {
      const { data: appRow } = await admin
        .from("apps")
        .select("client_id, client_secret")
        .eq("name", "Shopee")
        .single();
      partnerId = String((appRow as any)?.client_id || "").trim();
      partnerKey = String((appRow as any)?.client_secret || "").trim();
      console.log("[SHOPEE-SUBMIT-XML] apps_credentials", { rid, has_partner_id: !!partnerId, has_partner_key: !!partnerKey });
    } catch (_) {}
    try {
      const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY");
      if (encKey && accessToken && accessToken.startsWith("enc:gcm:")) {
        const aesKey = await importAesGcmKey(encKey);
        accessToken = await aesGcmDecryptFromString(aesKey, accessToken);
        accessToken = accessToken.trim();
        console.log("[SHOPEE-SUBMIT-XML] access_token_decrypted", { rid, len: accessToken.length });
      }
    } catch (_) {}
    // Pré-checa expiração e tenta refresh (janela de 5 minutos)
    try {
      let msLeft = Number.NEGATIVE_INFINITY;
      if (expiresStr && typeof expiresStr === "string" && expiresStr.trim()) {
        msLeft = new Date(expiresStr).getTime() - Date.now();
      }
      const needsRefresh = !Number.isFinite(msLeft) || msLeft <= 5 * 60 * 1000;
      console.log("[SHOPEE-SUBMIT-XML] token_precheck", { rid, expires_in: expiresStr || null, ms_left: msLeft, needs_refresh: needsRefresh });
      if (needsRefresh && String(integ?.refresh_token || "").trim().length > 0) {
        let refreshTokenPlain = String(integ.refresh_token || "");
        const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY");
        if (encKey && refreshTokenPlain.startsWith("enc:gcm:")) {
          try {
            const aesKey = await importAesGcmKey(encKey);
            refreshTokenPlain = await aesGcmDecryptFromString(aesKey, refreshTokenPlain);
          } catch (_) {}
        }
        try {
          const refreshPath = "/api/v2/auth/access_token";
          const ts0 = Math.floor(Date.now() / 1000);
          const bodyJson0 = JSON.stringify({ shop_id: Number(shopId), partner_id: Number(partnerId), refresh_token: refreshTokenPlain });
          const base0 = `${partnerId}${refreshPath}${ts0}${bodyJson0}`;
          const sign0 = await hmacSha256Hex(partnerKey, base0);
          const url0 = `${SHOPEE_HOST}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${ts0}&sign=${sign0}`;
          const r0 = await fetch(url0, { method: "POST", headers: { "content-type": "application/json" }, body: bodyJson0 });
          const t0 = await r0.text();
          let j0: any = {};
          try { j0 = t0 ? JSON.parse(t0) : {}; } catch { j0 = { raw: t0 }; }
          console.log("[SHOPEE-SUBMIT-XML] pre_refresh_response", { rid, status: r0.status, ok: r0.ok });
          if (r0.ok && j0 && j0.access_token) {
            accessToken = String(j0.access_token);
            const newRefresh0 = String(j0.refresh_token || refreshTokenPlain);
            const ttl0 = Number(j0.expire_in || 14400);
            const expiresAtIso0 = new Date(Date.now() + (Number.isFinite(ttl0) ? ttl0 : 14400) * 1000).toISOString();
            try {
              if (encKey) {
                const aesKey = await importAesGcmKey(encKey);
                const accessEnc0 = await aesGcmEncryptToString(aesKey, accessToken);
                const refreshEnc0 = await aesGcmEncryptToString(aesKey, newRefresh0);
                await admin.from("marketplace_integrations").update({ access_token: accessEnc0, refresh_token: refreshEnc0, expires_in: expiresAtIso0, meli_user_id: Number(shopId) }).eq("id", integ.id);
              } else {
                await admin.from("marketplace_integrations").update({ access_token: accessToken, refresh_token: newRefresh0, expires_in: expiresAtIso0, meli_user_id: Number(shopId) }).eq("id", integ.id);
              }
              expiresStr = expiresAtIso0;
            } catch {}
          }
        } catch (_) {}
      }
      if (needsRefresh && !(String(integ?.refresh_token || "").trim().length > 0)) {
        console.log("[SHOPEE-SUBMIT-XML] token_precheck_no_refresh_token", { rid });
      }
    } catch (_) {}
    if (!partnerId || !partnerKey || !shopId || !accessToken) {
      const missing = {
        partner_id: !partnerId,
        partner_key: !partnerKey,
        shop_id: !shopId,
        access_token: !accessToken,
      };
      console.warn("[SHOPEE-SUBMIT-XML] missing_credentials", { rid, integration_id: integ?.id || null, organizations_id: integ?.organizations_id || null, missing });
      return jsonResponse({ error: "Missing Shopee credentials", rid }, 200);
    }
    console.log("[SHOPEE-SUBMIT-XML] integration", {
      rid,
      integration_id: integ?.id || null,
      organizations_id: integ?.organizations_id || null,
      has_partner_id: !!partnerId,
      has_partner_key: !!partnerKey,
      shop_id: shopId,
      shop_id_source: "meli_user_id",
      has_access_token: !!accessToken,
    });
    const path = "/api/v2/order/upload_invoice_doc";
    const ts = Math.floor(Date.now() / 1000);
    const base = `${partnerId}${path}${ts}${accessToken}${shopId}`;
    const sign = await hmacSha256Hex(partnerKey, base);
    const qs = new URLSearchParams({
      partner_id: String(partnerId),
      timestamp: String(ts),
      access_token: String(accessToken),
      shop_id: String(shopId),
      sign,
    });
    const atHash = await sha256Hex(accessToken);
    const url = `${SHOPEE_HOST}${path}?${qs.toString()}`;
    console.log("[SHOPEE-SUBMIT-XML] request_composed", {
      rid,
      endpoint: `${SHOPEE_HOST}${path}`,
      partner_id: String(partnerId),
      shop_id: Number(shopId),
      timestamp: ts,
      sign_len: sign.length,
      access_token_len: accessToken.length,
      access_token_digest8: atHash.slice(0, 8),
    });
    let xmlText: string | null = null;
    const xmlB64 = nf?.xml_base64 || null;
    const fileUrl = nf?.xml_url || null;
    if (xmlB64) {
      try { xmlText = atob(String(xmlB64)); } catch { xmlText = null; }
    }
    if (!xmlText && fileUrl) {
      try {
        const envLower = String(nf?.emissao_ambiente || "").toLowerCase();
        const { data: compOrg } = await admin.from("companies").select("focus_token_producao, focus_token_homologacao").eq("id", companyId).limit(1).maybeSingle();
        const useToken = envLower.includes("homolog") ? compOrg?.focus_token_homologacao : compOrg?.focus_token_producao;
        const basic = useToken ? "Basic " + btoa(`${String(useToken)}:`) : undefined;
        const respXml = await fetch(String(fileUrl), { method: "GET", headers: basic ? { Authorization: basic } : undefined });
        if (respXml.ok) xmlText = await respXml.text();
      } catch {}
    }
    const xmlBytesLen = xmlText ? strToUint8(xmlText).length : 0;
    console.log("[SHOPEE-SUBMIT-XML] xml_resolved", { rid, source_base64: !!xmlB64, source_url: !!fileUrl, xml_len: xmlText ? xmlText.length : 0, xml_bytes: xmlBytesLen });
    let useFileType = 4;
    let uploadFile: File | null = null;
    let uploadBytesLen = 0;
    if (xmlText && xmlBytesLen <= 1024 * 1024) {
      uploadFile = new File([xmlText], "invoice.xml", { type: "text/xml" });
      uploadBytesLen = xmlBytesLen;
    } else {
      let pdfBytes: Uint8Array | null = null;
      const pdfB64 = nf?.pdf_base64 || null;
      const pdfUrl = nf?.pdf_url || null;
      if (pdfB64) {
        try { pdfBytes = b64ToUint8(String(pdfB64)); } catch { pdfBytes = null; }
      }
      if (!pdfBytes && pdfUrl) {
        try {
          const envLower = String(nf?.emissao_ambiente || "").toLowerCase();
          const { data: compOrg } = await admin.from("companies").select("focus_token_producao, focus_token_homologacao").eq("id", companyId).limit(1).maybeSingle();
          const useToken = envLower.includes("homolog") ? compOrg?.focus_token_homologacao : compOrg?.focus_token_producao;
          const basic = useToken ? "Basic " + btoa(`${String(useToken)}:`) : undefined;
          const respPdf = await fetch(String(pdfUrl), { method: "GET", headers: basic ? { Authorization: basic } : undefined });
          if (respPdf.ok) {
            const arrBuf = new Uint8Array(await respPdf.arrayBuffer());
            pdfBytes = arrBuf;
          }
        } catch {}
      }
      if (pdfBytes && pdfBytes.length > 0 && pdfBytes.length <= 1024 * 1024) {
        uploadFile = new File([pdfBytes], "invoice.pdf", { type: "application/pdf" });
        uploadBytesLen = pdfBytes.length;
        useFileType = 1;
      }
    }
    if (!uploadFile) return jsonResponse({ ok: false, error: "Invoice file not available or exceeds 1MB", rid }, 200);
    const form = new FormData();
    form.append("order_sn", orderSn);
    form.append("file_type", String(useFileType));
    form.append("file", uploadFile);
    console.log("[SHOPEE-SUBMIT-XML] upload_file_ready", { rid, order_sn: orderSn, file_type: useFileType, size_bytes: uploadBytesLen });
    const resp = await fetch(url, { method: "POST", body: form });
    const text = await resp.text();
    let jsonResp: any = {};
    try { jsonResp = text ? JSON.parse(text) : {}; } catch { jsonResp = { raw: text }; }
    console.log("[SHOPEE-SUBMIT-XML] response", { rid, status: resp.status, ok: resp.ok, request_id: (jsonResp && jsonResp.request_id) || null, body_preview: (text || "").slice(0, 512), error_code: (jsonResp && jsonResp.error) || null, error_message: (jsonResp && jsonResp.message) || null });
    if (!resp.ok) {
      const errCode = String(jsonResp?.error || "").toLowerCase();
      const canRefresh = String(integ?.refresh_token || "").trim().length > 0;
      if ((resp.status === 401 || resp.status === 403 || errCode.includes("invalid")) && canRefresh) {
        try {
          let refreshTokenPlain = String(integ.refresh_token || "");
          const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY");
          if (encKey && refreshTokenPlain.startsWith("enc:gcm:")) {
            const aesKey = await importAesGcmKey(encKey);
            refreshTokenPlain = await aesGcmDecryptFromString(aesKey, refreshTokenPlain);
          }
          const refreshPath = "/api/v2/auth/access_token";
          const ts2 = Math.floor(Date.now() / 1000);
          const bodyJson = JSON.stringify({ shop_id: Number(shopId), partner_id: Number(partnerId), refresh_token: refreshTokenPlain });
          const base2 = `${partnerId}${refreshPath}${ts2}${bodyJson}`;
          const sign2 = await hmacSha256Hex(partnerKey, base2);
          const url2 = `${SHOPEE_HOST}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${ts2}&sign=${sign2}`;
          const r2 = await fetch(url2, { method: "POST", headers: { "content-type": "application/json" }, body: bodyJson });
          const t2 = await r2.text();
          let j2: any = {};
          try { j2 = t2 ? JSON.parse(t2) : {}; } catch { j2 = { raw: t2 }; }
          console.log("[SHOPEE-SUBMIT-XML] token_refresh_response", { rid, status: r2.status, ok: r2.ok });
          if (r2.ok && j2 && j2.access_token) {
            accessToken = String(j2.access_token);
            const newRefresh = String(j2.refresh_token || refreshTokenPlain);
            const ttl = Number(j2.expire_in || 14400);
            const expiresAtIso = new Date(Date.now() + (Number.isFinite(ttl) ? ttl : 14400) * 1000).toISOString();
            try {
              if (encKey) {
                const aesKey = await importAesGcmKey(encKey);
                const accessEnc = await aesGcmEncryptToString(aesKey, accessToken);
                const refreshEnc = await aesGcmEncryptToString(aesKey, newRefresh);
                await admin.from("marketplace_integrations").update({ access_token: accessEnc, refresh_token: refreshEnc, expires_in: expiresAtIso, meli_user_id: Number(shopId) }).eq("id", integ.id);
              } else {
                await admin.from("marketplace_integrations").update({ access_token: accessToken, refresh_token: newRefresh, expires_in: expiresAtIso, meli_user_id: Number(shopId) }).eq("id", integ.id);
              }
            } catch {}
            const tsUpload = Math.floor(Date.now() / 1000);
            const baseUpload = `${partnerId}${path}${tsUpload}${accessToken}${shopId}`;
            const signUpload = await hmacSha256Hex(partnerKey, baseUpload);
            const atHash2 = await sha256Hex(accessToken);
            const qs2 = new URLSearchParams({ partner_id: String(partnerId), timestamp: String(tsUpload), access_token: String(accessToken), shop_id: String(shopId), sign: signUpload });
            const urlUpload = `${SHOPEE_HOST}${path}?${qs2.toString()}`;
            console.log("[SHOPEE-SUBMIT-XML] retry_upload_composed", { rid, endpoint: `${SHOPEE_HOST}${path}`, partner_id: String(partnerId), shop_id: Number(shopId), timestamp: tsUpload, sign_len: signUpload.length, access_token_len: accessToken.length, access_token_digest8: atHash2.slice(0, 8) });
            const retryResp = await fetch(urlUpload, { method: "POST", body: form });
            const retryText = await retryResp.text();
            let retryJson: any = {};
            try { retryJson = retryText ? JSON.parse(retryText) : {}; } catch { retryJson = { raw: retryText }; }
            console.log("[SHOPEE-SUBMIT-XML] retry_response", { rid, status: retryResp.status, ok: retryResp.ok, request_id: (retryJson && retryJson.request_id) || null, body_preview: (retryText || "").slice(0, 512) });
            if (!retryResp.ok) return jsonResponse({ ok: false, error: retryJson?.message || retryJson?.error || `HTTP ${retryResp.status}`, error_code: retryJson?.error || null, rid }, 200);
            await admin
              .from("notas_fiscais")
              .update({ marketplace_submission_status: "sent" })
              .eq("id", notaFiscalId);
            console.log("[SHOPEE-SUBMIT-XML] success", { rid, order_sn: orderSn });
            return jsonResponse({ ok: true, status: "sent", order_sn: orderSn, rid }, 200);
          }
        } catch (_) {}
      }
      return jsonResponse({ ok: false, error: jsonResp?.message || jsonResp?.error || `HTTP ${resp.status}`, error_code: jsonResp?.error || null, rid }, 200);
    }
    await admin
      .from("notas_fiscais")
      .update({ marketplace_submission_status: "sent" })
      .eq("id", notaFiscalId);
    console.log("[SHOPEE-SUBMIT-XML] success", { rid, order_sn: orderSn });
    return jsonResponse({ ok: true, status: "sent", order_sn: orderSn, rid }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[SHOPEE-SUBMIT-XML] exception", { error: msg });
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
