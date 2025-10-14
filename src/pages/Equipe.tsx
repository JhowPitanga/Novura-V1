// Equipe.tsx (Código Completo Atualizado)

import { useState } from "react";
import { MessageSquare, Kanban, Plus, Users, Trophy, User, Target, Zap, Clock, Calendar, CheckSquare, Filter, ChevronDown, ListPlus, Search } from "lucide-react";
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
import { TaskBacklog } from "@/components/equipe/TaskBacklog";
import { TaskRoadmap } from "@/components/equipe/TaskRoadmap";
import { TaskViews } from "@/components/equipe/TaskViews"; 
import { TaskDetailModal } from "@/components/equipe/TaskDetailModal"; // NOVO

// --- INTERFACE DE TAREFA ---
// Usar o tipo compartilhado do CreateTaskModal para garantir compatibilidade
import type { Task, TaskPriority, TaskType, TaskStatus } from "@/components/equipe/CreateTaskModal";

// --- DADOS MOCKADOS (Mantidos) ---
const navigationItems = [
    { title: "Chat", path: "", icon: MessageSquare, description: "Comunicação da equipe" },
    { title: "Tasks", path: "/tasks", icon: Kanban, description: "Gerenciamento de tarefas" },
    { title: "Gamificação", path: "/gamificacao", icon: Trophy, description: "Desempenho da equipe" },
];

const initialTasks: Task[] = [
    { id: 1, title: "Implementar API de pagamento", assignee: "Ana Silva", priority: "high", dueDate: "2024-01-20", type: "story", storyPoints: 8, status: "todo", sprint: "sprint-1", timeTracked: 120, labels: ["backend", "api"], dependencies: [] },
    { id: 2, title: "Corrigir bug no checkout", assignee: "Carlos Lima", priority: "high", dueDate: "2024-01-18", type: "bug", storyPoints: 3, status: "doing", sprint: "sprint-1", timeTracked: 90, labels: ["frontend", "urgente"], dependencies: [] },
    { id: 3, title: "Atualizar documentação", assignee: "Marina Costa", priority: "medium", dueDate: "2024-01-25", type: "task", storyPoints: 2, status: "todo", sprint: "sprint-1", timeTracked: 60, labels: ["docs"], dependencies: [] },
    { id: 4, title: "Desenvolver dashboard analytics", assignee: "João Santos", priority: "high", dueDate: "2024-01-22", type: "epic", storyPoints: 13, status: "doing", sprint: "sprint-1", timeTracked: 300, labels: ["dashboard", "analytics"], dependencies: [1] },
    { id: 5, title: "Otimizar performance mobile", assignee: "Ana Silva", priority: "medium", dueDate: "2024-01-24", type: "story", storyPoints: 5, status: "todo", sprint: "sprint-2", timeTracked: 45, labels: ["mobile", "performance"], dependencies: [] },
    { id: 6, title: "Setup CI/CD pipeline", assignee: "Carlos Lima", priority: "medium", dueDate: "2024-01-15", type: "task", storyPoints: 8, status: "done", sprint: "sprint-1", timeTracked: 480, labels: ["devops", "ci/cd"], dependencies: [] },
    { id: 7, title: "Implementar autenticação", assignee: "Marina Costa", priority: "high", dueDate: "2024-01-10", type: "story", storyPoints: 13, status: "done", sprint: "sprint-1", timeTracked: 360, labels: ["auth", "security"], dependencies: [] }
];

const teamMembers = [
    { id: 1, name: "Ana Silva", role: "Desenvolvedora", avatar: "/placeholder.svg", points: 2850, level: 12, badges: ["🏆", "⚡", "🎯"], activities: { tasksCompleted: 45, packagesShipped: 0, codeReviews: 23, bugs: 8 } },
    { id: 2, name: "Carlos Lima", role: "Logística", avatar: "/placeholder.svg", points: 3200, level: 15, badges: ["📦", "🚀", "⭐"], activities: { tasksCompleted: 32, packagesShipped: 156, codeReviews: 0, bugs: 0 } },
    { id: 3, name: "Marina Costa", role: "Designer", avatar: "/placeholder.svg", points: 2650, level: 11, badges: ["🎨", "✨", "💫"], activities: { tasksCompleted: 38, packagesShipped: 0, codeReviews: 15, bugs: 2 } },
    { id: 4, name: "João Santos", role: "Logística", avatar: "/placeholder.svg", points: 2950, level: 13, badges: ["📦", "🎯", "⚡"], activities: { tasksCompleted: 28, packagesShipped: 203, codeReviews: 0, bugs: 0 } }
];

const mockChats = [
    { id: 1, name: "Fushiguro Megumi", lastMsg: "você: enviou um anexo.", time: "9m", color: "purple", isStarred: true, isGroup: false },
    { id: 2, name: "Yaga Masamichi", lastMsg: "você: Parece bom plano. Mal poss...", time: "25m", color: "purple", isStarred: false, isGroup: false },
    { id: 3, name: "Nota Ninjas", lastMsg: "Parece bom. Vamos nos concentrar...", time: "44m", color: "green", isStarred: false, isGroup: true },
    { id: 4, name: "Momo Nishimiya", lastMsg: "Obrigado. Isso significa muito para...", time: "44m", color: "orange", isStarred: false, isGroup: false },
    { id: 5, name: "Equipe de Logística", lastMsg: "Cálculo do frete atualizado.", time: "1h", color: "blue", isStarred: false, isGroup: true },
    { id: 6, name: "Suguru Geto", lastMsg: "Tenho uma dúvida no deploy.", time: "2h", color: "red", isStarred: false, isGroup: false },
];

const ChatAvatar = ({ isGroup, color }: { isGroup: boolean, color: string }) => (
    <div className={`w-10 h-10 bg-${color}-200 rounded-full flex items-center justify-center mr-3`}>
        {isGroup ? <Users className={`w-5 h-5 text-${color}-800`} /> : <User className={`w-5 h-5 text-${color}-800`} />}
    </div>
);


// --- 1. MÓDULO CHAT (Design dos Anexos) ---
function ChatModule() {
    const [selectedChatId, setSelectedChatId] = useState<number | null>(1); 
    const [searchTerm, setSearchTerm] = useState("");
    const [showStarred, setShowStarred] = useState(true);
    const [showDMs, setShowDMs] = useState(true);
    const [showTeams, setShowTeams] = useState(true);

    const filteredChats = mockChats.filter(chat =>
        chat.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    const starredChats = filteredChats.filter(chat => chat.isStarred);
    const dmChats = filteredChats.filter(chat => !chat.isStarred && !chat.isGroup);
    const teamChats = filteredChats.filter(chat => !chat.isStarred && chat.isGroup);

    const ChatListItem = ({ chat }: { chat: typeof mockChats[0] }) => {
        const isActive = chat.id === selectedChatId;

        return (
            <div 
                key={chat.id} 
                className={`flex items-center p-3 rounded-lg transition-colors cursor-pointer 
                            ${isActive ? 'bg-purple-50 border-l-4 border-purple-600' : 'hover:bg-gray-100'}`}
                onClick={() => setSelectedChatId(chat.id)}
            >
                <ChatAvatar isGroup={chat.isGroup} color={chat.color} />
                
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 truncate">{chat.name}</h4>
                    <p className="text-xs text-gray-500 truncate">{chat.lastMsg}</p>
                </div>
                <span className="text-xs text-gray-400 ml-2">{chat.time}</span>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-140px)] bg-white border rounded-lg overflow-hidden shadow-lg">
            
            <div className="w-80 border-r bg-gray-50 flex-shrink-0 flex flex-col">
                <div className="p-4 border-b">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                            <span className="text-lg font-semibold text-gray-800">Mensagens</span>
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                {mockChats.length}
                            </Badge>
                        </div>
                        <Button variant="ghost" size="icon" className="text-purple-600 hover:bg-purple-100">
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
                        />
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-2">
                    
                    {starredChats.length > 0 && (
                        <>
                            <div 
                                className="px-2 py-2 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md"
                                onClick={() => setShowStarred(!showStarred)}
                            >
                                Estrelado ({starredChats.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showStarred ? 'rotate-180' : ''}`} />
                            </div>
                            {showStarred && (
                                <div className="space-y-1 mt-1">
                                    {starredChats.map(chat => <ChatListItem key={chat.id} chat={chat} />)}
                                </div>
                            )}
                        </>
                    )}

                    {dmChats.length > 0 && (
                        <>
                            <div 
                                className="px-2 py-4 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md"
                                onClick={() => setShowDMs(!showDMs)}
                            >
                                Mensagens Diretas ({dmChats.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showDMs ? 'rotate-180' : ''}`} />
                            </div>
                            {showDMs && (
                                <div className="space-y-1 mt-1">
                                    {dmChats.map(chat => <ChatListItem key={chat.id} chat={chat} />)}
                                </div>
                            )}
                        </>
                    )}

                    {teamChats.length > 0 && (
                        <>
                            <div 
                                className="px-2 py-4 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md"
                                onClick={() => setShowTeams(!showTeams)}
                            >
                                Equipes ({teamChats.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showTeams ? 'rotate-180' : ''}`} />
                            </div>
                            {showTeams && (
                                <div className="space-y-1 mt-1">
                                    {teamChats.map(chat => <ChatListItem key={chat.id} chat={chat} />)}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center w-full">
                {selectedChatId ? (
                    <ChatTab /> 
                ) : (
                    <div className="flex flex-col items-center justify-center h-full w-full text-center text-gray-500 p-8">
                        <div className="w-40 h-40 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <MessageSquare className="w-16 h-16 text-purple-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-700">Selecione uma conversa</h3>
                        <p className="mt-2 text-sm max-w-sm">
                            para visualizar suas mensagens.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// --- 2. MÓDULO TASK (ATUALIZADO PARA KANBAN E MODAL) ---
function TaskManagement() {
    const [tasks, setTasks] = useState(initialTasks);
    const [currentTab, setCurrentTab] = useState("board");
    const [currentView, setCurrentView] = useState("sprint-1"); 

    // NOVO ESTADO: Para gerenciar a abertura/dados do modal de detalhe
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedTaskDetail, setSelectedTaskDetail] = useState<Task | null>(null);

    const handleCreateTask = (newTask: Task) => {
        setTasks(prev => [...prev, { ...newTask, id: Date.now(), status: 'todo' }]);
    };

    const handleUpdateTask = (taskId: number, updates: Partial<Task>) => {
        setTasks(prev => prev.map(task => 
            task.id === taskId ? { ...task, ...updates } : task
        ));
    };

    const handleStartTimer = (taskId: number) => { console.log(`Timer iniciado para tarefa ${taskId}`); };
    const handleStopTimer = (taskId: number) => { console.log(`Timer parado para tarefa ${taskId}`); };

    // NOVA FUNÇÃO: Abre o modal e define a tarefa selecionada
    const handleOpenTaskDetail = (task: Task) => {
        setSelectedTaskDetail(task);
        setIsDetailModalOpen(true);
    };

    const handleCloseTaskDetail = () => {
        setIsDetailModalOpen(false);
        setSelectedTaskDetail(null);
    };

    return (
        <div className="space-y-4">
            {/* Header de Gerenciamento de Tarefas */}
            <div className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-between border">
                {/* Seleção de Projeto/Sprint (View Context) */}
                <div className="flex items-center space-x-3">
                    <h2 className="text-xl font-bold text-gray-900">Novura ERP V2</h2> {/* Nome do projeto do anexo */}
                    <Select value={currentView} onValueChange={setCurrentView}>
                        <SelectTrigger className="w-40 text-sm font-medium border-purple-300 bg-purple-50 text-purple-700">
                            <ListPlus className="w-4 h-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="sprint-1">Sprint 1 (Atual)</SelectItem>
                            <SelectItem value="sprint-2">Sprint 2</SelectItem>
                            <SelectItem value="backlog-geral">Backlog Geral</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                {/* Botões de Ação */}
                <div className="flex items-center space-x-3">
                    <Button variant="outline" className="text-gray-700 hover:bg-gray-100">
                        <Filter className="w-4 h-4 mr-2" /> Filtros
                    </Button>
                    {/* O modal de criação de tarefa precisa ser atualizado para usar a interface 'Task' */}
                    <CreateTaskModal onCreateTask={handleCreateTask} /> 
                </div>
            </div>

            {/* Abas de Visualização (Board, Backlog, Roadmap, etc) */}
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
                <TabsList className="bg-white border w-full justify-start h-12">
                    <TabsTrigger value="board" className="font-semibold text-gray-700 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
                        <Kanban className="w-4 h-4 mr-2" /> Quadro
                    </TabsTrigger>
                    <TabsTrigger value="backlog" className="font-semibold text-gray-700 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
                        <Calendar className="w-4 h-4 mr-2" /> Backlog & Sprints
                    </TabsTrigger>
                    <TabsTrigger value="roadmap" className="font-semibold text-gray-700 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
                        <Target className="w-4 h-4 mr-2" /> Roadmap
                    </TabsTrigger>
                    <TabsTrigger value="views" className="font-semibold text-gray-700 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
                        <ListPlus className="w-4 h-4 mr-2" /> Outras Views
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="board" className="pt-4 h-[calc(100vh-280px)]"> 
                    {/* O TaskBoard agora é a visualização Kanban */}
                    <TaskBoard 
                        tasks={tasks.filter(t => t.sprint === currentView)} // Filtra por Sprint/View
                        onUpdateTask={handleUpdateTask}
                        onStartTimer={handleStartTimer}
                        onStopTimer={handleStopTimer}
                        onOpenTaskDetail={handleOpenTaskDetail} // Passa a nova função para abrir o modal
                    />
                </TabsContent>

                <TabsContent value="backlog" className="pt-4">
                    <TaskBacklog 
                        tasks={tasks}
                        onUpdateTask={handleUpdateTask}
                    />
                </TabsContent>

                <TabsContent value="roadmap" className="pt-4">
                    <TaskRoadmap tasks={tasks} />
                </TabsContent>

                <TabsContent value="views" className="pt-4">
                    <TaskViews 
                        tasks={tasks}
                        onUpdateTask={handleUpdateTask}
                        onStartTimer={handleStartTimer}
                        onStopTimer={handleStopTimer}
                    />
                </TabsContent>
            </Tabs>

            {/* Modal de Detalhes da Tarefa (NOVO) */}
            <TaskDetailModal 
                task={selectedTaskDetail} 
                isOpen={isDetailModalOpen} 
                onClose={handleCloseTaskDetail} 
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