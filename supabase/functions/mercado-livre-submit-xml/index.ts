import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmDecryptFromString, aesGcmEncryptToString } from "../_shared/adapters/token-utils.ts";
import { normalizeFocusUrl } from "../_shared/domain/focus-url.ts";

function extractXmlMeta(xml: string): { nfeNumber: string | null; nfeKey: string | null } {
  let nfeNumber: string | null = null;
  let nfeKey: string | null = null;
  try {
    const m = xml.match(/<nNF>(\d+)<\/nNF>/);
    if (m && m[1]) nfeNumber = m[1];
  } catch {}
  try {
    const m2 = xml.match(/Id="NFe(\d{44})"/);
    if (m2 && m2[1]) nfeKey = m2[1];
  } catch {}
  if (!nfeKey) {
    try {
      const m3 = xml.match(/<chNFe>(\d{44})<\/chNFe>/);
      if (m3 && m3[1]) nfeKey = m3[1];
    } catch {}
  }
  return { nfeNumber, nfeKey };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY")!;
    const admin = createAdminClient() as any;
    const rid = req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const internalWorker = (req.headers.get("x-internal-worker") || "").toLowerCase() === "queue-consume";
    let userRes: any = null;
    let userErr: any = null;
    if (token) {
      const u = await (admin as any).auth.getUser(token);
      userRes = u?.data;
      userErr = u?.error;
    }
    const userMode = !!userRes?.user && !userErr;
    if (!userMode && !internalWorker) return jsonResponse({ error: "Unauthorized" }, 401);

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    console.log("[ML-SUBMIT-XML] inbound", {
      rid,
      method: req.method,
      authorization_present: !!authHeader,
      headers: {
        "content-type": req.headers.get("content-type") || null,
        "user-agent": req.headers.get("user-agent") || null,
        host: req.headers.get("host") || null,
      },
      body_preview: (raw || "").slice(0, 256),
    });
    console.log("[ML-SUBMIT-XML] auth_mode", { rid, user_mode: userMode, internal_worker: internalWorker });

    const organizationId: string | undefined = body?.organizationId || body?.organization_id;
    const companyId: string | undefined = body?.companyId || body?.company_id;
    const notaFiscalId: string | undefined = body?.notaFiscalId || body?.nota_fiscal_id;
    const nfeKey: string | undefined = body?.nfeKey || body?.nfe_key;
    console.log("[ML-SUBMIT-XML] params", { rid, organizationId, companyId, notaFiscalId, nfeKey });

    if (!organizationId) return jsonResponse({ error: "organizationId is required" }, 400);
    if (!companyId) return jsonResponse({ error: "companyId is required" }, 400);
    if (!notaFiscalId && !nfeKey) return jsonResponse({ error: "notaFiscalId or nfeKey is required" }, 400);

    if (userMode) {
      const { data: isMemberData, error: isMemberErr } = await (admin as any).rpc("is_org_member", {
        p_user_id: userRes.user.id,
        p_org_id: organizationId,
      });
      const isMember = (Array.isArray(isMemberData) ? isMemberData?.[0] : isMemberData) === true;
      if (isMemberErr || !isMember) return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: company, error: compErr } = await admin.from("companies").select("id, organization_id, focus_token_producao, focus_token_homologacao").eq("id", companyId).single();
    if (compErr || !company) return jsonResponse({ error: compErr?.message || "Company not found" }, 404);
    if (String(company.organization_id || "") !== String(organizationId)) return jsonResponse({ error: "Company not in organization" }, 403);

    let nfRow: any = null;
    {
      const q = admin.from("notas_fiscais").select("*").eq("company_id", companyId);
      let sel: any;
      if (notaFiscalId) {
        sel = await q.eq("id", notaFiscalId).limit(1).maybeSingle();
      } else {
        sel = await q.eq("nfe_key", nfeKey!).limit(1).maybeSingle();
      }
      if (sel.error || !sel.data) return jsonResponse({ error: sel.error?.message || "Nota fiscal não encontrada" }, 404);
      nfRow = sel.data;
    }
    console.log("[ML-SUBMIT-XML] nfRow", {
      rid,
      id: nfRow.id,
      status_focus: nfRow.status_focus || null,
      marketplace: nfRow.marketplace || null,
      marketplace_order_id: nfRow.marketplace_order_id || null,
      pack_id: nfRow.pack_id ?? null,
      xml_present: !!nfRow.xml_base64,
    });

    const marketplaceName: string = String(nfRow.marketplace || "");
    const packId: number | null = typeof nfRow.pack_id === "number" ? nfRow.pack_id : null;
    const marketplaceOrderId: string | null = nfRow.marketplace_order_id ? String(nfRow.marketplace_order_id) : null;
    const xmlB64: string | null = nfRow.xml_base64 || null;
    const emissaoAmbiente: string | null = nfRow.emissao_ambiente ? String(nfRow.emissao_ambiente) : null;
    const xmlUrlRaw: string | null = (nfRow.xml_url || null) || ((nfRow.marketplace_submission_response && (nfRow.marketplace_submission_response as any)?.links?.caminho_xml) || null);
    const statusFocus: string = String(nfRow.status_focus || "");
    let xmlToSubmit: string | null = null;
    try {
      const { data: presented } = await admin
        .from("marketplace_orders_presented_new")
        .select("xml_to_submit")
        .eq("organizations_id", organizationId)
        .eq("company_id", companyId)
        .eq("marketplace_order_id", marketplaceOrderId)
        .limit(1)
        .maybeSingle();
      xmlToSubmit = presented?.xml_to_submit ? String(presented.xml_to_submit) : null;
    } catch {}
    console.log("[ML-SUBMIT-XML] presented_xml", { rid, has_xml_to_submit: !!xmlToSubmit, xml_to_submit_is_url: !!(xmlToSubmit && (/^(https?:\/\/|\/)/.test(xmlToSubmit))) });

    if (!marketplaceName || marketplaceName.toLowerCase().includes("mercado") === false) {
      return jsonResponse({ error: "Marketplace não suportado para envio de XML" }, 400);
    }
    if (!marketplaceOrderId) {
      return jsonResponse({ error: "Marketplace Order ID ausente para envio de XML" }, 400);
    }
    if (!xmlB64 && !xmlUrlRaw && !xmlToSubmit) {
      return jsonResponse({ error: "XML não disponível (xml_to_submit ausente, xml_url ausente e xml_base64 vazio)" }, 400);
    }
    if (String(statusFocus).toLowerCase() !== "autorizado") {
      return jsonResponse({ error: "NF-e não está autorizada para envio de XML" }, 400);
    }

    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, access_token, refresh_token, expires_in, marketplace_name")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integração Mercado Livre não encontrada" }, 404);

    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    let accessToken: string = String(integration.access_token || "");
    let refreshTokenEnc: string | null = String(integration.refresh_token || "");
    if (accessToken.startsWith("enc:gcm:")) {
      accessToken = await aesGcmDecryptFromString(aesKey, accessToken);
    }
    if (refreshTokenEnc && refreshTokenEnc.startsWith("enc:gcm:") === false) {
      refreshTokenEnc = await aesGcmEncryptToString(aesKey, refreshTokenEnc);
    }
    console.log("[ML-SUBMIT-XML] token_state", {
      rid,
      access_token_encrypted: String(integration.access_token || "").startsWith("enc:gcm:"),
      decrypted_access_token_len: accessToken.length,
      has_refresh_token: !!integration.refresh_token,
    });

    const FOCUS_API_BASE = "https://api.focusnfe.com.br";
    let xmlText: string | null = null;
    let xmlUrlCandidate: string | null = null;
    let xmlSource: string | null = null;
    if (xmlToSubmit) {
      const s = String(xmlToSubmit).trim();
      if (s.startsWith("<")) {
        xmlText = s;
        xmlSource = "xml_to_submit_text";
      } else if (/^(https?:\/\/|\/)/.test(s)) {
        xmlUrlCandidate = s;
        xmlSource = "xml_to_submit_url";
      }
    }
    const xmlUrl = normalizeFocusUrl(FOCUS_API_BASE, xmlUrlCandidate || xmlUrlRaw);
    if (!xmlSource) {
      if (xmlUrlCandidate) xmlSource = "xml_to_submit_url";
      else if (xmlUrlRaw) xmlSource = "xml_url_field";
    }
    if (xmlUrl) {
      try {
        const useToken = emissaoAmbiente?.toLowerCase().includes("homolog") ? (company as any).focus_token_homologacao : (company as any).focus_token_producao;
        let headers: Record<string, string> | undefined = undefined;
        if (useToken) {
          const basic = "Basic " + btoa(`${String(useToken)}:`);
          headers = { Authorization: basic };
        }
        const respXml = await fetch(xmlUrl, { method: "GET", headers });
        if (!respXml.ok && !headers && ((respXml.status === 401 || respXml.status === 403) && ((company as any).focus_token_producao || (company as any).focus_token_homologacao))) {
          const useToken2 = emissaoAmbiente?.toLowerCase().includes("homolog") ? (company as any).focus_token_homologacao : (company as any).focus_token_producao;
          if (useToken2) {
            const basic2 = "Basic " + btoa(`${String(useToken2)}:`);
            const respXml2 = await fetch(xmlUrl, { method: "GET", headers: { Authorization: basic2 } });
            if (respXml2.ok) {
              xmlText = await respXml2.text();
            }
          }
        } else if (respXml.ok) {
          xmlText = await respXml.text();
        }
        console.log("[ML-SUBMIT-XML] xml_fetch", { rid, xml_url_present: !!(xmlUrlCandidate || xmlUrlRaw), normalized_url: xmlUrl, ok: !!xmlText, xml_source: xmlSource });
      } catch (e) {
        console.warn("[ML-SUBMIT-XML] xml_fetch_error", (e as any)?.message || e);
      }
    }
    if (!xmlText && xmlB64) {
      try { xmlText = atob(xmlB64!); xmlSource = xmlSource || "xml_base64"; } catch {}
    }
    if (!xmlText) return jsonResponse({ error: "XML não disponível (xml_url ausente/indisponível e xml_base64 vazio)" }, 400);
    const modMatch = xmlText.match(/<mod>(\d+)<\/mod>/);
    const cStatMatch = xmlText.match(/<cStat>(\d+)<\/cStat>/);
    const rootNfeProc = /<nfeProc[\s>]/.test(xmlText);
    const rootNFe = /<NFe[\s>]/.test(xmlText);
    console.log("[ML-SUBMIT-XML] xml_inspect", { rid, root_nfeProc: rootNfeProc, root_NFe: rootNFe, xml_mod: (modMatch && modMatch[1]) ? modMatch[1] : null, xml_cStat: (cStatMatch && cStatMatch[1]) ? cStatMatch[1] : null, xml_source: xmlSource });
    if (modMatch && modMatch[1] && modMatch[1] !== "55") {
      return jsonResponse({ error: "Somente NFe modelo 55 é suportada", xml_mod: modMatch[1] }, 400);
    }
    const meta = extractXmlMeta(xmlText);
    const xmlFileName = meta.nfeNumber ? `nfe_${meta.nfeNumber}.xml` : (meta.nfeKey ? `nfe_${meta.nfeKey}.xml` : "nfe.xml");
    console.log("[ML-SUBMIT-XML] xml_meta", { rid, nfeNumber: meta.nfeNumber, nfeKey: meta.nfeKey, xml_len: xmlText.length, xml_file_name: xmlFileName, xml_source: xmlSource });
    try {
      const updatePayload: any = {};
      if (!nfRow.nfe_number && meta.nfeNumber) updatePayload.nfe_number = Number(meta.nfeNumber);
      if (!nfRow.nfe_key && meta.nfeKey) updatePayload.nfe_key = meta.nfeKey;
      if (Object.keys(updatePayload).length > 0) {
        await admin.from("notas_fiscais").update(updatePayload).eq("id", nfRow.id);
      }
    } catch {}

    async function resolveShipmentId(accessToken: string): Promise<string | null> {
      try {
        // 1) Tentar via tabela normalizada marketplace_shipments
        const { data: shipRow } = await admin
          .from("marketplace_shipments")
          .select("marketplace_shipment_id")
          .eq("organizations_id", organizationId)
          .eq("company_id", companyId)
          .eq("marketplace_name", "Mercado Livre")
          .eq("marketplace_order_id", marketplaceOrderId)
          .order("last_updated", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (shipRow?.marketplace_shipment_id) {
          console.log(`[ML-SUBMIT-XML] Shipment via DB: ${shipRow.marketplace_shipment_id}`);
          return String(shipRow.marketplace_shipment_id);
        }
      } catch (e) {
        console.warn("[ML-SUBMIT-XML] Falha ao buscar marketplace_shipments:", e);
      }
      // 2) Tentar via view apresentada (se disponível) buscando shipments array
      try {
        const { data: ordView } = await admin
          .from("marketplace_orders_presented_new")
          .select("shipments, data, marketplace_order_id")
          .eq("organizations_id", organizationId)
          .eq("company_id", companyId)
          .eq("marketplace_order_id", marketplaceOrderId)
          .limit(1)
          .maybeSingle();
        const shipmentsArr: any[] = Array.isArray(ordView?.shipments) ? ordView!.shipments as any[] : [];
        const fromData = (ordView?.data && (ordView as any).data?.shipping) || null;
        let candidate: string | null = null;
        if (shipmentsArr.length > 0) {
          candidate = String(shipmentsArr[0]?.id || "");
        } else if (fromData && typeof fromData?.id !== "undefined") {
          candidate = String(fromData.id || "");
        }
        if (candidate) {
          console.log(`[ML-SUBMIT-XML] Shipment via presented view: ${candidate}`);
          return candidate;
        }
      } catch (e) {
        console.warn("[ML-SUBMIT-XML] Falha ao buscar marketplace_orders_presented_new:", e);
      }
      // 3) Fallback: consultar order direto na API do ML
      try {
        const orderResp = await fetch(`https://api.mercadolibre.com/orders/${marketplaceOrderId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const orderJson = await orderResp.json();
        const shipId = String(orderJson?.shipping?.id || (Array.isArray(orderJson?.shipments) ? orderJson.shipments?.[0]?.id : "") || "");
        if (shipId) {
          console.log(`[ML-SUBMIT-XML] Shipment via ML Orders API: ${shipId}`);
          return shipId;
        }
      } catch (e) {
        console.warn("[ML-SUBMIT-XML] Falha ao resolver shipment via ML Orders API:", e);
      }
      return null;
    }

    const postShipmentInvoice = async (token: string, xmlStr: string, shipmentId: string, siteId = "MLB"): Promise<Response> => {
      const url = `https://api.mercadolibre.com/shipments/${shipmentId}/invoice_data/?siteId=${siteId}`;
      console.log("[ML-SUBMIT-XML] post_invoice_start", { rid, url, siteId, xml_len: xmlStr.length });
      return fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/xml",
        },
        body: xmlStr,
      });
    };

    const shipmentId = await resolveShipmentId(accessToken);
    if (!shipmentId) {
      return jsonResponse({ error: "Shipment ID não encontrado para o pedido. Sincronize pedidos/envios antes de enviar NF.", marketplace_order_id: marketplaceOrderId }, 400);
    }
    console.log("[ML-SUBMIT-XML] shipment_resolved", { rid, shipmentId, marketplace_order_id: marketplaceOrderId });

    let resp = await postShipmentInvoice(accessToken, xmlText, shipmentId, "MLB");
    if (!resp.ok && (resp.status === 401 || resp.status === 403) && integration.refresh_token) {
      const { data: appRow, error: appErr } = await admin
        .from("apps")
        .select("client_id, client_secret")
        .eq("name", integration.marketplace_name === "mercado_livre" ? "Mercado Livre" : integration.marketplace_name)
        .single();
      if (!appRow || appErr) return jsonResponse({ error: "App credentials not found" }, 500);
      const refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token);
      const tokenResp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: String(appRow.client_id),
          client_secret: String(appRow.client_secret),
          refresh_token: refreshTokenPlain,
        }),
      });
      const tokenJson = await tokenResp.json();
      console.log("[ML-SUBMIT-XML] token_refresh_resp", { rid, ok: tokenResp.ok, status: tokenResp.status, json_preview: JSON.stringify(tokenJson).slice(0, 512) });
      if (!tokenResp.ok || !tokenJson?.access_token) {
        return jsonResponse({ error: "Token refresh failed", meli_response: tokenJson }, 200);
      }
      const newAccessEnc = await aesGcmEncryptToString(aesKey, tokenJson.access_token);
      const newRefreshEnc = await aesGcmEncryptToString(aesKey, tokenJson.refresh_token);
      const expiresAtIso = new Date(Date.now() + (Number(tokenJson.expires_in) || 3600) * 1000).toISOString();
      await admin
        .from("marketplace_integrations")
        .update({ access_token: newAccessEnc, refresh_token: newRefreshEnc, expires_in: expiresAtIso })
        .eq("id", integration.id);
      accessToken = tokenJson.access_token;
      console.log("[ML-SUBMIT-XML] token_refreshed", { rid, expires_in: tokenJson.expires_in, new_access_len: String(tokenJson.access_token || "").length });
      resp = await postShipmentInvoice(accessToken, xmlText, shipmentId, "MLB");
    }

    const text = await resp.text();
    const preview = (text || "").slice(0, 2048);
    console.log("[ML-SUBMIT-XML] post_invoice_resp", { rid, status: resp.status, ok: resp.ok, body_preview_len: preview.length, body_preview: preview });
    let js: any = null;
    try { js = text ? JSON.parse(text) : {}; } catch { js = { raw: text }; }

    const statusFinal = resp.ok ? "sent" : "error";
    let fiscalId: string | null = null;
    try {
      if (typeof js?.id === "string") fiscalId = js.id;
      else if (Array.isArray(js?.fiscal_documents_ids) && js.fiscal_documents_ids.length > 0) {
        fiscalId = String(js.fiscal_documents_ids[0]);
      }
    } catch {}

    const errorCode: string | null = js?.error_code ? String(js.error_code) : null;
    const errorMessage: string | null = js?.message ? String(js.message) : (js?.error ? String(js.error) : null);
    const errorDetails = js?.error_details || js?.cause || js?.json || null;
    console.log("[ML-SUBMIT-XML] parsed_resp", {
      rid,
      statusFinal,
      http_status: resp.status,
      fiscal_document_id: fiscalId,
      error_code: errorCode,
      error_message: errorMessage,
      error_description: describeMeliInvoiceError(errorCode),
    });

    function describeMeliInvoiceError(code: string | null): string | null {
      if (!code) return null;
      const c = code.trim();
      const map: Record<string, string> = {
        shipment_invoice_already_saved: "Já existe uma nota fiscal salva para o envio informado.",
        duplicated_fiscal_key: "Chave fiscal já utilizada. Utilize uma chave única.",
        invalid_nfe_cstat: "A NF-e não está autorizada. Envie uma nota autorizada pela SEFAZ.",
        wrong_invoice_date: "Data da NF-e inválida. Deve ser maior que a data da venda.",
        wrong_sender_zipcode: "CEP do vendedor inválido ou nulo.",
        wrong_receiver_zipcode: "CEP do comprador inválido ou nulo.",
        wrong_receiver_cnpj: "CNPJ do comprador inválido ou nulo.",
        wrong_receiver_cpf: "CPF do comprador inválido ou nulo.",
        wrong_receiver_state_tax: "Inscrição Estadual do comprador inválida ou nula.",
        invalid_user: "Usuário não tem permissão para operar o envio informado.",
        seller_not_allowed_to_import_nfe: "Vendedor não tem permissão para importar NF-e.",
        shipment_invoice_should_contain_company_state_tax_id: "Inscrição Estadual do comprador ausente na NF-e.",
        invalid_state_tax_id: "Inscrição Estadual inválida ou nula.",
        invalid_operation_for_site_id: "Operação inválida para o site/país informado.",
        error_parse_invoice_data: "Erro ao converter dados da NF-e para JSON. Verifique o XML.",
        invalid_parameter: "Parâmetro inválido. Verifique se o body contém id quando não deveria.",
        invalid_caller_id: "Caller Id inválido ou ausente.",
        sender_ie_not_found: "CNPJ do vendedor não é contribuinte na SEFAZ ou está bloqueado.",
        invalid_sender_ie_for_state: "IE do vendedor inválida para o estado cadastrado.",
        invalid_sender_ie: "IE do vendedor diferente do cadastro no ML/SEFAZ.",
        invalid_sender_cnpj: "CNPJ do vendedor diferente do cadastrado na SEFAZ.",
        different_state_nfe_shipment_origin: "UF emitida no XML difere da origem do envio.",
      };
      return map[c] || null;
    }

    const { error: updErr } = await admin
      .from("notas_fiscais")
      .update({
        marketplace_submission_status: statusFinal,
        marketplace_submission_response: {
          ...js,
          _endpoint: "shipments.invoice_data",
          _shipment_id: shipmentId,
          _site_id: "MLB",
          _status_code: resp.status,
          _error_code: errorCode,
          _error_description: describeMeliInvoiceError(errorCode),
          _error_message: errorMessage,
          _error_details: errorDetails,
        },
        marketplace_fiscal_document_id: fiscalId,
      })
      .eq("id", nfRow.id);
    if (updErr) return jsonResponse({ ok: false, error: updErr.message, meli: js }, 200);
    console.log("[ML-SUBMIT-XML] db_update_ok", { rid, nf_id: nfRow.id, status: statusFinal, http_status: resp.status, fiscal_document_id: fiscalId });

    return jsonResponse({
      ok: true,
      status: statusFinal,
      meli: js,
      fiscal_document_id: fiscalId,
      xml_number_sent: meta.nfeNumber || null,
      xml_key_sent: meta.nfeKey || null,
      shipment_id: shipmentId,
      site_id: "MLB",
      http_status: resp.status,
      error_code: errorCode,
      error_description: describeMeliInvoiceError(errorCode),
      error_message: errorMessage,
      error_details: errorDetails,
    }, 200);
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    console.error("[ML-SUBMIT-XML] error", { message: msg });
    return jsonResponse({ error: msg }, 500);
  }
});
