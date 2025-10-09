import { Button } from "@/components/ui/button";
import type { Task } from "./CreateTaskModal";

interface TaskBacklogProps {
  tasks: Task[];
  onUpdateTask: (taskId: number, updates: Partial<Task>) => void;
}

export function TaskBacklog({ tasks, onUpdateTask }: TaskBacklogProps) {
  const backlog = tasks.filter(t => t.status === "todo");

  return (
    <div className="space-y-4">
      {backlog.map(task => (
        <div key={task.id} className="rounded-md border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{task.title}</p>
              <p className="text-xs text-gray-600">{task.assignee} • SP {task.storyPoints}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onUpdateTask(task.id, { status: "doing" })}>Mover para doing</Button>
              <Button size="sm" variant="secondary" onClick={() => onUpdateTask(task.id, { status: "done" })}>Concluir</Button>
            </div>
          </div>
        </div>
      ))}
      {backlog.length === 0 && (
        <p className="text-sm text-gray-600">Nenhuma tarefa em backlog.</p>
      )}
    </div>
  );
}