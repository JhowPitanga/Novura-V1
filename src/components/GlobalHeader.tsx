import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, BookOpen, MessageSquare, Hash, Image as ImageIcon, Paperclip, ArrowRight, Settings, LogOut, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function GlobalHeader() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState("novidades");
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayName = String((user as any)?.user_metadata?.full_name || (user as any)?.user_metadata?.name || (user as any)?.email?.split("@")[0] || "Usuário");
  const email = String((user as any)?.email || "");
  const avatarUrl = String((user as any)?.user_metadata?.avatar_url || (user as any)?.user_metadata?.picture || "");
  const initial = displayName?.[0]?.toUpperCase() || "U";
  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch {}
    navigate("/auth");
  };



  return (
    <>
    <header className="fixed inset-x-0 z-[9999] h-16 bg-white shadow-sm flex items-center justify-between gap-1 px-8 top-0 rounded-t-xl">
      {/* SidebarTrigger removido para evitar dependência de provider */}
      <div className="flex-1 flex items-center justify-between">
        {/* Left: Brand / Title */}
        <div className="flex items-center space-x-5">
          <Link to="/" aria-label="Ir para Início" title="Ir para Início" className="flex items-center">
            <img
              src="/novura-erp-logo.svg"
              alt="Novura logo"
              className="h-16 w-auto cursor-pointer select-none transition-transform duration-200 ease-out hover:scale-[0.97] hover:brightness-95 active:scale-[0.90]"
              style={{ width: "calc(var(--sidebar-width) / 2)" }}
            />
          </Link>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-1 sm:space-x-3">
          {/* Notificações */}
          <Button variant="ghost" size="sm" className="relative" onClick={() => setNotifOpen(true)} aria-label="Abrir notificações">
            <Bell className="w-5 h-5 text-gray-700" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </Button>


          {/* Livro - Academy / Suporte */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-purple-700" aria-label="Abrir menu de ajuda">
                <BookOpen className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[10000]">
              <DropdownMenuItem asChild>
                <Link to="/novura-academy">Abrir academy novura</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/sac">Suporte novura</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Perfil do Usuário */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="rounded-full px-2 py-1 hover:bg-gray-100 flex items-center gap-2">
                <Avatar className="h-8 w-8 rounded-full">
                  {avatarUrl ? (<AvatarImage src={avatarUrl} alt={displayName} />) : null}
                  <AvatarFallback className="rounded-full">{initial}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-gray-700">{displayName}</span>
                <ChevronDown className="w-4 h-4 text-purple-600" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 z-[10000]">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 rounded-full">
                  {avatarUrl ? (<AvatarImage src={avatarUrl} alt={displayName} />) : null}
                  <AvatarFallback className="rounded-full">{initial}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium">{displayName}</div>
                  <div className="text-xs text-gray-600">{email}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                <Button variant="ghost" className="justify-start" onClick={() => navigate('/configuracoes')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Configurações
                </Button>
                <Button variant="ghost" className="justify-start text-red-600 hover:text-red-700" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2 text-red-600" />
                  Sair
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Drawer: Notificações */}
      <Drawer open={notifOpen} onOpenChange={setNotifOpen} direction="right">
        <DrawerContent className="h-full w-[420px] fixed right-0">
          <DrawerHeader className="border-b">
            <DrawerTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notificações
            </DrawerTitle>
          </DrawerHeader>
          <div className="h-full flex flex-col">
            <div className="p-4 border-b">
              <Tabs value={notifTab} onValueChange={setNotifTab} className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="novidades">Novidades Novura</TabsTrigger>
                  <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
                  <TabsTrigger value="crm">CRM</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Tabs value={notifTab} onValueChange={setNotifTab} className="w-full">
                <TabsContent value="novidades" className="p-4 space-y-3">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-sm text-gray-800">Atualização: Novo filtro por categoria no módulo de estoque</p>
                    <span className="text-xs text-gray-500">Há 2h</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-sm text-gray-800">Melhorias de performance no dashboard</p>
                    <span className="text-xs text-gray-500">Ontem</span>
                  </div>
                </TabsContent>
                <TabsContent value="pedidos" className="p-4 space-y-3">
                  <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                    <p className="text-sm text-gray-800">Pedido #PED123 pronto para coleta</p>
                    <span className="text-xs text-gray-500">Há 5 min</span>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                    <p className="text-sm text-gray-800">Pedido #PED124 atraso na coleta</p>
                    <span className="text-xs text-gray-500">Há 20 min</span>
                  </div>
                </TabsContent>
                <TabsContent value="crm" className="p-4 space-y-4">
                  <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                    <p className="text-sm text-gray-800">Novo chat do cliente Maria sobre pedido #PED125</p>
                    <span className="text-xs text-gray-500">Há 10 min</span>
                  </div>
                  <div className="flex justify-end">
                    <Button asChild className="bg-gradient-to-r from-novura-primary to-purple-600 hover:opacity-90 text-white rounded-xl">
                      <Link to="/sac" className="flex items-center">
                        Ver chat
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </DrawerContent>
      </Drawer>


    </header>
    {/* Spacer para empurrar conteúdo abaixo do header fixo */}
    <div className="h-[65px]" />
    </>
  );
}
