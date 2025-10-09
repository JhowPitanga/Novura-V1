import { useEffect, useMemo, useState } from "react";
import { Warehouse, Bell, Users, FilePlus2, Filter, Info, MoreHorizontal, AlertTriangle, Truck, Mail, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStorage } from "@/hooks/useStorage";
import { useCategories } from "@/hooks/useCategories";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { EstoqueTab } from "@/components/estoque/tabs/EstoqueTab";
import { CleanNavigation } from "@/components/CleanNavigation";
import { StorageManagementDrawer } from "@/components/estoque/StorageManagementDrawer";

export default function Estoque() {
  const { storageLocations, loading: storageLoading, refetch: refetchStorage } = useStorage();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGalpao, setSelectedGalpao] = useState("todos");
  const [editingStorageId, setEditingStorageId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("todas");
  const [openActionsForStorageId, setOpenActionsForStorageId] = useState<string | null>(null);
  const { categories, loading: categoriesLoading } = useCategories();
  const [activeFilter, setActiveFilter] = useState("estoque");
  const [activeNav, setActiveNav] = useState<'controle' | 'compras' | 'armazem'>("controle");
  const [isStorageDrawerOpen, setIsStorageDrawerOpen] = useState(false);

  const navigationItems = [
    { title: "Controle", path: "controle", description: "Controle de estoque" },
    { title: "Compras", path: "compras", description: "Compras de estoque" },
    { title: "Armazém", path: "armazem", description: "Gerenciar armazéns" },
  ];

  // Estado da aba de compras
  const [poSearch, setPoSearch] = useState("");
  const [poStatus, setPoStatus] = useState<string | undefined>(undefined);
  const [poSupplier, setPoSupplier] = useState<string | undefined>(undefined);
  const [poDateRange, setPoDateRange] = useState<{ start?: string; end?: string }>({});
  const [poDelayOnly, setPoDelayOnly] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [poDrawerOpen, setPoDrawerOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any | null>(null);

  // Carregar OCs do Supabase (fallback para mock)
  useEffect(() => {
    const fetchPOs = async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select(`
            id,
            created_at,
            status,
            expected_delivery,
            supplier_id,
            suppliers ( id, name, delay_score ),
            purchase_order_items ( id, quantity, unit_cost )
          `)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setPurchaseOrders((data || []).map((po: any) => ({
          id: po.id,
          created_at: po.created_at,
          status: po.status,
          expected_delivery: po.expected_delivery,
          supplier: po.suppliers?.name || "",
          delay_score: po.suppliers?.delay_score ?? 0,
          items_count: (po.purchase_order_items || []).length,
          total_value: (po.purchase_order_items || []).reduce((sum: number, it: any) => sum + (it.quantity * (it.unit_cost || 0)), 0),
        })));
      } catch (e) {
        // Fallback mock
        setPurchaseOrders([
          { id: "OC-2025-001", created_at: new Date().toISOString(), status: "Aberta", expected_delivery: new Date(Date.now() + 7*24*3600*1000).toISOString(), supplier: "Fornecedor Alfa", delay_score: 70, items_count: 3, total_value: 3250.50 },
          { id: "OC-2025-002", created_at: new Date().toISOString(), status: "A Caminho", expected_delivery: new Date(Date.now() + 3*24*3600*1000).toISOString(), supplier: "Fornecedor Beta", delay_score: 20, items_count: 5, total_value: 14200.00 },
          { id: "OC-2025-003", created_at: new Date().toISOString(), status: "Recebida", expected_delivery: new Date().toISOString(), supplier: "Fornecedor Gama", delay_score: 10, items_count: 2, total_value: 980.00 },
        ]);
      }
    };
    fetchPOs();
  }, []);

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
            <CleanNavigation items={navigationItems} activePath={activeNav} onNavigate={setActiveNav} />

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
                <EstoqueTab activeFilter={activeFilter} searchTerm={searchTerm} selectedGalpao={selectedGalpao} selectedCategory={selectedCategory} />
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

              {/* Aba: Compras de Estoque */}
              <TabsContent value="compras" className="mt-6 space-y-6">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    {/* Barra superior: pesquisa e filtros */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[240px]">
                        <Input placeholder="Buscar por Nº OC, Fornecedor, Status ou SKU" value={poSearch} onChange={(e) => setPoSearch(e.target.value)} />
                      </div>
                      <Select value={poStatus} onValueChange={setPoStatus}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status da OC" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Aberta">Aberta</SelectItem>
                          <SelectItem value="Enviada">Enviada</SelectItem>
                          <SelectItem value="A Caminho">A Caminho</SelectItem>
                          <SelectItem value="Recebida">Recebida</SelectItem>
                          <SelectItem value="Recebida Parcialmente">Recebida Parcialmente</SelectItem>
                          <SelectItem value="Cancelada">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={poSupplier} onValueChange={setPoSupplier}>
                        <SelectTrigger className="w-[200px]"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Fornecedor Alfa">Fornecedor Alfa</SelectItem>
                          <SelectItem value="Fornecedor Beta">Fornecedor Beta</SelectItem>
                          <SelectItem value="Fornecedor Gama">Fornecedor Gama</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={() => setPoDelayOnly(!poDelayOnly)}>
                        <AlertTriangle className={cn("w-4 h-4 mr-2", poDelayOnly ? "text-red-600" : "text-gray-600")} />
                        Somente atrasos
                      </Button>
                      <div className="ml-auto flex gap-2">
                        <Button className="bg-novura-primary" size="sm"><FilePlus2 className="w-4 h-4 mr-2" /> + Nova Ordem de Compra</Button>
                        <Button variant="outline" size="sm"><Truck className="w-4 h-4 mr-2" /> Criar OC a partir da sugestão</Button>
                      </div>
                    </div>

                    {/* Lista de OCs */}
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nº da OC</TableHead>
                            <TableHead>Data de Criação</TableHead>
                            <TableHead>Fornecedor</TableHead>
                            <TableHead>Qtd. de Itens</TableHead>
                            <TableHead>Valor Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Entrega Prevista</TableHead>
                            <TableHead>Alerta de Atraso</TableHead>
                            <TableHead className="w-24">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchaseOrders
                            .filter(po => {
                              const text = `${po.id} ${po.supplier} ${po.status}`.toLowerCase();
                              const matchSearch = text.includes(poSearch.toLowerCase());
                              const matchStatus = !poStatus || po.status === poStatus;
                              const matchSupplier = !poSupplier || po.supplier === poSupplier;
                              const isDelayed = po.expected_delivery && new Date(po.expected_delivery).getTime() < Date.now();
                              const matchDelay = !poDelayOnly || isDelayed;
                              return matchSearch && matchStatus && matchSupplier && matchDelay;
                            })
                            .map((po) => {
                              const isNextWeek = po.expected_delivery && (new Date(po.expected_delivery).getTime() - Date.now()) < 7*24*3600*1000;
                              const riskBadge = isNextWeek && po.delay_score > 60;
                              return (
                                <TableRow key={po.id}>
                                  <TableCell className="font-mono text-sm">{po.id}</TableCell>
                                  <TableCell>{new Date(po.created_at).toLocaleDateString("pt-BR")}</TableCell>
                                  <TableCell>{po.supplier}</TableCell>
                                  <TableCell>{po.items_count}</TableCell>
                                  <TableCell>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(po.total_value || 0)}</TableCell>
                                  <TableCell>
                                    <Badge className={cn(
                                      po.status === "Aberta" && "bg-amber-100 text-amber-700",
                                      po.status === "Enviada" && "bg-blue-100 text-blue-700",
                                      po.status === "A Caminho" && "bg-orange-100 text-orange-700",
                                      po.status === "Recebida" && "bg-emerald-100 text-emerald-700",
                                      po.status?.includes("Recebida Parcial") && "bg-violet-100 text-violet-700",
                                      po.status === "Cancelada" && "bg-gray-100 text-gray-700"
                                    )}>{po.status}</Badge>
                                  </TableCell>
                                  <TableCell>{po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString("pt-BR") : ""}</TableCell>
                                  <TableCell>
                                    {riskBadge ? (
                                      <Badge variant="outline" className="border-red-300 text-red-700">Risco de Atraso</Badge>
                                    ) : (
                                      <span className="text-xs text-gray-500"></span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm"><MoreHorizontal className="w-4 h-4" /></Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => { setSelectedPO(po); setPoDrawerOpen(true); }}>Ver Detalhes</DropdownMenuItem>
                                        <DropdownMenuItem>Editar</DropdownMenuItem>
                                        <DropdownMenuItem>Mudar Status</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem><Mail className="w-4 h-4 mr-2" /> Enviar Email (PDF)</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Drawer de detalhes da OC */}
                <Drawer open={poDrawerOpen} onOpenChange={setPoDrawerOpen}>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>Ordem de Compra {selectedPO?.id}</DrawerTitle>
                      <DrawerDescription>Detalhes e gestão completa</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 space-y-4">
                      <Tabs defaultValue="itens">
                        <TabsContent value="itens" className="mt-4">
                          <Card><CardContent className="p-4">
                            <p className="text-sm text-gray-700">Lista de itens, quantidades e custos unitários. Campo "Receber" para recebimento parcial.</p>
                          </CardContent></Card>
                        </TabsContent>
                        <TabsContent value="logistica" className="mt-4">
                          <Card><CardContent className="p-4 space-y-3">
                            <div className="flex items-center gap-2"><Info className="w-4 h-4" /><span className="text-sm">Previsão de recebimento e tracking do fornecedor.</span></div>
                            <div className="grid grid-cols-2 gap-3">
                              <Input placeholder="Previsão de recebimento (data)" />
                              <Input placeholder="Tracking do fornecedor (opcional)" />
                            </div>
                          </CardContent></Card>
                        </TabsContent>
                        <TabsContent value="historico" className="mt-4">
                          <Card><CardContent className="p-4">
                            <p className="text-sm text-gray-700">Registro cronológico de alterações, e-mails e recebimentos.</p>
                          </CardContent></Card>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </DrawerContent>
                </Drawer>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
