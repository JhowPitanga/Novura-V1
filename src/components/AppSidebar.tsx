import { useEffect, useState, useRef } from "react";
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
  Award,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/NavUser";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

const startModule = [
  { title: "Início", url: "/", icon: Home },
];

type ModuleItem = { title: string; url: string; icon: any; module?: string };

const managementModules: ModuleItem[] = [
  { title: "Desempenho", url: "/desempenho", icon: TrendingUp, module: "desempenho" },
  { title: "Pesquisa de Mercado", url: "/pesquisa-mercado", icon: BarChart2, module: "pesquisa_mercado" },
  { title: "Produtos", url: "/produtos", icon: Package, module: "produtos" },
  { title: "Anúncios", url: "/anuncios", icon: Megaphone, module: "anuncios" },
  { title: "SAC", url: "/sac", icon: MessageSquare, module: "sac" },
  { title: "Pedidos", url: "/pedidos", icon: ShoppingCart, module: "pedidos" },
  { title: "Equipe", url: "/equipe", icon: Users, module: "equipe" },
  { title: "Estoque", url: "/estoque", icon: Store, module: "estoque" },
  { title: "Notas Fiscais", url: "/notas-fiscais", icon: FileText, module: "notas_fiscais" },
];

const toolsModules: ModuleItem[] = [
  { title: "Recursos Seller", url: "/recursos-seller", icon: ShoppingBag, module: "recursos_seller" },
  { title: "Aplicativos", url: "/aplicativos", icon: Puzzle, module: "aplicativos" },
  { title: "Comunidade", url: "/comunidade", icon: MessageSquare, module: "comunidade" },
  { title: "Novura Academy", url: "/novura-academy", icon: Award, module: "novura_academy" },
  { title: "Novura Admin", url: "/novura-admin", icon: Settings, module: "novura_admin" },
];

interface AppSidebarProps {
  disableChat?: boolean;
}

export function AppSidebar({ disableChat = false }: AppSidebarProps) {
  const latestChannelRef = useRef<string | null>(null);
  const [hasChatNotif, setHasChatNotif] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState<number>(0);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  // Efeito sonoro simples para nova mensagem
  const playNotify = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 180);
    } catch {
      // ignore audio errors
    }
  };

  useEffect(() => {
    setHasChatNotif(unreadTotal > 0);
  }, [unreadTotal]);

  useEffect(() => {
    if (disableChat) return;
    const onNewMsg = (e: any) => {
      const detail = e?.detail || {};
      const chId = detail?.channelId as string | undefined;
      const module = (detail?.module as string | undefined) || 'equipe';
      const incomingTotal = detail?.unreadTotal as number | undefined;
      latestChannelRef.current = chId || null;
      if (chId) sessionStorage.setItem('chat:lastReceivedChannelId', chId);
      // Exibir dot apenas para módulo Equipe
      if (module === 'equipe') setHasChatNotif(true);
      // Se o payload já trouxer total não lido, atualiza badge imediatamente
      if (typeof incomingTotal === 'number') {
        setUnreadTotal(incomingTotal);
      }
      // Fallback: caso não venha total, busca agregado rapidamente
      else {
        (async () => {
          try {
            const { data } = await supabase
              .from('chat_unread_counts' as any)
              .select('unread_count')
              .eq('user_id', user!.id);
            const total = (data as any[] || []).reduce((sum, r) => sum + ((r?.unread_count || 0) as number), 0);
            setUnreadTotal(total);
          } catch { /* noop */ }
        })();
      }
      playNotify();
    };
    window.addEventListener('chat:message-received', onNewMsg);
    return () => window.removeEventListener('chat:message-received', onNewMsg);
  }, [disableChat]);

  // Agregado de não lidas vindo do módulo de chat
  useEffect(() => {
    if (disableChat) return;
    const onTotal = (e: any) => {
      const detail = e?.detail || {};
      // Respeita origem: apenas atualiza quando vier do módulo Equipe
      const source = (detail?.source as string | undefined) || 'equipe';
      const total = detail?.total;
      if (source !== 'equipe') return;
      setUnreadTotal(typeof total === 'number' ? total : 0);
    };
    window.addEventListener('chat:unread-total', onTotal);
    return () => window.removeEventListener('chat:unread-total', onTotal);
  }, [disableChat]);

  // Carga inicial do agregado via Supabase (persistência)
  // (movido para depois do useAuth para evitar TDZ com 'user')
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const { user, signOut, displayName: ctxDisplayName } = useAuth();
  const { hasModuleAccess, userRole } = usePermissions();
  

  // Carga inicial do agregado via Supabase (persistência)
  useEffect(() => {
    if (disableChat) return;
    let mounted = true;
    (async () => {
      try {
        if (!user?.id) { if (mounted) setUnreadTotal(0); return; }
        const { data, error } = await supabase
          .from('chat_unread_counts' as any)
          .select('channel_id, unread_count')
          .eq('user_id', user.id);
        if (!error && data) {
          const map: Record<string, number> = {};
          (data as any[]).forEach((r) => { map[r.channel_id] = (r.unread_count || 0) as number; });
          const total = Object.values(map).reduce((sum, n) => sum + (n || 0), 0);
          if (mounted) { setUnreadMap(map); setUnreadTotal(total); }
        }
      } catch { if (mounted) setUnreadTotal(0); }
    })();
    return () => { mounted = false; };
  }, [user?.id, disableChat]);

  // Assinatura em tempo real para atualizar badge quando chat_unread_counts mudar
  useEffect(() => {
    if (disableChat) return;
    if (!user?.id) return;
    const channel = supabase
      .channel(`realtime-unread-sidebar-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_unread_counts', filter: `user_id=eq.${user.id}` }, (payload: any) => {
        const row = (payload?.new || payload?.old || {}) as any;
        const chId = row?.channel_id as string | undefined;
        const count = (payload?.new?.unread_count ?? row?.unread_count ?? 0) as number;
        if (!chId) return;
        setUnreadMap(prev => {
          const next = { ...prev, [chId]: count };
          const total = Object.values(next).reduce((sum, n) => sum + (n || 0), 0);
          setUnreadTotal(total);
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, disableChat]);

  

  const displayName =
    ctxDisplayName ||
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.name ||
    user?.email ||
    "Usuário";

  const isActive = (path: string) => currentPath === path || currentPath.startsWith(path + "/");

  // Persistir rolagem do Sidebar
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const key = "sidebar:scrollTop";
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const top = parseInt(saved, 10);
      if (!Number.isNaN(top)) el.scrollTop = top;
    }
    const onScroll = () => sessionStorage.setItem(key, String(el.scrollTop));
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const handleConfigClick = () => {
    navigate('/configuracoes');
  };


  return (
    <>
      <Sidebar 
        className="border-r-0 bg-white" 
        collapsible="icon"
        variant="inset"
      >
        <SidebarContent className="bg-white flex flex-col h-full pt-[50px]"> 
          
          {/* Barra superior removida: sem espaçamento e sem botão de compactar */}
          
          {/* Conteúdo com rolagem (Módulos) */}
          {/* Adicionada classe customizada para o scroll overlay */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll-overlay">

            {/* Início */}
            <SidebarGroup className="mt-4 px-4">
              {!isCollapsed && <SidebarGroupLabel className="px-1 text-gray-500 text-sm">Início</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {startModule.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton tooltip={item.title} asChild isActive={isActive(item.url)}>
                        <NavLink
                          to={item.url}
                          className={`flex items-center w-full ${isCollapsed ? "justify-center px-0 py-5" : "space-x-4 px-4 py-5"} rounded-xl transition-all duration-300 group relative overflow-hidden text-base ${
                            isActive(item.url)
                              ? "bg-novura-primary text-white" // Cor padrão para ativo (sem sombra)
                              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900" // Cor de hover APENAS para inativo
                          }`}
                          onClick={() => {
                            if (item.url === '/equipe') {
                              const chId = latestChannelRef.current || sessionStorage.getItem('chat:lastReceivedChannelId') || null;
                              window.dispatchEvent(new CustomEvent('chat:open-quick-drawer', { detail: { channelId: chId } }));
                              setHasChatNotif(false);
                              sessionStorage.removeItem('chat:lastReceivedChannelId');
                            }
                          }}
                        >
                          <item.icon className={`w-5 h-5 flex-shrink-0 ${isCollapsed ? "mx-auto" : ""} ${
                            isActive(item.url) ? "text-white" : "text-gray-500 group-hover:text-gray-900"
                          }`} />
                          {!isCollapsed && (
                            <span className="font-medium text-sm">{item.title}</span>
                          )}
                          {item.url === '/equipe' && hasChatNotif && (
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
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
                  {managementModules
                    .filter((m) => {
                      return m.module ? hasModuleAccess(m.module) : true;
                    })
                    .map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton tooltip={item.title} asChild isActive={isActive(item.url)}>
                        <NavLink
                          to={item.url}
                          className={`flex items-center w-full ${isCollapsed ? "justify-center px-0 py-5" : "space-x-4 px-4 py-5"} rounded-xl transition-all duration-300 group relative overflow-hidden text-base ${
                            isActive(item.url)
                              ? "bg-novura-primary text-white" // Cor padrão para ativo (sem sombra)
                              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900" // Cor de hover APENAS para inativo
                          }`}
                        >
                          <item.icon className={`w-5 h-5 flex-shrink-0 ${isCollapsed ? "mx-auto" : ""} ${
                            isActive(item.url) ? "text-white" : "text-gray-500 group-hover:text-gray-900"
                          }`} />
                          {!isCollapsed && (
                            <span className="font-medium text-sm">{item.title}</span>
                          )}
                          {item.url === '/equipe' && unreadTotal > 0 && (
                            <span className="absolute top-2 right-2 bg-red-500 text-white rounded-full text-xs min-w-[18px] h-5 px-1 flex items-center justify-center">{unreadTotal}</span>
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
                  {toolsModules
                    .filter((m) => {
                      return m.module ? hasModuleAccess(m.module) : true;
                    })
                    .map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton tooltip={item.title} asChild isActive={isActive(item.url)}>
                        <NavLink
                          to={item.url}
                          className={`flex items-center w-full ${isCollapsed ? "justify-center px-0 py-5" : "space-x-4 px-4 py-5"} rounded-xl transition-all duration-300 group relative overflow-hidden text-base ${
                            isActive(item.url)
                              ? "bg-novura-primary text-white" // Cor padrão para ativo (sem sombra)
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

          
        </SidebarContent>
      </Sidebar>
    </>
  );
}
