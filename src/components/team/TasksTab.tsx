import { useState } from "react";
import { Kanban } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingOverlay from "@/components/LoadingOverlay";
import { CreateTaskModal } from "@/components/team/CreateTaskModal";
import { TaskBoard } from "@/components/team/TaskBoard";
import { TaskDetailModal } from "@/components/team/TaskDetailModal";
import { useTeamTasks } from "@/hooks/useTeamTasks";

export function TasksTab() {
    const [currentTab, setCurrentTab] = useState("board");
    const {
        tasks,
        isLoading,
        createOpen,
        setCreateOpen,
        isDetailModalOpen,
        selectedTaskDetail,
        openTaskDetail,
        closeTaskDetail,
        handleCreateTask,
        handleUpdateTask,
        handleAssignTask,
        handleDeleteTask,
        handleToggleCoAssignee,
    } = useTeamTasks();

    const handleStartTimer = (taskId: number) => { console.log(`Timer iniciado para tarefa ${taskId}`); };
    const handleStopTimer = (taskId: number) => { console.log(`Timer parado para tarefa ${taskId}`); };

    return (
        <div className="space-y-2 relative">
            {isLoading && <LoadingOverlay message="Carregando dados..." />}
            <CreateTaskModal
                onCreateTask={handleCreateTask}
                openExternal={createOpen}
                onOpenChange={setCreateOpen}
                showDefaultTrigger={false}
            />

            <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
                <TabsList className="bg-white border w-full justify-start h-11">
                    <TabsTrigger value="board" className="font-semibold text-gray-700 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
                        <Kanban className="w-4 h-4 mr-2" /> Quadro
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="board" className="pt-0 h-[calc(100vh-240px)]">
                    <TaskBoard
                        tasks={tasks}
                        onUpdateTask={handleUpdateTask}
                        onStartTimer={handleStartTimer}
                        onStopTimer={handleStopTimer}
                        onOpenTaskDetail={openTaskDetail}
                        onAddTask={() => setCreateOpen(true)}
                        onCreateTask={handleCreateTask}
                        onDeleteTask={handleDeleteTask}
                        onAssignTask={handleAssignTask}
                        onToggleCoAssignee={handleToggleCoAssignee}
                    />
                </TabsContent>
            </Tabs>

            <TaskDetailModal
                task={selectedTaskDetail}
                isOpen={isDetailModalOpen}
                onClose={closeTaskDetail}
                onUpdateTask={handleUpdateTask}
                onToggleParticipant={(taskId, member) => handleToggleCoAssignee(taskId, member)}
            />
        </div>
    );
}
