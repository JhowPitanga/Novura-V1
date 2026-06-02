// SIZE EXCEPTION (§1 ENGINEERING_STANDARDS.md): This page compositor intentionally
// exceeds the 200-line limit. All computation is delegated to hooks; this file
// only wires together layout, modals, and component props. Cannot be split further
// without introducing prop-drilling or an additional context layer.
import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { GlobalHeader } from "@/components/GlobalHeader";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import {
  useConnectedMarketplaces,
  useMarketplaceStores,
  useListingItems,
  useListingDrafts,
  useListingMutations,
  filterListings,
  filterListingsByScope,
  sortListings,
  countListingsByLogistic,
  countListingsByLink,
  countListingsByStatus,
  countListingsByStock,
} from "@/hooks/useListings";
import type { SortKey, SortDir } from "@/types/listings";
import {
  DEFAULT_LISTING_FILTERS,
  type ListingAppliedFilters,
} from "@/types/listings";

import { useListingsUrlState } from "@/hooks/useListingsUrlState";
import { useListingSelection } from "@/hooks/useListingSelection";
import { useLinkPickerQueue } from "@/hooks/useLinkPickerQueue";
import { useListingActions } from "@/hooks/useListingActions";

import { LinkPickerDrawer } from "@/components/shared/LinkPickerDrawer";
import { PromotionsTab } from "@/components/promotions/PromotionsTab";
import { StockEditModal, type StockVariation } from "@/components/listings/StockEditModal";
import { DeleteListingDialog } from "@/components/listings/DeleteListingDialog";
import { DraftsList } from "@/components/listings/DraftsList";
import { ListingsToolbar } from "@/components/listings/ListingsToolbar";
import { ListingSelectionBar } from "@/components/listings/ListingSelectionBar";
import { ListingCard } from "@/components/listings/ListingCard";

export default function Anuncios() {
  const { organizationId } = useAuth();
  const navigate = useNavigate();

  // UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [appliedFilters, setAppliedFilters] = useState<ListingAppliedFilters>(DEFAULT_LISTING_FILTERS);
  const [draftFilters, setDraftFilters] = useState<ListingAppliedFilters>(DEFAULT_LISTING_FILTERS);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("anuncios");
  const [stockModal, setStockModal] = useState<{ itemId: string; variations: StockVariation[] } | null>(null);
  const [bulkDeleteDraftsOpen, setBulkDeleteDraftsOpen] = useState(false);

  // Data
  const { data: marketplacesData } = useConnectedMarketplaces(organizationId);
  const navItems = marketplacesData?.navItems || [];
  const shippingCaps = marketplacesData?.shippingCaps || null;
  const hasIntegration = marketplacesData?.hasIntegration || false;

  // URL-driven state
  const {
    activeStatus,
    selectedMarketplacePath,
    marketplaceSlug,
    handleMarketplaceNavigate,
    handleStatusNavigate,
  } = useListingsUrlState({ navItems });

  const selectedDisplayName = navItems.find((n) => n.path === selectedMarketplacePath)?.displayName || "";
  const isShopee = selectedDisplayName.toLowerCase() === "shopee";

  const { data: storesData } = useMarketplaceStores(organizationId, selectedDisplayName);
  const marketplaceStores = storesData || [];

  const { parsedItems, rawItems, patchRawItems, listingTypeByItemId, isLoading, refetch } =
    useListingItems({
      orgId: organizationId,
      selectedDisplayName,
      selectedPath: selectedMarketplacePath,
      shippingCaps,
    });

  const { data: draftsData } = useListingDrafts(organizationId, activeStatus);
  const drafts = draftsData || [];

  const mutations = useListingMutations(organizationId);
  const syncing = mutations.syncAll.isPending || mutations.syncSelected.isPending;

  // Selection state
  const {
    selectedItems,
    expandedVariations,
    selectedDraftIds,
    setSelectedDraftIds,
    toggleSelectItem,
    toggleSelectAll,
    toggleExpandVariation,
    toggleSelectDraft,
    toggleSelectAllDrafts,
    resetSelection,
  } = useListingSelection();

  // Link picker state
  const {
    linkPickerContext,
    openLinkPicker,
    advanceLinkPickerQueue,
    closeLinkPicker,
  } = useLinkPickerQueue();

  // Filtering + sorting
  const scopedAds = filterListingsByScope(parsedItems, activeStatus, selectedDisplayName);
  const filterCounts = {
    logistic: countListingsByLogistic(scopedAds),
    link: countListingsByLink(scopedAds),
    status: countListingsByStatus(scopedAds),
    stock: countListingsByStock(scopedAds),
  };
  const filteredAds = filterListings(
    parsedItems,
    activeStatus,
    isShopee,
    selectedDisplayName,
    searchTerm,
    appliedFilters,
    selectedIntegrationIds,
  );
  const sortedAds = sortListings(filteredAds, sortKey, sortDir);
  const isAllSelected =
    sortedAds.length > 0 && sortedAds.every((a) => selectedItems.has(a.id));
  const isAllDraftsSelected =
    drafts.length > 0 && drafts.every((d: any) => selectedDraftIds.has(String(d.id)));

  // Reset UI on marketplace change
  useEffect(() => {
    setAppliedFilters(DEFAULT_LISTING_FILTERS);
    setDraftFilters(DEFAULT_LISTING_FILTERS);
    setSearchTerm("");
    setSelectedIntegrationIds(new Set());
    resetSelection();
  }, [marketplaceSlug, resetSelection]);

  useEffect(() => {
    if (filterDrawerOpen) {
      setDraftFilters(appliedFilters);
    }
  }, [filterDrawerOpen, appliedFilters]);

  // Actions
  const {
    confirmDeleteItemId,
    setConfirmDeleteItemId,
    confirmPauseFor,
    setConfirmPauseFor,
    handleSync,
    handleSyncSelected,
    handleSyncSingle,
    handleToggleStatus,
    handleDeleteItem,
    handleDeleteDraft,
    handleDeleteSelectedDrafts,
    handleDuplicate,
    handleStockSuccess,
  } = useListingActions({
    organizationId,
    selectedDisplayName,
    selectedItems,
    mutations,
    refetch,
    patchRawItems,
    rawItems,
    listingTypeByItemId,
    sortedAds,
    selectedDraftIds,
    setSelectedDraftIds,
  });

  const statusItems = isShopee
    ? [
        { title: "Todos", path: "/anuncios/todos" },
        { title: "Ativos", path: "/anuncios/ativos" },
        { title: "Rascunhos", path: "/anuncios/rascunhos" },
      ]
    : [
        { title: "Todos", path: "/anuncios/todos" },
        { title: "Ativos", path: "/anuncios/ativos" },
        { title: "Inativos", path: "/anuncios/inativos" },
        { title: "Rascunhos", path: "/anuncios/rascunhos" },
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
            onNavigate={handleMarketplaceNavigate}
            rightContent={
              hasIntegration && activeTab === "anuncios" ? (
                <Button
                  className="h-10 px-4 rounded-2xl bg-novura-primary hover:bg-novura-primary/90 shadow-lg"
                  onClick={() => navigate("/anuncios/criar/")}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar um anúncio
                </Button>
              ) : null
            }
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

                  <TabsContent
                    key={`anuncios-${marketplaceSlug}`}
                    value="anuncios"
                    className="mt-0"
                  >
                    {/* Modals */}
                    <StockEditModal
                      open={!!stockModal}
                      onOpenChange={(open) => {
                        if (!open) setStockModal(null);
                      }}
                      itemId={stockModal?.itemId || null}
                      orgId={organizationId}
                      variations={stockModal?.variations || []}
                      onSuccess={handleStockSuccess}
                    />
                    <LinkPickerDrawer
                      open={!!linkPickerContext}
                      onOpenChange={(open) => {
                        if (!open) closeLinkPicker();
                      }}
                      context={linkPickerContext}
                      onLinked={() => {
                        advanceLinkPickerQueue(rawItems);
                        refetch();
                      }}
                    />
                    <DeleteListingDialog
                      itemId={confirmDeleteItemId}
                      onClose={() => setConfirmDeleteItemId(null)}
                      onConfirm={handleDeleteItem}
                    />
                    {bulkDeleteDraftsOpen && (
                      <Dialog
                        open={bulkDeleteDraftsOpen}
                        onOpenChange={setBulkDeleteDraftsOpen}
                      >
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Excluir rascunhos selecionados?</DialogTitle>
                            <DialogDescription>
                              {selectedDraftIds.size} selecionado(s). Esta ação remove definitivamente do banco de dados.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setBulkDeleteDraftsOpen(false)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700"
                              onClick={async () => {
                                await handleDeleteSelectedDrafts();
                                setBulkDeleteDraftsOpen(false);
                              }}
                            >
                              Excluir
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}

                    <ListingsToolbar
                      searchTerm={searchTerm}
                      onSearchChange={setSearchTerm}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={(key, dir) => {
                        setSortKey(key);
                        setSortDir(dir);
                      }}
                      appliedFilters={appliedFilters}
                      draftFilters={draftFilters}
                      onDraftFiltersChange={setDraftFilters}
                      filterDrawerOpen={filterDrawerOpen}
                      onFilterDrawerOpenChange={setFilterDrawerOpen}
                      onConfirmFilters={() => {
                        setAppliedFilters(draftFilters);
                        setFilterDrawerOpen(false);
                      }}
                      onClearFilters={() => {
                        setAppliedFilters(DEFAULT_LISTING_FILTERS);
                        setDraftFilters(DEFAULT_LISTING_FILTERS);
                      }}
                      filterCounts={filterCounts}
                      stores={marketplaceStores}
                      selectedIntegrationIds={selectedIntegrationIds}
                      onSelectedIntegrationIdsChange={setSelectedIntegrationIds}
                      syncing={syncing}
                      selectedCount={selectedItems.size}
                      onSyncAll={handleSync}
                      onSyncSelected={handleSyncSelected}
                    />

                    <div className="mt-4">
                      <CleanNavigation
                        items={statusItems}
                        basePath=""
                        activePath={`/anuncios/${activeStatus}`}
                        onNavigate={handleStatusNavigate}
                      />
                    </div>

                    <div className="mt-2 px-2 flex items-center justify-between">
                      <ListingSelectionBar
                        activeStatus={activeStatus}
                        isAllSelected={isAllSelected}
                        onToggleSelectAll={() => toggleSelectAll(sortedAds)}
                        selectedCount={selectedItems.size}
                        isAllDraftsSelected={isAllDraftsSelected}
                        onToggleSelectAllDrafts={() => toggleSelectAllDrafts(drafts)}
                        selectedDraftsCount={selectedDraftIds.size}
                        onBulkDeleteDrafts={() => setBulkDeleteDraftsOpen(true)}
                      />
                    </div>

                    <Card
                      key={`listings-panel-${organizationId}-${marketplaceSlug}`}
                      className="mt-2 border border-gray-200 shadow-sm"
                    >
                      <CardContent className="p-0">
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-x-2 items-center px-3 py-2 border-b border-gray-200">
                            <div className="col-span-1"></div>
                            <div className="col-span-3 text-xs font-medium text-gray-600">
                              Produto(S)
                            </div>
                            <div className="col-span-2 text-xs font-medium text-gray-600">
                              Preço
                            </div>
                            <div className="col-span-2 text-xs font-medium text-gray-600">
                              Dados
                            </div>
                            <div className="col-span-2 text-xs font-medium text-gray-600">
                              Desempenho
                            </div>
                            <div className="col-span-2 text-xs font-medium text-gray-600 text-right">
                              Ações
                            </div>
                          </div>

                          {activeStatus === "rascunhos" ? (
                            <DraftsList
                              drafts={drafts}
                              selectedDraftIds={selectedDraftIds}
                              onToggleSelect={toggleSelectDraft}
                              onDeleteDraft={handleDeleteDraft}
                            />
                          ) : sortedAds.length > 0 ? (
                            sortedAds.map((ad) => {
                              const itemRow = rawItems.find(
                                (r) =>
                                  String(r?.marketplace_item_id || r?.id) === String(ad.id),
                              );
                              return (
                                <ListingCard
                                  key={ad.id}
                                  ad={ad}
                                  itemRow={itemRow}
                                  isShopee={isShopee}
                                  isSelected={selectedItems.has(ad.id)}
                                  isExpanded={expandedVariations.has(ad.id)}
                                  confirmPauseFor={confirmPauseFor}
                                  onToggleSelect={() => toggleSelectItem(ad.id)}
                                  onToggleExpansion={() => toggleExpandVariation(ad.id)}
                                  onToggleStatus={handleToggleStatus}
                                  onOpenStockEdit={(_, variationItems) => {
                                    setStockModal({
                                      itemId: String(ad.id),
                                      variations: variationItems.map((v) => ({
                                        id: v.id,
                                        sku: v.sku,
                                        seller_stock_total: v.seller_stock_total,
                                      })),
                                    });
                                  }}
                                  onDuplicate={handleDuplicate}
                                  onDeleteRequest={setConfirmDeleteItemId}
                                  onSetConfirmPause={setConfirmPauseFor}
                                  onSyncSingle={handleSyncSingle}
                                  onOpenLinkPicker={({
                                    ad: a,
                                    variationId,
                                    variationSku,
                                    variationTypes,
                                    pendingVariationIds,
                                  }) =>
                                    openLinkPicker({
                                      ad: a,
                                      variationId,
                                      variationSku,
                                      variationTypes,
                                      pendingVariationIds,
                                      itemRow,
                                    })
                                  }
                                />
                              );
                            })
                          ) : (
                            <div className="p-10 text-center text-gray-500">
                              {isLoading || (!marketplaceSlug && hasIntegration)
                                ? "Carregando..."
                                : "Nenhum anúncio encontrado."}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent
                    key={`promocoes-${marketplaceSlug}`}
                    value="promocoes"
                    className="mt-0"
                  >
                    {organizationId && selectedDisplayName ? (
                      <PromotionsTab
                        key={`promotions-tab-${marketplaceSlug}`}
                        organizationId={organizationId}
                        marketplaceDisplayName={selectedDisplayName}
                      />
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-500 text-sm">
                        Selecione um marketplace para gerenciar promoções.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="py-24 flex flex-col items-center justify-center">
                  <div className="text-lg font-semibold text-gray-700">CONECTE UM APLICATIVO</div>
                  <Button className="mt-4" onClick={() => navigate("/aplicativos")}>
                    Ir para Aplicativos
                  </Button>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
