import { useState, useCallback, useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Store, Settings, AlertTriangle, Loader2 } from "lucide-react";
import { Routes, Route, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { CleanNavigation } from "@/components/CleanNavigation";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import type { App, AppConnection } from "@/types/apps";
import { AppCard } from "@/components/apps/AppCard";
import { ConnectedAppCard } from "@/components/apps/ConnectedAppCard";
import { CannotDisconnectDialog } from "@/components/apps/CannotDisconnectDialog";
import { StoreNameDialog } from "@/components/apps/StoreNameDialog";
import { QuickSetupModal } from "@/components/apps/QuickSetupModal";
import { useAppsWithProvider } from "@/hooks/useMarketplaceProviders";
import { useIntegrations } from "@/hooks/useIntegrations";
import type { OAuthSuccessPayload } from "@/WebhooksAPI/marketplace/oauth";
import type { AppWithProvider } from "@/services/marketplace-providers.service";
import { integrationKeys as intKeys } from "@/services/marketplace-providers.service";

const navigationItems = [
  { title: "Loja de Apps", path: "", description: "Explore e conecte aplicativos" },
  { title: "Conectados", path: "/conectados", description: "Aplicativos integrados" },
];

const STATIC_CATEGORIES = [
  { id: "all", name: "Todos", icon: Settings },
  { id: "marketplaces", name: "Marketplaces", icon: Store },
];

const MELI_REDIRECT_URI = import.meta.env.VITE_MERCADO_LIVRE_REDIRECT_URI as string | undefined;
const SHOPEE_REDIRECT_URI = import.meta.env.VITE_SHOPEE_REDIRECT_URI as string | undefined;
const SHOPEE_REDIRECT_FALLBACK = "https://www.novuraerp.com.br/oauth/shopee/callback";

const allowedCategories = ["marketplaces", "logistics", "dropshipping", "others"] as const;

function mapAppRow(row: AppWithProvider): App {
  const category = allowedCategories.includes(
    (row.category ?? "others") as (typeof allowedCategories)[number],
  )
    ? (row.category as App["category"])
    : "others";
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    description: row.description ?? "",
    logo: row.logo_url ?? "",
    category,
    isConnected: false,
    price: row.price_type === "free" ? "free" : "paid",
    providerKey: row.provider_key ?? null,
    providerDisplayName: row.name ?? null,
  };
}

export default function Aplicativos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Connection dialog state
  const [storeNameDialogOpen, setStoreNameDialogOpen] = useState(false);
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);
  const [connectingApp, setConnectingApp] = useState<App | null>(null);
  const [pendingIntegration, setPendingIntegration] = useState<OAuthSuccessPayload | null>(null);

  // Disconnect state
  const [isCannotDisconnectOpen, setIsCannotDisconnectOpen] = useState(false);
  const [cannotDisconnectMessage, setCannotDisconnectMessage] = useState("");

  const { toast } = useToast();
  const { organizationId, permissions, userRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const isLojaRoute =
    location.pathname === "/aplicativos" || location.pathname === "/aplicativos/";

  const canAccess = (() => {
    if (userRole === "owner") return true;
    const mod = (permissions as Record<string, unknown>)?.aplicativos;
    if (!mod) return false;
    if (typeof mod === "object" && mod !== null)
      return Boolean((mod as Record<string, unknown>).view);
    return false;
  })();

  // Data from React Query
  const { data: appRows = [], isLoading: loadingApps } = useAppsWithProvider();
  const { data: integrations = [], isLoading: loadingIntegrations } = useIntegrations();

  // Build app list + connection status
  const apps: App[] = appRows.map((row) => {
    const mappedApp = mapAppRow(row);
    const integration = integrations.find(
      (i) => i.provider_id === row.provider_id && i.organizations_id === organizationId,
    );
    return {
      ...mappedApp,
      isConnected: Boolean(integration && integration.status === "active"),
    };
  });

  // Build appConnections map (appId → connection info)
  const appConnections: Record<string, AppConnection> = {};
  integrations.forEach((integration) => {
    const matchedApp = apps.find(
      (a) => a.providerKey && integration.provider_id &&
        appRows.find(r => r.provider_id === integration.provider_id && r.id === a.id),
    );
    if (!matchedApp) return;
    const expiresAt = integration.expires_at
      ? new Date(integration.expires_at)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000);
    const status: AppConnection["status"] =
      expiresAt <= now
        ? "inactive"
        : daysLeft <= 7
        ? "reconnect"
        : integration.status === "active"
        ? "active"
        : "inactive";

    const existing = appConnections[matchedApp.id];
    const candidate: AppConnection = {
      appId: matchedApp.id,
      storeName:
        integration.store_name ??
        (integration.config as Record<string, unknown>)?.storeName as string ??
        "Minha Loja",
      status,
      authenticatedAt:
        integration.connected_at ?? new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      integrationId: integration.id,
      setupStatus: integration.setup_status as "pending" | "completed",
    };
    if (!existing || new Date(existing.expiresAt) < expiresAt) {
      appConnections[matchedApp.id] = candidate;
    }
  });

  // Check for pending setup from NewCompany.tsx returnToApp flow
  const [returningIntegration] = useState<{ integrationId: string; providerKey: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem("novura:pending_setup");
      if (raw) {
        sessionStorage.removeItem("novura:pending_setup");
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    return null;
  });

  // When returning from /empresas/nova, open QuickSetupModal once apps have loaded
  useEffect(() => {
    if (!returningIntegration || !searchParams.get("company") || apps.length === 0) return;
    setPendingIntegration({
      integrationId: returningIntegration.integrationId,
      providerKey: returningIntegration.providerKey,
      externalAccountId: "",
      ok: true,
    });
    const app = apps.find((a) => a.providerKey === returningIntegration.providerKey);
    setConnectingApp(app ?? null);
    setQuickSetupOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps.length]);

  // Dynamic categories from provider data
  const providerCategories = Array.from(
    new Set(appRows.map((r) => r.provider_category ?? r.category ?? "others")),
  );
  const categories = [
    ...STATIC_CATEGORIES,
    ...providerCategories
      .filter((c) => !STATIC_CATEGORIES.find((sc) => sc.id === c))
      .map((c) => ({
        id: c,
        name: c.charAt(0).toUpperCase() + c.slice(1),
        icon: Store,
      })),
  ];

  const filteredApps = apps.filter((app) => {
    const matchesSearch =
      app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.description ?? "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const connectedApps = apps.filter((app) => appConnections[app.id]);

  // Integrations pending setup (orphans)
  const pendingSetupIntegrations = integrations.filter(
    (i) => i.setup_status === "pending" && i.status === "active" && !i.deactivated_at,
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleConnect = (app: App) => {
    if (!app.providerKey) {
      toast({
        title: "Integração não suportada",
        description: "Este aplicativo ainda não suporta o fluxo universal de conexão.",
        variant: "destructive",
      });
      return;
    }
    setConnectingApp(app);
    setStoreNameDialogOpen(true);
  };

  const handleOAuthSuccess = (payload: OAuthSuccessPayload) => {
    setPendingIntegration(payload);
    setQuickSetupOpen(true);
  };

  const handleQuickSetupClose = useCallback(
    (open: boolean) => {
      setQuickSetupOpen(open);
      if (!open) {
        setPendingIntegration(null);
        // Invalidate integrations to refresh connected apps list
        queryClient.invalidateQueries({
          queryKey: intKeys.list(organizationId ?? ""),
        });
        navigate("/aplicativos/conectados");
      }
    },
    [navigate, organizationId, queryClient],
  );

  const handleFinalizeOrphan = (integrationId: string, providerKey: string) => {
    const app = apps.find((a) => a.providerKey === providerKey);
    setConnectingApp(app ?? null);
    setPendingIntegration({
      integrationId,
      providerKey,
      externalAccountId: "",
      ok: true,
    });
    setQuickSetupOpen(true);
  };

  const disconnectApp = async (appId: string) => {
    if (!organizationId) {
      navigate("/auth");
      return;
    }
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    const providerKey = app.providerKey;
    try {
      if (providerKey) {
        const { error } = await supabase.rpc("disconnect_marketplace_by_provider", {
          p_organizations_id: organizationId,
          p_provider_key: providerKey,
        });
        if (error) {
          const msg = String(error?.message ?? "").toLowerCase();
          if (msg.includes("reserved_stock_present")) {
            setCannotDisconnectMessage(
              "Não é possível desconectar. Existem reservas de estoque ativas vinculadas a anúncios deste aplicativo.",
            );
            setIsCannotDisconnectOpen(true);
            return;
          }
          throw error;
        }
      } else {
        await supabase.rpc("disconnect_marketplace_cascade", {
          p_organizations_id: organizationId,
          p_marketplace_name: app.name,
        });
      }
      queryClient.invalidateQueries({ queryKey: intKeys.list(organizationId) });
      toast({
        title: "Aplicativo desconectado",
        description: `${app.name} foi removido da sua organização.`,
      });
    } catch (e) {
      toast({
        title: "Erro ao desconectar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const getConnectionInfo = (app: App) => {
    const conn = appConnections[app.id];
    if (!conn) return { conn: undefined, status: "inactive" as const, color: "bg-red-500" };
    const exp = new Date(conn.expiresAt);
    const now = new Date();
    if (exp < now) return { conn, status: "inactive" as const, color: "bg-red-500" };
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
    if (daysLeft <= 7) return { conn, status: "reconnect" as const, color: "bg-yellow-500" };
    return { conn, status: "active" as const, color: "bg-green-500" };
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar disableChat />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 p-6 overflow-auto">
            <CleanNavigation items={navigationItems} basePath="/aplicativos" />

            <Routes>
              {/* App Store */}
              <Route
                path="/"
                element={
                  <>
                    <div className="relative max-w-md">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="Buscar aplicativos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    {/* Dynamic category chips */}
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

                    {loadingApps ? (
                      <div className="flex items-center gap-2 mt-6 text-sm text-gray-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando catálogo...
                      </div>
                    ) : filteredApps.length === 0 ? (
                      <div className="mt-6 text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Settings className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-500">Nenhum app encontrado</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                        {filteredApps.map((app) => (
                          <AppCard key={app.id} app={app} onConnect={handleConnect} />
                        ))}
                      </div>
                    )}
                  </>
                }
              />

              {/* Connected Apps */}
              <Route
                path="/conectados"
                element={
                  <>
                    {/* Orphan integration alerts */}
                    {pendingSetupIntegrations.length > 0 && (
                      <div className="mb-6 space-y-2">
                        {pendingSetupIntegrations.map((integration) => {
                          const provKey = (integration as Record<string, unknown>)?.marketplace_providers
                            ? (integration as any).marketplace_providers?.key
                            : null;
                          return (
                            <div
                              key={integration.id}
                              className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3"
                            >
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-amber-900">
                                    Integração pendente de configuração
                                  </p>
                                  <p className="text-xs text-amber-700">
                                    {integration.store_name ?? integration.marketplace_name} — configure a empresa e o armazém.
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-amber-400 text-amber-800 hover:bg-amber-100"
                                onClick={() => handleFinalizeOrphan(integration.id, provKey ?? "")}
                              >
                                Finalizar configuração
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {loadingIntegrations ? (
                      <div className="flex items-center gap-2 mt-6 text-sm text-gray-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando integrações...
                      </div>
                    ) : connectedApps.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Settings className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-500">Nenhum aplicativo conectado ainda</p>
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() => navigate("/aplicativos")}
                        >
                          Ver catálogo de apps
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                        {connectedApps.map((app) => {
                          const { conn, status, color } = getConnectionInfo(app);
                          return (
                            <ConnectedAppCard
                              key={app.id}
                              app={app}
                              conn={conn}
                              status={status}
                              color={color}
                              onDisconnect={disconnectApp}
                              integrationId={conn?.integrationId ?? null}
                              organizationId={organizationId}
                            />
                          );
                        })}
                      </div>
                    )}
                  </>
                }
              />
            </Routes>
          </main>
        </div>
      </div>

      {/* Step 1: Store name + OAuth popup */}
      {connectingApp && (
        <StoreNameDialog
          open={storeNameDialogOpen}
          onOpenChange={setStoreNameDialogOpen}
          providerKey={connectingApp.providerKey ?? ""}
          providerDisplayName={connectingApp.providerDisplayName ?? connectingApp.name}
          redirectUri={
            connectingApp.providerKey === "shopee"
              ? (SHOPEE_REDIRECT_URI || SHOPEE_REDIRECT_FALLBACK)
              : connectingApp.providerKey === "mercado_livre"
              ? MELI_REDIRECT_URI
              : undefined
          }
          onSuccess={handleOAuthSuccess}
        />
      )}

      {/* Step 2: Company + Warehouse quick setup */}
      {pendingIntegration && (
        <QuickSetupModal
          open={quickSetupOpen}
          onOpenChange={handleQuickSetupClose}
          integrationId={pendingIntegration.integrationId}
          providerKey={pendingIntegration.providerKey}
          providerDisplayName={
            connectingApp?.providerDisplayName ??
            connectingApp?.name ??
            pendingIntegration.providerKey
          }
          defaultCompanyId={searchParams.get("company") ?? undefined}
          initialTab="company"
        />
      )}

      <CannotDisconnectDialog
        open={isCannotDisconnectOpen}
        onOpenChange={setIsCannotDisconnectOpen}
        message={cannotDisconnectMessage}
      />
    </SidebarProvider>
  );
}
