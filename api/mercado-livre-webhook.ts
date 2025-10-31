import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../src/integrations/supabase/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Basic CORS support for ML webhook
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-meli-signature, x-request-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const xMeliSignature = (req.headers['x-meli-signature'] as string) || '';
    const xRequestId = (req.headers['x-request-id'] as string) || '';

    // Forward body & relevant headers to Supabase Edge Function with apikey
    const forwardResp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-all`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        ...(xMeliSignature ? { 'x-meli-signature': xMeliSignature } : {}),
        ...(xRequestId ? { 'x-request-id': xRequestId } : {}),
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
    });

    const text = await forwardResp.text().catch(() => '');
    // Pass-through the status from the Edge Function; it already returns 200 to ML when appropriate
    const contentType = forwardResp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { return res.status(forwardResp.status).json(JSON.parse(text || '{}')); } catch { /* fallthrough */ }
    }
    return res.status(forwardResp.status).send(text);
  } catch (e: any) {
    // Fail-safe: respond 200 so ML doesn’t spam retries, but include error for observability
    return res.status(200).json({ ok: false, error: e?.message || 'Proxy error' });
  }
}