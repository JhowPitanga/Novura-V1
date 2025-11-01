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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
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
  { title: "Central de Anúncios", url: "/anuncios", icon: Megaphone, module: "anuncios" },
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
];

export function AppSidebar() {
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
              .from('chat_unread_counts')
              .select('unread_count')
              .eq('user_id', user?.id as string);
            const total = (data as any[] || []).reduce((sum, r) => sum + ((r?.unread_count || 0) as number), 0);
            setUnreadTotal(total);
          } catch { /* noop */ }
        })();
      }
      playNotify();
    };
    window.addEventListener('chat:message-received', onNewMsg);
    return () => window.removeEventListener('chat:message-received', onNewMsg);
  }, []);

  // Agregado de não lidas vindo do módulo de chat
  useEffect(() => {
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
  }, []);

  // Carga inicial do agregado via Supabase (persistência)
  // (movido para depois do useAuth para evitar TDZ com 'user')
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const { hasModuleAccess, userRole } = usePermissions();
  const [dbName, setDbName] = useState<string | null>(null);

  // Carga inicial do agregado via Supabase (persistência)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!user?.id) { if (mounted) setUnreadTotal(0); return; }
        const { data, error } = await supabase
          .from('chat_unread_counts')
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
  }, [user?.id]);

  // Assinatura em tempo real para atualizar badge quando chat_unread_counts mudar
  useEffect(() => {
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
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    const fetchDbName = async () => {
      try {
        if (!user?.id) {
          if (mounted) setDbName(null);
          return;
        }
        // 1) Tenta pegar do perfil (display_name)
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        if (profileError) {
          console.error('Erro ao buscar display_name em user_profiles:', profileError.message);
        }

        if (profile && (profile as any)?.display_name) {
          if (mounted) setDbName((profile as any).display_name);
          return;
        }

        // 2) Fallback: pega de users.name
        const { data: userRow, error: userError } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();
        if (userError) {
          console.error('Erro ao buscar nome do usuário em users:', userError.message);
        }
        if (mounted) setDbName((userRow as any)?.name ?? null);
      } catch (e) {
        console.error('Falha ao carregar nome do usuário:', e);
        if (mounted) setDbName(null);
      }
    };
    fetchDbName();
    return () => { mounted = false; };
  }, [user?.id]);

  const displayName =
    dbName ||
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
                      // Donos têm acesso a tudo; membros filtram por permissão do módulo
                      if (userRole === "owner") return true;
                      return m.module ? hasModuleAccess(m.module) : true;
                    })
                    .map((item) => (
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
                      if (userRole === "owner") return true;
                      return m.module ? hasModuleAccess(m.module) : true;
                    })
                    .map((item) => (
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
                      <p className="text-xs text-gray-600">{userRole === 'admin' ? 'admin' : 'membro'}</p>
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