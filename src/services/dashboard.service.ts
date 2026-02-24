import { supabase } from "@/integrations/supabase/client";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExpiringCert {
    id: string;
    company_id: string;
    valid_to: string;
    file_name?: string | null;
    company_name?: string | null;
    daysLeft: number;
}

export interface OrderStatusCounts {
    counts: { vincular: number; emissao: number; impressao: number; coleta: number; enviado: number };
    delayed: { vincular: boolean; emissao: boolean; impressao: boolean; coleta: boolean };
}

// ─── Service Functions ──────────────────────────────────────────────────────

export async function fetchExpiringCerts(orgId: string): Promise<ExpiringCert[]> {
    const today = new Date();
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 30);
    const toDateStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
        .from('companies')
        .select('id, organization_id, certificado_validade, certificado_a1_url, razao_social')
        .eq('organization_id', orgId)
        .not('certificado_validade', 'is', null)
        .lte('certificado_validade', toDateStr)
        .order('certificado_validade', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => {
        const vt = row.certificado_validade as string;
        const vtDate = new Date(vt + 'T00:00:00');
        const diffMs = vtDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return {
            id: row.id,
            company_id: row.id,
            valid_to: vt,
            file_name: row.certificado_a1_url ?? null,
            company_name: row.razao_social ?? null,
            daysLeft,
        };
    });
}

export async function fetchOrderStatusCounts(orgId: string): Promise<OrderStatusCounts> {
    const { data, error } = await (supabase as any)
        .from('marketplace_orders_presented_new')
        .select('id,status_interno,shipment_status,shipment_sla_status,estimated_delivery_limit_at,shipment_sla_expected_date')
        .eq('organizations_id', orgId);

    if (error) throw error;

    const rows: any[] = Array.isArray(data) ? data : [];
    const delivered = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup', 'shipped', 'dropped_off'];
    const vincArr = ['A vincular', 'A Vincular', 'A VINCULAR'];
    const emisArr = ['Emissao NF', 'Emissão NF', 'EMISSÃO NF', 'Subir xml', 'subir xml'];
    const imprArr = ['Impressao', 'Impressão', 'IMPRESSÃO'];
    const colArr = ['Aguardando Coleta', 'Aguardando coleta', 'AGUARDANDO COLETA'];
    const cancelArr = ['Cancelado', 'Devolução', 'Devolucao'];
    const nowMs = Date.now();

    const isDelivered = (s: any) => delivered.includes(String(s || '').toLowerCase());
    const isExpired = (r: any) => {
        const edStr = r?.estimated_delivery_limit_at || r?.shipment_sla_expected_date;
        if (!edStr) return false;
        return new Date(edStr).getTime() <= nowMs;
    };
    const isDelayed = (r: any) => {
        const si = String(r?.status_interno || '');
        if (si === 'Enviado' || cancelArr.includes(si)) return false;
        if (isDelivered(r?.shipment_status)) return false;
        const slaStatus = String(r?.shipment_sla_status || '').toLowerCase();
        return slaStatus === 'delayed' || isExpired(r);
    };

    const vincRows = rows.filter(r => vincArr.includes(String(r?.status_interno || '')));
    const emisRows = rows.filter(r => emisArr.includes(String(r?.status_interno || '')));
    const imprRows = rows.filter(r => imprArr.includes(String(r?.status_interno || '')));
    const colRows = rows.filter(r => colArr.includes(String(r?.status_interno || '')));
    const envRows = rows.filter(r => String(r?.status_interno || '') === 'Enviado');

    return {
        counts: {
            vincular: vincRows.length,
            emissao: emisRows.length,
            impressao: imprRows.length,
            coleta: colRows.length,
            enviado: envRows.length,
        },
        delayed: {
            vincular: vincRows.some(isDelayed),
            emissao: emisRows.some(isDelayed),
            impressao: imprRows.some(isDelayed),
            coleta: colRows.some(isDelayed),
        },
    };
}
