/**
 * §1 SIZE EXCEPTION: ~191 LOC (limit 150).
 * Justified: orchestrates drawer state + 5 async flows (links, integrations, items, link, unlink).
 * Each async block is ≤25 LOC. Splitting further would create unnecessary context/provider layers.
 *
 * Manages the marketplace mapping drawer state in EditProduct.
 * Replaces the 3 fetch-effects (existingLinks, integrations, items) + all handler state.
 * Extracted from EditProduct.tsx.
 *
 * NOTE: The openMapeamento drawer is currently not connected to any UI trigger
 * (setOpenMapeamento(true) is never called). This hook preserves that structural state
 * without fixing the dead-code issue — behavior-preserving refactor only.
 */

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  loadExistingLinks,
  loadActiveIntegrations,
  loadMarketplaceItems,
  upsertProductLink,
  deleteProductLink,
} from '@/services/productEdit.service';
import {
  getThumbFromPictures,
  buildVariationTitle,
  deriveSku,
  buildVariationLabel,
  dbMarketplaceNameByValue,
  valueByDbName,
} from '@/utils/products/marketplaceItemMapping';

export function useMarketplaceMappingDrawer(
  productId: string | undefined,
  organizationId: string | undefined
) {
  const { toast } = useToast();
  const [openMapeamento, setOpenMapeamento] = useState(false);
  const [selectedMarketplace, setSelectedMarketplace] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [existingLinks, setExistingLinks] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);
  const [unlinkingKey, setUnlinkingKey] = useState<string | null>(null);
  const [activeDbMarketplaceNames, setActiveDbMarketplaceNames] = useState<string[]>([]);

  const refreshExistingLinks = async () => {
    try {
      if (!productId || !organizationId) { setExistingLinks([]); return; }
      const links = await loadExistingLinks(productId, organizationId);
      setExistingLinks(links);
    } catch (e) {
      console.warn('Falha ao carregar vínculos existentes:', e);
      setExistingLinks([]);
    }
  };

  useEffect(() => { void refreshExistingLinks(); }, [organizationId, productId]);

  const fetchActiveIntegrations = async () => {
    try {
      if (!organizationId) return;
      const names = await loadActiveIntegrations(organizationId);
      setActiveDbMarketplaceNames(names);
      if (names.length > 0) {
        const defaultValue = valueByDbName[names[0]] || names[0];
        setSelectedMarketplace((prev) => prev || defaultValue);
      }
    } catch (e) {
      console.warn('Falha ao buscar integrações ativas:', e);
      setActiveDbMarketplaceNames([]);
    }
  };

  const fetchMarketplaceItems = async () => {
    try {
      if (!organizationId) return;
      setItemsLoading(true);
      const raw = await loadMarketplaceItems(organizationId, selectedMarketplace, searchTerm, dbMarketplaceNameByValue);
      const flattened: any[] = [];
      (raw as any[]).forEach((it) => {
        const vars = Array.isArray(it?.variations) ? it.variations : [];
        if (vars.length > 0) {
          vars.forEach((v: any) => {
            const vid = v?.id != null ? String(v.id) : (v?.variation_id != null ? String(v.variation_id) : (v?.sku != null ? String(v.sku) : ''));
            const thumb = getThumbFromPictures(v, it?.pictures);
            const sku = deriveSku(it, v);
            const vlabel = buildVariationLabel(v);
            flattened.push({
              marketplace_item_id: it.marketplace_item_id,
              marketplace_name: it.marketplace_name,
              company_id: it.company_id,
              variation_id: vid,
              title: buildVariationTitle(it.title, v),
              sku,
              variation_label: vlabel,
              thumbnail_url: thumb,
            });
          });
        } else {
          const thumb = getThumbFromPictures({}, it?.pictures);
          const sku = deriveSku(it, {});
          flattened.push({
            marketplace_item_id: it.marketplace_item_id,
            marketplace_name: it.marketplace_name,
            company_id: it.company_id,
            variation_id: '',
            title: it.title || `Anúncio ${it.marketplace_item_id}`,
            sku,
            variation_label: '',
            thumbnail_url: thumb,
          });
        }
      });
      setItems(flattened);
    } catch (e) {
      console.warn('Falha ao buscar itens do marketplace:', e);
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    if (openMapeamento && organizationId) {
      void fetchActiveIntegrations();
      void fetchMarketplaceItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMapeamento, selectedMarketplace, searchTerm, organizationId]);

  const handleLinkItem = async (item: any) => {
    if (!productId || !organizationId) {
      toast({ title: 'Contexto inválido', description: 'Organização não resolvida para vincular.', variant: 'destructive' });
      return;
    }
    try {
      const key = `${item.marketplace_item_id}::${item.variation_id || ''}`;
      setLinkingItemId(key);
      await upsertProductLink({
        organizations_id: organizationId,
        company_id: item.company_id,
        marketplace_name: item.marketplace_name,
        marketplace_item_id: item.marketplace_item_id,
        variation_id: item.variation_id || '',
        product_id: productId,
        permanent: true,
        updated_at: new Date().toISOString(),
      });
      toast({ title: 'Vínculo criado', description: 'Variação vinculada ao produto.' });
      await refreshExistingLinks();
      setOpenMapeamento(false);
    } catch (err: any) {
      toast({ title: 'Erro ao vincular', description: err?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLinkingItemId(null);
    }
  };

  const handleUnlink = async (link: any) => {
    if (!productId || !organizationId) return;
    const key = `${link.marketplace_item_id}::${link.variation_id || ''}`;
    try {
      setUnlinkingKey(key);
      await deleteProductLink({
        organizations_id: organizationId,
        product_id: productId,
        marketplace_name: link.marketplace_name,
        marketplace_item_id: link.marketplace_item_id,
        variation_id: link.variation_id || '',
      });
      toast({ title: 'Vínculo removido', description: 'Anúncio desvinculado do produto.' });
      await refreshExistingLinks();
    } catch (err: any) {
      toast({ title: 'Erro ao desvincular', description: err?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setUnlinkingKey(null);
    }
  };

  return {
    openMapeamento, setOpenMapeamento,
    selectedMarketplace, setSelectedMarketplace,
    searchTerm, setSearchTerm,
    existingLinks,
    itemsLoading,
    items,
    linkingItemId,
    unlinkingKey,
    activeDbMarketplaceNames,
    handleLinkItem,
    handleUnlink,
  };
}
