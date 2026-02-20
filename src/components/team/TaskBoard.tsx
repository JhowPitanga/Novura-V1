

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Calendar, UserCircle, Users, Flag, MoreVertical, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useOrgMemberSearch } from "@/hooks/useChat";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";


interface Task {
    id: number;
    title: string;
    assignee: string;
    assignees?: string[];
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
    startDate?: string;
    type: string;
    storyPoints: number;
    status: 'todo' | 'doing' | 'done';
    timeTracked: number;
    labels: string[];
    dependencies: number[];
}

interface TaskBoardProps {
    tasks: Task[];
    onUpdateTask: (taskId: number, updates: Partial<Task>) => void;
    onStartTimer: (taskId: number) => void;
    onStopTimer: (taskId: number) => void;
    onOpenTaskDetail: (task: Task) => void;
    onAddTask?: () => void; // abre modal de criação
    onDeleteTask?: (taskId: number) => void;
    onAssignTask?: (taskId: number, assignee: { id: string, name: string }) => void;
    onToggleCoAssignee?: (taskId: number, member: { id: string, name: string }) => void;
    onCreateTask?: (task: Task & { visibility?: 'private' | 'team' | 'members'; visibleMemberIds?: string[]; assignedToId?: string | null }) => void; // criação rápida
}

// Mapeamento de Status para Colunas do Kanban
const statusMap = {
    todo: { name: "PENDENTE", color: "text-gray-700 bg-gray-100" },
    doing: { name: "EM PROGRESSO", color: "text-purple-700 bg-purple-100" },
    done: { name: "CONCLUÍDO", color: "text-green-700 bg-green-100" },
};

// Componente individual do Cartão da Tarefa
const TaskCard: React.FC<{ task: Task, onOpenTaskDetail: (task: Task) => void, isDragging?: boolean, onDragStart?: (id: number) => void, onDragEnd?: () => void, onDeleteTask?: (taskId: number) => void, onAssignTask?: (taskId: number, assignee: { id: string, name: string }) => void, onToggleCoAssignee?: (taskId: number, member: { id: string, name: string }) => void, onUpdateTask?: (taskId: number, updates: Partial<Task>) => void }> = ({ task, onOpenTaskDetail, isDragging, onDragStart, onDragEnd, onDeleteTask, onAssignTask, onToggleCoAssignee, onUpdateTask }) => {
    const [assigneeOpen, setAssigneeOpen] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [priorityOpen, setPriorityOpen] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [assigneeSearch, setAssigneeSearch] = useState("");
    const { results: memberResults } = useOrgMemberSearch(assigneeSearch, { alwaysList: true });

    const priorityColor = useMemo(() => {
        // Urgente mapeado via label 'urgent'
        const isUrgent = (task.labels || []).includes('urgent');
        if (isUrgent) return 'text-red-600';
        switch (task.priority) {
            case 'high': return 'text-orange-600';
            case 'medium': return 'text-yellow-600';
            case 'low':
            default:
                return 'text-green-600';
        }
    }, [task.priority, task.labels]);

    return (
        <Card 
            className={`mb-1 p-2 cursor-pointer bg-white border-l-4 border-l-purple-400 transition-all duration-150 ${isDragging ? 'opacity-80 scale-[0.98] ring-2 ring-purple-200 shadow-md' : 'hover:shadow-md'}`}
            onClick={() => onOpenTaskDetail(task)}
            draggable
            onDragStart={(e) => {
                try {
                    e.dataTransfer.setData('taskId', String(task.id));
                    e.dataTransfer.setData('text/plain', String(task.id));
                } catch {}
                onDragStart?.(task.id);
            }}
            onDragEnd={() => { onDragEnd?.(); }}
        >
            {/* Barra de ações superiores */}
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-800 truncate mr-2">{task.title}</div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-green-600" onClick={(e) => { e.stopPropagation(); onUpdateTask?.(task.id, { status: 'done' }); }} title="Concluir">
                        <Check className="w-3.5 h-3.5" />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-gray-700" onClick={(e) => e.stopPropagation()} title="Mais">
                                <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <Popover open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
                                <PopoverTrigger asChild>
                                    <DropdownMenuItem className="text-red-600" onSelect={(e) => { e.preventDefault(); setConfirmDeleteOpen(true); }}>
                                        Excluir
                                    </DropdownMenuItem>
                                </PopoverTrigger>
                                <PopoverContent align="end" sideOffset={8} className="w-64 bg-white border shadow-md p-3 rounded-xl">
                                    <div className="text-sm font-medium text-gray-900">Excluir tarefa?</div>
                                    <div className="text-xs text-gray-600 mt-1">Esta ação removerá a tarefa e não pode ser desfeita.</div>
                                    <div className="flex justify-end gap-2 mt-3">
                                        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setConfirmDeleteOpen(false)}>Cancelar</Button>
                                        <Button size="sm" className="bg-red-600 hover:bg-red-700 rounded-full" onClick={() => { setConfirmDeleteOpen(false); onDeleteTask?.(task.id); }}>Confirmar</Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            
            {/* Nova barra de ícones com popovers */}
            <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
                {/* Ícone Perfil / Responsáveis (avatares sobrepostos) */}
                <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-16 flex-shrink-0 overflow-visible rounded-full ${task.assignee ? 'text-purple-600' : 'text-gray-500'} hover:bg-gray-100`}
                            onClick={(e) => e.stopPropagation()}
                            title="Responsáveis"
                        >
                            <div className="relative flex items-center">
                                <div className="flex -space-x-2">
                                    {/* Avatar principal (ou ícone padrão) */}
                                    <Avatar className="h-6 w-6 ring-2 ring-white z-30">
                                        <AvatarImage src="" alt={task.assignee} />
                                        {task.assignee ? (
                                            <AvatarFallback className="text-[10px] font-semibold">
                                                {(task.assignee || 'US').slice(0,2).toUpperCase()}
                                            </AvatarFallback>
                                        ) : (
                                            <AvatarFallback className="flex items-center justify-center"><UserCircle className="w-3.5 h-3.5 text-gray-500" /></AvatarFallback>
                                        )}
                                    </Avatar>
                                    {(task.assignees || []).slice(1,3).map((name, idx) => (
                                        <Avatar key={idx} className="h-6 w-6 ring-2 ring-white" style={{ zIndex: 20 - idx }}>
                                            <AvatarImage src="" alt={name} />
                                            <AvatarFallback className="text-[10px] font-semibold">{(name || 'US').slice(0,2).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                    ))}
                                </div>
                                {/* Contador extra quando houver muitos co-responsáveis */}
                                {((task.assignees || []).length > 3) && (
                                    <span className="ml-1 inline-flex items-center justify-center h-4 px-1.5 rounded-full bg-gray-200 text-[10px] text-gray-700">
                                        +{(task.assignees || []).length - 3}
                                    </span>
                                )}
                                {(task.assignees && task.assignees.length > 1) && (
                                    <span className="absolute -bottom-1 -left-1 inline-flex items-center justify-center h-4 w-4 rounded-full bg-gray-200">
                                        <Users className="w-3 h-3 text-gray-600" />
                                    </span>
                                )}
                            </div>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start" sideOffset={6} onClick={(e) => e.stopPropagation()}>
                        <Input placeholder="Buscar membros" value={assigneeSearch} onChange={(e) => setAssigneeSearch(e.target.value)} className="h-8 mb-2" />
                        <div className="max-h-40 overflow-auto">
                            {(memberResults || []).map((u: any) => {
                                const name = (u as any).nome || u.email;
                                const selected = (task.assignee === name) || ((task.assignees || []).includes(name));
                                return (
                                    <div
                                        key={u.id}
                                        className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer rounded ${selected ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                                        onClick={() => {
                                            if (task.assignee === name) {
                                                onAssignTask?.(task.id, { id: u.id, name });
                                            } else {
                                                onToggleCoAssignee?.(task.id, { id: u.id, name });
                                            }
                                        }}
                                    >
                                        <div className="relative">
                                            <Avatar className="h-6 w-6">
                                                <AvatarImage src="" alt={name} />
                                                <AvatarFallback className="text-[10px]">{(name || 'US').slice(0,2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            {selected && (
                                                <span className="absolute -bottom-1 -right-1 inline-flex items-center justify-center h-3 w-3 rounded-full bg-purple-600">
                                                    <Check className="w-3 h-3 text-white" />
                                                </span>
                                            )}
                                        </div>
                                        <span className="truncate">{name}</span>
                                    </div>
                                );
                            })}
                            {(!memberResults || memberResults.length === 0) && (
                                <div className="px-2 py-1 text-xs text-gray-500">Nenhum membro encontrado</div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
                {/* Avatares adicionais exibidos no botão acima; removido aqui para evitar duplicação */}

                {/* Ícone Calendário: data inicial e entrega */}
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" className={`h-7 px-2 rounded-full ${task.dueDate ? 'text-purple-600' : 'text-gray-600'} hover:bg-gray-100`} onClick={(e) => e.stopPropagation()} title="Datas">
                            <Calendar className="w-3.5 h-3.5 mr-1" />
                            {task.dueDate && (
                                <span className="text-[10px] font-semibold">{format(new Date(task.dueDate), 'MMM d', { locale: ptBR })}</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start" sideOffset={6} onClick={(e) => e.stopPropagation()}>
                        <CalendarComponent
                            mode="range"
                            selected={(task.startDate || task.dueDate) ? { from: task.startDate ? new Date(task.startDate) : undefined, to: task.dueDate ? new Date(task.dueDate) : undefined } : undefined}
                            onSelect={(range: any) => {
                                const to = range?.to ? format(range.to, 'yyyy-MM-dd') : '';
                                const from = range?.from ? format(range.from, 'yyyy-MM-dd') : undefined;
                                onUpdateTask?.(task.id, { dueDate: to, startDate: from });
                                setCalendarOpen(false);
                            }}
                            locale={ptBR}
                        />
                    </PopoverContent>
                </Popover>

                {/* Ícone Prioridade com tags */}
                <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className={`h-7 w-7 rounded-full ${priorityColor} hover:bg-gray-100`} onClick={(e) => e.stopPropagation()} title="Prioridade">
                            <Flag className="w-3.5 h-3.5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-2" align="start" sideOffset={6} onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                            <Button variant="ghost" className="w-full justify-start gap-2 text-gray-700" onClick={() => { const labels = Array.from(new Set([...(task.labels || []), 'urgent'])); onUpdateTask?.(task.id, { priority: 'high', labels }); setPriorityOpen(false); }}>
                                <Flag className="w-4 h-4 text-red-600" /> Urgente
                            </Button>
                            <Button variant="ghost" className="w-full justify-start gap-2 text-gray-700" onClick={() => { const labels = (task.labels || []).filter(l => l !== 'urgent'); onUpdateTask?.(task.id, { priority: 'high', labels }); setPriorityOpen(false); }}>
                                <Flag className="w-4 h-4 text-orange-600" /> Alta
                            </Button>
                            <Button variant="ghost" className="w-full justify-start gap-2 text-gray-700" onClick={() => { const labels = (task.labels || []).filter(l => l !== 'urgent'); onUpdateTask?.(task.id, { priority: 'medium', labels }); setPriorityOpen(false); }}>
                                <Flag className="w-4 h-4 text-yellow-600" /> Média
                            </Button>
                            <Button variant="ghost" className="w-full justify-start gap-2 text-gray-700" onClick={() => { const labels = (task.labels || []).filter(l => l !== 'urgent'); onUpdateTask?.(task.id, { priority: 'low', labels }); setPriorityOpen(false); }}>
                                <Flag className="w-4 h-4 text-green-600" /> Baixa
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </Card>
    );
};

// Componente da Coluna Kanban
const KanbanColumn: React.FC<{ status: 'todo' | 'doing' | 'done', tasks: Task[], onOpenTaskDetail: (task: Task) => void, onAddTask?: () => void, onUpdateTask?: (taskId: number, updates: Partial<Task>) => void, draggedTaskId?: number | null, onDragStart?: (id: number) => void, onDragEnd?: () => void, onDeleteTask?: (taskId: number) => void, onAssignTask?: (taskId: number, assignee: { id: string, name: string }) => void, onToggleCoAssignee?: (taskId: number, member: { id: string, name: string }) => void, onCreateTask?: (task: Task & { visibility?: 'private' | 'team' | 'members'; visibleMemberIds?: string[]; assignedToId?: string | null }) => void }> = ({ status, tasks, onOpenTaskDetail, onAddTask, onUpdateTask, draggedTaskId, onDragStart, onDragEnd, onDeleteTask, onAssignTask, onToggleCoAssignee, onCreateTask }) => {
    const { name, color } = statusMap[status];
    const [isDragOver, setIsDragOver] = useState(false);
    // Estados do Quick Create
    const [qcOpenHeader, setQcOpenHeader] = useState(false);
    const [qcOpenFooter, setQcOpenFooter] = useState(false);
    const [qcTitle, setQcTitle] = useState('');
    const [qcPriority, setQcPriority] = useState<'low'|'medium'|'high'>('medium');
    const [qcDueDate, setQcDueDate] = useState<string>('');
    const [qcTagsInput, setQcTagsInput] = useState('');
    const [qcTags, setQcTags] = useState<string[]>([]);
    const [qcAssigneeSearch, setQcAssigneeSearch] = useState('');
    const [qcAssigneeId, setQcAssigneeId] = useState<string | null>(null);
    const [qcAssigneeName, setQcAssigneeName] = useState<string>('');
    const { results: qcMemberResults } = useOrgMemberSearch(qcAssigneeSearch, { alwaysList: true });
    // Sub-popovers
    const [qcRespOpen, setQcRespOpen] = useState(false);
    const [qcDateOpen, setQcDateOpen] = useState(false);
    const [qcPrioOpen, setQcPrioOpen] = useState(false);
    const [qcTagOpen, setQcTagOpen] = useState(false);

    const resetQuickCreate = () => {
        setQcTitle('');
        setQcPriority('medium');
        setQcDueDate('');
        setQcTagsInput('');
        setQcTags([]);
        setQcAssigneeSearch('');
        setQcAssigneeId(null);
        setQcAssigneeName('');
    };

    const handleQuickSave = (close: () => void) => {
        if (!qcTitle.trim()) return;
        const newTask: Task & { visibility?: 'private' | 'team' | 'members'; visibleMemberIds?: string[]; assignedToId?: string | null } = {
            id: Date.now(),
            title: qcTitle.trim(),
            assignee: qcAssigneeName || '',
            assignees: qcAssigneeName ? [qcAssigneeName] : [],
            priority: qcPriority,
            dueDate: qcDueDate || '',
            startDate: undefined,
            type: 'task',
            storyPoints: 0,
            status,
            timeTracked: 0,
            labels: qcTags,
            dependencies: [],
            visibility: 'team',
            visibleMemberIds: [],
            assignedToId: qcAssigneeId,
        };
        onCreateTask?.(newTask);
        close();
        resetQuickCreate();
    };

    const QuickCreateContent = ({ close }: { close: () => void }) => (
        <div className="w-[280px]">
            <div className="flex items-center justify-between mb-2">
                <Input placeholder="Nome da tarefa..." value={qcTitle} onChange={(e) => setQcTitle(e.target.value)} className="h-8 text-xs" />
                <Button size="sm" className="ml-2 h-8 px-3 rounded-full" onClick={() => handleQuickSave(close)}>
                    Salvar <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
            </div>
            <div className="text-[11px] text-gray-600 mb-2">List</div>

            {/* Items acionadores de sub-popover */}
            <div className="space-y-2">
                {/* Responsável */}
                <Popover open={qcRespOpen} onOpenChange={setQcRespOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start h-8 text-xs text-gray-700 hover:bg-gray-50" onClick={(e) => { e.stopPropagation(); setQcRespOpen(true); }}>
                            <Users className="w-4 h-4 mr-2" /> Adicionar responsável
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={6} className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
                        <Input placeholder="Buscar" value={qcAssigneeSearch} onChange={(e) => setQcAssigneeSearch(e.target.value)} className="h-8 text-xs mb-2" />
                        <div className="max-h-32 overflow-auto">
                            {(qcMemberResults || []).map((u: any) => {
                                const name = (u as any).nome || u.email;
                                return (
                                    <Button key={u.id} variant={qcAssigneeId === u.id ? 'secondary' : 'ghost'} className="w-full justify-start h-7 text-xs" onClick={() => { setQcAssigneeId(u.id); setQcAssigneeName(name); setQcRespOpen(false); }}>
                                        {name}
                                    </Button>
                                );
                            })}
                            {(!qcMemberResults || qcMemberResults.length === 0) && (
                                <div className="px-2 py-1 text-xs text-gray-500">Nenhum membro encontrado</div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Datas */}
                <Popover open={qcDateOpen} onOpenChange={setQcDateOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start h-8 text-xs text-gray-700 hover:bg-gray-50" onClick={(e) => { e.stopPropagation(); setQcDateOpen(true); }}>
                            <Calendar className="w-4 h-4 mr-2" /> Adicionar datas
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={6} className="w-auto p-2" onClick={(e) => e.stopPropagation()}>
                        <CalendarComponent mode="single" selected={qcDueDate ? new Date(qcDueDate) : undefined} onSelect={(d: any) => { setQcDueDate(d ? format(d, 'yyyy-MM-dd') : ''); setQcDateOpen(false); }} locale={ptBR} />
                    </PopoverContent>
                </Popover>

                {/* Prioridade */}
                <Popover open={qcPrioOpen} onOpenChange={setQcPrioOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start h-8 text-xs text-gray-700 hover:bg-gray-50" onClick={(e) => { e.stopPropagation(); setQcPrioOpen(true); }}>
                            <Flag className="w-4 h-4 mr-2" /> Adicionar prioridade
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={6} className="w-48 p-2" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                            <Button variant="ghost" className={`w-full justify-start gap-2 h-8 text-xs ${qcPriority === 'high' ? 'bg-orange-100 text-orange-800' : 'text-gray-700'}`} onClick={() => { setQcPriority('high'); setQcPrioOpen(false); }}>
                                <Flag className="w-4 h-4 text-orange-600" /> Alta
                            </Button>
                            <Button variant="ghost" className={`w-full justify-start gap-2 h-8 text-xs ${qcPriority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'text-gray-700'}`} onClick={() => { setQcPriority('medium'); setQcPrioOpen(false); }}>
                                <Flag className="w-4 h-4 text-yellow-600" /> Média
                            </Button>
                            <Button variant="ghost" className={`w-full justify-start gap-2 h-8 text-xs ${qcPriority === 'low' ? 'bg-green-100 text-green-800' : 'text-gray-700'}`} onClick={() => { setQcPriority('low'); setQcPrioOpen(false); }}>
                                <Flag className="w-4 h-4 text-green-600" /> Baixa
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Tags */}
                <Popover open={qcTagOpen} onOpenChange={setQcTagOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start h-8 text-xs text-gray-700 hover:bg-gray-50" onClick={(e) => { e.stopPropagation(); setQcTagOpen(true); }}>
                            <span className="mr-2">🏷️</span> Add tag
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={6} className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                            <Input placeholder="tag" value={qcTagsInput} onChange={(e) => setQcTagsInput(e.target.value)} className="h-8 text-xs" />
                            <Button size="sm" variant="outline" className="h-8" onClick={() => { const t = qcTagsInput.trim(); if (t) { setQcTags(prev => Array.from(new Set([...prev, t]))); setQcTagsInput(''); } }}>Add</Button>
                        </div>
                        {qcTags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {qcTags.map(t => (
                                    <span key={t} className="inline-flex items-center px-2 h-6 rounded-full bg-gray-100 text-[11px] text-gray-700">{t}</span>
                                ))}
                            </div>
                        )}
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );

    return (
        // Simulação de Drag & Drop - A classe 'group-hover:' é um placeholder
        <div className="w-1/3 flex-shrink-0 mx-1">
            <Card className="bg-gray-50 shadow-none border-t-4 border-gray-200">
                <CardHeader className="p-2 pb-2 flex-row items-center justify-between">
                    <CardTitle className={`flex items-center text-sm font-bold ${color}`}>
                        {name} <span className="ml-2 text-xs font-semibold text-gray-500">({tasks.length})</span>
                    </CardTitle>
                    {/* Botão Adicionar Tarefa - Simulação */}
                    {status !== 'done' && (
                        <Popover open={qcOpenHeader} onOpenChange={setQcOpenHeader}>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-gray-500 hover:text-purple-600 p-1 h-auto" onClick={(e) => { e.stopPropagation(); setQcOpenHeader(true); }}>
                                    <Plus className="w-3.5 h-3.5" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" sideOffset={8} className="bg-white border shadow p-3 rounded-xl">
                                {QuickCreateContent({ close: () => setQcOpenHeader(false) })}
                            </PopoverContent>
                        </Popover>
                    )}
                </CardHeader>
                <CardContent 
                    className={`p-2 pt-0 h-full overflow-y-visible min-h-[300px] transition-all ${isDragOver ? 'ring-2 ring-purple-300 bg-purple-50/50' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragEnter={() => setIsDragOver(true)}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        let idStr = '';
                        try { idStr = e.dataTransfer.getData('taskId') || e.dataTransfer.getData('text/plain'); } catch {}
                        const taskId = Number(idStr);
                        if (!isNaN(taskId)) {
                            onUpdateTask?.(taskId, { status });
                        }
                        setIsDragOver(false);
                        onDragEnd?.();
                    }}
                >
                    {/* Lista de Tarefas */}
                    {tasks.map(task => (
                        <TaskCard key={task.id} task={task} onOpenTaskDetail={onOpenTaskDetail} isDragging={draggedTaskId === task.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onDeleteTask={onDeleteTask} onAssignTask={onAssignTask} onToggleCoAssignee={onToggleCoAssignee} onUpdateTask={onUpdateTask} />
                    ))}
                    {/* Adicionar Tarefa no final da coluna com popover de criação rápida */}
                    <div className="mt-2">
                        <Popover open={qcOpenFooter} onOpenChange={setQcOpenFooter}>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" className="w-full justify-start text-xs text-gray-500 hover:bg-gray-100" onClick={(e) => { e.stopPropagation(); setQcOpenFooter(true); }}>
                                    <Plus className="w-3.5 h-3.5 mr-2" /> Adicionar Tarefa
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" sideOffset={8} className="bg-white border shadow p-3 rounded-xl">
                                {QuickCreateContent({ close: () => setQcOpenFooter(false) })}
                            </PopoverContent>
                        </Popover>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

// Componente principal do TaskBoard
export const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onUpdateTask, onStartTimer, onStopTimer, onOpenTaskDetail, onAddTask, onDeleteTask, onAssignTask, onToggleCoAssignee, onCreateTask }) => {
    const todoTasks = tasks.filter(t => t.status === 'todo');
    const doingTasks = tasks.filter(t => t.status === 'doing');
    const doneTasks = tasks.filter(t => t.status === 'done');
    const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);

    return (
        <div className="flex overflow-x-hidden p-2 space-x-2 h-full">
            <KanbanColumn status="todo" tasks={todoTasks} onOpenTaskDetail={onOpenTaskDetail} onAddTask={onAddTask} onUpdateTask={onUpdateTask} draggedTaskId={draggedTaskId} onDragStart={(id) => setDraggedTaskId(id)} onDragEnd={() => setDraggedTaskId(null)} onDeleteTask={onDeleteTask} onAssignTask={onAssignTask} onToggleCoAssignee={onToggleCoAssignee} onCreateTask={onCreateTask} />
            <KanbanColumn status="doing" tasks={doingTasks} onOpenTaskDetail={onOpenTaskDetail} onAddTask={onAddTask} onUpdateTask={onUpdateTask} draggedTaskId={draggedTaskId} onDragStart={(id) => setDraggedTaskId(id)} onDragEnd={() => setDraggedTaskId(null)} onDeleteTask={onDeleteTask} onAssignTask={onAssignTask} onToggleCoAssignee={onToggleCoAssignee} onCreateTask={onCreateTask} />
            <KanbanColumn status="done" tasks={doneTasks} onOpenTaskDetail={onOpenTaskDetail} onAddTask={onAddTask} onUpdateTask={onUpdateTask} draggedTaskId={draggedTaskId} onDragStart={(id) => setDraggedTaskId(id)} onDragEnd={() => setDraggedTaskId(null)} onDeleteTask={onDeleteTask} onAssignTask={onAssignTask} onToggleCoAssignee={onToggleCoAssignee} onCreateTask={onCreateTask} />

        </div>
    );
};