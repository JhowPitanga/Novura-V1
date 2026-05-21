#!/usr/bin/env node
/**
 * ANN-EDGE-03: invoke listings-backfill edge function with pagination.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/invoke-listings-backfill.mjs <organizationId> [marketplaceName]
 */
const orgId = process.argv[2];
const marketplaceName = process.argv[3] || null;
const pageSize = Number(process.env.PAGE_SIZE || 100);

if (!orgId) {
  console.error('Usage: node scripts/invoke-listings-backfill.mjs <organizationId> [marketplaceName]');
  process.exit(1);
}

const baseUrl = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/listings-backfill`;
let offset = 0;
let totalProcessed = 0;

for (;;) {
  const body = { organizationId: orgId, pageSize, offset };
  if (marketplaceName) body.marketplaceName = marketplaceName;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error('Invalid JSON:', text);
    process.exit(1);
  }

  if (!res.ok) {
    console.error('Backfill failed:', json);
    process.exit(1);
  }

  const processed = Number(json.processed ?? json.results?.processed ?? 0);
  totalProcessed += processed;
  console.log(`offset=${offset} processed=${processed} errors=${(json.errors || []).length}`);

  const hasMore = json.hasMore === true || json.has_more === true;
  if (!hasMore || processed === 0) break;
  offset += pageSize;
}

console.log(`Done. totalProcessed=${totalProcessed}`);
