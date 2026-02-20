import { Button } from "@/components/ui/button";
import type { Task } from "./CreateTaskModal";

interface TaskViewsProps {
  tasks: Task[];
  onUpdateTask: (taskId: number, updates: Partial<Task>) => void;
  onStartTimer: (taskId: number) => void;
  onStopTimer: (taskId: number) => void;
}

export function TaskViews({ tasks, onUpdateTask, onStartTimer, onStopTimer }: TaskViewsProps) {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const doing = tasks.filter(t => t.status === "doing").length;
  const todo = tasks.filter(t => t.status === "todo").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-600">Total</p>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-600">Todo</p>
          <p className="text-2xl font-bold">{todo}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-600">Doing</p>
          <p className="text-2xl font-bold">{doing}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-600">Done</p>
          <p className="text-2xl font-bold">{done}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="grid grid-cols-4 gap-2 p-3 border-b text-sm font-medium">
          <span>Título</span>
          <span>Responsável</span>
          <span>Status</span>
          <span>Ações</span>
        </div>
        <div className="divide-y">
          {tasks.map(t => (
            <div key={t.id} className="grid grid-cols-4 gap-2 p-3 text-sm">
              <span>{t.title}</span>
              <span>{t.assignee}</span>
              <span className="capitalize">{t.status}</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onUpdateTask(t.id, { status: "doing" })}>Doing</Button>
                <Button size="sm" variant="secondary" onClick={() => onUpdateTask(t.id, { status: "done" })}>Done</Button>
                <Button size="sm" variant="outline" onClick={() => onStartTimer(t.id)}>Start</Button>
                <Button size="sm" variant="outline" onClick={() => onStopTimer(t.id)}>Stop</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}