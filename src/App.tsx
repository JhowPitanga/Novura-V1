
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RestrictedRoute } from "@/components/RestrictedRoute";
import { Suspense, lazy } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AdminLoadingShell } from "@/components/admin/shell/AdminLoadingShell";
import { isAdminConsolePath } from "@/lib/adminConsole";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Performance = lazy(() => import("./pages/Performance"));
const MarketResearch = lazy(() => import("./pages/MarketResearch"));
const Products = lazy(() => import("./pages/Products"));
const Listings = lazy(() => import("./pages/Listings"));
const ShopeeFlashSaleCreate = lazy(() => import("./pages/ShopeeFlashSaleCreate"));
const ShopeeFlashSaleManage = lazy(() => import("./pages/ShopeeFlashSaleManage"));
const PromotionCreate = lazy(() => import("./pages/PromotionCreate"));
const PromotionManage = lazy(() => import("./pages/PromotionManage"));
const CreateListingML = lazy(() => import("./pages/CreateListingML"));
const EditListingML = lazy(() => import("./pages/EditListingML"));
const CreateListing = lazy(() => import("./pages/CreateListing"));
const EditListing = lazy(() => import("./pages/EditListing"));
const SellerResources = lazy(() => import("./pages/SellerResources"));
const Apps = lazy(() => import("./pages/Apps"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Orders = lazy(() => import("./pages/Orders"));
const Team = lazy(() => import("./pages/Team"));
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const NovuraAcademy = lazy(() => import("./pages/NovuraAcademy"));
import { AdminLayout } from "./pages/admin/AdminLayout";
const AdminOverview = lazy(() =>
  import("./pages/admin/AdminOverview").then((m) => ({ default: m.AdminOverview })),
);
const AdminOrganizations = lazy(() =>
  import("./pages/admin/AdminOrganizations").then((m) => ({ default: m.AdminOrganizations })),
);
const AdminFeatureFlagsPlans = lazy(() =>
  import("./pages/admin/AdminFeatureFlagsPlans").then((m) => ({ default: m.AdminFeatureFlagsPlans })),
);
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders").then((m) => ({ default: m.AdminOrders })));
const ProductDetailsPage = lazy(() => import("./pages/ProductDetailsPage"));
const Settings = lazy(() => import("./pages/Settings"));
const NewCompany = lazy(() => import("./pages/NewCompany"));
const CustomerService = lazy(() => import("./pages/CustomerService"));
const Community = lazy(() => import("./pages/Community"));
const Auth = lazy(() => import("./pages/Auth"));
const MercadoLivreCallback = lazy(() => import("./pages/MercadoLivreCallback"));
const ShopeeCallback = lazy(() => import("./pages/ShopeeCallback"));
const InviteAccepted = lazy(() => import("./pages/InviteAccepted"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AdminPageFallback = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-48" />
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
    <Skeleton className="h-64 rounded-lg" />
  </div>
);

// Fallback de carregamento para módulos protegidos mantendo o Sidebar fixo
const ModuleLoadingFallback = () => {
  const { pathname } = useLocation();

  if (isAdminConsolePath(pathname)) {
    return <AdminLoadingShell message="Carregando módulo..." />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 p-6 overflow-auto flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Carregando módulo...</p>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

const LegacyCompanyRouteRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/configuracoes/empresa${location.search || ""}`} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route
              path="/landing"
              element={
                <Suspense fallback={<div className="p-6">Carregando...</div>}>
                  <Landing />
                </Suspense>
              }
            />
            <Route
              path="/auth"
              element={
                <Suspense fallback={<div className="p-6">Carregando...</div>}>
                  <Auth />
                </Suspense>
              }
            />
            <Route
              path="/cadastro"
              element={
                <Suspense fallback={<div className="p-6">Carregando...</div>}>
                  <Auth />
                </Suspense>
              }
            />
            <Route
              path="/convite-aceito"
              element={
                <Suspense fallback={<div className="p-6">Carregando...</div>}>
                  <InviteAccepted />
                </Suspense>
              }
            />
            <Route
              path="/oauth/mercado-livre/callback"
              element={
                <Suspense fallback={<div className="p-6">Carregando...</div>}>
                  <MercadoLivreCallback />
                </Suspense>
              }
            />
            <Route
              path="/oauth/shopee/callback"
              element={
                <Suspense fallback={<div className="p-6">Carregando...</div>}>
                  <ShopeeCallback />
                </Suspense>
              }
            />
            {/* Protected dashboard routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <Dashboard />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/desempenho/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="desempenho" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Performance />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pesquisa-mercado"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="pesquisa_mercado" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <MarketResearch />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/produtos/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="produtos" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Products />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/promocoes/nova"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <PromotionCreate />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/promocoes/:promotionId"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <PromotionManage />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/promocoes/shopee/flash/nova"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <ShopeeFlashSaleCreate />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/promocoes/shopee/flash/:promotionId"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <ShopeeFlashSaleManage />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Listings />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/criar"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["create","publish","view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <CreateListing />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/criar/:marketplace"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["create","publish","view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <CreateListing />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/edicao/:itemId"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["edit","view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <EditListing />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recursos-seller/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="recursos_seller" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <SellerResources />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recursos-seller/produto/:id"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="recursos_seller" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <ProductDetailsPage />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/equipe/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="equipe" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Team />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/aplicativos/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="aplicativos" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Apps />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sac"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="sac" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <CustomerService />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="pedidos" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Orders />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/emissao_nfe"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="pedidos" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Orders />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/emissao_nfe/emitir"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="pedidos" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Orders />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/emissao_nfe/processando"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="pedidos" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Orders />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/emissao_nfe/falha_emissao"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="pedidos" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Orders />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/emissao_nfe/subir_xml"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="pedidos" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Orders />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/estoque"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="estoque" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Inventory />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/notas-fiscais/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="notas_fiscais" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Invoices />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="configuracoes" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Settings />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracoes/empresa"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="configuracoes" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <NewCompany />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracoes/notas-fiscais/nova-empresa"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="configuracoes" actions={["view"]}>
                    <LegacyCompanyRouteRedirect />
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/novura-academy/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="novura_academy" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <NovuraAcademy />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/novura-admin"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="novura_admin" actions={["view"]}>
                    <AdminLayout />
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <Suspense fallback={<AdminPageFallback />}>
                    <AdminOverview />
                  </Suspense>
                }
              />
              <Route
                path="organizacoes"
                element={
                  <Suspense fallback={<AdminPageFallback />}>
                    <AdminOrganizations />
                  </Suspense>
                }
              />
              <Route
                path="flags-planos"
                element={
                  <Suspense fallback={<AdminPageFallback />}>
                    <AdminFeatureFlagsPlans />
                  </Suspense>
                }
              />
              <Route
                path="status-engine"
                element={
                  <Suspense fallback={<AdminPageFallback />}>
                    <AdminOrders />
                  </Suspense>
                }
              />
              <Route path="pedidos" element={<Navigate to="/novura-admin/status-engine" replace />} />
              <Route path="features" element={<Navigate to="/novura-admin/flags-planos" replace />} />
              <Route path="modulos" element={<Navigate to="/novura-admin/flags-planos" replace />} />
              <Route path="planos" element={<Navigate to="/novura-admin/flags-planos" replace />} />
              <Route path="*" element={<Navigate to="/novura-admin" replace />} />
            </Route>
            <Route
              path="/comunidade/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="comunidade" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Community />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            {/* Catch-all route */}
            <Route
              path="*"
              element={
                <Suspense fallback={<div className="p-6">Carregando...</div>}>
                  <NotFound />
                </Suspense>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
