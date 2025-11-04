import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://frwnfukydjwilfobxxhw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_xyN_quJIXYc1eVI1ijVSRA_y4mSoN78';

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildMercadoLivreLink(itemId, title) {
  if (!itemId) return '';
  const slug = title ? slugifyTitle(title) : '';
  const suffix = slug ? `-${slug}-_JM` : '-_JM';
  return `https://produto.mercadolivre.com.br/MLB-${itemId}${suffix}`;
}

async function getOrderVariationLinkById(orderId) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase
    .from('marketplace_orders_presented')
    .select('marketplace, first_item_permalink, first_item_id, first_item_title')
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return '';
  if (data.first_item_permalink) return data.first_item_permalink;
  if (data.marketplace === 'Mercado Livre') {
    return buildMercadoLivreLink(data.first_item_id || '', data.first_item_title || '');
  }
  return '';
}

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Uso: node scripts/get-order-link.mjs <order-uuid>');
    process.exit(1);
  }
  try {
    const link = await getOrderVariationLinkById(orderId);
    console.log(link || '(link não encontrado)');
  } catch (e) {
    console.error('Erro ao gerar link:', e.message);
    process.exit(1);
  }
}

main();