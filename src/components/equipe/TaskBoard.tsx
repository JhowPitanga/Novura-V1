

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Clock, Calendar, Briefcase, Paperclip, CheckSquare, Target } from "lucide-react";
import { Button } from "@/components/ui/button";


interface Task {
    id: number;
    title: string;
    assignee: string;
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
    type: string;
    storyPoints: number;
    status: 'todo' | 'doing' | 'done';
    sprint: string;
    timeTracked: number;
    labels: string[];
    dependencies: number[];
}

interface TaskBoardProps {
    tasks: Task[];
    onUpdateTask: (taskId: number, updates: Partial<Task>) => void;
    onStartTimer: (taskId: number) => void;
    onStopTimer: (taskId: number) => void;
    // Nova prop para lidar com o clique (abrir modal)
    onOpenTaskDetail: (task: Task) => void; 
}

// Mapeamento de Status para Colunas do Kanban
const statusMap = {
    todo: { name: "PENDENTE", color: "text-gray-700 bg-gray-100" },
    doing: { name: "EM PROGRESSO", color: "text-purple-700 bg-purple-100" },
    done: { name: "CONCLUÍDO", color: "text-green-700 bg-green-100" },
};

// Componente individual do Cartão da Tarefa
const TaskCard: React.FC<{ task: Task, onOpenTaskDetail: (task: Task) => void }> = ({ task, onOpenTaskDetail }) => {
    return (
        <Card 
            className="mb-3 p-3 cursor-pointer hover:shadow-md transition-shadow bg-white border-l-4 border-l-purple-400"
            onClick={() => onOpenTaskDetail(task)} // Chama o modal ao clicar
        >
            <div className="text-sm font-medium text-gray-800 mb-2">{task.title}</div>
            
            {/* Ícones de Metadados (Simples) */}
            <div className="flex items-center space-x-2 text-gray-500 text-xs mt-3">
                <div className="flex items-center" title="Responsável">
                    <Briefcase className="w-3 h-3 mr-1" />
                    <span className="truncate">{task.assignee}</span>
                </div>
                <div className="flex items-center" title="Data de Vencimento">
                    <Calendar className="w-3 h-3 mr-1" />
                    {task.dueDate}
                </div>
            </div>
        </Card>
    );
};

// Componente da Coluna Kanban
const KanbanColumn: React.FC<{ status: 'todo' | 'doing' | 'done', tasks: Task[], onOpenTaskDetail: (task: Task) => void }> = ({ status, tasks, onOpenTaskDetail }) => {
    const { name, color } = statusMap[status];

    return (
        // Simulação de Drag & Drop - A classe 'group-hover:' é um placeholder
        <div className="w-1/3 flex-shrink-0 mx-2">
            <Card className="bg-gray-50 shadow-none border-t-4 border-gray-200">
                <CardHeader className="p-3 pb-2 flex-row items-center justify-between">
                    <CardTitle className={`flex items-center text-sm font-bold ${color}`}>
                        {name} <span className="ml-2 text-xs font-semibold text-gray-500">({tasks.length})</span>
                    </CardTitle>
                    {/* Botão Adicionar Tarefa - Simulação */}
                    {status !== 'done' && (
                        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-purple-600 p-1 h-auto">
                            <Plus className="w-4 h-4" />
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="p-3 pt-0 h-full overflow-y-auto min-h-[500px]">
                    {/* Lista de Tarefas */}
                    {tasks.map(task => (
                        <TaskCard key={task.id} task={task} onOpenTaskDetail={onOpenTaskDetail} />
                    ))}
                    {/* Adicionar Tarefa no final da coluna, seguindo o Anexo 4 */}
                    <div className="mt-3">
                        <Button variant="ghost" className="w-full justify-start text-sm text-gray-500 hover:bg-gray-100">
                            <Plus className="w-4 h-4 mr-2" /> Adicionar Tarefa
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

// Componente principal do TaskBoard
export const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onUpdateTask, onStartTimer, onStopTimer, onOpenTaskDetail }) => {
    const todoTasks = tasks.filter(t => t.status === 'todo');
    const doingTasks = tasks.filter(t => t.status === 'doing');
    const doneTasks = tasks.filter(t => t.status === 'done');

    return (
        <div className="flex overflow-x-auto p-2 space-x-4 h-full">
            <KanbanColumn status="todo" tasks={todoTasks} onOpenTaskDetail={onOpenTaskDetail} />
            <KanbanColumn status="doing" tasks={doingTasks} onOpenTaskDetail={onOpenTaskDetail} />
            <KanbanColumn status="done" tasks={doneTasks} onOpenTaskDetail={onOpenTaskDetail} />

             {/* Botão Adicionar Grupo (Coluna) */}
            <div className="w-40 flex-shrink-0">
                 <Button variant="outline" className="w-full h-auto py-3 text-sm text-gray-500 border-dashed border-gray-300 hover:bg-gray-100">
                    <Plus className="w-4 h-4 mr-2" /> Adicionar Grupo
                </Button>
            </div>
        </div>
    );
};