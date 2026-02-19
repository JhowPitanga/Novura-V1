import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

type QueueRow = {
  id: string;
  organizations_id: string;
  company_id: string;
  order_id: string;
  environment: "homologacao" | "producao";
  status: "pending" | "processing" | "done" | "error";
  attempts: number;
  last_error?: string | null;
  priority: number;
  batch_key?: string | null;
  created_at: string;
  processed_at?: string | null;
};

type ConsumeRequest = {
  organizationId?: string;
  companyId?: string;
  environment?: "homologacao" | "producao";
  limit?: number;
  queue?: "q_emit_focus" | "q_submit_xml";
};

const BATCH_SIZE_DEFAULT = 80;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({}, 200);
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const rid = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

  try {
    const body = (await req.json().catch(() => ({}))) as ConsumeRequest;
    const organizationId = body.organizationId;
    const companyId = body.companyId;
    const environment = body.environment;
    const limit = Math.max(1, Math.min(Number(body.limit || BATCH_SIZE_DEFAULT), BATCH_SIZE_DEFAULT));
    const queue = String((body as any).queue || "").toLowerCase() === "q_submit_xml" ? "q_submit_xml" : "q_emit_focus";
    console.log("[QUEUE-CONSUME] inbound", { rid, queue, limit, body_preview: JSON.stringify(body).slice(0, 256) });

    let pgmqRows: Array<{ msg_id: number; vt: string; message: any; enqueued_at: string; read_ct: number }> = [];
    let pgmqErr: any = null;
    try {
      const readFn = queue === "q_emit_focus" ? "q_emit_focus_read" : "q_submit_xml_read";
      const { data, error } = await admin
        .rpc(readFn, { p_vt: 120, p_qty: limit } as any);
      if (error) pgmqErr = error;
      if (Array.isArray(data)) pgmqRows = data as any[];
    } catch (e: any) {
      pgmqErr = e;
    }
    console.log("[QUEUE-CONSUME] read_result", { rid, queue, rows: pgmqRows.length, error: pgmqErr ? (pgmqErr.message || String(pgmqErr)) : null });

    const authHeader = req.headers.get("Authorization") || "";
    console.log("[QUEUE-CONSUME] auth_header", { rid, present: !!authHeader });
    if (pgmqRows.length === 0) return json({ ok: true, processed: 0, rid });

    if (queue === "q_emit_focus") {
      let msgIds: number[] = [];
      let orgForBatch: string | undefined = organizationId;
      let companyForBatch: string | undefined = companyId;
      let envForBatch: "homologacao" | "producao" | undefined = environment as any;
      let forceNewNumber = false;
      let forceNewRef = false;
      let orderIds: string[] = [];
      for (const r of pgmqRows) {
        msgIds.push(Number(r.msg_id));
        const m = (r as any).message ?? (r as any).msg ?? {};
        const orgId = String(m.organizations_id || m.organizationId || "");
        const compId = String(m.company_id || m.companyId || "");
        const env = String(m.environment || "").toLowerCase() === "producao" ? "producao" : "homologacao";
        forceNewNumber = forceNewNumber || !!m.forceNewNumber;
        forceNewRef = forceNewRef || !!m.forceNewRef;
        if (!orgForBatch) orgForBatch = orgId || orgForBatch;
        if (!companyForBatch) companyForBatch = compId || companyForBatch;
        if (!envForBatch) envForBatch = env as any;
        const ids = Array.isArray(m.orderIds) ? m.orderIds.map((x: any) => String(x)).filter(Boolean) : [String(m.order_id || m.orderId || "")].filter(Boolean);
        orderIds.push(...ids);
      }
      orderIds = Array.from(new Set(orderIds));
      console.log("[QUEUE-CONSUME] emit_batch_compose", { rid, orgForBatch, companyForBatch, envForBatch, orderIds_len: orderIds.length, forceNewNumber, forceNewRef });
      if (orderIds.length === 0) {
        return json({ ok: true, processed: 0, rid });
      }
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/focus-nfe-emit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          organizationId: orgForBatch,
          companyId: companyForBatch,
          orderIds,
          environment: envForBatch,
          forceNewNumber,
          forceNewRef,
        }),
      });
      const resultText = await resp.text();
      let resultJson: any = {};
      try { resultJson = resultText ? JSON.parse(resultText) : {}; } catch { resultJson = { raw: resultText }; }
      console.log("[QUEUE-CONSUME] emit_resp", { rid, status: resp.status, ok: resp.ok, body_preview: (resultText || "").slice(0, 512) });
      if (!resp.ok) {
        const errMsg = resultJson?.error || `HTTP ${resp.status}`;
        return json({ error: errMsg, rid }, resp.status);
      }
      const results = Array.isArray(resultJson?.results) ? resultJson.results : [];
      const byOrderId = new Map<string, any>();
      for (const r of results) {
        const k = String(r?.orderId || "");
        if (k) byOrderId.set(k, r);
      }
      const dels = [];
      const archs = [];
      for (let i = 0; i < pgmqRows.length; i++) {
        const r = pgmqRows[i];
        const m = (r as any).message ?? (r as any).msg ?? {};
        const ids = Array.isArray(m.orderIds) ? m.orderIds.map((x: any) => String(x)).filter(Boolean) : [String(m.order_id || m.orderId || "")].filter(Boolean);
        const okAny = ids.some((oid: string) => {
          const rr = byOrderId.get(oid);
          const st = String(rr?.status || "").toLowerCase();
          return !!rr && (st === "autorizado" || st === "autorizada" || st === "processando_autorizacao");
        });
        if (okAny) {
          dels.push(admin.rpc("q_emit_focus_delete", { p_msg_id: Number(r.msg_id) } as any));
        } else {
        }
      }
      await Promise.allSettled(dels);
      await Promise.allSettled(archs);
      return json({
        ok: true,
        processed: pgmqRows.length,
        rid,
        summary: {
          authorized: results.filter((r: any) => String(r?.status || "").toLowerCase().includes("autoriz")).length,
          errors: results.filter((r: any) => r?.ok === false || String(r?.status || "") === "").length,
        },
      });
    } else {
      const submits: Array<{
        msgId: number;
        organizationId: string;
        companyId: string;
        notaFiscalId?: string;
        nfeKey?: string;
        marketplace: string;
      }> = [];
      for (const r of pgmqRows) {
        const m = (r as any).message ?? (r as any).msg ?? {};
        const orgId = String(m.organizations_id || m.organizationId || "");
        const compId = String(m.company_id || m.companyId || "");
        const nfId = String(m.nota_fiscal_id || m.notaFiscalId || "");
        const nfKey = String(m.nfe_key || m.nfeKey || "");
        const mk = String(m.marketplace || m.marketplace_name || "").toLowerCase();
        submits.push({
          msgId: Number(r.msg_id),
          organizationId: orgId,
          companyId: compId,
          notaFiscalId: nfId || undefined,
          nfeKey: nfKey || undefined,
          marketplace: mk,
        });
      }
      console.log("[QUEUE-CONSUME] submit_batch_compose", { rid, count: submits.length });
      const dels = [];
      const results: any[] = [];
      for (const s of submits) {
        let endpoint: string | null = null;
        const mkRaw = String(s.marketplace || "");
        const mkTestMl = /(mercado\s*livre|meli|mlb|mercado)/i.test(mkRaw);
        const mkTestShopee = /shopee/i.test(mkRaw);
        if (mkTestMl) endpoint = "mercado-livre-submit-xml";
        else if (mkTestShopee) endpoint = "shopee-submit-xml";
        console.log("[QUEUE-CONSUME] submit_route", { rid, msg_id: s.msgId, mk: mkRaw, endpoint });
        if (!endpoint || !s.organizationId || !s.companyId || (!s.notaFiscalId && !s.nfeKey)) {
          results.push({ ok: false, marketplace: s.marketplace, msgId: s.msgId, status: "", error: "payload_incompleto" });
          continue;
        }
        const payload: any = {
          organizationId: s.organizationId,
          companyId: s.companyId,
        };
        if (endpoint === "mercado-livre-submit-xml") {
          if (s.notaFiscalId) payload.notaFiscalId = s.notaFiscalId;
          if (s.nfeKey) payload.nfeKey = s.nfeKey;
        } else if (endpoint === "shopee-submit-xml") {
          if (s.notaFiscalId) payload.notaFiscalId = s.notaFiscalId;
        }
        console.log("[QUEUE-CONSUME] submit_call", { rid, msg_id: s.msgId, endpoint, payload });
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            "x-internal-worker": "queue-consume",
            "x-correlation-id": rid,
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify(payload),
        });
        const t = await resp.text();
        let j: any = {};
        try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
        console.log("[QUEUE-CONSUME] submit_resp", { rid, msg_id: s.msgId, endpoint, status: resp.status, ok: resp.ok, body_preview: (t || "").slice(0, 512) });
        const ok = resp.ok && j?.ok === true;
        results.push({ ok, marketplace: s.marketplace, msgId: s.msgId, status: j?.status || "", error: j?.error || null });
        if (ok) {
          dels.push(admin.rpc("q_submit_xml_delete", { p_msg_id: Number(s.msgId) } as any));
        }
      }
      await Promise.allSettled(dels);
      console.log("[QUEUE-CONSUME] submit_summary", { rid, sent: results.filter((r: any) => r.ok === true && String(r?.status || "").toLowerCase() === "sent").length, errors: results.filter((r: any) => r.ok === false).length });
      return json({
        ok: true,
        processed: pgmqRows.length,
        rid,
        summary: {
          sent: results.filter((r: any) => r.ok === true && String(r?.status || "").toLowerCase() === "sent").length,
          errors: results.filter((r: any) => r.ok === false).length,
        },
        results,
      });
    }
  } catch (e: any) {
    return json({ error: e?.message || String(e), rid }, 500);
  }
});
