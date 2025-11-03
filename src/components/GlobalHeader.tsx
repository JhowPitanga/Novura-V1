import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Users, BookOpen, MessageSquare, Hash, Image as ImageIcon, Paperclip, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ChatTab } from "@/components/equipe/ChatTab";
import { useChatChannels } from "@/hooks/useChat";

export function GlobalHeader() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [notifTab, setNotifTab] = useState("novidades");
  const { channels = [], directChannels = [], teamChannels = [] } = useChatChannels();
  const [quickChannelId, setQuickChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (!quickChannelId) {
      const first = (directChannels[0]?.id) || (teamChannels[0]?.id) || (channels[0]?.id) || null;
      if (first) setQuickChannelId(first);
    }
  }, [channels, directChannels, teamChannels, quickChannelId]);

  // Abrir drawer rápido ao receber evento do AppSidebar
  useEffect(() => {
    const handler = (e: any) => {
      const chId = e?.detail?.channelId as string | undefined;
      const fallback = (directChannels[0]?.id) || (teamChannels[0]?.id) || (channels[0]?.id) || null;
      setQuickChannelId(chId || fallback);
      setChatOpen(true);
    };
    window.addEventListener('chat:open-quick-drawer', handler);
    return () => window.removeEventListener('chat:open-quick-drawer', handler);
  }, [channels, directChannels, teamChannels]);

  return (
    <>
    <header className="fixed inset-x-0 z-[9999] h-16 bg-white shadow-sm flex items-center justify-between gap-1 px-4 top-1 rounded-t-xl">
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

          {/* Equipe / Chat Rápido */}
          <Button variant="ghost" size="sm" className="text-gray-700" onClick={() => setChatOpen(true)} aria-label="Abrir chat rápido">
            <Users className="w-5 h-5 mr-1" />
            <span className="hidden sm:inline">Equipe</span>
          </Button>

          {/* Livro - Academy / Suporte */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-purple-700" aria-label="Abrir menu de ajuda">
                <BookOpen className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/novura-academy">Abrir academy novura</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/sac">Suporte novura</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

      {/* Drawer: Chat Rápido da Equipe */}
      <Drawer open={chatOpen} onOpenChange={setChatOpen} direction="right">
        <DrawerContent className="h-full w-[480px] fixed right-0">
          <DrawerHeader className="border-b">
            <DrawerTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Chat Rápido da Equipe
            </DrawerTitle>
          </DrawerHeader>
          <div className="h-full flex flex-col">
            {/* Topbar: Busca e CTA */}
            <div className="p-4 border-b flex items-center gap-3">
              <div className="flex-1">
                <Input placeholder="Pesquisar contatos" className="rounded-xl" />
              </div>
              <Button asChild className="bg-gradient-to-r from-novura-primary to-purple-600 text-white rounded-xl">
                <Link to="/equipe" className="flex items-center">
                  Ir para Equipe
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>

            {/* Lista rápida de canais */}
            <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-purple-50/30">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Hash className="w-4 h-4" />
                <span className="mr-2">Canais:</span>
                <div className="flex flex-wrap gap-2">
                  {[...directChannels, ...teamChannels].slice(0, 6).map((ch) => (
                    <button
                      key={ch.id}
                      className={`px-2 py-1 rounded-lg text-xs ${quickChannelId === ch.id ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                      onClick={() => setQuickChannelId(ch.id)}
                    >
                      {(ch.type === 'team' ? '#' : '@')}{ch.name || 'Direta'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat Component real */}
            <div className="flex-1 overflow-y-auto">
              {quickChannelId ? (
                <ChatTab channelId={quickChannelId} />
              ) : (
                <div className="p-6 text-sm text-gray-600">Selecione um canal acima para conversar rapidamente.</div>
              )}
            </div>

            {/* Dicas de comandos */}
            <div className="p-3 border-t bg-white text-xs text-gray-500">
              Dicas: use <Badge variant="outline" className="text-[10px]">#</Badge> para módulos e <Badge variant="outline" className="text-[10px]">@</Badge> para pessoas.
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </header>
    {/* Spacer para empurrar conteúdo abaixo do header fixo */}
    <div className="h-[58px]" />
    </>
  );
}