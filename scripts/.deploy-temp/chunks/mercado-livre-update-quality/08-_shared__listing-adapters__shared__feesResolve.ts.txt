// Channel-agnostic fee resolver → CanonicalFees (marketplace_listing_fees).
// Mercado Livre and Shopee inputs are normalized here so the DB stores one shape.

import type { CanonicalFees } from '../types.ts';
import type { ProviderFeeRuleSnapshot } from '../types.ts';

export interface FeesResolveInput {
  marketplaceName: string;
  salePrice: number | null;
  payloadVersion?: number | null;
  currency?: string;
  /** Mercado Livre: marketplace_item_prices.listing_prices jsonb */
  mlListingPrices?: Record<string, unknown> | null;
  /** Shopee: base_info slice */
  shopeePayload?: {
    commission_fee?: number | null;
    commission_rate?: number | null;
    logistic_info?: Array<{ shipping_fee_subsidy?: number; enabled?: boolean }>;
  } | null;
  /** Cached category rule (marketplace_provider_fee_rules) */
  feeRule?: ProviderFeeRuleSnapshot | null;
  /** Learned from realized orders (marketplace_orders_presented_new) */
  observedAvgCommissionAmount?: number | null;
  observedAvgCommissionPercentage?: number | null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
}

function computeTotal(fees: CanonicalFees): void {
  if (
    fees.commission_amount != null ||
    fees.listing_fee_amount != null ||
    fees.shipping_subsidy != null
  ) {
    fees.total_fees_estimated =
      (fees.commission_amount ?? 0) +
      (fees.listing_fee_amount ?? 0) +
      (fees.shipping_subsidy ?? 0);
  }
}

function resolveMercadoLivreFees(input: FeesResolveInput): CanonicalFees {
  const lp = (input.mlListingPrices ?? {}) as Record<string, unknown>;
  const saleFeeDetails = (lp['sale_fee_details'] ?? {}) as Record<string, unknown>;
  const prices0 = Array.isArray(lp['prices']) ? (lp['prices'] as unknown[])[0] : null;
  const shippingCost = prices0 && typeof prices0 === 'object'
    ? (prices0 as Record<string, unknown>)['shipping_cost'] as Record<string, unknown> | undefined
    : undefined;

  const fees: CanonicalFees = {
    currency: input.currency ?? 'BRL',
    commission_amount: num(lp['sale_fee_amount']) ?? num(
      (prices0 as Record<string, unknown> | undefined)?.['sale_fee'] &&
        typeof (prices0 as Record<string, unknown>)['sale_fee'] === 'object'
        ? ((prices0 as Record<string, unknown>)['sale_fee'] as Record<string, unknown>)['amount']
        : null,
    ),
    commission_percentage: num(saleFeeDetails['percentage_fee']),
    commission_fixed_fee: num(saleFeeDetails['fixed_fee']),
    listing_fee_amount: num(lp['listing_fee_amount']),
    shipping_subsidy: num(shippingCost?.['amount']),
    total_fees_estimated: null,
    source_payload_version: input.payloadVersion ?? null,
  };

  computeTotal(fees);
  return fees;
}

function maxShippingSubsidyShopee(
  logistics: Array<{ shipping_fee_subsidy?: number; enabled?: boolean }> | undefined,
): number | null {
  if (!Array.isArray(logistics) || !logistics.length) return null;
  let max = 0;
  let found = false;
  for (const l of logistics) {
    if (l?.enabled === false) continue;
    const sub = num(l?.shipping_fee_subsidy);
    if (sub != null && sub > max) {
      max = sub;
      found = true;
    }
  }
  return found ? max : null;
}

function resolveShopeeFees(input: FeesResolveInput): CanonicalFees {
  const base = input.shopeePayload ?? {};
  const price = input.salePrice;
  const rule = input.feeRule;
  const pctFromRule = num(rule?.commission_percentage);
  const pctFromPayload = num(base.commission_rate);
  const pctFromOrders = num(input.observedAvgCommissionPercentage);
  const commissionPct = pctFromPayload ?? pctFromRule ?? pctFromOrders ?? null;

  let commissionAmount = num(base.commission_fee);
  if (commissionAmount == null && num(input.observedAvgCommissionAmount) != null) {
    commissionAmount = num(input.observedAvgCommissionAmount);
  }
  if (commissionAmount == null && commissionPct != null && price != null && price > 0) {
    commissionAmount = Math.round((price * commissionPct / 100) * 100) / 100;
  }

  const fees: CanonicalFees = {
    currency: input.currency ?? 'BRL',
    commission_amount: commissionAmount,
    commission_percentage: commissionPct,
    commission_fixed_fee: num(rule?.commission_fixed_fee) ?? 0,
    listing_fee_amount: num(rule?.listing_fee_amount) ?? 0,
    shipping_subsidy: maxShippingSubsidyShopee(base.logistic_info),
    total_fees_estimated: null,
    source_payload_version: input.payloadVersion ?? null,
  };

  computeTotal(fees);
  return fees;
}

/** Resolves canonical fees for any supported marketplace. */
export function resolveCanonicalFees(input: FeesResolveInput): CanonicalFees {
  const mkt = String(input.marketplaceName || '').toLowerCase();
  if (mkt.includes('mercado') || mkt === 'ml') {
    return resolveMercadoLivreFees(input);
  }
  if (mkt.includes('shopee')) {
    return resolveShopeeFees(input);
  }

  return {
    currency: input.currency ?? 'BRL',
    commission_amount: null,
    commission_percentage: null,
    commission_fixed_fee: null,
    listing_fee_amount: null,
    shipping_subsidy: null,
    total_fees_estimated: null,
    source_payload_version: input.payloadVersion ?? null,
  };
}
