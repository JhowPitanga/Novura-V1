import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AnuncioParaVincular {
    id: string;
    quantidade: number;
}

type InsufficientMap = Record<string, { available: number | null; required: number }>;

interface UseLinkOrderStorageResult {
    storageId: string | null;
    insufficientMap: InsufficientMap;
}

/**
 * Resolves the default storage ID for the current user/org,
 * and tracks insufficient stock for each linked anuncio.
 */
export function useLinkOrderStorage(
    isOpen: boolean,
    orgId: string | null | undefined,
    vinculacoes: Record<string, string>,
    anunciosParaVincular: AnuncioParaVincular[],
): UseLinkOrderStorageResult {
    const [storageId, setStorageId] = useState<string | null>(null);
    const [insufficientMap, setInsufficientMap] = useState<InsufficientMap>({});

    // Resolve the default storage ID when the modal opens
    useEffect(() => {
        if (!isOpen) return;
        (async () => {
            let sid: string | null = null;
            try {
                const { data: authUserData } = await supabase.auth.getUser();
                const uid = authUserData?.user?.id;
                if (uid && orgId) {
                    const { data: userOrgSettings } = await supabase
                        .from('user_organization_settings')
                        .select('default_storage_id')
                        .eq('organization_id', orgId)
                        .eq('user_id', uid)
                        .maybeSingle();
                    sid = (userOrgSettings as any)?.default_storage_id ?? null;
                }
            } catch {}

            if (!sid && typeof window !== 'undefined') {
                try { sid = localStorage.getItem('defaultStorageId') || null; } catch {}
            }

            if (!sid) {
                try {
                    let q: any = supabase
                        .from('storage')
                        .select('id')
                        .eq('active', true)
                        .order('created_at', { ascending: true })
                        .limit(1);
                    if (orgId) q = (q as any).eq('organizations_id', orgId);
                    const { data } = await q;
                    if (data && data.length > 0) sid = String(data[0].id);
                } catch {}
            }

            setStorageId(sid);
        })();
    }, [isOpen, orgId]);

    // Check available stock for each linked product when vinculacoes change
    useEffect(() => {
        if (!isOpen) return;
        const vincIds = Object.keys(vinculacoes);
        if (vincIds.length === 0 || !storageId) {
            setInsufficientMap({});
            return;
        }

        const productIds = vincIds.map((aid) => vinculacoes[aid]).filter(Boolean);
        (async () => {
            try {
                const { data } = await (supabase as any)
                    .from('products_stock')
                    .select('product_id,current,reserved')
                    .eq('storage_id', storageId)
                    .in('product_id', productIds);

                const stockMap: Record<string, number> = {};
                const rows: any[] = Array.isArray(data) ? data : [];
                rows.forEach((r: any) => {
                    stockMap[String(r.product_id)] = Number(r.current || 0) - Number(r.reserved || 0);
                });

                const next: InsufficientMap = {};
                anunciosParaVincular.forEach((anuncio) => {
                    const pid = vinculacoes[anuncio.id];
                    if (!pid) return;
                    const available = Object.hasOwn(stockMap, pid) ? stockMap[pid] : null;
                    next[anuncio.id] = { available, required: anuncio.quantidade };
                });
                setInsufficientMap(next);
            } catch {
                const next: InsufficientMap = {};
                anunciosParaVincular.forEach((anuncio) => {
                    const pid = vinculacoes[anuncio.id];
                    if (!pid) return;
                    next[anuncio.id] = { available: null, required: anuncio.quantidade };
                });
                setInsufficientMap(next);
            }
        })();
    }, [isOpen, storageId, vinculacoes, anunciosParaVincular]);

    return { storageId, insufficientMap };
}
