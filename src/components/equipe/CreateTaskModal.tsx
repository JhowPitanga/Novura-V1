import { Button } from "@/components/ui/button";

export type TaskPriority = "high" | "medium" | "low";
export type TaskType = "story" | "bug" | "task" | "epic";
export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: number;
  title: string;
  assignee: string;
  priority: TaskPriority;
  dueDate: string; // YYYY-MM-DD
  type: TaskType;
  storyPoints: number;
  status: TaskStatus;
  sprint: string;
  timeTracked: number; // minutes
  labels: string[];
  dependencies: number[];
}

interface CreateTaskModalProps {
  onCreateTask: (task: Task) => void;
}

// Implementação mínima: um botão que cria uma tarefa padrão.
export function CreateTaskModal({ onCreateTask }: CreateTaskModalProps) {
  const handleClick = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    const newTask: Task = {
      id: Date.now(),
      title: "Nova tarefa",
      assignee: "Usuário",
      priority: "medium",
      dueDate: `${yyyy}-${mm}-${dd}`,
      type: "task",
      storyPoints: 1,
      status: "todo",
      sprint: "sprint-1",
      timeTracked: 0,
      labels: [],
      dependencies: [],
    };

    onCreateTask(newTask);
  };

  return (
    <Button variant="default" onClick={handleClick}>
      Nova tarefa
    </Button>
  );
}