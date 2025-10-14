
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfiguracoesFiscais } from "@/components/configuracoes/ConfiguracoesFiscais";
import { ConfiguracoesUsuarios } from "@/components/configuracoes/ConfiguracoesUsuarios";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { CleanNavigation } from "@/components/CleanNavigation";

export default function Configuracoes() {
  const [activeTab, setActiveTab] = useState("usuarios");

  const navItems = [
    { title: "Usuários", path: "usuarios", description: "Gerencie usuários e permissões" },
    { title: "Configurações Fiscais", path: "fiscais", description: "Parâmetros e regras fiscais" },
  ];

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

              {/* Clean Navigation padrão do sistema */}
              <CleanNavigation items={navItems} activePath={activeTab} onNavigate={setActiveTab} />

              {/* Conteúdo por abas controladas */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
                <TabsContent value="usuarios">
                  <ConfiguracoesUsuarios />
                </TabsContent>

                <TabsContent value="fiscais">
                  <ConfiguracoesFiscais />
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
