
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Desempenho />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pesquisa-mercado"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <PesquisaMercado />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/produtos/*"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Produtos />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/anuncios/*"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Anuncios />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recursos-seller/*"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <RecursosSeller />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recursos-seller/produto/:id"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <ProductDetailsPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/equipe/*"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Equipe />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/aplicativos/*"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Aplicativos />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sac"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <SAC />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Pedidos />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/estoque"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Estoque />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/notas-fiscais"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <NotasFiscais />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Configuracoes />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracoes/notas-fiscais/nova-empresa"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <NovaEmpresa />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/novura-academy/*"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <NovuraAcademy />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/comunidade/*"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div className="p-6">Carregando...</div>}>
                    <Comunidade />
                  </Suspense>
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
