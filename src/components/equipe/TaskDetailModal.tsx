// src/components/equipe/TaskDetailModal.tsx

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Calendar, Target, User, Users, Paperclip, ChevronDown, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useOrgMemberSearch } from "@/hooks/useChat";

// Interface Task (simplificada para o modal)
interface Task {
    id: number;
    title: string;
    assignee: string;
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
    status: string;
    timeTracked: number;
    creatorName?: string;
    participantNames?: string[];
    description?: string;
}

interface TaskDetailModalProps {
    task: Task | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdateTask?: (taskId: number, updates: Partial<Task>) => void;
    onToggleParticipant?: (taskId: number, member: { id: string; name: string }) => void;
}

// Removido: mock de atividade. Integração real será adicionada posteriormente.

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, isOpen, onClose, onUpdateTask, onToggleParticipant }) => {
    const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
    const [description, setDescription] = useState<string>("");
    const [attachments, setAttachments] = useState<{ label: string; url: string }[]>([]);
    const [attachOpen, setAttachOpen] = useState(false);
    const [attachUrl, setAttachUrl] = useState("");
    const [memberSearch, setMemberSearch] = useState("");
    const { results: memberResults } = useOrgMemberSearch(memberSearch, { alwaysList: true });

    useEffect(() => {
        const fetchDescription = async () => {
            if (!task?.id || !isOpen) return;
            const { data, error } = await supabase
                .from('tasks')
                .select('description')
                .eq('id', task.id)
                .limit(1)
                .maybeSingle();
            if (!error && data) {
                setDescription(data.description || "");
            } else {
                setDescription("");
            }
        };
        fetchDescription();
    }, [task?.id, isOpen]);

    if (!task) return null;

    // Função para simular o envio de comentário
    const handleCommentSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (comment.trim()) {
            console.log(`Comentário adicionado à tarefa ${task.id}: ${comment}`);
            setComment("");
            // Aqui adicionaria a lógica para atualizar o mockActivity/API
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[1000px] p-0 flex h-[90vh]">
                
                {/* Painel Principal (Esquerda) */}
                <div className="flex-1 overflow-y-auto p-8 pr-4">
                    
                    {/* Cabeçalho da Tarefa */}
                    <DialogHeader className="mb-6">
                        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                            <span className="flex items-center">
                            {/* ID removido do cabeçalho */}
                                {/* Removido bloco de IA */}
                            </span>
                            <div className="flex space-x-2">
                                <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
                            </div>
                        </div>
                        <DialogTitle className="text-3xl font-extrabold text-gray-900 leading-tight">
                            {task.title}
                        </DialogTitle>
                    </DialogHeader>

                    {/* Quadro de Status + Campos Principais */}
                    <div className="space-y-6">
                        {/* Quadro de Status vinculado */}
                        <div className="mb-4">
                            <label className="text-sm font-medium text-gray-700 flex items-center"><Target className="w-4 h-4 mr-2" /> Status</label>
                            <div className="mt-2 inline-flex rounded-full bg-white gap-2">
                                <Button size="sm" className={`rounded-full ${task.status === 'todo' ? 'bg-gray-100 text-gray-700' : 'text-gray-700 hover:bg-gray-50'}`} onClick={() => onUpdateTask?.(task.id, { status: 'todo' as any })}>Pendente</Button>
                                <Button size="sm" className={`rounded-full ${task.status === 'doing' ? 'bg-purple-100 text-purple-700' : 'text-gray-700 hover:bg-gray-50'}`} onClick={() => onUpdateTask?.(task.id, { status: 'doing' as any })}>Em Progresso</Button>
                                <Button size="sm" className={`rounded-full ${task.status === 'done' ? 'bg-green-100 text-green-700' : 'text-gray-700 hover:bg-gray-50'}`} onClick={() => onUpdateTask?.(task.id, { status: 'done' as any })}>Concluído</Button>
                            </div>
                        </div>

                        {/* Campos Principais (Responsável, Entrega, Criado por, Participantes) */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-4">
                                <div className="w-28 text-gray-500 font-medium flex items-center"><User className="w-4 h-4 mr-2" /> Responsável</div>
                                <span className="text-gray-800">{task.assignee || '—'}</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="w-28 text-gray-500 font-medium flex items-center"><Calendar className="w-4 h-4 mr-2" /> Entrega</div>
                                <Popover open={dueDatePickerOpen} onOpenChange={setDueDatePickerOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className={`justify-start text-left font-normal ${!task.dueDate && 'text-gray-500'}`}>
                                            {task.dueDate ? task.dueDate : 'Selecionar data'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <CalendarComponent
                                            mode="single"
                                            selected={task.dueDate ? new Date(task.dueDate) : undefined}
                                            onSelect={(d) => {
                                                if (d && onUpdateTask) {
                                                    onUpdateTask(task.id, { dueDate: format(d, 'yyyy-MM-dd') });
                                                    setDueDatePickerOpen(false);
                                                }
                                            }}
                                            locale={ptBR}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            {/* Removidos: Tempo rastreado e Etiquetas */}
                        </div>

                        {/* Criado por e Participantes */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-4">
                                <div className="w-28 text-gray-500 font-medium">Criado por</div>
                                <span className="text-gray-800">{task.creatorName || '—'}</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="w-28 text-gray-500 font-medium flex items-center"><Users className="w-4 h-4 mr-2" /> Participantes</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-wrap gap-1">
                                        {(task.participantNames || []).map((p, idx) => (
                                            <Badge key={idx} variant="secondary" className="bg-gray-100 text-gray-700">{p}</Badge>
                                        ))}
                                        {(task.participantNames || []).length === 0 && (
                                            <span className="text-gray-800">—</span>
                                        )}
                                    </div>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="rounded-full">Editar</Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72 p-2" align="start" sideOffset={6}>
                                            <Input placeholder="Buscar membros" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="h-8 mb-2" />
                                            <div className="max-h-40 overflow-auto">
                                                {(memberResults || []).map((u: any) => {
                                                    const name = (u as any).nome || u.email;
                                                    const selected = (task.participantNames || []).includes(name);
                                                    return (
                                                        <div key={u.id} className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer rounded ${selected ? 'bg-gray-100' : 'hover:bg-gray-50'}`} onClick={() => onToggleParticipant?.(task.id, { id: u.id, name })}>
                                                            <Avatar className="h-6 w-6">
                                                                <AvatarImage src="" alt={name} />
                                                                <AvatarFallback className="text-[10px]">{(name || 'US').slice(0,2).toUpperCase()}</AvatarFallback>
                                                            </Avatar>
                                                            <span className="truncate">{name}</span>
                                                            {selected && <Check className="w-3.5 h-3.5 ml-auto text-purple-600" />}
                                                        </div>
                                                    );
                                                })}
                                                {(!memberResults || memberResults.length === 0) && (
                                                    <div className="px-2 py-1 text-xs text-gray-500">Nenhum membro encontrado</div>
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </div>

                        {/* Descrição abaixo dos campos principais */}
                        <div className="mt-2">
                            <label className="text-sm font-medium text-gray-700">Descrição</label>
                            <textarea
                                className="mt-2 w-full min-h-[120px] resize-y rounded-md border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                                placeholder="Adicione uma descrição da tarefa"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                onBlur={async () => {
                                    await supabase
                                        .from('tasks')
                                        .update({ description })
                                        .eq('id', task.id);
                                    onUpdateTask?.(task.id, { description });
                                }}
                            />
                        </div>
                        {/* Guia de anexos */}
                        <div className="mt-4 border rounded-lg p-3 bg-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center text-sm font-semibold text-gray-800"><Paperclip className="w-4 h-4 mr-2" /> Guia de anexos</div>
                                <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                                    <PopoverTrigger asChild>
                                        <Button size="sm" variant="outline" className="rounded-full">Adicionar guia</Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-3" align="end" sideOffset={8}>
                                        <div className="text-sm font-medium mb-2">Adicionar Link</div>
                                        <Input placeholder="https://..." value={attachUrl} onChange={(e) => setAttachUrl(e.target.value)} className="h-9" />
                                        <div className="flex justify-end gap-2 mt-3">
                                            <Button size="sm" variant="outline" onClick={() => { setAttachOpen(false); setAttachUrl(''); }}>Cancelar</Button>
                                            <Button size="sm" onClick={() => { const url = attachUrl.trim(); if (url) setAttachments(prev => [...prev, { label: 'Link', url }]); setAttachOpen(false); setAttachUrl(''); }}>Salvar</Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            {attachments.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                    {attachments.map((a, idx) => (
                                        <a key={idx} target="_blank" rel="noreferrer" href={a.url} className="flex items-center gap-2 text-sm text-purple-700 hover:underline">
                                            <Paperclip className="w-4 h-4" /> {a.label}: {a.url}
                                        </a>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-2 text-xs text-gray-500">Nenhum anexo adicionado</div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Painel Lateral de Atividade (Direita) */}
                <div className="w-80 border-l bg-gray-50 flex flex-col flex-shrink-0">
                    <div className="p-4 border-b">
                        <h3 className="text-lg font-bold text-gray-800">Atividade</h3>
                    </div>
                    
                    {/* Dropdown de histórico de alterações */}
                    <div className="p-4 border-b flex items-center justify-between">
                        <span className="text-sm text-gray-600">Histórico de alterações</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 px-2 text-xs">Abrir histórico <ChevronDown className="w-3.5 h-3.5 ml-1" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuItem>
                                    <div className="flex items-start gap-2">
                                        <Check className="w-3.5 h-3.5 text-green-600 mt-0.5" />
                                        <div>
                                            <div className="text-xs">Status atualizado</div>
                                            <div className="text-[10px] text-gray-500">Ontem às 16:12</div>
                                        </div>
                                    </div>
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <div className="flex items-start gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-purple-600 mt-0.5" />
                                        <div>
                                            <div className="text-xs">Data de entrega atualizada</div>
                                            <div className="text-[10px] text-gray-500">Hoje às 09:20</div>
                                        </div>
                                    </div>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    {/* Feed removido; histórico via dropdown. Comentários removidos. */}
                    <div className="flex-1" />
                </div>

            </DialogContent>
        </Dialog>
    );
};