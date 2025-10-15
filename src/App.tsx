
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RestrictedRoute } from "@/components/RestrictedRoute";
import { Suspense, lazy } from "react";
const Index = lazy(() => import("./pages/Index"));
const Desempenho = lazy(() => import("./pages/Desempenho"));
const PesquisaMercado = lazy(() => import("./pages/PesquisaMercado"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Anuncios = lazy(() => import("./pages/Anuncios"));
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
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
                      <Anuncios />
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
                    <Suspense fallback={<div className="p-6">Carregando...</div>}>
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
