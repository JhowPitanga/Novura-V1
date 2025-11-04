import { supabase } from '@/integrations/supabase/client';

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
  const { data, error } = await supabase
    .from('marketplace_orders_presented')
    .select('marketplace, first_item_permalink, first_item_id, first_item_title')
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar pedido:', error.message);
    return '';
  }

  if (!data) return '';

  if (data.first_item_permalink) return data.first_item_permalink;

  if (data.marketplace === 'Mercado Livre') {
    return buildMercadoLivreLink(data.first_item_id || '', data.first_item_title || '');
  }

  return '';
}