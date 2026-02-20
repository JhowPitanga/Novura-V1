import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, Check, X } from "lucide-react";
import { useBindableProducts } from '@/hooks/useProducts';
import { toast } from '@/components/ui/use-toast';
import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Product {
  id: string;
  name: string;
  sku: string;
  image_url?: string;
  image_urls?: string[];
  barcode?: string; // opcional
  available_stock?: number; // opcional
}

interface AnuncioParaVincular {
  id: string;
  nome: string;
  quantidade: number;
  marketplace: string;
  rowId?: string;
  produtoERPId?: string;
  sku?: string; // opcional: SKU do anúncio
  variacao?: string; // opcional: cor/variação
  image_url?: string; // opcional: miniatura
  marketplaceItemId?: string; // id do anúncio no marketplace (ex.: item.id no ML)
  variationId?: string; // id/label da variação (quando aplicável)
}

interface VincularPedidoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (vinculos: any) => void; // manter lógica existente
  pedidoId: string;
  anunciosParaVincular: AnuncioParaVincular[];
}

export function LinkOrderModal({ isOpen, onClose, onSave, pedidoId, anunciosParaVincular }: VincularPedidoModalProps) {
  const [isProductPickerOpen, setProductPickerOpen] = useState(false);
  const [didProductFetch, setDidProductFetch] = useState(false);
  const enabledProductsFetch = isProductPickerOpen && !didProductFetch;
  const { bindableProducts, loading, error } = useBindableProducts(enabledProductsFetch);
  const { organizationId: orgIdFromAuth } = useAuth();

  // Estado principal de vinculações por anúncio
  const [vinculacoes, setVinculacoes] = useState<{ [anuncioId: string]: string }>({});
  const [permanenteFlags, setPermanenteFlags] = useState<{ [anuncioId: string]: boolean }>({});
  const [storageIdState, setStorageIdState] = useState<string | null>(null);
  const [insufficientMap, setInsufficientMap] = useState<{ [anuncioId: string]: { available: number | null; required: number } }>({});

  // Estado do modal secundário (busca de produtos)
  const [anuncioEmSelecao, setAnuncioEmSelecao] = useState<string | null>(null);
  const [produtoSelecionadoNoPicker, setProdutoSelecionadoNoPicker] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filtragem para o modal secundário
  const filteredProducts: Product[] = bindableProducts.filter((produto: Product) => {
    const term = searchTerm.toLowerCase();
    const nameMatch = (produto.name || '').toLowerCase().includes(term);
    const skuMatch = (produto.sku ? produto.sku.toLowerCase() : '').includes(term);
    const barcodeMatch = produto.barcode ? produto.barcode.toLowerCase().includes(term) : false;
    return nameMatch || skuMatch || barcodeMatch;
  });

  // Abrir o modal secundário para um item específico
  const openProductPickerFor = (anuncioId: string) => {
    setAnuncioEmSelecao(anuncioId);
    setProdutoSelecionadoNoPicker(vinculacoes[anuncioId] ?? null);
    setProductPickerOpen(true);
  };

  // Seleção de produto por clique na linha da lista (modal secundário)
  const handleProductRowClick = (productId: string) => {
    setProdutoSelecionadoNoPicker(productId);
  };

  // Confirmar seleção no modal secundário
  const handleConfirmSelection = () => {
    if (!anuncioEmSelecao || !produtoSelecionadoNoPicker) {
      toast({
        title: 'Seleção incompleta',
        description: 'Escolha um produto para confirmar a vinculação.',
        variant: 'destructive',
      });
      return;
    }
    setVinculacoes(prev => ({ ...prev, [anuncioEmSelecao]: produtoSelecionadoNoPicker }));
    setProductPickerOpen(false);
    setAnuncioEmSelecao(null);
    setProdutoSelecionadoNoPicker(null);
    toast({
      title: 'Produto vinculado',
      description: 'O produto ERP foi selecionado para o anúncio do pedido.',
      variant: 'default',
    });
  };

  const handleRemoveVinculo = (anuncioId: string) => {
    setVinculacoes(prev => {
      const next = { ...prev };
      delete next[anuncioId];
      return next;
    });
    setPermanenteFlags(prev => ({ ...prev, [anuncioId]: false }));
  };

  const handleSave = async () => {
    // Montar itens vinculados com flags de permanente e quantidade para reserva
    const linkedItems = anunciosParaVincular
      .map((anuncio) => {
        const productId = vinculacoes[anuncio.id];
        if (!productId) return null;
        return {
          anuncioId: anuncio.id,
          productId,
          quantity: anuncio.quantidade,
          permanent: !!permanenteFlags[anuncio.id],
          marketplace: anuncio.marketplace,
          adSku: anuncio.sku || null,
          marketplaceItemId: anuncio.marketplaceItemId || null,
          variationId: anuncio.variationId ?? '',
        };
      })
      .filter(Boolean) as Array<{
        anuncioId: string;
        productId: string;
        quantity: number;
        permanent: boolean;
        marketplace: string;
        adSku: string | null;
        marketplaceItemId: string | null;
        variationId: string;
      }>;

    if (linkedItems.length === 0) {
      toast({
        title: 'Seleção incompleta',
        description: 'Escolha ao menos um produto para confirmar a vinculação.',
        variant: 'destructive',
      });
      return;
    }

    // Antes de reservar estoque, persistir vínculos permanentes (se houver)
    const persistErrors: string[] = [];
    try {
      // Obter organização atual
      const organizationId: string | null = orgIdFromAuth ? String(orgIdFromAuth) : null;

      // Obter company_id do pedido via view presented (por id ou marketplace_order_id)
      let companyId: string | null = null;
      if (pedidoId) {
        try {
          // 1) Tenta por marketplace_order_id
          const q = (supabase as any)
            .from('marketplace_orders_presented')
            .select('id, company_id, marketplace_order_id')
            .eq('marketplace_order_id', pedidoId)
            .maybeSingle();
          const { data: ord1, error: err1 } = await q;
          if (!err1 && ord1?.company_id) {
            companyId = String(ord1.company_id);
          }
          // 2) Fallback: tenta por id
          if (!companyId) {
            const { data: ord2, error: err2 } = await (supabase as any)
              .from('marketplace_orders_presented')
              .select('id, company_id')
              .eq('id', pedidoId)
              .maybeSingle();
            if (!err2 && ord2?.company_id) {
              companyId = String(ord2.company_id);
            }
          }
        } catch (e) {
          // silencioso, tratar abaixo
        }
      }

      // Montar linhas a persistir: apenas itens marcados como permanentes e com marketplaceItemId disponível
      const rowsToPersist = linkedItems
        .filter(li => li.permanent && !!li.marketplaceItemId)
        .map(li => ({
          organizations_id: organizationId,
          company_id: companyId,
          marketplace_name: li.marketplace,
          marketplace_item_id: li.marketplaceItemId as string,
          variation_id: li.variationId || '',
          product_id: li.productId,
          permanent: li.permanent,
          updated_at: new Date().toISOString(),
        }));

      if (rowsToPersist.length > 0) {
        // Validar contexto necessário
        const missingContext = rowsToPersist.some(r => !r.organizations_id || !r.company_id);
        if (missingContext) {
          persistErrors.push('Contexto de organização/empresa não resolvido para persistência de vínculo.');
        } else {
          const { error: upsertErr } = await (supabase as any)
            .from('marketplace_item_product_links')
            .upsert(rowsToPersist, { onConflict: 'organizations_id,marketplace_name,marketplace_item_id,variation_id' });
          if (upsertErr) {
            persistErrors.push(upsertErr.message);
          }
        }
      }
    } catch (e: any) {
      persistErrors.push(e?.message || 'Erro inesperado ao persistir vínculos.');
    }

    let resolvedOrgIdForStorage: string | null = null;
    if (!resolvedOrgIdForStorage) {
      try {
        const { data: orgResX } = await supabase.rpc('get_current_user_organization_id');
        const orgIdX = Array.isArray(orgResX) ? orgResX?.[0] : orgResX;
        if (orgIdX) resolvedOrgIdForStorage = String(orgIdX);
      } catch {}
    }

    let storageId: string | null = null;
    try {
      const { data: authUserData } = await supabase.auth.getUser();
      const uid = authUserData?.user?.id;
      if (uid && resolvedOrgIdForStorage) {
        const { data: userOrgSettings } = await supabase
          .from('user_organization_settings')
          .select('default_storage_id')
          .eq('organization_id', resolvedOrgIdForStorage)
          .eq('user_id', uid)
          .maybeSingle();
        storageId = (userOrgSettings as any)?.default_storage_id ?? null;
      }
    } catch {}

    if (!storageId && typeof window !== 'undefined') {
      try { storageId = localStorage.getItem('defaultStorageId') || null; } catch {}
    }

    if (!storageId) {
      try {
        let q: any = supabase
          .from('storage')
          .select('id')
          .eq('active', true)
          .order('created_at', { ascending: true })
          .limit(1);
        if (resolvedOrgIdForStorage) q = (q as any).eq('organizations_id', resolvedOrgIdForStorage);
        const { data } = await q;
        if (data && data.length > 0) storageId = String(data[0].id);
      } catch {}
    }

    if (!storageId) {
      toast({
        title: 'Armazém padrão não encontrado',
        description: 'Defina o armazém padrão em Estoque para permitir reservas automáticas.',
        variant: 'destructive',
      });
      return;
    }

    // Montar payload novo para salvar (inclui flags permanentes e dados de reserva)
    const payload = {
      linkedItems,
      storageId,
      pedidoId,
    };

    try {
      const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY, 'x-request-id': crypto.randomUUID() };
      let presentedNewId: string | null = null;
      let marketplaceName: string | null = null;
      let marketplaceOrderIdStr: string | null = null;
      {
        const { data: pres1 } = await (supabase as any)
          .from('marketplace_orders_presented_new')
          .select('id, marketplace, marketplace_order_id')
          .eq('id', pedidoId)
          .maybeSingle();
        if (pres1?.id) {
          presentedNewId = String(pres1.id);
          marketplaceName = String(pres1.marketplace || '');
          marketplaceOrderIdStr = String(pres1.marketplace_order_id || '');
        } else {
          const { data: pres2 } = await (supabase as any)
            .from('marketplace_orders_presented_new')
            .select('id, marketplace, marketplace_order_id')
            .eq('marketplace_order_id', pedidoId)
            .maybeSingle();
          if (pres2?.id) {
            presentedNewId = String(pres2.id);
            marketplaceName = String(pres2.marketplace || '');
            marketplaceOrderIdStr = String(pres2.marketplace_order_id || '');
          }
        }
      }

      const ops = linkedItems.map((li) => {
        const ref = anunciosParaVincular.find((a) => a.id === li.anuncioId);
        return (async () => {
          let updErrMsg: string | null = null;
          if (ref?.rowId) {
            const upd = await (supabase as any)
              .from('marketplace_order_items')
              .update({ linked_products: li.productId, has_unlinked_items: false })
              .eq('row_id', ref.rowId)
              .select('row_id, id, linked_products, has_unlinked_items')
              .maybeSingle();
            if (upd.error) updErrMsg = String(upd.error.message || 'Falha ao atualizar item por row_id');
          } else if (li.variationId && presentedNewId) {
            const upd = await (supabase as any)
              .from('marketplace_order_items')
              .update({ linked_products: li.productId, has_unlinked_items: false })
              .eq('id', presentedNewId)
              .eq('model_id_externo', li.variationId)
              .select('row_id, id, linked_products, has_unlinked_items')
              .maybeSingle();
            if (upd.error) updErrMsg = String(upd.error.message || 'Falha ao atualizar item por variation_id');
          } else {
            updErrMsg = 'Item sem referência para atualização';
          }
          if (updErrMsg) {
            toast({
              title: 'Falha na vinculação',
              description: updErrMsg,
              variant: 'destructive',
            });
            await (supabase as any)
              .from('marketplace_orders_presented_new')
              .update({ has_unlinked_items: true })
              .or(`id.eq.${presentedNewId || pedidoId},marketplace_order_id.eq.${pedidoId}`);
          }
        })();
      }).filter(Boolean) as Promise<any>[];
      if (ops.length > 0) {
        await Promise.all(ops);
      }

      if (presentedNewId) {
        const { data: aggRows } = await (supabase as any)
          .from('marketplace_order_items')
          .select('linked_products, has_unlinked_items')
          .eq('id', presentedNewId);
        const orderHasUnlinked = Array.isArray(aggRows)
          ? aggRows.some((r: any) => (r?.has_unlinked_items === true) || !String(r?.linked_products || '').trim())
          : false;
        await (supabase as any)
          .from('marketplace_orders_presented_new')
          .update({ has_unlinked_items: orderHasUnlinked })
          .eq('id', presentedNewId);
      }

      if (presentedNewId) {
        const itemsForRpc = linkedItems.map((li) => ({
          product_id: li.productId,
          quantity: li.quantity,
          marketplace_item_id: li.marketplaceItemId || null,
          variation_id: li.variationId || '',
          permanent: !!li.permanent,
        }));
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(storageId)) {
          toast({
            title: 'Armazém inválido',
            description: 'O armazém padrão não está configurado corretamente.',
            variant: 'destructive',
          });
          return;
        }
        const { data: reservationResult, error: reservationError } = await (supabase as any).rpc('fn_order_reserva_stock_linked', {
          p_order_id: presentedNewId,
          p_items: itemsForRpc,
          p_storage_id: storageId,
        });
        if (reservationError || (reservationResult && (reservationResult as any)?.ok === false)) {
          const rawMsg = reservationError?.message || ((reservationResult as any)?.error) || 'Falha na reserva de estoque';
          const msg = String(rawMsg || '').startsWith('RESERVA_FALHA_')
            ? `Sem estoque para ${String(rawMsg).replace('RESERVA_FALHA_', '')} item(ns)`
            : [
                rawMsg,
                reservationError?.code ? `Código: ${reservationError.code}` : null,
                reservationError?.details ? `Detalhes: ${reservationError.details}` : null,
                reservationError?.hint ? `Dica: ${reservationError.hint}` : null,
              ].filter(Boolean).join(' | ');
          toast({
            title: 'Falha na reserva',
            description: msg,
            variant: 'destructive',
          });
          return;
        }
      }

      if (marketplaceName && marketplaceOrderIdStr) {
        const fnName = marketplaceName.toLowerCase().includes('mercado')
          ? 'mercado-livre-process-presented'
          : (marketplaceName.toLowerCase().includes('shopee') ? 'shopee-process-presented' : null);
        if (fnName) {
          const body =
            fnName === 'mercado-livre-process-presented'
              ? { order_id: marketplaceOrderIdStr, status_only: true }
              : { order_sn: marketplaceOrderIdStr, status_only: true };
          await (supabase as any).functions.invoke(fnName, { body, headers } as any);
        }
      }
    } catch {}

    onSave(payload);
    onClose();

    // Feedback consolidando possíveis erros de persistência e de reserva
    const anyErrors = (persistErrors.length > 0);
    const details = [
      ...(persistErrors.length > 0 ? [
        `Persistência de vínculos: ${persistErrors.join('; ')}`,
      ] : []),
    ].join(' | ');

    toast({
      title: anyErrors ? 'Vinculação concluída com avisos' : 'Vinculação salva!',
      description: anyErrors ? (details || 'Ocorreram avisos na operação.') : 'Os anúncios foram vinculados corretamente.',
      variant: 'default',
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      let sid: string | null = null;
      try {
        const { data: authUserData } = await supabase.auth.getUser();
        const uid = authUserData?.user?.id;
        if (uid && orgIdFromAuth) {
          const { data: userOrgSettings } = await supabase
            .from('user_organization_settings')
            .select('default_storage_id')
            .eq('organization_id', orgIdFromAuth)
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
          if (orgIdFromAuth) q = (q as any).eq('organizations_id', orgIdFromAuth);
          const { data } = await q;
          if (data && data.length > 0) sid = String(data[0].id);
        } catch {}
      }
      setStorageIdState(sid);
    })();
  }, [isOpen, orgIdFromAuth]);

  useEffect(() => {
    if (!isOpen) return;
    const vincIds = Object.keys(vinculacoes);
    if (vincIds.length === 0 || !storageIdState) {
      setInsufficientMap({});
      return;
    }
    const productIds = vincIds.map((aid) => vinculacoes[aid]).filter(Boolean);
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('products_stock')
          .select('product_id,current,reserved')
          .eq('storage_id', storageIdState)
          .in('product_id', productIds);
        const stockMap: Record<string, number | null> = {};
        const rows: any[] = Array.isArray(data) ? data : [];
        rows.forEach((r: any) => {
          const pid = String(r.product_id);
          const available = Number(r.current || 0) - Number(r.reserved || 0);
          stockMap[pid] = available;
        });
        const next: { [anuncioId: string]: { available: number | null; required: number } } = {};
        anunciosParaVincular.forEach((anuncio) => {
          const pid = vinculacoes[anuncio.id];
          if (!pid) return;
          const available = stockMap.hasOwnProperty(pid) ? (stockMap[pid] as number) : null;
          next[anuncio.id] = { available, required: anuncio.quantidade };
        });
        setInsufficientMap(next);
      } catch {
        const next: { [anuncioId: string]: { available: number | null; required: number } } = {};
        anunciosParaVincular.forEach((anuncio) => {
          const pid = vinculacoes[anuncio.id];
          if (!pid) return;
          next[anuncio.id] = { available: null, required: anuncio.quantidade };
        });
        setInsufficientMap(next);
      }
    })();
  }, [isOpen, storageIdState, vinculacoes, anunciosParaVincular]);

  useEffect(() => {
    if (isProductPickerOpen && !didProductFetch && !loading && Array.isArray(bindableProducts) && bindableProducts.length > 0) {
      setDidProductFetch(true);
    }
  }, [isProductPickerOpen, didProductFetch, loading, bindableProducts]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="fixed left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] sm:max-w-5xl p-0 max-h-[80vh] overflow-hidden">
          {/* Botão de fechar (X) posicionado acima e afastado do quadro de vincular */}
          
          <DialogHeader>
            <DialogTitle>Vincular produtos ao pedido</DialogTitle>
            <DialogDescription>Vincule todos os itens e confirme apenas com estoque suficiente no armazém selecionado.</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-6 max-h-[58vh] overflow-y-auto">
            {anunciosParaVincular.map((anuncio) => {
              const produtoVinculado = vinculacoes[anuncio.id] ? bindableProducts.find((p: Product) => p.id === vinculacoes[anuncio.id]) : null;
              return (
                <div key={anuncio.id} className="flex flex-col md:flex-row items-stretch gap-6">
                  {/* Quadro 1: Detalhes do anúncio (esquerda) */}
                  <div className="flex-1 rounded-xl border border-primary p-4 bg-white shadow-md min-h-40">
                    <div className="flex items-center gap-4">
                      <img src={(anuncio.image_url ?? "/placeholder.svg")} alt={anuncio.nome} className="w-12 h-12 object-cover rounded-md" />
                      <div className="flex-1">
                        <div className="font-semibold text-sm md:text-base">{anuncio.nome}</div>
                        <div className="text-xs text-gray-500">{anuncio.variacao ? anuncio.variacao : '—'}</div>
                      </div>
                      <div className="text-primary font-bold text-sm md:text-base">QTD: {anuncio.quantidade}</div>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">SKU: {anuncio.sku || '—'}</div>
                    <div className="mt-1 text-[10px] text-gray-500">Marketplace: {anuncio.marketplace}</div>
                  </div>

                  {/* Indicador entre quadros */}
                  <div className="flex items-center justify-center w-24 md:w-32">
                    <div className="flex-1 h-px bg-primary/40"></div>
                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md mx-2">
                      <Check className="w-4 h-4" />
                    </div>
                    <div className="flex-1 h-px bg-primary/40"></div>
                  </div>

                  {/* Quadro 2: Estado inicial ou vinculado (direita) */}
                  <div className="flex-1 rounded-xl border border-primary p-4 bg-white shadow-md min-h-28">
                    {!produtoVinculado ? (
                      <div className="h-full flex items-center justify-center">
                        <Button className="bg-primary text-white" onClick={() => openProductPickerFor(anuncio.id)}>
                          Vincular produto
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-4">
                          <img src={(produtoVinculado.image_url ?? produtoVinculado.image_urls?.[0] ?? "/placeholder.svg")} alt={produtoVinculado.name} className="w-12 h-12 object-cover rounded-md" />
                          <div className="flex-1">
                            <div className="font-semibold text-sm md:text-base">{produtoVinculado.name}</div>
                            <div className="text-xs text-gray-500">{produtoVinculado.barcode ? `Código de Barras: ${produtoVinculado.barcode}` : '—'}</div>
                          </div>
                          <div className="text-primary font-bold text-sm md:text-base">DEDUZIR: {anuncio.quantidade}</div>
                        </div>
                        <div className="text-xs text-gray-600">SKU: {produtoVinculado.sku}</div>
                        {(() => {
                          const info = insufficientMap[anuncio.id];
                          const lack = info && info.available !== null && info.available < info.required;
                          const unknown = info && info.available === null;
                          return (
                            <div className={`text-xs ${lack || unknown ? 'text-red-600' : 'text-green-600'}`}>
                              {lack ? `Sem estoque no armazém selecionado: disponível ${info?.available ?? 0}, solicitado ${info?.required}` :
                               unknown ? 'O produto selecionado não possui estoque, adicione e tente novamente' :
                               `Estoque suficiente: disponível ${info?.available ?? 0}, solicitado ${info?.required}`}
                            </div>
                          );
                        })()}

                        <div className="inline-flex items-center gap-2 text-xs">
                          <Checkbox
                            id={`permanente-${anuncio.id}`}
                            checked={!!permanenteFlags[anuncio.id]}
                            onCheckedChange={(v) =>
                              setPermanenteFlags(prev => ({ ...prev, [anuncio.id]: Boolean(v) }))
                            }
                          />
                          <Label htmlFor={`permanente-${anuncio.id}`} className="text-xs">
                            Vincular permanente
                          </Label>
                        </div>

                        <div className="flex gap-2">
                          <Button variant="outline" className="text-xs" onClick={() => openProductPickerFor(anuncio.id)}>Alterar Produto</Button>
                          <Button variant="ghost" className="text-xs text-red-600" onClick={() => handleRemoveVinculo(anuncio.id)}>Desvincular</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {anunciosParaVincular.length === 0 && (
              <div className="text-sm text-gray-600">Nenhum item de anúncio para vincular.</div>
            )}
          </div>

          <DialogFooter className="bg-gray-100 p-4 border-t flex justify-end">
            <Button
              onClick={handleSave}
              disabled={
                Object.keys(vinculacoes).length === 0 ||
                (anunciosParaVincular.length > 0 && (Object.keys(vinculacoes).length < anunciosParaVincular.length || anunciosParaVincular.some(a => !vinculacoes[a.id]))) ||
                Object.values(insufficientMap).some((v) => (v.available === null) || (v.available < v.required))
              }
            >
              <Check className="h-4 w-4 mr-2" />
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Secundário: Busca de Produtos */}
      <Dialog open={isProductPickerOpen} onOpenChange={(open) => {
        if (!open) {
          setProductPickerOpen(false);
          setAnuncioEmSelecao(null);
          setProdutoSelecionadoNoPicker(null);
        }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Buscar produtos do ERP</DialogTitle>
            <DialogDescription>Pesquise por Nome, SKU ou Código de Barras e confirme a seleção.</DialogDescription>
          </DialogHeader>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por nome, SKU ou código de barras"
              className="h-10 w-full pl-10 pr-4 rounded-lg border"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto pr-2">
            {loading && (
              <div className="text-center text-gray-500">Carregando produtos...</div>
            )}
            {error && (
              <div className="text-center text-red-500">Erro ao carregar produtos.</div>
            )}
            {!loading && !error && (
              <ul className="space-y-2">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((produto) => {
                    const selected = produtoSelecionadoNoPicker === produto.id;
                    return (
                      <li
                        key={produto.id}
                        className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${selected ? 'bg-primary/10 border-primary' : 'hover:bg-gray-50'}`}
                        onClick={() => handleProductRowClick(produto.id)}
                      >
                        <div className="flex items-center space-x-3">
                          <img src={(produto.image_url ?? produto.image_urls?.[0] ?? "/placeholder.svg")} alt={produto.name} className="w-10 h-10 object-cover rounded-md" />
                          <div>
                            <div className="font-medium text-sm">{produto.name}</div>
                            <div className="text-xs text-gray-500">SKU: {produto.sku}{produto.available_stock !== undefined ? ` • Estoque: ${produto.available_stock}` : ''}</div>
                          </div>
                        </div>
                        {selected && <Check className="w-4 h-4 text-primary" />}
                      </li>
                    );
                  })
                ) : (
                  <p className="text-center text-gray-500">Nenhum produto encontrado.</p>
                )}
              </ul>
            )}
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setProductPickerOpen(false)}>Cancelar</Button>
            <Button className="bg-primary text-white" onClick={handleConfirmSelection} disabled={!produtoSelecionadoNoPicker || !anuncioEmSelecao}>
              Confirmar seleção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
