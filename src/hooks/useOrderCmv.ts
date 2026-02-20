import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches the linked product cost (CMV) for a given order.
 * Uses linked_products to resolve product IDs or SKUs, then averages cost_price.
 */
export function useOrderCmv(pedido: any): number | null {
    const [cmvLinked, setCmvLinked] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                let links: any[] = [];
                const raw = pedido?.linked_products;
                if (Array.isArray(raw)) {
                    links = raw;
                } else if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) links = parsed;
                    } catch {}
                }

                const ids = Array.from(
                    new Set(links.map((e: any) => String(e?.product_id || "")).filter(Boolean))
                );
                const skus = Array.from(
                    new Set(links.map((e: any) => String(e?.sku || "")).filter(Boolean))
                );

                let products: any[] = [];
                if (ids.length > 0) {
                    const { data } = await (supabase as any)
                        .from("products")
                        .select("id, cost_price")
                        .in("id", ids);
                    if (Array.isArray(data)) products = data;
                }
                if (!products.length && skus.length > 0) {
                    const { data } = await (supabase as any)
                        .from("products")
                        .select("id, cost_price, sku")
                        .in("sku", skus);
                    if (Array.isArray(data)) products = data;
                }

                if (products.length) {
                    const costs = products
                        .map((p: any) => (typeof p?.cost_price === 'number' ? p.cost_price : Number(p?.cost_price) || 0))
                        .filter((n: number) => Number.isFinite(n));
                    const avg = costs.length ? costs.reduce((a: number, b: number) => a + b, 0) / costs.length : 0;
                    const qty =
                        Number(pedido?.quantidadeTotal) ||
                        (Array.isArray(pedido?.itens)
                            ? pedido.itens.reduce((s: number, it: any) => s + (Number(it?.quantidade) || 0), 0)
                            : 1);
                    if (!cancelled) setCmvLinked(avg * qty);
                } else {
                    if (!cancelled) setCmvLinked(null);
                }
            } catch {
                if (!cancelled) setCmvLinked(null);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [pedido]);

    return cmvLinked;
}
