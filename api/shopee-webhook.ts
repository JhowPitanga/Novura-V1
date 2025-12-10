type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): {
    json(data: unknown): void;
    send(data: unknown): void;
    setHeader(name: string, value: string): void;
  };
};
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../src/integrations/supabase/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-shopee-signature, x-request-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const xShopeeSignature = (req.headers['x-shopee-signature'] as string) || '';
    const xRequestId = (req.headers['x-request-id'] as string) || '';

    const forwardResp = await fetch(`${SUPABASE_URL}/functions/v1/shopee-sync-all`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'x-internal-call': '1',
        ...(xShopeeSignature ? { 'x-shopee-signature': xShopeeSignature } : {}),
        ...(xRequestId ? { 'x-request-id': xRequestId } : {}),
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
    });

    const text = await forwardResp.text().catch(() => '');
    const contentType = forwardResp.headers.get('content-type') || 'application/json';
    const chain = res.status(forwardResp.status);
    chain.setHeader('content-type', contentType);
    chain.send(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro inesperado';
    return res.status(500).json({ error: msg });
  }
}
