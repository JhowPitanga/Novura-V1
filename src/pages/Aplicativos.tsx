import { useState, useEffect, useCallback } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// Removed Tabs components import
import { Input } from "@/components/ui/input";
import { Search, Store, Truck, Settings, Check, Plus, ExternalLink, Filter } from "lucide-react";
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
import { Routes, Route, useNavigate } from "react-router-dom";
import { CleanNavigation } from "@/components/CleanNavigation";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startMercadoLivreAuth, listenForMeliOAuthSuccess } from '@/WebhooksAPI/marketplace/mercado-livre';
import { startShopeeAuth, listenForShopeeOAuthSuccess } from '@/WebhooksAPI/marketplace/shopee';

interface App {
  id: string;
  name: string;
  description: string;
  logo: string;
  category: 'marketplaces' | 'logistics' | 'dropshipping' | 'others';
  isConnected: boolean;
  price: 'free' | 'paid';
  rating?: number; // opcional, dados removidos da UI
  installs?: number; // opcional, dados removidos da UI
 }

// Endpoint da API de catálogo de apps (env VITE_APPS_API_URL ou fallback /api/apps)
const APPS_API_URL = import.meta.env.VITE_APPS_API_URL || "/api/apps";
// URL de redirect para o callback do Mercado Livre (defina em .env: VITE_MERCADO_LIVRE_REDIRECT_URI)
const MELI_REDIRECT_URI = import.meta.env.VITE_MERCADO_LIVRE_REDIRECT_URI as string | undefined;
// URL de redirect para o callback da Shopee (defina em .env: VITE_SHOPEE_REDIRECT_URI)
const SHOPEE_REDIRECT_URI = import.meta.env.VITE_SHOPEE_REDIRECT_URI as string | undefined;

interface AppConnection {
  appId: string;
  storeName: string;
  status: 'active' | 'reconnect' | 'inactive';
  authenticatedAt: string; // ISO string
  expiresAt: string; // ISO string
}

export default function Aplicativos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [connectedFilter, setConnectedFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [appConnections, setAppConnections] = useState<Record<string, AppConnection>>({});
  const [apps, setApps] = useState<App[]>([]);
  const [loadingApps, setLoadingApps] = useState<boolean>(true);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [isCannotDisconnectOpen, setIsCannotDisconnectOpen] = useState(false);
  const [cannotDisconnectMessage, setCannotDisconnectMessage] = useState('');
  const { toast } = useToast();
  const { user, organizationId } = useAuth();
  const navigate = useNavigate();

  // Carregar catálogo de apps via API (quando disponível)
  useEffect(() => {
    let isMounted = true;
    const loadApps = async () => {
      setLoadingApps(true);
      setAppsError(null);
      try {
        const { data, error } = await supabase
          .from('apps_public_view')
          .select('id, name, description, logo_url, category, price_type, auth_url')
          .order('name');

        if (error) throw error;

        if (isMounted && Array.isArray(data)) {
          const allowedCategories = ['marketplaces', 'logistics', 'dropshipping', 'others'] as const;
          type AppViewRow = { id: string; name: string; description: string; logo_url: string; category: string; price_type: string; auth_url?: string | null };
          const mapped = (data as AppViewRow[]).map((row) => {
            const category = allowedCategories.includes(row.category as (typeof allowedCategories)[number])
              ? row.category
              : 'others';
            return {
              id: row.id as string,
              name: row.name as string,
              description: row.description as string,
              logo: row.logo_url as string,
              category: category as App['category'],
              isConnected: false,
              price: (row.price_type === 'free' ? 'free' : 'paid') as App['price'],
            } as App;
          });
          setApps(mapped);
        }
      } catch (err) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Não foi possível carregar o catálogo de apps.';
          setApps([]);
          setAppsError(msg);
        }
      } finally {
        if (isMounted) setLoadingApps(false);
      }
    };
    loadApps();
    return () => {
      isMounted = false;
    };
  }, []);

  const navigationItems = [
     { title: "Loja de Apps", path: "", description: "Explore e conecte aplicativos" },
     { title: "Conectados", path: "/conectados", description: "Aplicativos integrados" },
   ];

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
    const hasConnection = !!appConnections[app.id];
    const isConnected = app.isConnected || hasConnection;
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

  const loadConnections = useCallback(async () => {
    try {
      if (!organizationId) return;
      const { data, error } = await supabase
        .from('marketplace_integrations')
        .select('id, marketplace_name, config, expires_in')
        .eq('organizations_id', organizationId);

      if (error) throw error;

      const nextConnections: Record<string, AppConnection> = {};
      type IntegrationRow = { marketplace_name: string; config?: { storeName?: string; connectedAt?: string }; expires_in?: number | string };
      ((data as IntegrationRow[]) || []).forEach((row) => {
        // Normaliza nome do app para localizar no catálogo carregado
        const marketplaceName = row.marketplace_name === 'mercado_livre' ? 'Mercado Livre' : row.marketplace_name;
        const app = apps.find(a => a.name === marketplaceName);
        if (!app) return;

        const expiresMs = (typeof row.expires_in === 'number' ? row.expires_in : Number(row.expires_in)) || 0;
        const expiresAtDate = expiresMs > 0 ? new Date(Date.now() + expiresMs * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const storeNameCfg = row?.config?.storeName || 'Minha Loja';

        nextConnections[app.id] = {
          appId: app.id,
          storeName: storeNameCfg,
          status: 'active',
          authenticatedAt: row?.config?.connectedAt || new Date().toISOString(),
          expiresAt: expiresAtDate.toISOString(),
        };
      });

      setAppConnections(nextConnections);
      setApps(prev => prev.map(app => ({ ...app, isConnected: !!nextConnections[app.id] })));
    } catch (e) {
      console.error('Falha ao carregar integrações', e);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId && apps.length > 0) {
      loadConnections();
    }
  }, [organizationId, apps.length]);

  // Helper para mapear nome exibido para nome no banco
  const toDbMarketplaceName = (name: string) => {
    if (name === 'Mercado Livre') return 'Mercado Livre';
    return name;
  };

  // Inicia fluxo de conexão (OAuth) do app selecionado
  const connectApp = async () => {
    try {
      if (!selectedApp) {
        toast({ title: 'Seleção ausente', description: 'Nenhum aplicativo selecionado para conexão.', variant: 'destructive' });
        return;
      }
      if (!organizationId) {
        toast({ title: 'Sessão necessária', description: 'Entre na sua conta para conectar aplicativos.', variant: 'destructive' });
        navigate('/auth');
        return;
      }
      const trimmedStoreName = storeName.trim();
      if (!trimmedStoreName) {
        toast({ title: 'Nome da loja obrigatório', description: 'Informe o nome da loja para continuar.' });
        return;
      }

      const appNameLower = selectedApp.name.toLowerCase();

      if (appNameLower === 'shopee') {
        const { authorization_url } = await startShopeeAuth(supabase, {
          organizationId,
          storeName: trimmedStoreName,
          connectedByUserId: user?.id || null,
          redirectUri: SHOPEE_REDIRECT_URI || undefined,
        });

        const popup = window.open(authorization_url, 'shopee_auth', 'width=960,height=800,menubar=no,toolbar=no');
        if (!popup) {
          toast({ title: 'Janela bloqueada', description: 'Permita pop-ups no navegador para continuar.' });
          return;
        }

        const unsubscribe = listenForShopeeOAuthSuccess((_payload) => {
          try {
            setIsDialogOpen(false);
            setStoreName('');
            setAppConnections(prev => ({
              ...prev,
              [selectedApp.id]: {
                appId: selectedApp.id,
                storeName: trimmedStoreName,
                status: 'active',
                authenticatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              },
            }));
            setApps(prev => prev.map(a => a.id === selectedApp.id ? { ...a, isConnected: true } : a));
            toast({ title: 'Conexão concluída', description: `${selectedApp.name} foi conectado com sucesso.` });
            navigate('/aplicativos/conectados');
          } finally {
            unsubscribe();
          popup.close?.();
          }
        });
      } else {
        const { authorization_url } = await startMercadoLivreAuth(supabase, {
          organizationId,
          storeName: trimmedStoreName,
          marketplaceName: selectedApp.name,
          connectedByUserId: user?.id || null,
          redirectUri: MELI_REDIRECT_URI || undefined,
        });

        const popup = window.open(authorization_url, 'meli_auth', 'width=960,height=800,menubar=no,toolbar=no');
        if (!popup) {
          toast({ title: 'Janela bloqueada', description: 'Permita pop-ups no navegador para continuar.' });
          return;
        }

        const unsubscribe = listenForMeliOAuthSuccess((_payload) => {
          try {
            setIsDialogOpen(false);
            setStoreName('');
            setAppConnections(prev => ({
              ...prev,
              [selectedApp.id]: {
                appId: selectedApp.id,
                storeName: trimmedStoreName,
                status: 'active',
                authenticatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              },
            }));
            setApps(prev => prev.map(a => a.id === selectedApp.id ? { ...a, isConnected: true } : a));
            toast({ title: 'Conexão concluída', description: `${selectedApp.name} foi conectado com sucesso.` });
            navigate('/aplicativos/conectados');
          } finally {
            unsubscribe();
          popup.close?.();
          }
        });
      }
    } catch (e) {
      console.error('Erro inesperado ao conectar app:', e);
      toast({ title: 'Erro inesperado', description: 'Ocorreu um erro ao conectar o aplicativo.', variant: 'destructive' });
    }
  };

  // Remove integração do app para a organização atual
  const disconnectApp = async (appId: string) => {
    try {
      if (!organizationId) {
        toast({ title: 'Sessão necessária', description: 'Entre na sua conta para desconectar aplicativos.', variant: 'destructive' });
        navigate('/auth');
        return;
      }
      const app = apps.find(a => a.id === appId);
      if (!app) return;
      const normalizedName = toDbMarketplaceName(app.name);

      const { error: rpcErr } = await supabase.rpc('disconnect_marketplace_cascade', {
        p_organizations_id: organizationId,
        p_marketplace_name: normalizedName,
      });
      if (rpcErr) {
        const msg = String(rpcErr?.message || '').toLowerCase();
        if (msg.includes('reserved_stock_present')) {
          setCannotDisconnectMessage('Não é possível desconectar. Existem reservas de estoque ativas vinculadas a anúncios deste aplicativo.');
          setIsCannotDisconnectOpen(true);
          return;
        }
        const { data: deletedRows, error } = await supabase
          .from('marketplace_integrations')
          .delete()
          .eq('organizations_id', organizationId)
          .or(`marketplace_name.eq.${normalizedName},marketplace_name.eq.${app.name}`)
          .select('id');
        if (error) {
          console.error('Erro ao desconectar app (fallback):', error);
          toast({ title: 'Falha ao desconectar', description: 'Não foi possível remover a conexão.', variant: 'destructive' });
          return;
        }
        if (!deletedRows || deletedRows.length === 0) {
          toast({ title: 'Falha ao desconectar', description: 'Não foi possível localizar a conexão para remoção.', variant: 'destructive' });
          return;
        }
      }

      setAppConnections(prev => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
      setApps(prev => prev.map(a => a.id === appId ? { ...a, isConnected: false } : a));
      await loadConnections();
      toast({ title: 'Aplicativo desconectado', description: `${app.name} foi removido da sua organização.` });
    } catch (e) {
      console.error('Erro inesperado ao desconectar app:', e);
      toast({ title: 'Erro inesperado', description: 'Ocorreu um erro ao desconectar o aplicativo.', variant: 'destructive' });
    }
  };

  const getConnectionInfo = (app: App) => {
    const conn = appConnections[app.id];
    const now = new Date();
    let status: 'active' | 'reconnect' | 'inactive' = (app.isConnected || conn) ? 'active' : 'inactive';
    let color = status === 'active' ? 'bg-green-500' : 'bg-red-500';
    if (conn) {
      const exp = new Date(conn.expiresAt);
      if (exp < now) {
        status = 'inactive';
        color = 'bg-red-500';
      } else {
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
        if (daysLeft <= 7) {
          status = 'reconnect';
          color = 'bg-yellow-500';
        } else {
          status = 'active';
          color = 'bg-green-500';
        }
      }
    }
    return { conn, status, color };
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <GlobalHeader />

          <main className="flex-1 p-6 overflow-auto">
            <CleanNavigation items={navigationItems} basePath="/aplicativos" />
            <Routes>
              <Route
                path="/"
                element={
                  <>
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
                    <div className="flex space-x-2 overflow-x-auto pb-2 mt-6">
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

                    {/* Apps Grid / Estados de carregamento e vazio */}
                    {loadingApps ? (
                      <div className="mt-6 text-sm text-gray-600">Carregando catálogo de apps...</div>
                    ) : filteredApps.length === 0 ? (
                      <div className="mt-6 text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Settings className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-500">Catálogo de apps indisponível no momento</p>
                        {appsError && <p className="text-gray-400 text-sm mt-2">Tente novamente mais tarde.</p>}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
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
                    )}
                    {/* Conteúdo de apps conectados movido para rota /conectados */}
                  </>
                }
              />
              <Route
                path="/conectados"
                element={
                  <>
                    {connectedApps.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Settings className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-500">Nenhum aplicativo conectado ainda</p>
                        <Button className="mt-4" onClick={() => setSelectedCategory("all")}>Explorar Aplicativos</Button>
                      </div>
                    ) : (
                      <>
                        <div className="text-center py-6">
                          <Button className="mt-2" onClick={() => setSelectedCategory("all")}>Explorar Aplicativos</Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                          {connectedApps.map((app) => {
                            const { conn, status, color } = getConnectionInfo(app);
                            return (
                              <Card key={app.id} className="hover:shadow-md transition-shadow">
                                <CardHeader className="pb-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-10 h-10 bg-gradient-to-br from-novura-primary to-purple-600 rounded-lg flex items-center justify-center">
                                        <img src={app.logo} alt={app.name} className="w-6 h-6 rounded" />
                                      </div>
                                      <div>
                                        <CardTitle className="text-sm">{app.name}</CardTitle>
                                        <div className="flex items-center space-x-2 mt-1">
                                          <span className={`inline-block w-2 h-2 rounded-full ${color}`}></span>
                                          <span className="text-xs text-gray-600">
                                            {status === 'active' ? 'Ativo' : status === 'reconnect' ? 'Reconectar' : 'Inativo'}
                                          </span>
                                        </div>
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
                                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 mb-4">
                                    <div>Autenticado em: {conn?.authenticatedAt ? new Date(conn.authenticatedAt).toLocaleDateString('pt-BR') : '—'}</div>
                                    <div>Expira em: {conn?.expiresAt ? new Date(conn.expiresAt).toLocaleDateString('pt-BR') : '—'}</div>
                                    <div>Nome da loja: {conn?.storeName || '—'}</div>
                                  </div>
                                  <div className="flex space-x-2">
                                    <Button variant="outline" size="sm" className="flex-1">Configurar</Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">Desconectar</Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Excluir aplicativo?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Tem certeza de que deseja excluir este aplicativo? Isso removerá as configurações salvas para esta loja.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction asChild>
                                            <Button variant="destructive" onClick={() => disconnectApp(app.id)}>Excluir</Button>
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                }
              />
            </Routes>
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
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Nome da Loja</label>
              <Input
                placeholder="Digite o nome da loja"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Obrigatório. Será exibido no card de apps conectados.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={connectApp} disabled={!storeName.trim()}>Conectar Agora</Button>
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

      <Dialog open={isCannotDisconnectOpen} onOpenChange={setIsCannotDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Não é possível desconectar</DialogTitle>
            <DialogDescription>
              {cannotDisconnectMessage || 'Existem reservas de estoque ativas vinculadas a anúncios deste aplicativo.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCannotDisconnectOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
