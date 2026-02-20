import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { GlobalHeader } from "@/components/GlobalHeader";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";

import {
    useConnectedMarketplaces,
    useListingItems,
    useListingDrafts,
    useListingMutations,
    filterListings,
    sortListings,
} from "@/hooks/useListings";
import type { SortKey, SortDir, ListingItem } from "@/types/listings";

import { StockEditModal, type StockVariation } from "@/components/listings/StockEditModal";
import { DeleteListingDialog } from "@/components/listings/DeleteListingDialog";
import { DraftsList } from "@/components/listings/DraftsList";
import { ListingsToolbar } from "@/components/listings/ListingsToolbar";
import { ListingSelectionBar } from "@/components/listings/ListingSelectionBar";
import { ListingCard } from "@/components/listings/ListingCard";

export default function Anuncios() {
    const { organizationId } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    // URL-driven state
    const [activeStatus, setActiveStatus] = useState<string>("todos");
    const [selectedMarketplacePath, setSelectedMarketplacePath] = useState<string>("");

    // UI state
    const [searchTerm, setSearchTerm] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>('sales');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [activeTab, setActiveTab] = useState<string>("anuncios");
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [expandedVariations, setExpandedVariations] = useState<Set<string>>(new Set());
    const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
    const [stockModal, setStockModal] = useState<{ itemId: string; variations: StockVariation[] } | null>(null);
    const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
    const [bulkDeleteDraftsOpen, setBulkDeleteDraftsOpen] = useState(false);
    const [confirmPauseFor, setConfirmPauseFor] = useState<string | null>(null);

    // Sync active status from URL
    useEffect(() => {
        const m = String(location.pathname).match(/^\/anuncios\/(ativos|inativos|rascunhos)/);
        if (m?.[1]) setActiveStatus(m[1]);
    }, [location.pathname]);

    // Data
    const { data: marketplacesData } = useConnectedMarketplaces(organizationId);
    const navItems = marketplacesData?.navItems || [];
    const shippingCaps = marketplacesData?.shippingCaps || null;
    const hasIntegration = marketplacesData?.hasIntegration || false;

    useEffect(() => {
        if (navItems.length > 0 && !selectedMarketplacePath) {
            setSelectedMarketplacePath(navItems[0].path);
        }
    }, [navItems, selectedMarketplacePath]);

    const selectedDisplayName = navItems.find(n => n.path === selectedMarketplacePath)?.displayName || '';
    const isShopee = selectedDisplayName.toLowerCase() === 'shopee';

    const { parsedItems, rawItems, setRawItems, listingTypeByItemId, isLoading, refetch } = useListingItems({
        orgId: organizationId,
        selectedDisplayName,
        selectedPath: selectedMarketplacePath,
        shippingCaps,
    });

    const { data: draftsData } = useListingDrafts(organizationId, activeStatus);
    const drafts = draftsData || [];

    const mutations = useListingMutations(organizationId);
    const syncing = mutations.syncAll.isPending || mutations.syncSelected.isPending;

    // Filtering + sorting
    const filteredAds = filterListings(parsedItems, activeStatus, isShopee, selectedDisplayName, searchTerm);
    const sortedAds = sortListings(filteredAds, sortKey, sortDir);
    const isAllSelected = sortedAds.length > 0 && sortedAds.every(a => selectedItems.has(a.id));
    const isAllDraftsSelected = drafts.length > 0 && drafts.every((d: any) => selectedDraftIds.has(String(d.id)));

    // ─── Handlers ────────────────────────────────────────────────────────────

    const handleSync = async () => {
        if (!organizationId) { toast({ title: "Sessão necessária", variant: "destructive" }); return; }
        try {
            await mutations.syncAll.mutateAsync({ marketplaceDisplay: selectedDisplayName });
            toast({ title: "Sincronização concluída", description: "Itens, qualidade e reviews atualizados com sucesso!" });
            refetch();
        } catch (e: any) {
            toast({ title: "Falha na sincronização", description: e?.message || "Erro inesperado", variant: "destructive" });
        }
    };

    const handleSyncSelected = async () => {
        if (!organizationId) { toast({ title: "Sessão necessária", variant: "destructive" }); return; }
        if (selectedItems.size === 0) { toast({ title: "Nenhum anúncio selecionado" }); return; }
        try {
            await mutations.syncSelected.mutateAsync({ marketplaceDisplay: selectedDisplayName, itemIds: Array.from(selectedItems) });
            toast({ title: "Sincronização concluída", description: `Selecionados sincronizados: ${selectedItems.size}` });
            refetch();
        } catch (e: any) {
            toast({ title: "Falha na sincronização", description: e?.message || "Erro inesperado", variant: "destructive" });
        }
    };

    const handleToggleStatus = async (ad: ListingItem, makeActive: boolean) => {
        const targetStatus = makeActive ? 'active' : 'paused';
        setRawItems(prev => prev.map(r => {
            const mlId = r?.marketplace_item_id || r?.id;
            return String(mlId) === String(ad.marketplaceId) ? { ...r, status: targetStatus } : r;
        }));
        try {
            await mutations.toggleStatus.mutateAsync({ itemId: ad.marketplaceId, targetStatus });
            toast({ title: makeActive ? 'Anúncio ativado' : 'Anúncio pausado' });
        } catch (e: any) {
            setRawItems(prev => prev.map(r => {
                const mlId = r?.marketplace_item_id || r?.id;
                return String(mlId) === String(ad.marketplaceId) ? { ...r, status: makeActive ? 'paused' : 'active' } : r;
            }));
            toast({ title: 'Falha ao atualizar status', description: e?.message || '', variant: 'destructive' });
        }
    };

    const handleDeleteItem = async () => {
        if (!confirmDeleteItemId) return;
        const ad = sortedAds.find(a => a.id === confirmDeleteItemId);
        if (!ad) return;
        await mutations.deleteItem.mutateAsync({ marketplaceItemId: ad.marketplaceId });
        toast({ title: 'Anúncio excluído', description: 'Removido do banco de dados.' });
    };

    const handleDeleteDraft = async (draftId: string) => {
        try {
            await mutations.deleteDraftMut.mutateAsync({ draftId });
            toast({ title: 'Rascunho excluído' });
        } catch (e: any) {
            toast({ title: 'Falha ao excluir rascunho', description: e?.message || String(e), variant: 'destructive' });
        }
    };

    const handleDeleteSelectedDrafts = async () => {
        try {
            await mutations.deleteDraftsMut.mutateAsync({ draftIds: Array.from(selectedDraftIds) });
            setSelectedDraftIds(new Set());
            toast({ title: 'Rascunhos excluídos' });
        } catch (e: any) {
            toast({ title: 'Falha ao excluir rascunhos', description: e?.message || String(e), variant: 'destructive' });
        }
    };

    const handleDuplicate = async (ad: ListingItem) => {
        const itemRow = rawItems.find(r => String(r?.marketplace_item_id || r?.id) === String(ad.id));
        if (!itemRow || !organizationId) return;
        const lt = listingTypeByItemId[String(ad.id)] || null;
        try {
            const draftId = await mutations.createDraftMut.mutateAsync({ itemRow, listingTypeId: lt });
            toast({ title: 'Rascunho criado', description: 'Você pode editar o rascunho agora.' });
            navigate(`/anuncios/criar/?draft_id=${draftId}&step=6`);
        } catch (e: any) {
            toast({ title: 'Erro ao duplicar', description: e?.message || String(e), variant: 'destructive' });
        }
    };

    const handleStockSuccess = (itemId: string, updates: Array<{ model_id: number; seller_stock: number }>) => {
        setRawItems(prev => prev.map(r => {
            const rid = String(r?.marketplace_item_id || r?.id);
            if (rid !== itemId) return r;
            const vars = Array.isArray(r?.variations) ? r.variations : [];
            return {
                ...r,
                variations: vars.map((vv: any) => {
                    const mid = String(vv?.model_id || vv?.id);
                    const upd = updates.find(u => String(u.model_id) === mid);
                    if (!upd) return vv;
                    const ns = Number(upd.seller_stock);
                    const sinfo = typeof vv?.stock_info_v2 === 'object' && vv.stock_info_v2 ? { ...vv.stock_info_v2 } : null;
                    if (sinfo) {
                        const list = Array.isArray(sinfo.seller_stock) ? [...sinfo.seller_stock] : [];
                        if (list.length > 0) {
                            list[0] = { ...list[0], stock: ns, location_id: list[0].location_id || "BRZ" };
                        } else {
                            list.push({ stock: ns, if_saleable: true, location_id: "BRZ" });
                        }
                        sinfo.seller_stock = list;
                        sinfo.summary_info = { ...(sinfo.summary_info || {}), total_available_stock: ns };
                    }
                    return { ...vv, seller_stock: ns, available_quantity: ns, stock_info_v2: sinfo || vv.stock_info_v2 };
                }),
            };
        }));
    };

    const toggleSelectAll = () => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            const visibleIds = sortedAds.map(a => a.id);
            const allSelected = visibleIds.every(id => newSet.has(id));
            visibleIds.forEach(id => allSelected ? newSet.delete(id) : newSet.add(id));
            return newSet;
        });
    };

    const toggleSelectAllDrafts = () => {
        setSelectedDraftIds(prev => {
            const newSet = new Set(prev);
            const all = drafts.every((d: any) => newSet.has(String(d.id)));
            drafts.forEach((d: any) => all ? newSet.delete(String(d.id)) : newSet.add(String(d.id)));
            return newSet;
        });
    };

    const statusItems = isShopee
        ? [
            { title: 'Todos', path: '/anuncios/todos' },
            { title: 'Ativos', path: '/anuncios/ativos' },
            { title: 'Rascunhos', path: '/anuncios/rascunhos' },
          ]
        : [
            { title: 'Todos', path: '/anuncios/todos' },
            { title: 'Ativos', path: '/anuncios/ativos' },
            { title: 'Inativos', path: '/anuncios/inativos' },
            { title: 'Rascunhos', path: '/anuncios/rascunhos' },
          ];

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-white">
                <AppSidebar />
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />
                    <CleanNavigation
                        items={navItems}
                        basePath="/anuncios"
                        activePath={selectedMarketplacePath}
                        onNavigate={(path) => { setSelectedMarketplacePath(path); navigate('/anuncios' + path); }}
                    />

                    <main className="flex-1 overflow-auto">
                        <div className="px-6 pt-3 pb-6">
                            {hasIntegration ? (
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="border-b border-gray-200 w-full">
                                            <TabsList className="bg-transparent p-0 h-auto">
                                                <TabsTrigger
                                                    value="anuncios"
                                                    className="px-6 py-4 border-b-2 border-transparent data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary hover:text-novura-primary rounded-none bg-transparent"
                                                >
                                                    Anúncios
                                                </TabsTrigger>
                                                <TabsTrigger
                                                    value="promocoes"
                                                    className="px-6 py-4 border-b-2 border-transparent data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary hover:text-novura-primary rounded-none bg-transparent"
                                                >
                                                    Promoções
                                                </TabsTrigger>
                                            </TabsList>
                                        </div>
                                    </div>

                                    <TabsContent value="anuncios" className="mt-0">
                                        {/* Modals */}
                                        <StockEditModal
                                            open={!!stockModal}
                                            onOpenChange={(open) => { if (!open) setStockModal(null); }}
                                            itemId={stockModal?.itemId || null}
                                            orgId={organizationId}
                                            variations={stockModal?.variations || []}
                                            onSuccess={handleStockSuccess}
                                        />
                                        <DeleteListingDialog
                                            itemId={confirmDeleteItemId}
                                            onClose={() => setConfirmDeleteItemId(null)}
                                            onConfirm={handleDeleteItem}
                                        />
                                        {bulkDeleteDraftsOpen && (
                                            <Dialog open={bulkDeleteDraftsOpen} onOpenChange={setBulkDeleteDraftsOpen}>
                                                <DialogContent className="max-w-md">
                                                    <DialogHeader>
                                                        <DialogTitle>Excluir rascunhos selecionados?</DialogTitle>
                                                        <DialogDescription>
                                                            {selectedDraftIds.size} selecionado(s). Esta ação remove definitivamente do banco de dados.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="flex justify-end gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => setBulkDeleteDraftsOpen(false)}>Cancelar</Button>
                                                        <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={async () => { await handleDeleteSelectedDrafts(); setBulkDeleteDraftsOpen(false); }}>Excluir</Button>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        )}

                                        <ListingsToolbar
                                            searchTerm={searchTerm}
                                            onSearchChange={setSearchTerm}
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}
                                            syncing={syncing}
                                            selectedCount={selectedItems.size}
                                            onSyncAll={handleSync}
                                            onSyncSelected={handleSyncSelected}
                                            onCreateListing={() => navigate('/anuncios/criar/')}
                                        />

                                        <div className="mt-4">
                                            <CleanNavigation
                                                items={statusItems}
                                                basePath=""
                                                activePath={`/anuncios/${activeStatus}`}
                                                onNavigate={(path) => {
                                                    const seg = path.split('/').pop() || 'todos';
                                                    setActiveStatus(seg);
                                                    navigate(path);
                                                }}
                                            />
                                        </div>

                                        <div className="mt-2 px-2 flex items-center justify-between">
                                            <ListingSelectionBar
                                                activeStatus={activeStatus}
                                                isAllSelected={isAllSelected}
                                                onToggleSelectAll={toggleSelectAll}
                                                selectedCount={selectedItems.size}
                                                isAllDraftsSelected={isAllDraftsSelected}
                                                onToggleSelectAllDrafts={toggleSelectAllDrafts}
                                                selectedDraftsCount={selectedDraftIds.size}
                                                onBulkDeleteDrafts={() => setBulkDeleteDraftsOpen(true)}
                                            />
                                        </div>

                                        <Card className="mt-2 border border-gray-200 shadow-sm">
                                            <CardContent className="p-0">
                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-12 gap-x-2 items-center px-3 py-2 border-b border-gray-200">
                                                        <div className="col-span-1"></div>
                                                        <div className="col-span-3 text-xs font-medium text-gray-600">Produto(S)</div>
                                                        <div className="col-span-2 text-xs font-medium text-gray-600">Preço</div>
                                                        <div className="col-span-2 text-xs font-medium text-gray-600">Dados</div>
                                                        <div className="col-span-2 text-xs font-medium text-gray-600">Desempenho</div>
                                                        <div className="col-span-2 text-xs font-medium text-gray-600 text-right">Ações</div>
                                                    </div>

                                                    {activeStatus === 'rascunhos' ? (
                                                        <DraftsList
                                                            drafts={drafts}
                                                            selectedDraftIds={selectedDraftIds}
                                                            onToggleSelect={(id) => setSelectedDraftIds(prev => {
                                                                const s = new Set(prev);
                                                                s.has(id) ? s.delete(id) : s.add(id);
                                                                return s;
                                                            })}
                                                            onDeleteDraft={handleDeleteDraft}
                                                        />
                                                    ) : sortedAds.length > 0 ? (
                                                        sortedAds.map((ad) => {
                                                            const itemRow = rawItems.find(r => String(r?.marketplace_item_id || r?.id) === String(ad.id));
                                                            return (
                                                                <ListingCard
                                                                    key={ad.id}
                                                                    ad={ad}
                                                                    itemRow={itemRow}
                                                                    isShopee={isShopee}
                                                                    isSelected={selectedItems.has(ad.id)}
                                                                    isExpanded={expandedVariations.has(ad.id)}
                                                                    confirmPauseFor={confirmPauseFor}
                                                                    onToggleSelect={() => setSelectedItems(prev => {
                                                                        const s = new Set(prev);
                                                                        s.has(ad.id) ? s.delete(ad.id) : s.add(ad.id);
                                                                        return s;
                                                                    })}
                                                                    onToggleExpansion={() => setExpandedVariations(prev => {
                                                                        const s = new Set(prev);
                                                                        s.has(ad.id) ? s.delete(ad.id) : s.add(ad.id);
                                                                        return s;
                                                                    })}
                                                                    onToggleStatus={handleToggleStatus}
                                                                    onOpenStockEdit={(_, variationItems) => {
                                                                        setStockModal({
                                                                            itemId: String(ad.id),
                                                                            variations: variationItems.map(v => ({ id: v.id, sku: v.sku, seller_stock_total: v.seller_stock_total })),
                                                                        });
                                                                    }}
                                                                    onDuplicate={handleDuplicate}
                                                                    onDeleteRequest={setConfirmDeleteItemId}
                                                                    onSetConfirmPause={setConfirmPauseFor}
                                                                />
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="p-10 text-center text-gray-500">
                                                            {isLoading ? 'Carregando...' : 'Nenhum anúncio encontrado.'}
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </TabsContent>

                                    <TabsContent value="promocoes" className="mt-0">
                                        <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-600">
                                            Em breve: gestão de promoções.
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            ) : (
                                <div className="py-24 flex flex-col items-center justify-center">
                                    <div className="text-lg font-semibold text-gray-700">CONECTE UM APLICATIVO</div>
                                    <Button className="mt-4" onClick={() => navigate('/aplicativos')}>Ir para Aplicativos</Button>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
