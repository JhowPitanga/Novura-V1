import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Loader2, Search, Trash2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStorage } from "@/hooks/useStorage";
import { useCategories } from "@/hooks/useCategories";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StockTab } from "@/components/inventory/tabs/StockTab";
import { FulfillmentTab } from "@/components/inventory/tabs/FulfillmentTab";
import { MovementsTab } from "../components/inventory/tabs/MovementsTab";
import { CleanNavigation } from "@/components/CleanNavigation";
import { StorageManagementDrawer } from "@/components/inventory/StorageManagementDrawer";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { deleteStorageById, storageHasAnyStock } from "@/services/inventory.service";

export default function Estoque() {
  const { storageLocations, loading: storageLoading, refetch: refetchStorage } = useStorage();
  const { organizationId } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  /** "todos" or storage UUID — value must match stock_by_location.storage_id */
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState("todos");
  const [editingStorageId, setEditingStorageId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("todas");
  const [openActionsForStorageId, setOpenActionsForStorageId] = useState<string | null>(null);
  const { categories, loading: categoriesLoading } = useCategories();
  const [activeFilter, setActiveFilter] = useState("estoque");
  const [activeNav, setActiveNav] = useState<'controle' | 'fulfillment' | 'armazem' | 'relatorios'>("controle");
  const [isStorageDrawerOpen, setIsStorageDrawerOpen] = useState(false);
  const [deleteStorageModal, setDeleteStorageModal] = useState<{
    open: boolean;
    storage: { id: string; name: string } | null;
    phase: "idle" | "checking" | "ready" | "blocked";
  }>({ open: false, storage: null, phase: "idle" });
  const [deletingStorage, setDeletingStorage] = useState(false);

  useEffect(() => {
    if (!deleteStorageModal.open || deleteStorageModal.phase !== "checking" || !deleteStorageModal.storage) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const hasStock = await storageHasAnyStock(deleteStorageModal.storage!.id);
        if (cancelled) return;
        setDeleteStorageModal((m) =>
          m.open && m.storage
            ? { ...m, phase: hasStock ? "blocked" : "ready" }
            : m
        );
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        toast({
          title: "Erro",
          description: "Não foi possível verificar o estoque deste armazém.",
          variant: "destructive",
        });
        setDeleteStorageModal({ open: false, storage: null, phase: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deleteStorageModal.open, deleteStorageModal.phase, deleteStorageModal.storage?.id]);

  const navigationItems = [
    { title: "Controle", path: "controle", description: "Controle de estoque" },
    { title: "Full", path: "fulfillment", description: "Armazéns externos" },
    { title: "Armazém", path: "armazem", description: "Gerenciar armazéns" },
    { title: "Relatórios", path: "relatorios", description: "Transições de estoque" },
  ];

  // Removido código relacionado à aba de compras

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />

          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Módulo de Estoque</h1>
                <p className="text-gray-600">Controle de estoque e pipeline de compras</p>
              </div>
            </div>

            {/* Navegação ao estilo Produtos */}
            <CleanNavigation items={navigationItems} activePath={activeNav} onNavigate={(path) => setActiveNav(path as 'controle' | 'fulfillment' | 'armazem' | 'relatorios')} />

            {/* Conteúdo controlado por navegação */}
            <Tabs value={activeNav} className="w-full">
              {/* Aba: Controle de Estoque */}
              <TabsContent value="controle" className="mt-6 space-y-6">
                {/* Filtros superiores */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Pesquisar por produto, SKU..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                        />
                      </div>
                      <div className="flex items-center gap-2 min-w-[180px]">
                        <Select value={selectedWarehouseFilter} onValueChange={setSelectedWarehouseFilter}>
                          <SelectTrigger className="h-12 w-[220px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"><SelectValue placeholder="Selecione o armazém" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os Armazéns</SelectItem>
                            {storageLoading && (
                              <SelectItem value="__loading" disabled>Carregando armazéns...</SelectItem>
                            )}
                            {!storageLoading && storageLocations.map((storage) => (
                              <SelectItem key={storage.id} value={String(storage.id)}>{storage.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={activeFilter} onValueChange={setActiveFilter}>
                          <SelectTrigger className="h-12 w-[220px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"><SelectValue placeholder="Filtro de estoque" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="estoque">Todos</SelectItem>
                            <SelectItem value="sem_estoque">Sem estoque</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-[220px]">
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="h-12 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">Todas as Categorias</SelectItem>
                            {categoriesLoading && (
                              <SelectItem value="__loading" disabled>Carregando categorias...</SelectItem>
                            )}
                            {!categoriesLoading && categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Lista principal de estoque */}
                <StockTab
                  activeFilter={activeFilter}
                  searchTerm={searchTerm}
                  selectedWarehouseFilter={selectedWarehouseFilter}
                  selectedCategory={selectedCategory}
                />
                <StorageManagementDrawer
                  open={isStorageDrawerOpen}
                  onOpenChange={(open) => setIsStorageDrawerOpen(open)}
                  existingStorage={editingStorageId ? storageLocations.find(s => String(s.id) === String(editingStorageId)) : undefined}
                  onSaved={() => {
                    refetchStorage();
                  }}
                />
              </TabsContent>

              {/* Aba: Full (fulfillment stock — linked listings only) */}
              <TabsContent value="fulfillment" className="mt-6 space-y-6">
                <FulfillmentTab />
              </TabsContent>

              {/* Aba: Relatórios de transições */}
              <TabsContent value="relatorios" className="mt-6 space-y-6">
                <MovementsTab />
              </TabsContent>

              {/* Aba: Armazém */}
              <TabsContent value="armazem" className="mt-6 space-y-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-semibold">Armazéns</h2>
                      <Button
                        className="bg-novura-primary"
                        onClick={() => {
                          setEditingStorageId(null);
                          setIsStorageDrawerOpen(true);
                        }}
                      >
                        Criar novo armazém
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {storageLoading && <p className="text-sm text-muted-foreground">Carregando armazéns...</p>}
                      {!storageLoading && storageLocations.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhum armazém cadastrado ainda.</p>
                      )}
                      {!storageLoading && storageLocations.map((storage) => {
                        const isDefault = (() => {
                          try {
                            const lsId = typeof window !== 'undefined' ? localStorage.getItem('defaultStorageId') : null;
                            return !!lsId && String(lsId) === String(storage.id);
                          } catch (_) { return false; }
                        })();
                        return (
                          <div key={storage.id} className="rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/60 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                                    <Warehouse className="h-4 w-4" />
                                  </span>
                                  <p className="text-sm font-semibold truncate">{storage.name}</p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">{storage.active ? 'Ativo' : 'Inativo'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                              {isDefault && <Badge variant="outline" className="border-violet-300 text-violet-700">Padrão</Badge>}
                              <DropdownMenu open={openActionsForStorageId === String(storage.id)} onOpenChange={(open) => setOpenActionsForStorageId(open ? String(storage.id) : null)}>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="pr-2 border-0 shadow-none h-8">
                                    <span className="mr-1">Ações</span>
                                    {openActionsForStorageId === String(storage.id) ? (
                                      <ChevronUp className="w-4 h-4 text-novura-primary" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-novura-primary" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => {
                                    setEditingStorageId(String(storage.id));
                                    setIsStorageDrawerOpen(true);
                                  }}>Editar</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {
                                    try {
                                      localStorage.setItem('defaultStorageId', String(storage.id));
                                      refetchStorage();
                                    } catch (_) {}
                                  }}>Definir como padrão</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                      setOpenActionsForStorageId(null);
                                      setDeleteStorageModal({
                                        open: true,
                                        storage: { id: String(storage.id), name: storage.name },
                                        phase: "checking",
                                      });
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir armazém
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <StorageManagementDrawer
                  open={isStorageDrawerOpen}
                  onOpenChange={(open) => setIsStorageDrawerOpen(open)}
                  existingStorage={editingStorageId ? storageLocations.find(s => String(s.id) === String(editingStorageId)) : undefined}
                  onSaved={() => {
                    refetchStorage();
                  }}
                />

                <AlertDialog
                  open={deleteStorageModal.open}
                  onOpenChange={(open) => {
                    if (!open && !deletingStorage) {
                      setDeleteStorageModal({ open: false, storage: null, phase: "idle" });
                    }
                  }}
                >
                  <AlertDialogContent
                    overlayClassName="z-[20100]"
                    className="z-[20110]"
                    onPointerDownOutside={(e) => {
                      if (deletingStorage) e.preventDefault();
                    }}
                  >
                    {deleteStorageModal.phase === "checking" && (
                      <>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Verificando estoque</AlertDialogTitle>
                          <AlertDialogDescription className="flex items-center gap-2 text-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Aguarde enquanto verificamos o armazém&hellip;
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                      </>
                    )}
                    {deleteStorageModal.phase === "blocked" && (
                      <>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Não é possível excluir</AlertDialogTitle>
                          <AlertDialogDescription>
                            Existem produtos com estoque nesse armazém, transfira antes de excluir
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogAction
                            onClick={() =>
                              setDeleteStorageModal({ open: false, storage: null, phase: "idle" })
                            }
                          >
                            Fechar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </>
                    )}
                    {deleteStorageModal.phase === "ready" && deleteStorageModal.storage && (
                      <>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir armazém?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza de que deseja excluir o armazém <strong className="text-foreground">&quot;{deleteStorageModal.storage.name}&quot;</strong>? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={deletingStorage}>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deletingStorage}
                            onClick={async (e) => {
                              e.preventDefault();
                              const s = deleteStorageModal.storage;
                              if (!s) return;
                              setDeletingStorage(true);
                              try {
                                await deleteStorageById(s.id);
                                try {
                                  if (typeof localStorage !== "undefined" && localStorage.getItem("defaultStorageId") === s.id) {
                                    localStorage.removeItem("defaultStorageId");
                                  }
                                } catch {
                                  /* ignore */
                                }
                                toast({ title: "Armazém excluído" });
                                refetchStorage();
                                setDeleteStorageModal({ open: false, storage: null, phase: "idle" });
                              } catch (err) {
                                console.error(err);
                                toast({
                                  variant: "destructive",
                                  title: "Não foi possível excluir o armazém",
                                });
                              } finally {
                                setDeletingStorage(false);
                              }
                            }}
                          >
                            {deletingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </>
                    )}
                  </AlertDialogContent>
                </AlertDialog>
              </TabsContent>

            </Tabs>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
