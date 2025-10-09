// src/components/equipe/TaskDetailModal.tsx

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Calendar, Clock, Target, User, Tag, Paperclip, MessageSquare, Plus, Brain, Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Interface Task (simplificada para o modal)
interface Task {
    id: number;
    title: string;
    assignee: string;
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
    status: string;
    timeTracked: number;
}

interface TaskDetailModalProps {
    task: Task | null;
    isOpen: boolean;
    onClose: () => void;
}

// Mock de dados de atividade/comentários para o painel lateral
const mockActivity = [
    { id: 1, user: "Flaminy Shop (você)", action: "criou esta tarefa", time: "out. 2 às 7:40 pm" },
];

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, isOpen, onClose }) => {
    const [description, setDescription] = useState("Peça ao Brain para Escrever uma descrição. Gerar subtarefas ou encontrar tarefas semelhantes");
    const [comment, setComment] = useState("");

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
            <DialogContent className="max-w-[1200px] p-0 flex h-[90vh]">
                
                {/* Painel Principal (Esquerda) */}
                <div className="flex-1 overflow-y-auto p-8 pr-4">
                    
                    {/* Cabeçalho da Tarefa */}
                    <DialogHeader className="mb-6">
                        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                            <span className="flex items-center">
                                <span className="font-mono text-gray-400 mr-2">#{task.id}</span>
                                <Badge variant="secondary" className="bg-purple-100 text-purple-700">Pergunta à IA</Badge>
                            </span>
                            <div className="flex space-x-2">
                                <Button variant="ghost" size="sm" onClick={() => console.log('Compartilhar')}>
                                    <Share2 className="w-4 h-4 mr-1" /> Compartilhar
                                </Button>
                                <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
                            </div>
                        </div>
                        <DialogTitle className="text-3xl font-extrabold text-gray-900 leading-tight">
                            {task.title}
                        </DialogTitle>
                    </DialogHeader>

                    {/* Descrição e Subtarefas */}
                    <div className="space-y-6">
                        <div className="p-4 bg-gray-50 rounded-lg border border-dashed text-gray-600">
                            {description}
                            <div className="flex space-x-3 mt-3">
                                <Button variant="outline" size="sm" className="text-gray-600 hover:bg-white">
                                    Escrever descrição
                                </Button>
                                <Button variant="outline" size="sm" className="text-purple-600 border-purple-300 hover:bg-purple-50">
                                    <Brain className="w-4 h-4 mr-1" /> Escrever com IA
                                </Button>
                            </div>
                        </div>

                        {/* Campos Principais (Status, Datas, Responsáveis) - Simulação do Anexo 5 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-4">
                                <div className="w-24 text-gray-500 font-medium flex items-center"><Target className="w-4 h-4 mr-2" /> Status</div>
                                <Badge className="bg-red-100 text-red-700">{task.status.toUpperCase()}</Badge>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="w-24 text-gray-500 font-medium flex items-center"><User className="w-4 h-4 mr-2" /> Responsáveis</div>
                                <span className="text-gray-800">{task.assignee}</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="w-24 text-gray-500 font-medium flex items-center"><Calendar className="w-4 h-4 mr-2" /> Datas</div>
                                <span className="text-gray-800">{task.dueDate}</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="w-24 text-gray-500 font-medium flex items-center"><Clock className="w-4 h-4 mr-2" /> Tempo rastreado</div>
                                <span className="text-gray-800">{task.timeTracked > 0 ? `${(task.timeTracked / 60).toFixed(1)}h` : 'Adicionar hora'}</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="w-24 text-gray-500 font-medium flex items-center"><Tag className="w-4 h-4 mr-2" /> Etiquetas</div>
                                <span className="text-gray-800">Vazio</span>
                            </div>
                        </div>

                        <h3 className="text-lg font-bold text-gray-800 border-t pt-6">Campos personalizados</h3>
                        <Button variant="outline" className="w-full justify-start text-gray-600 border-dashed"><Plus className="w-4 h-4 mr-2" /> Criar um campo nesta localização</Button>
                        
                        <h3 className="text-lg font-bold text-gray-800 border-t pt-6">Adicionar subtarefa</h3>
                        <Button variant="ghost" className="w-full justify-start text-gray-600 hover:bg-gray-100"><Plus className="w-4 h-4 mr-2" /> Adicionar subtarefa</Button>
                    </div>

                </div>

                {/* Painel Lateral de Atividade (Direita) */}
                <div className="w-80 border-l bg-gray-50 flex flex-col flex-shrink-0">
                    <div className="p-4 border-b">
                        <h3 className="text-lg font-bold text-gray-800">Atividade</h3>
                    </div>
                    
                    {/* Feed de Atividades */}
                    <div className="flex-1 overflow-y-auto p-4 text-sm space-y-3">
                        {mockActivity.map(activity => (
                            <div key={activity.id} className="text-gray-600">
                                <span className="font-semibold">{activity.user}</span> {activity.action} <span className="text-xs text-gray-400 ml-1">({activity.time})</span>
                            </div>
                        ))}
                    </div>

                    {/* Área de Comentários */}
                    <div className="p-4 border-t bg-white">
                        <h4 className="text-sm font-semibold mb-2">Comentário</h4>
                        <form onSubmit={handleCommentSubmit} className="space-y-2">
                            <Input
                                placeholder="Mencione @Brain para criar, encontrar ou perguntar qualquer coisa"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                            />
                            <div className="flex items-center justify-between">
                                <div className="flex space-x-1 text-gray-500">
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8"><Paperclip className="w-4 h-4" /></Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8"><MessageSquare className="w-4 h-4" /></Button>
                                </div>
                                <Button type="submit" size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={!comment.trim()}>
                                    Comentar
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    );
};