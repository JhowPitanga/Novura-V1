import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse as json } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";

type ConsumeRequest = {
  organizationId?: string;
  companyId?: string;
  environment?: "homologacao" | "producao";
  limit?: number;
  queue?: "q_emit_focus" | "q_submit_xml";
};

type PgmqRow = { msg_id: number; vt: string; message: any; enqueued_at: string; read_ct: number };

type EmitGroup = {
  msgIds: number[];
  orderIds: string[];
  organizationId: string;
  companyId: string;
  environment: "homologacao" | "producao";
  forceNewNumber: boolean;
  forceNewRef: boolean;
};

const BATCH_SIZE_DEFAULT = 80;
const DEAD_LETTER_MAX_READS = 5;

function extractEmitGroupKey(m: any): string {
  const orgId = String(m.organizations_id || m.organizationId || "");
  const compId = String(m.company_id || m.companyId || "");
  const env = String(m.environment || "").toLowerCase() === "producao" ? "producao" : "homologacao";
  return `${orgId}:${compId}:${env}`;
}

function extractOrderIds(m: any): string[] {
  return Array.isArray(m.orderIds)
    ? m.orderIds.map((x: any) => String(x)).filter(Boolean)
    : [String(m.order_id || m.orderId || "")].filter(Boolean);
}

/** Group active PGMQ rows by (orgId, companyId, environment), accumulating orderIds per group. */
function groupEmitRows(rows: PgmqRow[]): Map<string, EmitGroup> {
  const groups = new Map<string, EmitGroup>();
  for (const r of rows) {
    const m = r.message ?? {};
    const key = extractEmitGroupKey(m);
    const orgId = String(m.organizations_id || m.organizationId || "");
    const compId = String(m.company_id || m.companyId || "");
    const env: "homologacao" | "producao" = String(m.environment || "").toLowerCase() === "producao" ? "producao" : "homologacao";
    if (!groups.has(key)) {
      groups.set(key, { msgIds: [], orderIds: [], organizationId: orgId, companyId: compId, environment: env, forceNewNumber: false, forceNewRef: false });
    }
    const group = groups.get(key)!;
    group.msgIds.push(Number(r.msg_id));
    group.forceNewNumber = group.forceNewNumber || !!m.forceNewNumber;
    group.forceNewRef = group.forceNewRef || !!m.forceNewRef;
    for (const id of extractOrderIds(m)) {
      if (!group.orderIds.includes(id)) group.orderIds.push(id);
    }
  }
  return groups;
}

async function callEmitFocus(supabaseUrl: string, anonKey: string, authHeader: string, group: EmitGroup): Promise<any[]> {
  const resp = await fetch(`${supabaseUrl}/functions/v1/focus-nfe-emit`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anonKey, ...(authHeader ? { Authorization: authHeader } : {}) },
    body: JSON.stringify({ organizationId: group.organizationId, companyId: group.companyId, orderIds: group.orderIds, environment: group.environment, forceNewNumber: group.forceNewNumber, forceNewRef: group.forceNewRef }),
  });
  const text = await resp.text();
  let resultJson: any = {};
  try { resultJson = text ? JSON.parse(text) : {}; } catch { resultJson = { raw: text }; }
  if (!resp.ok) return [];
  return Array.isArray(resultJson?.results) ? resultJson.results : [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rid = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createAdminClient();

  try {
    const body = (await req.json().catch(() => ({}))) as ConsumeRequest;
    const limit = Math.max(1, Math.min(Number(body.limit || BATCH_SIZE_DEFAULT), BATCH_SIZE_DEFAULT));
    const queue = String((body as any).queue || "").toLowerCase() === "q_submit_xml" ? "q_submit_xml" : "q_emit_focus";
    const authHeader = req.headers.get("Authorization") || "";
    console.log("[QUEUE-CONSUME] inbound", { rid, queue, limit });

    // Read messages from PGMQ
    let pgmqRows: PgmqRow[] = [];
    try {
      const readFn = queue === "q_emit_focus" ? "q_emit_focus_read" : "q_submit_xml_read";
      const { data, error } = await admin.rpc(readFn, { p_vt: 120, p_qty: limit } as any);
      if (error) console.error("[QUEUE-CONSUME] read_error", { rid, error: error.message });
      if (Array.isArray(data)) pgmqRows = data as PgmqRow[];
    } catch (e: any) {
      console.error("[QUEUE-CONSUME] read_exception", { rid, error: e?.message });
    }
    if (pgmqRows.length === 0) return json({ ok: true, processed: 0, rid });

    if (queue === "q_emit_focus") {
      // Separate dead-letter messages (exceeded retry limit) from active rows
      const deadMsgIds: number[] = [];
      const activeRows = pgmqRows.filter(r => {
        if (Number(r.read_ct) > DEAD_LETTER_MAX_READS) {
          deadMsgIds.push(Number(r.msg_id));
          return false;
        }
        return true;
      });

      if (deadMsgIds.length > 0) {
        console.error("[QUEUE-CONSUME] dead_letter", { rid, count: deadMsgIds.length, msgIds: deadMsgIds });
        await Promise.allSettled(deadMsgIds.map(msgId => admin.rpc("q_emit_focus_delete", { p_msg_id: msgId } as any)));
      }

      // Group active rows by (organizationId, companyId, environment)
      const groups = groupEmitRows(activeRows);
      console.log("[QUEUE-CONSUME] emit_groups", { rid, count: groups.size });

      // Call focus-nfe-emit once per group
      const allResults: any[] = [];
      const successfulOrderIds = new Set<string>();
      for (const group of groups.values()) {
        if (group.orderIds.length === 0) continue;
        const results = await callEmitFocus(SUPABASE_URL, SUPABASE_ANON_KEY, authHeader, group);
        for (const r of results) {
          if (r?.ok === true) successfulOrderIds.add(String(r.orderId || ""));
        }
        allResults.push(...results);
      }

      // Delete only messages whose orderIds were ALL successfully processed
      const dels = activeRows
        .filter(r => {
          const ids = extractOrderIds(r.message ?? {});
          return ids.length > 0 && ids.every(id => successfulOrderIds.has(id));
        })
        .map(r => admin.rpc("q_emit_focus_delete", { p_msg_id: Number(r.msg_id) } as any));
      await Promise.allSettled(dels);

      return json({ ok: true, processed: pgmqRows.length, rid, summary: { authorized: allResults.filter((r: any) => r?.ok === true).length, errors: allResults.filter((r: any) => r?.ok === false).length, deadLetters: deadMsgIds.length } });
    }

    // q_submit_xml path
    const dels: Promise<any>[] = [];
    const results: any[] = [];
    for (const r of pgmqRows) {
      const m = r.message ?? {};
      const orgId = String(m.organizations_id || m.organizationId || "");
      const compId = String(m.company_id || m.companyId || "");
      const nfId = String(m.nota_fiscal_id || m.notaFiscalId || "");
      const nfKey = String(m.nfe_key || m.nfeKey || "");
      const mk = String(m.marketplace || m.marketplace_name || "").toLowerCase();
      const mkTestMl = /(mercado\s*livre|meli|mlb|mercado)/i.test(mk);
      const mkTestShopee = /shopee/i.test(mk);
      const endpoint = mkTestMl ? "mercado-livre-submit-xml" : mkTestShopee ? "shopee-submit-xml" : null;

      if (!endpoint || !orgId || !compId || (!nfId && !nfKey)) {
        results.push({ ok: false, marketplace: mk, msgId: r.msg_id, error: "payload_incompleto" });
        continue;
      }
      const payload: any = { organizationId: orgId, companyId: compId };
      if (endpoint === "mercado-livre-submit-xml") { if (nfId) payload.notaFiscalId = nfId; if (nfKey) payload.nfeKey = nfKey; }
      else if (nfId) payload.notaFiscalId = nfId;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: SUPABASE_ANON_KEY, "x-internal-worker": "queue-consume", ...(authHeader ? { Authorization: authHeader } : {}) },
        body: JSON.stringify(payload),
      });
      const t = await resp.text();
      let j: any = {};
      try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
      const ok = resp.ok && j?.ok === true;
      results.push({ ok, marketplace: mk, msgId: r.msg_id, error: j?.error || null });
      if (ok) dels.push(admin.rpc("q_submit_xml_delete", { p_msg_id: Number(r.msg_id) } as any));
    }
    await Promise.allSettled(dels);
    return json({ ok: true, processed: pgmqRows.length, rid, summary: { sent: results.filter((r: any) => r.ok === true).length, errors: results.filter((r: any) => r.ok === false).length }, results });
  } catch (e: any) {
    return json({ error: e?.message || String(e), rid }, 500);
  }
});
