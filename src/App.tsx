
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
const Index = lazy(() => import("./pages/Index"));
const Desempenho = lazy(() => import("./pages/Desempenho"));
const PesquisaMercado = lazy(() => import("./pages/PesquisaMercado"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Anuncios = lazy(() => import("./pages/Anuncios"));
const AnunciosCriarML = lazy(() => import("./pages/AnunciosCriarML"));
const AnunciosEditarML = lazy(() => import("./pages/AnunciosEditarML"));
const RecursosSeller = lazy(() => import("./pages/RecursosSeller"));
const Aplicativos = lazy(() => import("./pages/Aplicativos"));
const Estoque = lazy(() => import("./pages/Estoque"));
const NotasFiscais = lazy(() => import("./pages/NotasFiscais"));
const Pedidos = lazy(() => import("./pages/Pedidos"));
const Equipe = lazy(() => import("./pages/Equipe"));
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const NotFound = lazy(() => import("./pages/NotFound"));
const NovuraAcademy = lazy(() => import("./pages/NovuraAcademy"));
const ProductDetailsPage = lazy(() => import("./pages/ProductDetailsPage"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const NovaEmpresa = lazy(() => import("./pages/NovaEmpresa"));
const SAC = lazy(() => import("./pages/SAC"));
const Comunidade = lazy(() => import("./pages/Comunidade"));
const Auth = lazy(() => import("./pages/Auth"));
const MercadoLivreCallback = lazy(() => import("./pages/MercadoLivreCallback"));
const ConviteAceito = lazy(() => import("./pages/ConviteAceito"));

const queryClient = new QueryClient();

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
              path="/convite-aceito"
              element={
                <Suspense fallback={<div className="p-6">Carregando...</div>}>
                  <ConviteAceito />
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
            {/* Protected dashboard routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <Index />
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
                      <Desempenho />
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
                      <PesquisaMercado />
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
                      <Produtos />
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
                      <Anuncios />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/criar/ml"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="anuncios" actions={["create","publish","view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <AnunciosCriarML />
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
                      <AnunciosEditarML />
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
                      <RecursosSeller />
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
                      <Equipe />
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
                      <Aplicativos />
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
                      <SAC />
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
                      <Pedidos />
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
                      <Estoque />
                    </Suspense>
                  </RestrictedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/notas-fiscais"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="notas_fiscais" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <NotasFiscais />
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
                      <Configuracoes />
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
                      <NovaEmpresa />
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
              path="/comunidade/*"
              element={
                <ProtectedRoute>
                  <RestrictedRoute module="comunidade" actions={["view"]}>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <Comunidade />
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
