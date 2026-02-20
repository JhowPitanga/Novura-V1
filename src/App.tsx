
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RestrictedRoute } from "@/components/RestrictedRoute";
import { Suspense, lazy } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Loader2 } from "lucide-react";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Performance = lazy(() => import("./pages/Performance"));
const MarketResearch = lazy(() => import("./pages/MarketResearch"));
const Products = lazy(() => import("./pages/Products"));
const Listings = lazy(() => import("./pages/Listings"));
const CreateListingML = lazy(() => import("./pages/CreateListingML"));
const EditListingML = lazy(() => import("./pages/EditListingML"));
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
const NovuraAdmin = lazy(() => import("./pages/NovuraAdmin"));
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

// Fallback de carregamento para módulos protegidos mantendo o Sidebar fixo
const ModuleLoadingFallback = () => (
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
                      <CreateListingML />
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
                      <CreateListingML />
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
                      <EditListingML />
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
              path="/configuracoes/notas-fiscais/nova-empresa"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="notas_fiscais" actions={["create","edit","view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <NewCompany />
                    </Suspense>
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
              path="/novura-admin/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="novura_admin" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <NovuraAdmin />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
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
