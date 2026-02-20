import { useState } from "react";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StockTab } from "@/components/inventory/tabs/StockTab";
import { CleanNavigation } from "@/components/CleanNavigation";
import { StorageManagementDrawer } from "@/components/inventory/StorageManagementDrawer";

export default function Estoque() {
  const { storageLocations, loading: storageLoading, refetch: refetchStorage } = useStorage();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGalpao, setSelectedGalpao] = useState("todos");
  const [editingStorageId, setEditingStorageId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("todas");
  const [openActionsForStorageId, setOpenActionsForStorageId] = useState<string | null>(null);
  const { categories, loading: categoriesLoading } = useCategories();
  const [activeFilter, setActiveFilter] = useState("estoque");
  const [activeNav, setActiveNav] = useState<'controle' | 'armazem'>("controle");
  const [isStorageDrawerOpen, setIsStorageDrawerOpen] = useState(false);

  const navigationItems = [
    { title: "Controle", path: "controle", description: "Controle de estoque" },
    { title: "Armazém", path: "armazem", description: "Gerenciar armazéns" },
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
            <CleanNavigation items={navigationItems} activePath={activeNav} onNavigate={(path) => setActiveNav(path as 'controle' | 'armazem')} />

            {/* Conteúdo controlado por navegação */}
            <Tabs value={activeNav} className="w-full">
              {/* Aba: Controle de Estoque */}
              <TabsContent value="controle" className="mt-6 space-y-6">
                {/* Filtros superiores */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-500" />
                        {/* Removido o rótulo "Filtros" */}
                      </div>
                      <div className="flex-1 min-w-[240px]">
                        <Input placeholder="Pesquisar por produto, SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      </div>
                      <div className="flex items-center gap-2 min-w-[180px]">
                        <Select value={selectedGalpao} onValueChange={setSelectedGalpao}>
                          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Selecione o armazém" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os Armazéns</SelectItem>
                            {storageLoading && (
                              <SelectItem value="__loading" disabled>Carregando armazéns...</SelectItem>
                            )}
                            {!storageLoading && storageLocations.map((storage) => (
                              <SelectItem key={storage.id} value={storage.name}>{storage.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
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
                      <div className="min-w-[220px]">
                        <Select value={activeFilter} onValueChange={setActiveFilter}>
                          <SelectTrigger><SelectValue placeholder="Nível de estoque" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="estoque">Todos</SelectItem>
                            <SelectItem value="sem_estoque">Sem estoque</SelectItem>
                            <SelectItem value="critico">Crítico</SelectItem>
                            <SelectItem value="baixo">Baixo</SelectItem>
                            <SelectItem value="medio">Médio</SelectItem>
                            <SelectItem value="suficiente">Suficiente</SelectItem>
                            <SelectItem value="inventario">Crítico/Baixo</SelectItem>
                            <SelectItem value="total">Total</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Lista principal de estoque */}
                <StockTab activeFilter={activeFilter} searchTerm={searchTerm} selectedGalpao={selectedGalpao} selectedCategory={selectedCategory} />
                <StorageManagementDrawer
                  open={isStorageDrawerOpen}
                  onOpenChange={(open) => setIsStorageDrawerOpen(open)}
                  existingStorage={editingStorageId ? storageLocations.find(s => String(s.id) === String(editingStorageId)) : undefined}
                  onSaved={() => {
                    refetchStorage();
                  }}
                />
              </TabsContent>

              {/* Aba: Armazém */}
              <TabsContent value="armazem" className="mt-6 space-y-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-semibold">Armazéns</h2>
                    </div>
                    <div className="space-y-2">
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
                          <div key={storage.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{storage.name}</p>
                              </div>
                              <p className="text-xs text-muted-foreground">{storage.active ? 'Ativo' : 'Inativo'}</p>
                            </div>
                            <div className="flex items-center gap-2 justify-end w-[260px]">
                              {isDefault && <Badge variant="outline" className="border-violet-300 text-violet-700">ARMAZÉM PADRÃO</Badge>}
                              <DropdownMenu open={openActionsForStorageId === String(storage.id)} onOpenChange={(open) => setOpenActionsForStorageId(open ? String(storage.id) : null)}>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="pr-2 border-0 shadow-none">
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
                                </DropdownMenuContent>
                              </DropdownMenu>
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
              </TabsContent>

            </Tabs>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
