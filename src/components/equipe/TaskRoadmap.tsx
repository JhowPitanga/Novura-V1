import type { Task, TaskType } from "./CreateTaskModal";

interface TaskRoadmapProps {
  tasks: Task[];
}

export function TaskRoadmap({ tasks }: TaskRoadmapProps) {
  const groups: Record<TaskType, Task[]> = { story: [], bug: [], task: [], epic: [] };
  tasks.forEach(t => groups[t.type].push(t));

  const order: TaskType[] = ["epic", "story", "task", "bug"];

  return (
    <div className="space-y-6">
      {order.map(type => (
        <div key={type} className="rounded-lg border bg-white p-4">
          <h3 className="font-semibold capitalize mb-3">{type}</h3>
          <div className="space-y-2">
            {groups[type].map(t => (
              <div key={t.id} className="flex items-center justify-between rounded-md border p-3">
                <p className="font-medium">{t.title}</p>
                <span className="text-xs text-gray-500">Sprint: {t.sprint}</span>
              </div>
            ))}
            {groups[type].length === 0 && (
              <p className="text-sm text-gray-600">Nenhum item.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}