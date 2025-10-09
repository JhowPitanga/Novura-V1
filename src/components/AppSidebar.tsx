import { useState } from "react";
import { 
  Home, 
  TrendingUp, 
  Package, 
  Megaphone, 
  ShoppingCart, 
  Store, 
  FileText, 
  Puzzle, 
  ShoppingBag,
  Users,
  Settings,
  User,
  MessageSquare,
  BarChart2,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

const startModule = [
  { title: "Início", url: "/", icon: Home },
];

const managementModules = [
  { title: "Desempenho", url: "/desempenho", icon: TrendingUp },
  { title: "Pesquisa de Mercado", url: "/pesquisa-mercado", icon: BarChart2 },
  { title: "Produtos", url: "/produtos", icon: Package },
  { title: "Central de Anúncios", url: "/anuncios", icon: Megaphone },
  { title: "SAC", url: "/sac", icon: MessageSquare },
  { title: "Pedidos", url: "/pedidos", icon: ShoppingCart },
  { title: "Equipe", url: "/equipe", icon: Users },
  { title: "Estoque", url: "/estoque", icon: Store },
  { title: "Notas Fiscais", url: "/notas-fiscais", icon: FileText },
];

const toolsModules = [
  { title: "Recursos Seller", url: "/recursos-seller", icon: ShoppingBag },
  { title: "Aplicativos", url: "/aplicativos", icon: Puzzle },
  { title: "Comunidade", url: "/comunidade", icon: MessageSquare },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const displayName =
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.name ||
    user?.email ||
    "Usuário";

  const isActive = (path: string) => currentPath === path || currentPath.startsWith(path + "/");

  const handleConfigClick = () => {
    navigate('/configuracoes');
  };


  return (
    <>
      <Sidebar 
        className="border-r-0 bg-white" 
        collapsible="icon" 
        style={{ minWidth: isCollapsed ? '90px' : '280px', width: isCollapsed ? '90px' : '280px' }}
      >
        <SidebarContent className="bg-white flex flex-col h-full"> 
          
          {/* Header APENAS com o Botão de Compactar */}
          {/* Botão de Compactar visível em todas as telas */}
          <div className={`p-4 border-b border-gray-100 flex items-center ${isCollapsed ? 'justify-center' : 'justify-end'}`}>
            <SidebarTrigger className="h-8 w-8 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200" icon={ChevronLeft} />
          </div>
          
          {/* Conteúdo com rolagem (Módulos) */}
          {/* Adicionada classe customizada para o scroll overlay */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll-overlay">

            {/* Início */}
            <SidebarGroup className="mt-4 px-4">
              {!isCollapsed && <SidebarGroupLabel className="px-1 text-gray-500 text-sm">Início</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {startModule.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton tooltip={item.title} asChild>
                        <NavLink
                          to={item.url}
                          className={`flex items-center w-full ${isCollapsed ? "justify-center px-0 py-5" : "space-x-4 px-4 py-5"} rounded-xl transition-all duration-300 group relative overflow-hidden text-base ${
                            isActive(item.url)
                              ? "bg-novura-primary text-white shadow-lg" // Cor padrão para ativo
                              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900" // Cor de hover APENAS para inativo
                          }`}
                        >
                          <item.icon className={`w-5 h-5 flex-shrink-0 ${isCollapsed ? "mx-auto" : ""} ${
                            isActive(item.url) ? "text-white" : "text-gray-500 group-hover:text-gray-900"
                          }`} />
                          {!isCollapsed && (
                            <span className="font-medium text-sm">{item.title}</span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Gerenciamento */}
            <SidebarGroup className="mt-4 px-4">
              {!isCollapsed && <SidebarGroupLabel className="px-1 text-gray-500 text-sm">Gerenciamento</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {managementModules.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton tooltip={item.title} asChild>
                        <NavLink
                          to={item.url}
                          className={`flex items-center w-full ${isCollapsed ? "justify-center px-0 py-5" : "space-x-4 px-4 py-5"} rounded-xl transition-all duration-300 group relative overflow-hidden text-base ${
                            isActive(item.url)
                              ? "bg-novura-primary text-white shadow-lg" // Cor padrão para ativo
                              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900" // Cor de hover APENAS para inativo
                          }`}
                        >
                          <item.icon className={`w-5 h-5 flex-shrink-0 ${isCollapsed ? "mx-auto" : ""} ${
                            isActive(item.url) ? "text-white" : "text-gray-500 group-hover:text-gray-900"
                          }`} />
                          {!isCollapsed && (
                            <span className="font-medium text-sm">{item.title}</span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Ferramentas */}
            <SidebarGroup className="mt-4 px-4">
              {!isCollapsed && <SidebarGroupLabel className="px-1 text-gray-500 text-sm">Ferramentas</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {toolsModules.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton tooltip={item.title} asChild>
                        <NavLink
                          to={item.url}
                          className={`flex items-center w-full ${isCollapsed ? "justify-center px-0 py-5" : "space-x-4 px-4 py-5"} rounded-xl transition-all duration-300 group relative overflow-hidden text-base ${
                            isActive(item.url)
                              ? "bg-novura-primary text-white shadow-lg" // Cor padrão para ativo
                              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900" // Cor de hover APENAS para inativo
                          }`}
                        >
                          <item.icon className={`w-5 h-5 flex-shrink-0 ${isCollapsed ? "mx-auto" : ""} ${
                            isActive(item.url) ? "text-white" : "text-gray-500 group-hover:text-gray-900"
                          }`} />
                          {!isCollapsed && (
                            <span className="font-medium text-sm">{item.title}</span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>

          {/* User Profile - Fixo na parte inferior */}
          <div className={`mt-auto ${isCollapsed ? "p-3" : "p-6"} border-t border-gray-100`}> 
            {/* Bloco do Perfil (Visível quando expandido) */}
            {!isCollapsed && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3"> 
                    <div className="w-10 h-10 bg-novura-primary rounded-full flex items-center justify-center shadow-lg">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{displayName}</span>
                      <p className="text-xs text-gray-600">Admin</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleConfigClick}
                    className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            )}

            {/* Logout (Último item) */}
            <button
              onClick={async () => { await signOut(); navigate('/auth'); }}
              className={`w-full h-10 rounded-xl flex items-center transition-colors text-gray-800 font-medium mt-3 ${isCollapsed ? "justify-center" : "justify-start gap-3 hover:bg-gray-100 px-4"}`}
            >
              <LogOut className={`w-5 h-5 ${isCollapsed ? "text-gray-500" : "text-gray-700"}`} />
              {!isCollapsed && <span className="text-sm">Sair</span>}
            </button>
            
            {/* Perfil (Visível quando compactado) */}
            {isCollapsed && (
              <div className="w-full mt-3 flex justify-center">
                  <div className="w-10 h-10 bg-novura-primary rounded-full flex items-center justify-center shadow-lg">
                      <User className="w-5 h-5 text-white" />
                  </div>
              </div>
            )}
          </div>
        </SidebarContent>
      </Sidebar>
    </>
  );
}