
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfiguracoesFiscais } from "@/components/configuracoes/ConfiguracoesFiscais";
import { ConfiguracoesUsuarios } from "@/components/configuracoes/ConfiguracoesUsuarios";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";

export default function Configuracoes() {
  const [activeTab, setActiveTab] = useState("fiscais");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <GlobalHeader />

          {/* Main Content */}
          <main className="flex-1 p-8 overflow-auto">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações</h1>
                <p className="text-gray-600">Gerencie as configurações do sistema</p>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-md mb-8 h-12 bg-gray-100">
                  <TabsTrigger 
                    value="fiscais" 
                    className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm"
                  >
                    Configurações Fiscais
                  </TabsTrigger>
                  <TabsTrigger 
                    value="usuarios"
                    className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm"
                  >
                    Usuários
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="fiscais">
                  <ConfiguracoesFiscais />
                </TabsContent>

                <TabsContent value="usuarios">
                  <ConfiguracoesUsuarios />
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
