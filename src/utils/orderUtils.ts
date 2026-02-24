export function mapTipoEnvioLabel(v?: string): string {
  const s = String(v || '').toLowerCase();
  if (s === 'full' || s === 'fulfillment' || s === 'fbm') return 'Full';
  if (s === 'flex' || s === 'self_service') return 'Flex';
  if (s === 'envios' || s === 'me2' || s === 'xd_drop_off' || s === 'cross_docking' || s === 'custom') return 'Envios';
  if (s === 'correios' || s === 'drop_off') return 'Correios';
  if (s === 'no_shipping') return 'Sem Envio';
  return s ? s : '—';
}

export function isAbortLikeError(e: any): boolean {
  const m = String((e && ((e as any).message || (e as any).name)) || e || '').toLowerCase();
  return m.includes('abort') || m.includes('failed to fetch') || m.includes('err_aborted');
}

export function normalizeShippingType(input?: string | null): string {
  const s = String(input || '').toLowerCase();
  if (!s) return '';
  if (s === 'full' || s === 'fulfillment' || s === 'fbm') return 'full';
  if (s === 'flex' || s === 'self_service') return 'flex';
  if (s === 'envios' || s === 'me2' || s === 'xd_drop_off' || s === 'cross_docking' || s === 'custom') return 'envios';
  if (s === 'correios' || s === 'drop_off') return 'correios';
  if (s === 'no_shipping') return 'no_shipping';
  return s;
}

export function ensureHttpUrl(url?: string | null): string | null {
  if (!url) return null;
  const s = String(url).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export function normalizeMarketplaceId(v?: string | null): string {
  const s = String(v || "")
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
  if (!s) return "";
  return s.replace(/[_\s]+/g, "-");
}

export function formatMarketplaceLabel(id: string): string {
  const s = String(id || "").toLowerCase().trim();
  if (!s) return "Marketplace";
  return s.split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : "").join(" ");
}

export function buildLabelInfo(o: any) {
  return {
    cached: Boolean(o?.label_cached || o?.label_content_base64 || o?.label_pdf_base64 || o?.label_zpl2_base64),
    response_type: (o?.label_response_type || (o?.label_pdf_base64 ? 'pdf' : (o?.label_zpl2_base64 ? 'zpl2' : null))) as string | null,
    fetched_at: (o?.label_fetched_at || null) as string | null,
    size_bytes: (typeof o?.label_size_bytes === 'number' ? o.label_size_bytes : Number(o?.label_size_bytes)) || null,
    shipment_ids: [] as string[],
    content_base64: o?.label_content_base64 || o?.label_pdf_base64 || o?.label_zpl2_base64 || null,
    content_type: o?.label_content_type || (o?.label_pdf_base64 ? 'application/pdf' : (o?.label_zpl2_base64 ? 'text/plain' : null)),
    pdf_base64: o?.label_pdf_base64 || null,
    zpl2_base64: o?.label_zpl2_base64 || null,
  };
}

export function resolveLinkedSku(o: any, linkedProducts: any[]): string | null {
  if (!Array.isArray(linkedProducts) || linkedProducts.length === 0) return null;
  const getVid = (v: any) => { const s = String(v ?? '').trim(); return s === '0' ? '' : s; };
  const cleanId = (s: any) => { const str = String(s || ''); const mm = str.match(/(\d+)/); return mm ? String(mm[1]) : str; };
  const pl = String(o?.first_item_permalink || '');
  const m = pl.match(/ML[A-Z]-?(\d+)/i);
  const altId = m ? String(m[1]) : '';
  const firstId = cleanId(String(o?.first_item_id || '')) || altId;
  const firstVid = getVid(o?.first_item_variation_id);
  const match =
    linkedProducts.find((l: any) => cleanId(l?.marketplace_item_id) === firstId && getVid(l?.variation_id) === firstVid) ||
    linkedProducts.find((l: any) => cleanId(l?.marketplace_item_id) === firstId) ||
    linkedProducts[0] ||
    null;
  return match && match.sku ? String(match.sku) : null;
}

export function buildFinancials(
  items: any[],
  orderTotal: number,
  valorRecebidoFrete: number,
  taxaMarketplace: number,
  envioMetodo: string | null,
) {
  const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;
  const itemsSum = items.reduce((sum: number, it: any) => sum + (toNum(it.valor) * (toNum(it.quantidade) || 0)), 0);
  const valorPedido = itemsSum || orderTotal;
  const liquido = valorPedido + valorRecebidoFrete - taxaMarketplace;
  return {
    valorPedido,
    freteRecebido: valorRecebidoFrete,
    freteRecebidoLiquido: valorRecebidoFrete,
    taxaFrete: 0,
    taxaMarketplace,
    saleFee: taxaMarketplace,
    feesPayments: 0,
    shippingFeeBuyer: 0,
    envioMetodo,
    envioTags: [] as string[],
    freteDiferenca: valorRecebidoFrete - 0,
    cupom: 0,
    impostos: 0,
    liquido,
    margem: 0,
    pagamentos: [] as any[],
    envios: [] as any[],
  };
}

export function mapStatusFocusToBadge(status: string | undefined): { label: string; className: string } {
  const stLower = String(status || '').toLowerCase();
  switch (stLower) {
    case 'autorizado':
    case 'autorizada':
      return { label: 'Autorizada', className: 'bg-green-600 text-white' };
    case 'processando_autorizacao':
      return { label: 'Processando', className: 'bg-blue-100 text-blue-800 border border-blue-200' };
    case 'pendente':
      return { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800 border border-yellow-200' };
    case 'cancelado':
    case 'cancelada':
      return { label: 'Cancelada', className: 'bg-red-100 text-red-800 border border-red-200' };
    case 'rejeitado':
    case 'rejeitada':
      return { label: 'Rejeitada', className: 'bg-red-100 text-red-800 border border-red-200' };
    case 'denegado':
    case 'denegada':
      return { label: 'Denegada', className: 'bg-red-100 text-red-800 border border-red-200' };
    case 'erro':
    case 'error':
      return { label: 'Erro', className: 'bg-red-100 text-red-800 border border-red-200' };
    default:
      return { label: status || 'Indefinido', className: 'bg-gray-100 text-gray-800 border border-gray-200' };
  }
}

export function getStatusColor(status: string): string {
  const s = String(status || '').trim().toLowerCase();
  switch (s) {
    case 'pendente':
    case 'a vincular':
      return 'bg-yellow-500 hover:bg-yellow-500 text-white';
    case 'emissao nf':
      return 'bg-orange-500 hover:bg-orange-500 text-white';
    case 'subir xml':
      return 'bg-blue-500 hover:bg-blue-500 text-white';
    case 'nf emitida':
    case 'impressao':
      return 'bg-purple-600 hover:bg-purple-700 text-white';
    case 'aguardando coleta':
      return 'bg-blue-500 hover:bg-blue-500 text-white';
    case 'enviado':
      return 'bg-green-500 hover:bg-green-500 text-white';
    case 'entregue':
      return 'bg-green-600 hover:bg-green-600 text-white';
    case 'cancelado':
      return 'bg-red-500 hover:bg-red-500 text-white';
    case 'devolvido':
    case 'devolução':
      return 'bg-gray-500 hover:bg-gray-500 text-white';
    default:
      return 'bg-gray-500 hover:bg-gray-500 text-white';
  }
}

export function formatShipmentStatus(status?: string): string {
  const s = String(status || '').trim();
  if (!s) return '';
  const key = s.toLowerCase();
  const map: Record<string, string> = {
    'pending': 'pendente',
    'ready_to_print': 'pronto para imprimir',
    'printed': 'etiqueta impressa',
    'ready_to_ship': 'enviar',
    'handling': 'em preparação',
    'shipped': 'enviado',
    'in_transit': 'em trânsito',
    'delivery_in_progress': 'em entrega',
    'out_for_delivery': 'saiu para entrega',
    'on_route': 'a caminho',
    'handed_to_carrier': 'entregue à transportadora',
    'delivered': 'entregue',
    'receiver_received': 'recebido pelo destinatário',
    'ready_to_pickup': 'pronto para retirada',
    'not_delivered': 'não entregue',
    'returned': 'devolvido',
    'canceled': 'cancelado',
    'cancelled': 'cancelado',
    'collected': 'coletado',
    'processing': 'processando',
  };
  return map[key] || s.replace(/_/g, ' ');
}

export function getShipmentStatusColor(status: string): string {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'pending':
    case 'ready_to_print':
      return 'bg-yellow-500 hover:bg-yellow-500 text-white';
    case 'ready_to_ship':
      return 'bg-purple-600 hover:bg-purple-600 text-white';
    case 'in_transit':
    case 'shipped':
      return 'bg-blue-500 hover:bg-blue-500 text-white';
    case 'delivered':
      return 'bg-green-600 hover:bg-green-600 text-white';
    case 'not_delivered':
    case 'returned':
      return 'bg-purple-600 hover:bg-purple-600 text-white';
    case 'canceled':
    case 'cancelled':
      return 'bg-red-600 hover:bg-red-600 text-white';
    default:
      return 'bg-gray-500 hover:bg-gray-500 text-white';
  }
}

export const formatCurrency = (value: number): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
