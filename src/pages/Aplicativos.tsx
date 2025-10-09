import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Store, Truck, Settings, Check, Plus, ExternalLink, MessageSquare, Filter, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface App {
  id: string;
  name: string;
  description: string;
  logo: string;
  category: 'marketplaces' | 'logistics' | 'dropshipping' | 'others';
  isConnected: boolean;
  price: 'free' | 'paid';
  rating: number;
  installs: number;
}

const apps: App[] = [
  // Marketplaces
  {
    id: "mercadolivre",
    name: "Mercado Livre",
    description: "Integre com o maior marketplace da América Latina",
    logo: "/placeholder.svg",
    category: "marketplaces",
    isConnected: true,
    price: "free",
    rating: 4.8,
    installs: 50000,
  },
  {
    id: "amazon",
    name: "Amazon",
    description: "Venda seus produtos na Amazon Brasil",
    logo: "/placeholder.svg",
    category: "marketplaces",
    isConnected: false,
    price: "free",
    rating: 4.7,
    installs: 30000,
  },
  {
    id: "shopee",
    name: "Shopee",
    description: "Conecte-se com a Shopee para expandir suas vendas",
    logo: "/placeholder.svg",
    category: "marketplaces",
    isConnected: true,
    price: "free",
    rating: 4.6,
    installs: 25000,
  },

  // Dropshipping
  {
    id: "oberlo",
    name: "Oberlo",
    description: "Encontre produtos para dropshipping facilmente",
    logo: "/placeholder.svg",
    category: "dropshipping",
    isConnected: false,
    price: "free",
    rating: 4.4,
    installs: 18000,
  },
  {
    id: "spocket",
    name: "Spocket",
    description: "Produtos de dropshipping dos EUA e Europa",
    logo: "/placeholder.svg",
    category: "dropshipping",
    isConnected: false,
    price: "paid",
    rating: 4.5,
    installs: 12000,
  },
  {
    id: "dsers",
    name: "DSers",
    description: "Ferramenta oficial de dropshipping do AliExpress",
    logo: "/placeholder.svg",
    category: "dropshipping",
    isConnected: false,
    price: "free",
    rating: 4.3,
    installs: 22000,
  },

  // Logistics
  {
    id: "correios",
    name: "Correios",
    description: "Calcule fretes e rastreie encomendas pelos Correios",
    logo: "/placeholder.svg",
    category: "logistics",
    isConnected: true,
    price: "free",
    rating: 4.2,
    installs: 40000,
  },
  {
    id: "jadlog",
    name: "Jadlog",
    description: "Integração com transportadora Jadlog",
    logo: "/placeholder.svg",
    category: "logistics",
    isConnected: false,
    price: "free",
    rating: 4.1,
    installs: 18000,
  },

  // Others
  {
    id: "pagseguro",
    name: "PagSeguro",
    description: "Gateway de pagamento PagSeguro",
    logo: "/placeholder.svg",
    category: "others",
    isConnected: true,
    price: "free",
    rating: 4.3,
    installs: 35000,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Processamento de pagamentos internacionais",
    logo: "/placeholder.svg",
    category: "others",
    isConnected: false,
    price: "free",
    rating: 4.7,
    installs: 22000,
  },
];

export default function Aplicativos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [connectedFilter, setConnectedFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);

  const categories = [
    { id: "all", name: "Todos", icon: Settings },
    { id: "marketplaces", name: "Marketplaces", icon: Store },
    { id: "dropshipping", name: "Dropshipping", icon: Truck },
    { id: "logistics", name: "Logística", icon: Truck },
    { id: "others", name: "Outros", icon: Settings },
  ];

  const filteredApps = apps.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const connectedApps = apps.filter(app => {
    const isConnected = app.isConnected;
    const matchesFilter = connectedFilter === "all" || 
                         (connectedFilter === "connected" && isConnected) ||
                         (connectedFilter === "disconnected" && !isConnected);
    const matchesCategory = selectedCategory === "all" || app.category === selectedCategory;
    return isConnected && matchesFilter && matchesCategory;
  });

  const handleConnect = (app: App) => {
    setSelectedApp(app);
    setIsDialogOpen(true);
  };

  const connectApp = () => {
    if (selectedApp) {
      alert(`${selectedApp.name} conectado com sucesso!`);
      setIsDialogOpen(false);
      setSelectedApp(null);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <GlobalHeader />

          <main className="flex-1 p-6 overflow-auto">
            <Tabs defaultValue="store" className="w-full">
              <div className="flex items-center justify-between mb-6">
                <TabsList className="grid w-fit grid-cols-2">
                  <TabsTrigger value="store" className="px-6">Loja de Apps</TabsTrigger>
                  <TabsTrigger value="connected" className="px-6">Apps Conectados</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="store" className="space-y-6">
                {/* Search */}
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar aplicativos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Categories */}
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {categories.map((category) => (
                    <Button
                      key={category.id}
                      variant={selectedCategory === category.id ? "default" : "outline"}
                      onClick={() => setSelectedCategory(category.id)}
                      className="flex items-center space-x-2 whitespace-nowrap"
                      size="sm"
                    >
                      <category.icon className="w-4 h-4" />
                      <span>{category.name}</span>
                    </Button>
                  ))}
                </div>

                {/* Apps Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredApps.map((app) => (
                    <Card key={app.id} className="overflow-hidden hover:shadow-lg transition-all duration-200 hover:scale-105">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-novura-primary to-purple-600 rounded-xl flex items-center justify-center">
                              <img src={app.logo} alt={app.name} className="w-8 h-8 rounded" />
                            </div>
                            <div>
                              <CardTitle className="text-sm font-semibold">{app.name}</CardTitle>
                              <div className="flex items-center space-x-2 mt-1">
                                <Badge variant={app.price === 'free' ? 'default' : 'secondary'} className="text-xs">
                                  {app.price === 'free' ? 'Gratuito' : 'Pago'}
                                </Badge>
                                {app.isConnected && (
                                  <Badge className="bg-green-100 text-green-800 text-xs">
                                    <Check className="w-3 h-3 mr-1" />
                                    Conectado
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <CardDescription className="text-sm mb-4 line-clamp-2">
                          {app.description}
                        </CardDescription>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                          <span>★ {app.rating}</span>
                          <span>{app.installs.toLocaleString()} instalações</span>
                        </div>
                        <Button
                          className="w-full"
                          variant={app.isConnected ? "outline" : "default"}
                          onClick={() => !app.isConnected && handleConnect(app)}
                          disabled={app.isConnected}
                          size="sm"
                        >
                          {app.isConnected ? (
                            <>
                              <Check className="w-4 h-4 mr-2" />
                              Conectado
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-2" />
                              Conectar
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="connected" className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Aplicativos Conectados ({connectedApps.length})</h3>
                  
                  <div className="flex items-center space-x-3">
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-[180px]">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Categorias</SelectItem>
                        <SelectItem value="marketplaces">Marketplaces</SelectItem>
                        <SelectItem value="dropshipping">Dropshipping</SelectItem>
                        <SelectItem value="logistics">Logística</SelectItem>
                        <SelectItem value="others">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Button onClick={() => setIsAddStoreOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Loja
                    </Button>
                  </div>
                </div>
                
                {connectedApps.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Settings className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500">Nenhum aplicativo conectado ainda</p>
                    <Button className="mt-4" onClick={() => setSelectedCategory("all")}>
                      Explorar Aplicativos
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {connectedApps.map((app) => (
                      <Card key={app.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-novura-primary to-purple-600 rounded-lg flex items-center justify-center">
                                <img src={app.logo} alt={app.name} className="w-6 h-6 rounded" />
                              </div>
                              <div>
                                <CardTitle className="text-sm">{app.name}</CardTitle>
                                <Badge className="bg-green-100 text-green-800 text-xs">
                                  <Check className="w-3 h-3 mr-1" />
                                  Ativo
                                </Badge>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <CardDescription className="text-sm mb-4">
                            {app.description}
                          </CardDescription>
                          <div className="flex space-x-2">
                            <Button variant="outline" size="sm" className="flex-1">
                              Configurar
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                              Desconectar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      {/* Connection Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar {selectedApp?.name}</DialogTitle>
            <DialogDescription>
              Você está prestes a conectar o {selectedApp?.name} ao seu sistema. 
              Isso permitirá sincronização automática de dados.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              Recursos que serão habilitados:
            </p>
            <ul className="text-sm space-y-2">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Sincronização de produtos</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Gestão de pedidos</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Atualização de estoque</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Relatórios integrados</span>
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={connectApp}>
              Conectar Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Store Dialog */}
      <Dialog open={isAddStoreOpen} onOpenChange={setIsAddStoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Nova Loja</DialogTitle>
            <DialogDescription>
              Configure uma nova loja para integrar com seus aplicativos conectados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome da Loja</label>
              <Input placeholder="Digite o nome da loja" />
            </div>
            <div>
              <label className="text-sm font-medium">URL da Loja</label>
              <Input placeholder="https://minhaloja.com.br" />
            </div>
            <div>
              <label className="text-sm font-medium">Plataforma</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="woocommerce">WooCommerce</SelectItem>
                  <SelectItem value="magento">Magento</SelectItem>
                  <SelectItem value="tray">Tray</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddStoreOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setIsAddStoreOpen(false)}>
              Adicionar Loja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
