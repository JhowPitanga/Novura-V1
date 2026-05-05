
import { Routes, Route, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { CreateProductPage as CriarProduto } from "@/components/products/create/CreateProductPage";
import { EditarProduto } from "@/components/products/EditProduct";
import { EditVariationWrapper as EditarVariacao } from "@/components/products/edit/EditVariationWrapper";
import { EditKitWrapper as EditarKit } from "@/components/products/edit/EditKitWrapper";
import { ProdutosHeader } from "@/components/products/ProductsHeader";
import { ProdutosUnicos } from "@/components/products/tabs/SingleProducts";
import { ProdutosVariacoes } from "@/components/products/tabs/ProductVariations";
import { ProdutosKits } from "@/components/products/tabs/ProductKits";
import { useAuth } from "@/hooks/useAuth";

const navigationItems = [
  { title: "Únicos", path: "", description: "Produtos únicos" },
  { title: "Variações", path: "/variacoes", description: "Produtos com variações" },
  { title: "Kits", path: "/kits", description: "Kits e combos" },
];

export default function Produtos() {
  const location = useLocation();
  const { permissions, userRole } = useAuth();
  const canCreate = Boolean((permissions as any)?.produtos?.create) || userRole === "owner" || userRole === "admin";

  // Check if we're on create or edit pages
  const isCreateOrEditPage = location.pathname.includes('/criar') || location.pathname.includes('/editar');

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <ProdutosHeader />

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
                </div>
              )}

              {!isCreateOrEditPage && (
                <div className="mb-6">
                  <CleanNavigation
                    items={navigationItems}
                    basePath="/produtos"
                    rightContent={
                      canCreate ? (
                        <Button asChild className="h-10 rounded-xl bg-violet-700 text-white hover:bg-violet-800">
                          <a href="/produtos/criar">
                            <Plus className="mr-2 h-4 w-4" />
                            Novo produto
                          </a>
                        </Button>
                      ) : null
                    }
                  />
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
