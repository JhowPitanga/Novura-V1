
import { Routes, Route, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CriarProduto } from "@/components/produtos/CriarProduto";
import { EditarProduto } from "@/components/produtos/EditarProduto";
import { EditarVariacao } from "@/components/produtos/EditarVariacao";
import { EditarKit } from "@/components/produtos/EditarKit";
import { ProdutosHeader } from "@/components/produtos/ProdutosHeader";
import { ProdutosUnicos } from "@/components/produtos/tabs/ProdutosUnicos";
import { ProdutosVariacoes } from "@/components/produtos/tabs/ProdutosVariacoes";
import { ProdutosKits } from "@/components/produtos/tabs/ProdutosKits";

const navigationItems = [
  { title: "Únicos", path: "", description: "Produtos únicos" },
  { title: "Variações", path: "/variacoes", description: "Produtos com variações" },
  { title: "Kits", path: "/kits", description: "Kits e combos" },
];

export default function Produtos() {
  const location = useLocation();
  
  // Check if we're on create or edit pages
  const isCreateOrEditPage = location.pathname.includes('/criar') || location.pathname.includes('/editar');

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <ProdutosHeader />

          {/* Navigation - Only show on main listing pages */}
          {!isCreateOrEditPage && (
            <CleanNavigation items={navigationItems} basePath="/produtos" />
          )}
          
          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="p-6">
              {/* Header - Only show on main listing pages */}
              {!isCreateOrEditPage && (
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Gestão de Produtos</h1>
                    <p className="text-gray-600">Gerencie seus produtos de forma inteligente</p>
                  </div>
                  <Button className="bg-novura-primary hover:bg-novura-primary/90" asChild>
                    <a href="/produtos/criar">
                      <Plus className="w-4 h-4 mr-2" />
                      Novo Produto
                    </a>
                  </Button>
                </div>
              )}

              {/* Routes */}
              <Routes>
                <Route path="/" element={<ProdutosUnicos />} />
                <Route path="/variacoes" element={<ProdutosVariacoes />} />
                <Route path="/kits" element={<ProdutosKits />} />
                <Route path="/criar" element={<CriarProduto />} />
                <Route path="/editar/:id" element={<EditarProduto />} />
                <Route path="/editar-variacao/:id" element={<EditarVariacao />} />
                <Route path="/editar-kit/:id" element={<EditarKit />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
