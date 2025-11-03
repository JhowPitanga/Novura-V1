import React, { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Tag, Package } from "lucide-react";
import { BuscarCategoriasTab } from "@/components/pesquisa-mercado/BuscarCategoriasTab";
import { PalavrasChaveTab } from "@/components/pesquisa-mercado/PalavrasChaveTab";
import { ProdutoTab } from "@/components/pesquisa-mercado/ProdutoTab";

export default function PesquisaMercado() {
  const [activeTab, setActiveTab] = useState("categorias");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 overflow-auto">
            <div className="p-8">
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Pesquisa de Mercado</h1>
                <p className="text-gray-600">Analise oportunidades, categorias e produtos para otimizar sua estratégia de vendas</p>
              </div>

              {/* Tabs Container */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="border-b border-gray-200 px-6">
                    <TabsList className="bg-transparent p-0 h-auto">
                      <TabsTrigger
                        value="categorias"
                        className="flex items-center space-x-2 px-6 py-4 border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:text-purple-600 rounded-none bg-transparent"
                      >
                        <Search className="w-5 h-5" />
                        <span className="font-medium">Buscar Categorias</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="palavras-chave"
                        className="flex items-center space-x-2 px-6 py-4 border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:text-purple-600 rounded-none bg-transparent"
                      >
                        <Tag className="w-5 h-5" />
                        <span className="font-medium">Palavras-chave</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="produto"
                        className="flex items-center space-x-2 px-6 py-4 border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:text-purple-600 rounded-none bg-transparent"
                      >
                        <Package className="w-5 h-5" />
                        <span className="font-medium">Produto</span>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="categorias" className="p-6 mt-0">
                    <BuscarCategoriasTab />
                  </TabsContent>

                  <TabsContent value="palavras-chave" className="p-6 mt-0">
                    <PalavrasChaveTab />
                  </TabsContent>

                  <TabsContent value="produto" className="p-6 mt-0">
                    <ProdutoTab />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}