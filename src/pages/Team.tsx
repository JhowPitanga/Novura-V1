// Equipe.tsx (Código Completo Atualizado)

import { useState, useEffect, useMemo } from "react";
import { MessageSquare, Kanban, Plus, Users, Trophy, User, Target, Zap, Clock, Calendar, CheckSquare, Filter, ChevronDown, ListPlus, Search, MoreVertical, Check } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { CleanNavigation } from "@/components/CleanNavigation";
import { ChatTab } from "@/components/equipe/ChatTab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Importações para Task Management
import { CreateTaskModal } from "@/components/equipe/CreateTaskModal";
import { TaskBoard } from "@/components/equipe/TaskBoard"; // ATUALIZADO (Kanban)
// Removido: Backlog, Roadmap e Views (não será utilizado)
import { TaskDetailModal } from "@/components/equipe/TaskDetailModal"; // NOVO
import LoadingOverlay from "@/components/LoadingOverlay";
import { useChatChannels, useOrgMemberSearch } from "@/hooks/useChat";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

// --- INTERFACE DE TAREFA ---
// Usar o tipo compartilhado do CreateTaskModal para garantir compatibilidade
import type { Task, TaskPriority, TaskType, TaskStatus } from "@/components/equipe/CreateTaskModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// --- DADOS MOCKADOS (Mantidos) ---
const navigationItems = [
    { title: "Chat", path: "", icon: MessageSquare, description: "Comunicação da equipe" },
    { title: "Tasks", path: "/tasks", icon: Kanban, description: "Gerenciamento de tarefas" },
    { title: "Gamificação", path: "/gamificacao", icon: Trophy, description: "Desempenho da equipe" },
];

// Removido: dados mockados de tarefas; serão carregadas do Supabase

const teamMembers = [
    { id: 1, name: "Ana Silva", role: "Desenvolvedora", avatar: "/placeholder.svg", points: 2850, level: 12, badges: ["🏆", "⚡", "🎯"], activities: { tasksCompleted: 45, packagesShipped: 0, codeReviews: 23, bugs: 8 } },
    { id: 2, name: "Carlos Lima", role: "Logística", avatar: "/placeholder.svg", points: 3200, level: 15, badges: ["📦", "🚀", "⭐"], activities: { tasksCompleted: 32, packagesShipped: 156, codeReviews: 0, bugs: 0 } },
    { id: 3, name: "Marina Costa", role: "Designer", avatar: "/placeholder.svg", points: 2650, level: 11, badges: ["🎨", "✨", "💫"], activities: { tasksCompleted: 38, packagesShipped: 0, codeReviews: 15, bugs: 2 } },
    { id: 4, name: "João Santos", role: "Logística", avatar: "/placeholder.svg", points: 2950, level: 13, badges: ["📦", "🎯", "⚡"], activities: { tasksCompleted: 28, packagesShipped: 203, codeReviews: 0, bugs: 0 } }
];

// Real channels will be fetched via hook

const ChatAvatar = ({ isGroup, color }: { isGroup: boolean, color: string }) => (
    <div className={`w-10 h-10 bg-${color}-200 rounded-full flex items-center justify-center mr-3`}>
        {isGroup ? <Users className={`w-5 h-5 text-${color}-800`} /> : <User className={`w-5 h-5 text-${color}-800`} />}
    </div>
);


// --- 1. MÓDULO CHAT (Design dos Anexos) ---
function ChatModule() {
    const [searchTerm, setSearchTerm] = useState("");
    const [showMemberDropdown, setShowMemberDropdown] = useState(false);
    const [showStarred, setShowStarred] = useState(true);
    const [showDMs, setShowDMs] = useState(true);
    const [showTeams, setShowTeams] = useState(true);
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [teamName, setTeamName] = useState("");
  // Removed teamCategory; groups now only have a name and member selection
    const [memberSearch, setMemberSearch] = useState("");
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

    const { channels = [], directChannels = [], teamChannels = [], toggleStar, deleteChannel, startDirectMessage, createTeam } = useChatChannels();
    const { user, organizationId } = useAuth();
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const [activeDisplayName, setActiveDisplayName] = useState<string | undefined>(undefined);
    const allChannels = useMemo(() => [
        ...(channels || []),
        ...(directChannels || []),
        ...(teamChannels || [])
    ], [channels, directChannels, teamChannels]);
    const activeChannel = useMemo(() => allChannels.find(c => c.id === activeChannelId) || null, [allChannels, activeChannelId]);
    const { results: memberResults } = useOrgMemberSearch(memberSearch, { alwaysList: true });

    // Total agregado de não lidas
    const unreadTotal = useMemo(() => Object.values(unreadCounts).reduce((sum, n) => sum + (n || 0), 0), [unreadCounts]);

    // Marcar canal como lido (estado + persistência via RPC)
    const markChannelRead = (channelId: string) => {
        setUnreadCounts(prev => {
            if (!(channelId in prev)) return prev;
            const next = { ...prev };
            next[channelId] = 0;
            try {
                if (typeof window !== 'undefined' && user?.id) {
                    const cacheKey = `chat_unread_counts:${user.id}`;
                    localStorage.setItem(cacheKey, JSON.stringify(next));
                }
            } catch {}
            return next;
        });
        (async () => {
            try {
                await (supabase as any).rpc('mark_channel_read', { p_channel_id: channelId });
            } catch {}
        })();
    };

    // Atualiza o nome exibido do canal ativo (DM mostra outro membro)
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const ch: any = activeChannel;
                if (!ch) { if (mounted) setActiveDisplayName(undefined); return; }
                if (ch.type === 'team') {
                    if (mounted) setActiveDisplayName(ch.name || 'Canal da Equipe');
                    return;
                }
                // DM: resolver nome do outro membro
                const members: string[] = Array.isArray(ch?.member_ids) ? ch.member_ids : [];
                const otherId = members.find((id) => id !== user?.id);
                if (!otherId) { if (mounted) setActiveDisplayName(ch.name || undefined); return; }
                let nome: string | null = null;
                let email: string | null = null;
                try {
                    const { data: profile } = await supabase
                        .from('user_profiles')
                        .select('id,nome,email')
                        .eq('id', otherId)
                        .single();
                    if (profile) { nome = (profile as any).nome; email = (profile as any).email; }
                } catch {}
                if (!nome && !email && organizationId) {
                    try {
                    const { data: mems } = await (supabase as any)
                            .rpc('search_org_members', { p_org_id: organizationId, p_term: null, p_limit: 200 });
                        const found = (mems as any[])?.find((u) => u.id === otherId);
                        nome = (found as any)?.nome ?? null; email = (found as any)?.email ?? null;
                    } catch {}
                }
                if (mounted) setActiveDisplayName(nome || email || ch.name || undefined);
            } catch { if (mounted) setActiveDisplayName((activeChannel as any)?.name); }
        })();
        return () => { mounted = false; };
    }, [activeChannel, user, organizationId]);

    // Carregar contadores persistidos no Supabase para o usuário
    useEffect(() => {
        let mounted = true;
        (async () => {
            if (!user?.id) return;
            try {
                let hasCache = false;
                try {
                    if (typeof window !== 'undefined') {
                        const cacheKey = `chat_unread_counts:${user.id}`;
                        const cached = localStorage.getItem(cacheKey);
                        if (cached) {
                            const parsed = JSON.parse(cached || '{}');
                            if (parsed && typeof parsed === 'object') {
                                setUnreadCounts(parsed as Record<string, number>);
                                hasCache = Object.keys(parsed).length > 0;
                            }
                        }
                    }
                } catch {}
                if (!hasCache) {
                    const { data, error } = await (supabase as any)
                        .from('chat_unread_counts')
                        .select('channel_id, unread_count')
                        .eq('user_id', user.id);
                    if (!error && data) {
                        const map: Record<string, number> = {};
                        (data as any[]).forEach((row) => { map[row.channel_id] = row.unread_count || 0; });
                        if (mounted) setUnreadCounts(map);
                        try {
                            if (typeof window !== 'undefined') {
                                const cacheKey = `chat_unread_counts:${user.id}`;
                                localStorage.setItem(cacheKey, JSON.stringify(map));
                            }
                        } catch {}
                    }
                }
            } catch {}
        })();
        return () => { mounted = false; };
    }, [user?.id]);

    // Ouvir novas mensagens e acumular não lidas em canais não ativos + persistência
    useEffect(() => {
        const handler = (ev: any) => {
            const detail = ev?.detail || {};
            const chId: string | undefined = detail?.channelId;
            const msg = detail?.message || {};
            if (!chId) return;
            if (chId === activeChannelId) return; // canal ativo não acumula aqui
            if (!!user && msg?.sender_id === user.id) return; // ignora próprias
            let nextCount = 0;
            setUnreadCounts(prev => {
                nextCount = (prev[chId] || 0) + 1;
                const next = { ...prev, [chId]: nextCount };
                try {
                    if (typeof window !== 'undefined' && user?.id) {
                        const cacheKey = `chat_unread_counts:${user.id}`;
                        localStorage.setItem(cacheKey, JSON.stringify(next));
                    }
                } catch {}
                return next;
            });
            if (user?.id) {
                try {
                    (supabase as any)
                        .from('chat_unread_counts')
                        .upsert({ channel_id: chId, user_id: user.id, unread_count: nextCount }, { onConflict: 'channel_id,user_id' });
                } catch {}
            }
        };
        window.addEventListener('chat:message-received', handler as any);
        return () => { window.removeEventListener('chat:message-received', handler as any); };
    }, [activeChannelId, user]);

    // Ouvir mudanças de não lidas do canal ativo (emitidas pelo ChatTab) e persistir
    useEffect(() => {
        const handler = (ev: any) => {
            const { channelId, count } = ev?.detail || {};
            if (!channelId || typeof count !== 'number') return;
            setUnreadCounts(prev => {
                const next = { ...prev, [channelId]: count };
                try {
                    if (typeof window !== 'undefined' && user?.id) {
                        const cacheKey = `chat_unread_counts:${user.id}`;
                        localStorage.setItem(cacheKey, JSON.stringify(next));
                    }
                } catch {}
                return next;
            });
            // Persistência: quando zerar, chamar RPC para marcar lido (atualiza last_read_at)
            if (count === 0) {
                (async () => { try { await (supabase as any).rpc('mark_channel_read', { p_channel_id: channelId }); } catch {} })();
            }
        };
        window.addEventListener('chat:active-unread-changed', handler as any);
        return () => { window.removeEventListener('chat:active-unread-changed', handler as any); };
    }, [user?.id]);

    // Assinar atualizações em tempo real de chat_unread_counts para este usuário
    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`realtime-unread-${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_unread_counts', filter: `user_id=eq.${user.id}` }, (payload: any) => {
                const row = (payload?.new || payload?.old || {}) as any;
                const chId = row?.channel_id;
                // Preferir valor de new.unread_count quando disponível
                const count = (payload?.new?.unread_count ?? row?.unread_count ?? 0) as number;
                if (!chId) return;
                setUnreadCounts(prev => {
                    const next = { ...prev, [chId]: count };
                    try {
                        if (typeof window !== 'undefined' && user?.id) {
                            const cacheKey = `chat_unread_counts:${user.id}`;
                            localStorage.setItem(cacheKey, JSON.stringify(next));
                        }
                    } catch {}
                    return next;
                });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id]);

    // Emitir total agregado para a barra lateral
    useEffect(() => {
        const total = Object.values(unreadCounts).reduce((sum, n) => sum + (n || 0), 0);
        window.dispatchEvent(new CustomEvent('chat:unread-total', { detail: { total, source: 'equipe' } }));
    }, [unreadCounts]);

    const filtered = (list: any[]) => list.filter(c => (c.name || 'Direta').toLowerCase().includes(searchTerm.toLowerCase()));
    const starred = filtered((channels || []).filter((c: any) => c.isStarred));
    const dms = filtered(directChannels || []);
    const teams = filtered(teamChannels || []);

    const ChatListItem = ({ ch }: { ch: any }) => {
        const isActive = ch.id === activeChannelId;
        const isGroup = ch.type === 'team';
        const color = isGroup ? 'purple' : 'gray';
        const canDelete = !!user && ch?.created_by === user.id;
        const [confirmOpen, setConfirmOpen] = useState(false);
        const [otherName, setOtherName] = useState<string | null>(null);

        useEffect(() => {
            let mounted = true;
            const loadOtherName = async () => {
                if (isGroup) return;
                const members: string[] = Array.isArray(ch?.member_ids) ? ch.member_ids : [];
                const otherId = members.find((id) => id !== user?.id);
                if (!otherId) return;
                try {
                    let nome: string | null = null;
                    let email: string | null = null;
                    const { data: profile, error: pErr } = await supabase
                        .from('user_profiles')
                        .select('id,nome,email')
                        .eq('id', otherId)
                        .single();
                    if (!pErr && profile) { nome = (profile as any).nome; email = (profile as any).email; }
                    if (!nome && !email && organizationId) {
                        try {
                            const { data: mems } = await supabase
                                .rpc('search_org_members', { p_org_id: organizationId, p_term: null, p_limit: 200 });
                            const found = (mems as any[])?.find((u) => u.id === otherId);
                            nome = (found as any)?.nome ?? null; email = (found as any)?.email ?? null;
                        } catch {}
                    }
                    if (mounted) setOtherName(nome || email || null);
                } catch {}
            };
            loadOtherName();
            return () => { mounted = false; };
        }, [ch?.id, JSON.stringify(ch?.member_ids), user?.id, organizationId]);
        return (
            <div 
                key={ch.id}
                className={`flex items-center p-3 rounded-lg transition-colors cursor-pointer ${isActive ? 'bg-purple-50 border-l-4 border-purple-600' : 'hover:bg-gray-100'}`}
                onClick={() => { 
                    setActiveChannelId(ch.id);
                    // Definir nome imediatamente sem fallback "Mensagem Direta" para evitar flicker
                    const immediateName = isGroup ? (ch.name || 'Canal da Equipe') : (otherName || ch.name || '');
                    setActiveDisplayName(immediateName);
                    markChannelRead(ch.id);
                }}
            >
                <ChatAvatar isGroup={isGroup} color={color} />
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 truncate">{isGroup ? (ch.name || 'Canal da Equipe') : (otherName || ch.name || '')}</h4>
                </div>
                <div className="ml-2 flex items-center gap-2">
                    {/* Badge de não lidas por canal */}
                    {!!unreadCounts[ch.id] && unreadCounts[ch.id] > 0 && (
                        <Badge variant="secondary" className="bg-purple-600 text-white min-w-[22px] h-6 rounded-full px-2 flex items-center justify-center text-xs">
                            {unreadCounts[ch.id]}
                        </Badge>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleStar(ch.id, !ch.isStarred); }}>
                                {ch.isStarred ? 'Remover dos Estrelados' : 'Adicionar aos Estrelados'}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canDelete} className={` ${canDelete ? 'text-red-600' : 'text-gray-400'} `} onClick={(e) => { e.stopPropagation(); if (canDelete) setConfirmOpen(true); }}>
                                {canDelete ? 'Excluir conversa' : 'Apenas criador pode excluir'}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <p className="text-sm text-gray-600">Essa ação é irreversível. Confirme duas vezes para excluir.</p>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={async () => {
                        // primeira confirmação
                        setConfirmOpen(false);
                        // segunda confirmação
                        const again = window.confirm('Tem certeza? Esta é a segunda confirmação.');
                        if (!again) return;
                        const res = await deleteChannel(ch.id);
                        if ((res as any)?.ok) {
                          if (activeChannelId === ch.id) setActiveChannelId(null);
                        } else {
                          // opcional: feedback
                          console.warn((res as any)?.error || 'Erro ao excluir');
                        }
                      }}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            </div>
        );
    };

    return (
        <>
        <div className="flex h-[calc(100vh-140px)] bg-white border rounded-lg overflow-hidden shadow-lg">
            <div className="w-80 border-r bg-gray-50 flex-shrink-0 flex flex-col">
                <div className="p-4 border-b">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                            <span className="text-lg font-semibold text-gray-800">Mensagens</span>
                            <Badge variant="secondary" className="bg-purple-600 text-white min-w-[22px] h-6 rounded-full px-2 flex items-center justify-center text-xs">
                                {unreadTotal}
                            </Badge>
                        </div>
                        <Button variant="ghost" size="icon" className="text-purple-600 hover:bg-purple-100" onClick={() => setCreateOpen(true)}>
                            <Plus className="w-5 h-5" />
                        </Button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          placeholder="Encontre um DM ou Equipe"
                          className="pl-9 h-9 bg-white border-gray-300 focus:border-purple-600"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onFocus={() => setShowMemberDropdown(true)}
                          onClick={() => setShowMemberDropdown(true)}
                          onBlur={() => setTimeout(() => setShowMemberDropdown(false), 150)}
                        />
                        {showMemberDropdown && (
                            <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-sm max-h-56 overflow-auto">
                                {memberResults.filter((u: any) => u.id !== user?.id).map((u: any) => (
                                    <div key={u.id} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer" onMouseDown={async () => {
                                        const res = await startDirectMessage(u.id);
                                        if ((res as any)?.channelId) setActiveChannelId((res as any).channelId);
                                        // Definir nome imediato ao iniciar DM
                                        setActiveDisplayName(u.nome || u.email);
                                        setSearchTerm('');
                                        setShowMemberDropdown(false);
                                    }}>
                                        {u.nome || u.email}
                                    </div>
                                ))}
                                {memberResults.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-gray-500">Nenhum membro encontrado</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-2">
                    {starred.length > 0 && (
                        <>
                            <div className="px-2 py-2 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md" onClick={() => setShowStarred(!showStarred)}>
                                Estrelado ({starred.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showStarred ? 'rotate-180' : ''}`} />
                            </div>
                            {showStarred && (
                                <div className="space-y-1 mt-1">
                                    {starred.map((ch: any) => <ChatListItem key={ch.id} ch={ch} />)}
                                </div>
                            )}
                        </>
                    )}

                    {dms.length > 0 && (
                        <>
                            <div className="px-2 py-4 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md" onClick={() => setShowDMs(!showDMs)}>
                                Mensagens Diretas ({dms.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showDMs ? 'rotate-180' : ''}`} />
                            </div>
                            {showDMs && (
                                <div className="space-y-1 mt-1">
                                    {dms.map((ch: any) => <ChatListItem key={ch.id} ch={ch} />)}
                                </div>
                            )}
                        </>
                    )}

                    {teams.length > 0 && (
                        <>
                            <div className="px-2 py-4 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md" onClick={() => setShowTeams(!showTeams)}>
                                Equipes ({teams.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showTeams ? 'rotate-180' : ''}`} />
                            </div>
                            {showTeams && (
                                <div className="space-y-1 mt-1">
                                    {teams.map((ch: any) => <ChatListItem key={ch.id} ch={ch} />)}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center w-full">
                {activeChannelId ? (
                    <ChatTab 
                        channelId={activeChannelId as string} 
                        channelName={activeDisplayName ?? (activeChannel as any)?.name} 
                        channelType={(activeChannel as any)?.type}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full w-full text-center text-gray-500 p-8">
                        <div className="w-40 h-40 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <MessageSquare className="w-16 h-16 text-purple-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-700">Selecione uma conversa</h3>
                        <p className="mt-2 text-sm max-w-sm">para visualizar suas mensagens.</p>
                    </div>
                )}
            </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Criar Grupo</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Input placeholder="Nome do grupo" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                    <div>
                        <Input placeholder="Buscar membros" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                        <div className="mt-2 max-h-40 overflow-auto border rounded-md divide-y">
                            {(memberResults || []).filter((u: any) => u.id !== user?.id).map((u: any) => {
                                const checked = selectedMembers.includes(u.id);
                                const displayName = (u as any).nome || u.email || u.id;
                                return (
                                    <div key={u.id} className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${checked ? 'bg-purple-50' : 'hover:bg-gray-50'}`} onClick={() => setSelectedMembers(prev => checked ? prev.filter(id => id !== u.id) : [...prev, u.id])}>
                                        <Avatar className="h-6 w-6">
                                            <AvatarImage src={undefined as any} alt={displayName} />
                                            <AvatarFallback>{(displayName || '').slice(0,2).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        <span className="flex-1 truncate">{displayName}</span>
                                        {checked && <Check className="w-4 h-4 text-purple-600" />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button onClick={async () => {
                            if (!teamName.trim()) return;
                            const res = await createTeam(teamName.trim(), selectedMembers);
                            if ((res as any)?.data?.id) {
                                setActiveChannelId((res as any).data.id);
                            }
                            setCreateOpen(false);
                            setTeamName("");
                            setSelectedMembers([]);
                            setMemberSearch("");
                        }}>Criar</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        </>
    );
}

// --- 2. MÓDULO TASK (ATUALIZADO PARA KANBAN E MODAL) ---
function TaskManagement() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [currentTab, setCurrentTab] = useState("board");
    const { organizationId, user } = useAuth();
    const [createOpen, setCreateOpen] = useState(false);
    const [memberMap, setMemberMap] = useState<Record<string, { nome?: string | null; email?: string | null }>>({});
    const [taskExtras, setTaskExtras] = useState<Record<number, { assigned_to?: string | null; created_by?: string | null; visible_to_members?: string[] }>>({});
    const [isLoading, setIsLoading] = useState(false);

    // Carregar tarefas reais do Supabase
    async function loadTasks() {
        if (!organizationId) return;
        setIsLoading(true);
        const { data, error } = await supabase
            .from('tasks')
            .select('id,title,priority,type,status,due_date,time_tracked,labels,dependencies,assigned_to,created_by,visible_to_members')
            .eq('organizations_id', organizationId)
            .order('created_at', { ascending: false });
        try {
            if (error) {
                console.error('Erro ao carregar tasks:', error.message);
                return;
            }
            const mapped: Task[] = (data || []).map((row: any) => {
                const primaryName = (row.assigned_to && (memberMap[row.assigned_to]?.nome || memberMap[row.assigned_to]?.email)) || '';
                const addNames = (row.visible_to_members || []).map((id: string) => (memberMap[id]?.nome || memberMap[id]?.email)).filter(Boolean);
                const startLabel = (row.labels || []).find((l: string) => typeof l === 'string' && l.startsWith('start:'));
                const startDate = startLabel ? (startLabel as string).split(':')[1] : undefined;
                return {
                    id: row.id,
                    title: row.title,
                    assignee: primaryName,
                    assignees: [primaryName, ...addNames].filter(Boolean),
                    priority: (row.priority ?? 'medium') as TaskPriority,
                    dueDate: row.due_date ?? '',
                    startDate,
                    type: (row.type ?? 'task') as TaskType,
                    storyPoints: 0,
                    status: (row.status ?? 'todo') as TaskStatus,
                    timeTracked: row.time_tracked ?? 0,
                    labels: row.labels ?? [],
                    dependencies: row.dependencies ?? [],
                } as Task;
            });
            const extras: Record<number, { assigned_to?: string | null; created_by?: string | null; visible_to_members?: string[] }> = {};
            for (const row of (data || [])) {
                extras[row.id] = {
                    assigned_to: row.assigned_to || null,
                    created_by: row.created_by || null,
                    visible_to_members: row.visible_to_members || [],
                };
            }
            setTaskExtras(extras);
            setTasks(mapped);
        } finally {
            setIsLoading(false);
        }
    }

    // Inicialização
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadTasks(); }, [organizationId, memberMap]);

    // Carregar mapa de membros para resolver nomes/emails
    useEffect(() => {
        const loadMembers = async () => {
            if (!organizationId) return;
            setIsLoading(true);
            const { data, error } = await supabase
                .rpc('search_org_members', { p_org_id: organizationId, p_term: null, p_limit: 200 });
            try {
                if (error) {
                    console.error('Erro ao carregar membros:', error.message);
                    return;
                }
                const map: Record<string, { nome?: string | null; email?: string | null }> = {};
                for (const u of (data as any[]) || []) {
                    map[u.id] = { nome: (u as any).nome, email: u.email };
                }
                setMemberMap(map);
            } finally {
                setIsLoading(false);
            }
        };
        loadMembers();
    }, [organizationId]);

    // NOVO ESTADO: Para gerenciar a abertura/dados do modal de detalhe
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedTaskDetail, setSelectedTaskDetail] = useState<any | null>(null);

    const handleCreateTask = async (newTask: Task & { visibility?: 'private'|'team'|'members', visibleMemberIds?: string[], assignedToId?: string | null }) => {
        if (!organizationId || !user?.id) return;
        const { data, error } = await supabase
            .from('tasks')
            .insert({
                organizations_id: organizationId,
                created_by: user.id,
                assigned_to: (newTask as any).assignedToId || null,
                title: newTask.title,
                description: null,
                priority: newTask.priority,
                type: newTask.type,
                status: newTask.status ?? 'todo',
                due_date: newTask.dueDate ? newTask.dueDate : null,
                time_tracked: newTask.timeTracked ?? 0,
                labels: newTask.labels ?? [],
                dependencies: newTask.dependencies ?? [],
                visibility: newTask.visibility ?? 'team',
                visible_to_members: newTask.visibleMemberIds ?? [],
            })
            .select();
        if (error) {
            console.error('Erro ao criar task:', error.message);
            return;
        }
        await loadTasks();
        setCreateOpen(false);
    };

    // Alternar co-responsáveis (persistir em visible_to_members)
    const handleToggleCoAssignee = async (taskId: number, member: { id: string, name: string }) => {
        const extras = taskExtras[taskId] || { visible_to_members: [] };
        const current = Array.isArray(extras.visible_to_members) ? extras.visible_to_members : [];
        const exists = current.includes(member.id);
        const next = exists ? current.filter(m => m !== member.id) : [...current, member.id];
        const { error } = await supabase
            .from('tasks')
            .update({ visible_to_members: next })
            .eq('id', taskId);
        if (error) {
            console.error('Erro ao alternar co-responsável:', error.message);
            return;
        }
        await loadTasks();
    };

    const handleUpdateTask = async (taskId: number, updates: Partial<Task>) => {
        // Atualização otimista na UI
        setTasks(prev => prev.map(task => task.id === taskId ? { ...task, ...updates } : task));
        // Persistir no Supabase (apenas campos relevantes)
        try {
            if (!organizationId) return;
            const payload: any = {};
            if (typeof updates.status !== 'undefined') payload.status = updates.status;
            if (typeof updates.priority !== 'undefined') payload.priority = updates.priority;
            if (typeof updates.type !== 'undefined') payload.type = updates.type;
            if (typeof updates.dueDate !== 'undefined') payload.due_date = updates.dueDate || null;

            // Manter/atualizar label de start date e mesclar com alterações de labels
            const currentTask = tasks.find(t => t.id === taskId);
            const currentLabels: string[] = currentTask?.labels || [];
            let newLabels: string[] = [...currentLabels];
            const hasStartUpdate = Object.prototype.hasOwnProperty.call(updates, 'startDate');
            if (hasStartUpdate) {
                newLabels = newLabels.filter(l => !String(l).startsWith('start:'));
                if (updates.startDate) newLabels.push(`start:${updates.startDate}`);
            }
            if (typeof updates.labels !== 'undefined') {
                // Mescla rótulos vindos da UI (ex.: urgent) com o start:
                const startOnly = newLabels.filter(l => String(l).startsWith('start:'));
                newLabels = Array.from(new Set([...(updates.labels || []), ...startOnly]));
            }
            if (hasStartUpdate || typeof updates.labels !== 'undefined') {
                payload.labels = newLabels;
            }
            if (Object.keys(payload).length === 0) return; // nada para persistir

            const { error } = await supabase
                .from('tasks')
                .update(payload)
                .eq('id', taskId)
                .eq('organizations_id', organizationId);
            if (error) throw error;
        } catch (e: any) {
            console.error('Erro ao atualizar task:', e.message || e);
            await loadTasks();
        }
    };

    const handleAssignTask = async (taskId: number, assignee: { id: string, name: string }) => {
        // Atualização otimista
        setTasks(prev => prev.map(task => task.id === taskId ? { ...task, assignee: assignee.name } : task));
        setTaskExtras(prev => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), assigned_to: assignee.id } }));
        try {
            if (!organizationId) return;
            const { error } = await supabase
                .from('tasks')
                .update({ assigned_to: assignee.id })
                .eq('id', taskId)
                .eq('organizations_id', organizationId);
            if (error) throw error;
        } catch (e: any) {
            console.error('Erro ao atribuir responsável:', e.message || e);
            await loadTasks();
        }
    };

    const handleDeleteTask = async (taskId: number) => {
        try {
            if (!organizationId) return;
            const { error } = await supabase
                .from('tasks')
                .delete()
                .eq('id', taskId)
                .eq('organizations_id', organizationId);
            if (error) throw error;
            setTasks(prev => prev.filter(t => t.id !== taskId));
            setTaskExtras(prev => { const copy = { ...prev }; delete copy[taskId]; return copy; });
        } catch (e: any) {
            console.error('Erro ao excluir task:', e.message || e);
            await loadTasks();
        }
    };

    const handleStartTimer = (taskId: number) => { console.log(`Timer iniciado para tarefa ${taskId}`); };
    const handleStopTimer = (taskId: number) => { console.log(`Timer parado para tarefa ${taskId}`); };

    // NOVA FUNÇÃO: Abre o modal e define a tarefa selecionada
    const handleOpenTaskDetail = (task: Task) => {
        const extras = taskExtras[task.id] || {};
        const creatorName = extras.created_by ? (memberMap[extras.created_by]?.nome || memberMap[extras.created_by]?.email) : undefined;
        const participantNames = (extras.visible_to_members || []).map((id) => (memberMap[id]?.nome || memberMap[id]?.email)).filter(Boolean);
        setSelectedTaskDetail({ ...task, creatorName, participantNames });
        setIsDetailModalOpen(true);
    };

    const handleCloseTaskDetail = () => {
        setIsDetailModalOpen(false);
        setSelectedTaskDetail(null);
    };

    return (
        <div className="space-y-2 relative">
            {isLoading && <LoadingOverlay message="Carregando dados..." />}
            {/* Modal de criação controlado externamente; sem cabeçalho extra */}
            <CreateTaskModal onCreateTask={handleCreateTask} openExternal={createOpen} onOpenChange={setCreateOpen} showDefaultTrigger={false} />

            {/* Abas de Visualização (somente Quadro/Kanban) */}
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
                <TabsList className="bg-white border w-full justify-start h-11">
                    <TabsTrigger value="board" className="font-semibold text-gray-700 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
                        <Kanban className="w-4 h-4 mr-2" /> Quadro
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="board" className="pt-0 h-[calc(100vh-240px)]">
                    {/* O TaskBoard agora é a visualização Kanban */}
                    <TaskBoard 
                        tasks={tasks}
                        onUpdateTask={handleUpdateTask}
                        onStartTimer={handleStartTimer}
                        onStopTimer={handleStopTimer}
                        onOpenTaskDetail={handleOpenTaskDetail}
                        onAddTask={() => setCreateOpen(true)}
                        onCreateTask={handleCreateTask}
                        onDeleteTask={handleDeleteTask}
                        onAssignTask={handleAssignTask}
                        onToggleCoAssignee={handleToggleCoAssignee}
                    />
                </TabsContent>
            </Tabs>

            {/* Modal de Detalhes da Tarefa */}
            <TaskDetailModal 
                task={selectedTaskDetail} 
                isOpen={isDetailModalOpen} 
                onClose={handleCloseTaskDetail}
                onUpdateTask={handleUpdateTask}
                onToggleParticipant={(taskId, member) => handleToggleCoAssignee(taskId, member)}
            />
        </div>
    );
}


// --- 3. MÓDULO GAMIFICAÇÃO (Design de Dashboard) (Mantido) ---
function Gamificacao() {
    const [selectedCategory, setSelectedCategory] = useState("all");

    const categories = [
        { id: "all", name: "Geral" },
        { id: "dev", name: "Desenvolvimento" },
        { id: "logistics", name: "Logística" },
        { id: "design", name: "Design" }
    ];

    const sortedMembers = teamMembers.sort((a, b) => b.points - a.points);
    const totalPoints = sortedMembers.reduce((sum, member) => sum + member.points, 0);

    return (
        <div className="space-y-8">
            {/* Header e Filtro */}
            <div className="flex items-center justify-between pb-2 border-b">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Central de Gamificação</h2>
                    <p className="text-gray-600 mt-1">Motivação e performance através de métricas visuais.</p>
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-48 text-purple-600 border-purple-400">
                        <Users className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Filtrar por Equipe" />
                    </SelectTrigger>
                    <SelectContent>
                        {categories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Activity Stats (Visão Geral) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Pontos Totais */}
                <Card className="bg-purple-600 text-white shadow-xl">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <Trophy className="w-6 h-6" />
                            <p className="text-xs font-medium">TOTAL DA EQUIPE</p>
                        </div>
                        <p className="text-4xl font-extrabold">{totalPoints.toLocaleString()}</p>
                        <p className="text-sm opacity-80">Pontos de Engajamento</p>
                    </CardContent>
                </Card>
                {/* Tarefas */}
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-2">
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                            <p className="text-xs text-green-600 font-medium">+12% esta semana</p>
                        </div>
                        <p className="text-3xl font-bold">143</p>
                        <p className="text-sm text-gray-600">Tarefas Concluídas</p>
                    </CardContent>
                </Card>
                {/* Pacotes */}
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-2">
                            <Zap className="w-5 h-5 text-purple-600" />
                            <p className="text-xs text-green-600 font-medium">+8% esta semana</p>
                        </div>
                        <p className="text-3xl font-bold">359</p>
                        <p className="text-sm text-gray-600">Pacotes Enviados</p>
                    </CardContent>
                </Card>
                {/* Bugs */}
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-2">
                            <Target className="w-5 h-5 text-red-600" />
                            <p className="text-xs text-red-600 font-medium">-5% esta semana</p>
                        </div>
                        <p className="text-3xl font-bold">10</p>
                        <p className="text-sm text-gray-600">Bugs Corrigidos</p>
                    </CardContent>
                </Card>
            </div>

            {/* Ranking e Top Performers */}
            <Card className="shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between p-6 pb-2">
                    <CardTitle className="text-2xl font-bold flex items-center">
                        <Trophy className="w-6 h-6 mr-3 text-yellow-500" /> Leaderboard da Semana
                    </CardTitle>
                    <Button variant="outline" size="sm" className="text-purple-600 border-purple-300 hover:bg-purple-50">
                        Ver Recompensas
                    </Button>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {sortedMembers.slice(0, 3).map((member, index) => (
                            <div key={member.id} className={`p-4 rounded-xl border transition-all ${index === 0 ? 'bg-yellow-50 border-yellow-400 shadow-md scale-[1.02]' : 'bg-gray-50'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <Badge className={`text-sm font-bold ${index === 0 ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-200 text-gray-700'}`}>
                                        # {index + 1}
                                    </Badge>
                                    <div className="flex justify-end space-x-1">
                                        {member.badges.map((badge, idx) => (
                                            <span key={idx} className="text-lg">{badge}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-800 rounded-full flex items-center justify-center mb-2">
                                        <User className="w-8 h-8 text-white" />
                                    </div>
                                    <h3 className="font-bold text-lg">{member.name}</h3>
                                    <p className="text-sm text-gray-600">{member.role} • Nível {member.level}</p>
                                    <p className="text-4xl font-extrabold text-purple-600 mt-2">{member.points.toLocaleString()}</p>
                                    <p className="text-xs text-gray-500">Pontos da Semana</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Ranking Detalhado (Abaixo do Top 3) */}
                    <h3 className="text-xl font-semibold border-t pt-4 mb-4">Outros Membros</h3>
                    <div className="space-y-3">
                        {sortedMembers.slice(3).map((member, index) => (
                            <div key={member.id} className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors border">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-sm font-bold mr-4">
                                    {index + 4}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-medium">{member.name}</h4>
                                    <span className="text-xs text-gray-500">{member.role}</span>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <div className="flex space-x-1 text-xs">
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">{member.activities.tasksCompleted} TSK</Badge>
                                        <Badge variant="secondary" className="bg-green-100 text-green-700">{member.activities.packagesShipped} PKT</Badge>
                                    </div>
                                    <p className="text-lg font-bold text-purple-600">{member.points.toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}


// --- MÓDULO PRINCIPAL ---
export default function Equipe() {
    const [currentPath, setCurrentPath] = useState("");

    const renderContent = () => {
        switch (currentPath) {
            case "/tasks":
                return <TaskManagement />;
            case "/gamificacao":
                return <Gamificacao />;
            default:
                return <ChatModule />;
        }
    };

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-gradient-to-br from-gray-50 to-white">
                <AppSidebar />
                
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />

                    {/* Navigation */}
                    <CleanNavigation 
                        items={navigationItems} 
                        basePath="/equipe" 
                        onNavigate={(path) => setCurrentPath(path)}
                        activePath={currentPath}
                    />
                    
                    {/* Main Content */}
                    <main className="flex-1 overflow-auto">
                        <div className="p-6">
                            {renderContent()}
                        </div>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
