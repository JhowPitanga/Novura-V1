
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Desempenho from "./pages/Desempenho";
import PesquisaMercado from "./pages/PesquisaMercado";
import Produtos from "./pages/Produtos";
import Anuncios from "./pages/Anuncios";
import RecursosSeller from "./pages/RecursosSeller";
import Aplicativos from "./pages/Aplicativos";
import Estoque from "./pages/Estoque";
import NotasFiscais from "./pages/NotasFiscais";
import Pedidos from "./pages/Pedidos";
import Equipe from "./pages/Equipe";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import NotFound from "./pages/NotFound";
import NovuraAcademy from "./pages/NovuraAcademy";
import ProductDetailsPage from "./pages/ProductDetailsPage";

import Configuracoes from "./pages/Configuracoes";
import { NovaEmpresa } from "./pages/NovaEmpresa";
import SAC from "./pages/SAC";
import Comunidade from "./pages/Comunidade";
import Auth from "./pages/Auth";

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
            <Route path="/landing" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Protected dashboard routes */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/desempenho/*" element={<ProtectedRoute><Desempenho /></ProtectedRoute>} />
            <Route path="/pesquisa-mercado" element={<ProtectedRoute><PesquisaMercado /></ProtectedRoute>} />
            <Route path="/produtos/*" element={<ProtectedRoute><Produtos /></ProtectedRoute>} />
            <Route path="/anuncios/*" element={<ProtectedRoute><Anuncios /></ProtectedRoute>} />
            <Route path="/recursos-seller/*" element={<ProtectedRoute><RecursosSeller /></ProtectedRoute>} />
            <Route path="/recursos-seller/produto/:id" element={<ProtectedRoute><ProductDetailsPage /></ProtectedRoute>} />
            <Route path="/equipe/*" element={<ProtectedRoute><Equipe /></ProtectedRoute>} />
            <Route path="/aplicativos" element={<ProtectedRoute><Aplicativos /></ProtectedRoute>} />
            <Route path="/sac" element={<ProtectedRoute><SAC /></ProtectedRoute>} />
            <Route path="/pedidos" element={<ProtectedRoute><Pedidos /></ProtectedRoute>} />
            <Route path="/estoque" element={<ProtectedRoute><Estoque /></ProtectedRoute>} />
            <Route path="/notas-fiscais" element={<ProtectedRoute><NotasFiscais /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
            <Route path="/configuracoes/notas-fiscais/nova-empresa" element={<ProtectedRoute><NovaEmpresa /></ProtectedRoute>} />
            <Route path="/novura-academy/*" element={<ProtectedRoute><NovuraAcademy /></ProtectedRoute>} />
            <Route path="/comunidade/*" element={<ProtectedRoute><Comunidade /></ProtectedRoute>} />
            
            {/* Catch-all route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
