// Equipe.tsx (Código Completo Atualizado)

import { useState, useEffect, useMemo } from "react";
import { MessageSquare, Kanban, Plus, Users, Trophy, User, Target, Zap, Clock, Calendar, CheckSquare, Filter, ChevronDown, ListPlus, Search, MoreVertical, Check } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { CleanNavigation } from "@/components/CleanNavigation";
import { ChatTab } from "@/components/team/ChatTab";
import { TasksTab } from "@/components/team/TasksTab";
import { ChatSidebar } from "@/components/team/ChatSidebar";
import { GamificationTab } from "@/components/team/GamificationTab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Importações para Task Management
import { CreateTaskModal } from "@/components/team/CreateTaskModal";
import { TaskBoard } from "@/components/team/TaskBoard"; // ATUALIZADO (Kanban)
// Removido: Backlog, Roadmap e Views (não será utilizado)
import { TaskDetailModal } from "@/components/team/TaskDetailModal"; // NOVO
import LoadingOverlay from "@/components/LoadingOverlay";
import { useChatChannels, useOrgMemberSearch } from "@/hooks/useChat";
import { useChatUnread } from "@/hooks/useChatUnread";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

// --- INTERFACE DE TAREFA ---
// Usar o tipo compartilhado do CreateTaskModal para garantir compatibilidade
import type { Task, TaskPriority, TaskType, TaskStatus } from "@/types/team";
import { mapRowToTask, mergeLabels, buildMemberMap, extractTaskExtras } from "@/utils/teamTasks";
import {
    fetchTasks as svcFetchTasks,
    createTask as svcCreateTask,
    updateTask as svcUpdateTask,
    assignTask as svcAssignTask,
    toggleCoAssigneeTask as svcToggleCoAssignee,
    deleteTask as svcDeleteTask,
    fetchOrgMembers as svcFetchOrgMembers,
    fetchUnreadCounts as svcFetchUnreadCounts,
    upsertUnreadCount as svcUpsertUnreadCount,
    markChannelRead as svcMarkChannelRead,
    fetchDmUserProfile as svcFetchDmUserProfile,
} from "@/services/team.service";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// --- DADOS MOCKADOS (Mantidos) ---
const navigationItems = [
    { title: "Chat", path: "", icon: MessageSquare, description: "Comunicação da equipe" },
    { title: "Tasks", path: "/tasks", icon: Kanban, description: "Gerenciamento de tarefas" },
    { title: "Gamificação", path: "/gamificacao", icon: Trophy, description: "Desempenho da equipe" },
];


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
    const [activeDisplayName, setActiveDisplayName] = useState<string | undefined>(undefined);
    const allChannels = useMemo(() => [
        ...(channels || []),
        ...(directChannels || []),
        ...(teamChannels || [])
    ], [channels, directChannels, teamChannels]);
    const activeChannel = useMemo(() => allChannels.find(c => c.id === activeChannelId) || null, [allChannels, activeChannelId]);
    const { results: memberResults } = useOrgMemberSearch(memberSearch, { alwaysList: true });

    const { unreadCounts, unreadTotal, markRead } = useChatUnread(activeChannelId);

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
                    const { data: profile } = await svcFetchDmUserProfile(otherId);
                    if (profile) { nome = (profile as any).nome; email = (profile as any).email; }
                } catch {}
                if (!nome && !email && organizationId) {
                    try {
                        const { data: mems } = await svcFetchOrgMembers(organizationId);
                        const found = (mems as any[])?.find((u) => u.id === otherId);
                        nome = (found as any)?.nome ?? null; email = (found as any)?.email ?? null;
                    } catch {}
                }
                if (mounted) setActiveDisplayName(nome || email || ch.name || undefined);
            } catch { if (mounted) setActiveDisplayName((activeChannel as any)?.name); }
        })();
        return () => { mounted = false; };
    }, [activeChannel, user, organizationId]);

    return (
        <>
        <div className="flex h-[calc(100vh-140px)] bg-white border rounded-lg overflow-hidden shadow-lg">
            <ChatSidebar
                channels={channels}
                directChannels={directChannels}
                teamChannels={teamChannels}
                unreadCounts={unreadCounts}
                unreadTotal={unreadTotal}
                activeChannelId={activeChannelId}
                onChannelSelect={(chId, name) => { if (chId) setActiveChannelId(chId); else setActiveChannelId(null); setActiveDisplayName(name); }}
                onMarkRead={markRead}
                onToggleStar={(chId, starred) => toggleStar(chId, starred)}
                onDeleteChannel={async (chId) => { const res = await deleteChannel(chId); return (res as any) || {}; }}
                onStartDirectMessage={async (uid) => { const res = await startDirectMessage(uid); return (res as any) || {}; }}
                onCreateGroup={() => setCreateOpen(true)}
            />

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



// --- MÓDULO PRINCIPAL ---
export default function Equipe() {
    const [currentPath, setCurrentPath] = useState("");

    const renderContent = () => {
        switch (currentPath) {
            case "/tasks":
                return <TasksTab />;
            case "/gamificacao":
                return <GamificationTab />;
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
