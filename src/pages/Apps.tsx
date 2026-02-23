import { useState, useEffect, useCallback } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Store, Settings } from "lucide-react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { CleanNavigation } from "@/components/CleanNavigation";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startMercadoLivreAuth, listenForMeliOAuthSuccess } from '@/WebhooksAPI/marketplace/mercado-livre';
import { startShopeeAuth, startShopeeAuthSandbox, listenForShopeeOAuthSuccess } from '@/WebhooksAPI/marketplace/shopee';
import type { App, AppConnection } from "@/types/apps";
import { AppCard } from "@/components/apps/AppCard";
import { ConnectedAppCard } from "@/components/apps/ConnectedAppCard";
import { ConnectDialog } from "@/components/apps/ConnectDialog";
import { CannotDisconnectDialog } from "@/components/apps/CannotDisconnectDialog";

const MELI_REDIRECT_URI = import.meta.env.VITE_MERCADO_LIVRE_REDIRECT_URI as string | undefined;
const SHOPEE_REDIRECT_URI = import.meta.env.VITE_SHOPEE_REDIRECT_URI as string | undefined;
const SHOPEE_REDIRECT_FALLBACK = 'https://www.novuraerp.com.br/oauth/shopee/callback';

const navigationItems = [
    { title: "Loja de Apps", path: "", description: "Explore e conecte aplicativos" },
    { title: "Conectados", path: "/conectados", description: "Aplicativos integrados" },
];

const categories = [
    { id: "all", name: "Todos", icon: Settings },
    { id: "marketplaces", name: "Marketplaces", icon: Store },
];

type AppViewRow = {
    id: string; name: string; description: string;
    logo_url: string; category: string; price_type: string;
};

const allowedCategories = ['marketplaces', 'logistics', 'dropshipping', 'others'] as const;

function mapAppRow(row: AppViewRow): App {
    const category = allowedCategories.includes(row.category as (typeof allowedCategories)[number])
        ? row.category as App['category']
        : 'others';
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        logo: row.logo_url,
        category,
        isConnected: false,
        price: row.price_type === 'free' ? 'free' : 'paid',
    };
}

export default function Aplicativos() {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [connectedFilter] = useState("all");
    const [selectedApp, setSelectedApp] = useState<App | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [storeName, setStoreName] = useState("");
    const [appConnections, setAppConnections] = useState<Record<string, AppConnection>>({});
    const [apps, setApps] = useState<App[]>([]);
    const [loadingApps, setLoadingApps] = useState<boolean>(true);
    const [appsError, setAppsError] = useState<string | null>(null);
    const [isCannotDisconnectOpen, setIsCannotDisconnectOpen] = useState(false);
    const [cannotDisconnectMessage, setCannotDisconnectMessage] = useState('');
    const { toast } = useToast();
    const { user, organizationId, permissions, userRole } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const isLojaRoute = location.pathname === '/aplicativos' || location.pathname === '/aplicativos/';
    const isConectadosRoute = location.pathname.startsWith('/aplicativos/conectados');
    const canAccess = (() => {
        if (userRole === 'owner') return true;
        const mod = (permissions as any)?.aplicativos;
        if (!mod) return false;
        if (typeof mod === 'object' && mod !== null) return Boolean((mod as any).view);
        return false;
    })();

    useEffect(() => {
        if (!isLojaRoute || !canAccess) return;
        let isMounted = true;
        const loadApps = async () => {
            setLoadingApps(true);
            setAppsError(null);
            try {
                const { data, error } = await supabase.from('apps_public_view').select('*').order('name');
                if (error) throw error;
                if (isMounted && Array.isArray(data)) {
                    setApps((data as AppViewRow[]).map(mapAppRow));
                }
            } catch (err) {
                if (isMounted) {
                    setApps([]);
                    setAppsError(err instanceof Error ? err.message : 'Não foi possível carregar o catálogo de apps.');
                }
            } finally {
                if (isMounted) setLoadingApps(false);
            }
        };
        loadApps();
        return () => { isMounted = false; };
    }, [isLojaRoute, canAccess]);

    const filteredApps = apps.filter(app => {
        const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            app.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === "all" || app.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const toDbMarketplaceName = (name: string) => name === 'Mercado Livre' ? 'Mercado Livre' : name;

    const loadConnections = useCallback(async () => {
        try {
            if (!organizationId) return;
            const { data, error } = await supabase
                .from('marketplace_integrations')
                .select('id, marketplace_name, config, expires_in')
                .eq('organizations_id', organizationId);
            if (error) throw error;

            type IntegrationRow = { marketplace_name: string; config?: { storeName?: string; connectedAt?: string }; expires_in?: number | string };
            const rows = ((data as IntegrationRow[]) || []);
            const normalize = (n: string) => n.toLowerCase().replace(/[_\s-]+/g, '');
            const toDisplayName = (name: string) => {
                const canon = name.toLowerCase().replace(/[_\s-]+/g, '_');
                if (canon === 'mercado_livre' || canon === 'meli') return 'Mercado Livre';
                if (canon === 'shopee') return 'Shopee';
                if (canon === 'amazon') return 'Amazon';
                return name.replace(/[_-]+/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            };

            let catalog = Array.isArray(apps) ? [...apps] : [];
            if (!catalog || catalog.length === 0) {
                const names = Array.from(new Set(rows.map(r => toDisplayName(r.marketplace_name))));
                if (names.length > 0) {
                    const { data: appRows } = await supabase.from('apps_public_view').select('*');
                    catalog = ((appRows as AppViewRow[]) || []).map(mapAppRow);
                }
            }

            const nextConnections: Record<string, AppConnection> = {};
            rows.forEach((row) => {
                let match = catalog.find(a => {
                    const an = normalize(a.name);
                    const mn = normalize(row.marketplace_name);
                    return an === mn || an.includes(mn) || mn.includes(an);
                });
                if (!match) {
                    const syntheticId = `integration:${normalize(row.marketplace_name)}`;
                    if (!catalog.find(a => a.id === syntheticId)) {
                        catalog.push({ id: syntheticId, name: toDisplayName(row.marketplace_name), description: 'Integração conectada', logo: '', category: 'marketplaces', isConnected: true, price: 'free' });
                    }
                    match = catalog.find(a => a.id === syntheticId) || null;
                    if (!match) return;
                }

                const rawExp = row.expires_in;
                let expiresAtDate: Date;
                if (typeof rawExp === 'string' && rawExp.trim()) {
                    const d = new Date(rawExp);
                    expiresAtDate = Number.isFinite(d.getTime()) ? d : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                } else if (typeof rawExp === 'number' && Number.isFinite(rawExp)) {
                    expiresAtDate = new Date(Date.now() + rawExp * 1000);
                } else {
                    expiresAtDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                }
                const now = new Date();
                const daysLeft = Math.ceil((expiresAtDate.getTime() - now.getTime()) / 86400000);
                const status: AppConnection['status'] = expiresAtDate <= now ? 'inactive' : daysLeft <= 7 ? 'reconnect' : 'active';

                const candidate: AppConnection = {
                    appId: match.id,
                    storeName: (row as any)?.config?.shop_name || (row as any)?.config?.storeName || 'Minha Loja',
                    status,
                    authenticatedAt: (row as any)?.config?.connectedAt || (row as any)?.config?.connected_at || new Date().toISOString(),
                    expiresAt: expiresAtDate.toISOString(),
                };
                const existing = nextConnections[match.id];
                if (!existing || new Date(existing.expiresAt) < expiresAtDate) {
                    nextConnections[match.id] = candidate;
                }
            });

            setAppConnections(nextConnections);
            setApps(catalog.map(app => ({ ...app, isConnected: !!nextConnections[app.id] && nextConnections[app.id].status !== 'inactive' })));
        } catch (e) {
            console.error('Falha ao carregar integrações', e);
        }
    }, [organizationId, apps]);

    useEffect(() => {
        if (!canAccess) return;
        if (isConectadosRoute && organizationId) loadConnections();
    }, [isConectadosRoute, organizationId, canAccess]);

    const connectedApps = apps.filter(app => {
        const conn = appConnections[app.id];
        const isActive = !!conn && conn.status !== 'inactive';
        const matchesFilter = connectedFilter === "all" || (connectedFilter === "connected" && isActive) || (connectedFilter === "disconnected" && !conn);
        const matchesCategory = selectedCategory === "all" || app.category === selectedCategory;
        return !!conn && matchesFilter && matchesCategory;
    });

    const handleConnect = (app: App) => { setSelectedApp(app); setIsDialogOpen(true); };

    const connectApp = async () => {
        try {
            if (!selectedApp) { toast({ title: 'Seleção ausente', description: 'Nenhum aplicativo selecionado para conexão.', variant: 'destructive' }); return; }
            if (!organizationId) { toast({ title: 'Sessão necessária', description: 'Entre na sua conta para conectar aplicativos.', variant: 'destructive' }); navigate('/auth'); return; }
            const trimmedStoreName = storeName.trim();
            if (!trimmedStoreName) { toast({ title: 'Nome da loja obrigatório', description: 'Informe o nome da loja para continuar.' }); return; }

            const appNameCanon = selectedApp.name.toLowerCase().replace(/[_\s-]+/g, '');
            const onSuccess = () => {
                setIsDialogOpen(false);
                setStoreName('');
                setAppConnections(prev => ({
                    ...prev,
                    [selectedApp.id]: { appId: selectedApp.id, storeName: trimmedStoreName, status: 'active', authenticatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
                }));
                setApps(prev => prev.map(a => a.id === selectedApp.id ? { ...a, isConnected: true } : a));
                toast({ title: 'Conexão concluída', description: `${selectedApp.name} foi conectado com sucesso.` });
                navigate('/aplicativos/conectados');
            };

            if (appNameCanon === 'shopee' || (appNameCanon.includes('shopee') && (appNameCanon.includes('sandbox') || appNameCanon.includes('sanbox')))) {
                const isSandbox = appNameCanon.includes('sandbox') || appNameCanon.includes('sanbox');
                const authFn = isSandbox ? startShopeeAuthSandbox : startShopeeAuth;
                const { authorization_url } = await authFn(supabase, { organizationId, storeName: trimmedStoreName, connectedByUserId: user?.id || null, redirectUri: SHOPEE_REDIRECT_URI || SHOPEE_REDIRECT_FALLBACK });
                try { localStorage.setItem('shopee_auth_env', isSandbox ? 'sandbox' : 'prod'); } catch (_) {}
                const popup = window.open(authorization_url, 'shopee_auth', 'width=960,height=800,menubar=no,toolbar=no');
                if (!popup) { toast({ title: 'Janela bloqueada', description: 'Permita pop-ups no navegador para continuar.' }); return; }
                const unsubscribe = listenForShopeeOAuthSuccess((_payload) => {
                    try { onSuccess(); } finally {
                        unsubscribe();
                        if (isSandbox) { try { localStorage.removeItem('shopee_auth_env'); } catch (_) {} }
                        popup.close?.();
                    }
                });
            } else {
                const { authorization_url } = await startMercadoLivreAuth(supabase, { organizationId, storeName: trimmedStoreName, marketplaceName: selectedApp.name, connectedByUserId: user?.id || null, redirectUri: MELI_REDIRECT_URI || undefined });
                const popup = window.open(authorization_url, 'meli_auth', 'width=960,height=800,menubar=no,toolbar=no');
                if (!popup) { toast({ title: 'Janela bloqueada', description: 'Permita pop-ups no navegador para continuar.' }); return; }
                const unsubscribe = listenForMeliOAuthSuccess((_payload) => {
                    try { onSuccess(); } finally { unsubscribe(); popup.close?.(); }
                });
            }
        } catch (e) {
            console.error('Erro inesperado ao conectar app:', e);
            toast({ title: 'Erro inesperado', description: 'Ocorreu um erro ao conectar o aplicativo.', variant: 'destructive' });
        }
    };

    const disconnectApp = async (appId: string) => {
        try {
            if (!organizationId) { toast({ title: 'Sessão necessária', description: 'Entre na sua conta para desconectar aplicativos.', variant: 'destructive' }); navigate('/auth'); return; }
            const app = apps.find(a => a.id === appId);
            if (!app) return;
            const { error: rpcErr } = await supabase.rpc('disconnect_marketplace_cascade', { p_organizations_id: organizationId, p_marketplace_name: toDbMarketplaceName(app.name) });
            if (rpcErr) {
                const msg = String(rpcErr?.message || '').toLowerCase();
                if (msg.includes('reserved_stock_present')) { setCannotDisconnectMessage('Não é possível desconectar. Existem reservas de estoque ativas vinculadas a anúncios deste aplicativo.'); setIsCannotDisconnectOpen(true); return; }
                const { data: deletedRows, error } = await supabase.from('marketplace_integrations').delete().eq('organizations_id', organizationId).or(`marketplace_name.eq.${toDbMarketplaceName(app.name)},marketplace_name.eq.${app.name}`).select('id');
                if (error || !deletedRows || deletedRows.length === 0) { toast({ title: 'Falha ao desconectar', description: 'Não foi possível remover a conexão.', variant: 'destructive' }); return; }
            }
            setAppConnections(prev => { const next = { ...prev }; delete next[appId]; return next; });
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
        if (!conn) return { conn, status: 'inactive' as const, color: 'bg-red-500' };
        const exp = new Date(conn.expiresAt);
        const now = new Date();
        if (exp < now) return { conn, status: 'inactive' as const, color: 'bg-red-500' };
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
        if (daysLeft <= 7) return { conn, status: 'reconnect' as const, color: 'bg-yellow-500' };
        return { conn, status: 'active' as const, color: 'bg-green-500' };
    };

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-gray-50">
                <AppSidebar disableChat />
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />
                    <main className="flex-1 p-6 overflow-auto">
                        <CleanNavigation items={navigationItems} basePath="/aplicativos" />
                        <Routes>
                            <Route path="/" element={
                                <>
                                    <div className="relative max-w-md">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                        <Input placeholder="Buscar aplicativos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                                    </div>
                                    <div className="flex space-x-2 overflow-x-auto pb-2 mt-6">
                                        {categories.map((category) => (
                                            <Button key={category.id} variant={selectedCategory === category.id ? "default" : "outline"} onClick={() => setSelectedCategory(category.id)} className="flex items-center space-x-2 whitespace-nowrap" size="sm">
                                                <category.icon className="w-4 h-4" />
                                                <span>{category.name}</span>
                                            </Button>
                                        ))}
                                    </div>
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
                                            {filteredApps.map((app) => <AppCard key={app.id} app={app} onConnect={handleConnect} />)}
                                        </div>
                                    )}
                                </>
                            } />
                            <Route path="/conectados" element={
                                connectedApps.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Settings className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <p className="text-gray-500">Nenhum aplicativo conectado ainda</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                                        {connectedApps.map((app) => {
                                            const { conn, status, color } = getConnectionInfo(app);
                                            return <ConnectedAppCard key={app.id} app={app} conn={conn} status={status} color={color} onDisconnect={disconnectApp} />;
                                        })}
                                    </div>
                                )
                            } />
                        </Routes>
                    </main>
                </div>
            </div>

            <ConnectDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                appName={selectedApp?.name}
                storeName={storeName}
                onStoreNameChange={setStoreName}
                onConnect={connectApp}
            />
            <CannotDisconnectDialog
                open={isCannotDisconnectOpen}
                onOpenChange={setIsCannotDisconnectOpen}
                message={cannotDisconnectMessage}
            />
        </SidebarProvider>
    );
}
