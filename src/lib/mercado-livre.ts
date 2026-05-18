import { fetchOrderItemLinkData } from '@/services/orders.service';

function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return base;
}

export function buildMercadoLivreLink(itemId: string, title?: string): string {
  if (!itemId) return '';
  const slug = title ? slugifyTitle(title) : '';
  const suffix = slug ? `-${slug}-_JM` : '-_JM';
  return `https://produto.mercadolivre.com.br/MLB-${itemId}${suffix}`;
}

export async function getOrderVariationLinkById(orderId: string): Promise<string> {
  if (!orderId) return '';

  const row = await fetchOrderItemLinkData(orderId);
  if (!row) return '';

  if (row.firstItemPermalink) return row.firstItemPermalink;

  if (row.marketplace === 'mercado_livre' || row.marketplace === 'Mercado Livre') {
    return buildMercadoLivreLink(row.firstItemId || '', row.firstItemTitle || '');
  }

  return '';
}
