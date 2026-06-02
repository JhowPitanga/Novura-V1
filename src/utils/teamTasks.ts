import type { Task, TaskPriority, TaskType, TaskStatus } from "@/types/team";

export type MemberMapEntry = { nome?: string | null; email?: string | null };
export type MemberMap = Record<string, MemberMapEntry>;
export type TaskExtras = Record<number, {
  assigned_to?: string | null;
  created_by?: string | null;
  visible_to_members?: string[];
}>;

/** Maps a DB row from `tasks` to the Task UI type. */
export function mapRowToTask(row: any, memberMap: MemberMap): Task {
  const primaryName =
    (row.assigned_to && (memberMap[row.assigned_to]?.nome || memberMap[row.assigned_to]?.email)) || '';
  const addNames = (row.visible_to_members || [])
    .map((id: string) => (memberMap[id]?.nome || memberMap[id]?.email))
    .filter(Boolean);
  const startLabel = (row.labels || []).find(
    (l: string) => typeof l === 'string' && l.startsWith('start:'),
  );
  const startDate = startLabel ? (startLabel as string).split(':')[1] : undefined;
  return {
    id: row.id,
    title: row.title,
    assignee: primaryName,
    assignees: [primaryName, ...addNames].filter(Boolean),
    priority: (row.priority ?? 'medium') as TaskPriority,
    dueDate: row.due_date ?? '',
    startDate,
    type: (row.type ?? 'task') as TaskType,
    storyPoints: 0,
    status: (row.status ?? 'todo') as TaskStatus,
    timeTracked: row.time_tracked ?? 0,
    labels: row.labels ?? [],
    dependencies: row.dependencies ?? [],
  } as Task;
}

/**
 * Merges label updates from the UI into the current label array,
 * preserving the `start:` encode/decode contract.
 * Returns the new label array; caller decides whether to persist.
 */
export function mergeLabels(
  currentLabels: string[],
  updates: { startDate?: string; labels?: string[] },
): string[] {
  let newLabels: string[] = [...currentLabels];
  const hasStartUpdate = Object.prototype.hasOwnProperty.call(updates, 'startDate');
  if (hasStartUpdate) {
    newLabels = newLabels.filter((l) => !String(l).startsWith('start:'));
    if (updates.startDate) newLabels.push(`start:${updates.startDate}`);
  }
  if (typeof updates.labels !== 'undefined') {
    const startOnly = newLabels.filter((l) => String(l).startsWith('start:'));
    newLabels = Array.from(new Set([...(updates.labels || []), ...startOnly]));
  }
  return newLabels;
}

/** Builds the memberMap from the RPC result array. */
export function buildMemberMap(
  members: Array<{ id: string; nome?: string | null; email?: string | null }>,
): MemberMap {
  const map: MemberMap = {};
  for (const u of members) {
    map[u.id] = { nome: u.nome, email: u.email };
  }
  return map;
}

/** Extracts per-task raw DB extras keyed by task id. */
export function extractTaskExtras(rows: any[]): TaskExtras {
  const extras: TaskExtras = {};
  for (const row of rows) {
    extras[row.id] = {
      assigned_to: row.assigned_to || null,
      created_by: row.created_by || null,
      visible_to_members: row.visible_to_members || [],
    };
  }
  return extras;
}
