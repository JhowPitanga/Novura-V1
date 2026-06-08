export type TaskPriority = "high" | "medium" | "low";
export type TaskType = "story" | "bug" | "task" | "epic";
export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: number;
  title: string;
  assignee: string;
  assignees?: string[];
  priority: TaskPriority;
  dueDate: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD
  type: TaskType;
  storyPoints: number;
  status: TaskStatus;
  timeTracked: number; // minutes
  labels: string[];
  dependencies: number[];
}
