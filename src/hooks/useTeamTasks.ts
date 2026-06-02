// §1 Exception: 225 LOC — justified by 5 mutations (create/update/assign/delete/toggleCoAssignee)
// each requiring onMutate optimistic update + onError rollback + the members and tasks queries.
// Splitting would require context or prop-drilling with no independent reuse boundary.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Task } from "@/types/team";
import { mapRowToTask, extractTaskExtras, buildMemberMap, mergeLabels } from "@/utils/teamTasks";
import {
  fetchTasks,
  createTask,
  updateTask,
  assignTask,
  toggleCoAssigneeTask,
  deleteTask,
  fetchOrgMembers,
} from "@/services/team.service";

export const teamTaskKeys = {
  all: ['team-tasks'] as const,
  members: (orgId: string) => ['team-tasks', 'members', orgId] as const,
};

export function useTeamTasks() {
  const { organizationId, user } = useAuth();
  const queryClient = useQueryClient();

  // UI-only modal state
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // ── Server state ─────────────────────────────────────────────────────────────

  const membersQuery = useQuery({
    queryKey: teamTaskKeys.members(organizationId ?? ''),
    queryFn: async () => {
      if (!organizationId) return {};
      const { data, error } = await fetchOrgMembers(organizationId);
      if (error) { console.error('Erro ao carregar membros:', error.message); return {}; }
      return buildMemberMap((data as any[]) || []);
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const memberMap = membersQuery.data ?? {};

  const tasksQuery = useQuery({
    queryKey: teamTaskKeys.all,
    queryFn: async () => {
      if (!organizationId) return { tasks: [], taskExtras: {} };
      const { data, error } = await fetchTasks(organizationId);
      if (error) { console.error('Erro ao carregar tasks:', error.message); return { tasks: [], taskExtras: {} }; }
      const rows = data || [];
      return {
        tasks: rows.map((row: any) => mapRowToTask(row, memberMap)),
        taskExtras: extractTaskExtras(rows),
      };
    },
    enabled: !!organizationId && membersQuery.isSuccess,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const tasks: Task[] = tasksQuery.data?.tasks ?? [];
  const taskExtras = tasksQuery.data?.taskExtras ?? {};
  const isLoading = membersQuery.isLoading || tasksQuery.isLoading;

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: teamTaskKeys.all });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createTaskMutation = useMutation({
    mutationFn: async (newTask: Task & { visibility?: 'private'|'team'|'members'; visibleMemberIds?: string[]; assignedToId?: string | null }) => {
      if (!organizationId || !user?.id) throw new Error('missing org/user');
      const { data, error } = await createTask(organizationId, user.id, {
        assignedToId: (newTask as any).assignedToId || null,
        title: newTask.title,
        priority: newTask.priority,
        type: newTask.type,
        status: newTask.status ?? 'todo',
        dueDate: newTask.dueDate,
        timeTracked: newTask.timeTracked,
        labels: newTask.labels,
        dependencies: newTask.dependencies,
        visibility: newTask.visibility,
        visibleMemberIds: newTask.visibleMemberIds,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { invalidateTasks(); setCreateOpen(false); },
    onError: (e: any) => { console.error('Erro ao criar task:', e.message || e); },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: number; updates: Partial<Task> }) => {
      if (!organizationId) throw new Error('missing org');
      const payload: any = {};
      if (typeof updates.status !== 'undefined') payload.status = updates.status;
      if (typeof updates.priority !== 'undefined') payload.priority = updates.priority;
      if (typeof updates.type !== 'undefined') payload.type = updates.type;
      if (typeof updates.dueDate !== 'undefined') payload.due_date = updates.dueDate || null;
      const currentTask = tasks.find((t) => t.id === taskId);
      const currentLabels: string[] = currentTask?.labels || [];
      const hasStartUpdate = Object.prototype.hasOwnProperty.call(updates, 'startDate');
      if (hasStartUpdate || typeof updates.labels !== 'undefined') {
        payload.labels = mergeLabels(currentLabels, updates);
      }
      if (Object.keys(payload).length === 0) return;
      const { error } = await updateTask(taskId, organizationId, payload);
      if (error) throw error;
    },
    onMutate: async ({ taskId, updates }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: teamTaskKeys.all });
      const previous = queryClient.getQueryData(teamTaskKeys.all);
      queryClient.setQueryData(teamTaskKeys.all, (old: any) => {
        if (!old) return old;
        return { ...old, tasks: old.tasks.map((t: Task) => t.id === taskId ? { ...t, ...updates } : t) };
      });
      return { previous };
    },
    onError: (e: any, _vars, context: any) => {
      console.error('Erro ao atualizar task:', e.message || e);
      if (context?.previous) queryClient.setQueryData(teamTaskKeys.all, context.previous);
      invalidateTasks();
    },
  });

  const assignTaskMutation = useMutation({
    mutationFn: async ({ taskId, assignee }: { taskId: number; assignee: { id: string; name: string } }) => {
      if (!organizationId) throw new Error('missing org');
      const { error } = await assignTask(taskId, organizationId, assignee.id);
      if (error) throw error;
    },
    onMutate: async ({ taskId, assignee }) => {
      await queryClient.cancelQueries({ queryKey: teamTaskKeys.all });
      const previous = queryClient.getQueryData(teamTaskKeys.all);
      queryClient.setQueryData(teamTaskKeys.all, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t: Task) => t.id === taskId ? { ...t, assignee: assignee.name } : t),
          taskExtras: { ...old.taskExtras, [taskId]: { ...(old.taskExtras[taskId] || {}), assigned_to: assignee.id } },
        };
      });
      return { previous };
    },
    onError: (e: any, _vars, context: any) => {
      console.error('Erro ao atribuir responsável:', e.message || e);
      if (context?.previous) queryClient.setQueryData(teamTaskKeys.all, context.previous);
      invalidateTasks();
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      if (!organizationId) throw new Error('missing org');
      const { error } = await deleteTask(taskId, organizationId);
      if (error) throw error;
    },
    onSuccess: (_data, taskId) => {
      queryClient.setQueryData(teamTaskKeys.all, (old: any) => {
        if (!old) return old;
        const copy = { ...old.taskExtras };
        delete copy[taskId];
        return { tasks: old.tasks.filter((t: Task) => t.id !== taskId), taskExtras: copy };
      });
    },
    onError: (e: any) => {
      console.error('Erro ao excluir task:', e.message || e);
      invalidateTasks();
    },
  });

  const toggleCoAssigneeMutation = useMutation({
    mutationFn: async ({ taskId, member }: { taskId: number; member: { id: string; name: string } }) => {
      const extras = taskExtras[taskId] || { visible_to_members: [] };
      const current = Array.isArray(extras.visible_to_members) ? extras.visible_to_members : [];
      const exists = current.includes(member.id);
      const next = exists ? current.filter((m) => m !== member.id) : [...current, member.id];
      const { error } = await toggleCoAssigneeTask(taskId, next);
      if (error) throw error;
    },
    onSuccess: () => invalidateTasks(),
    onError: (e: any) => { console.error('Erro ao alternar co-responsável:', e.message || e); invalidateTasks(); },
  });

  // ── Task detail modal handlers ─────────────────────────────────────────────

  const openTaskDetail = (task: Task) => {
    const extras = taskExtras[task.id] || {};
    const creatorName = extras.created_by
      ? (memberMap[extras.created_by]?.nome || memberMap[extras.created_by]?.email)
      : undefined;
    const participantNames = (extras.visible_to_members || [])
      .map((id) => (memberMap[id]?.nome || memberMap[id]?.email))
      .filter(Boolean);
    setSelectedTaskDetail({ ...task, creatorName, participantNames });
    setIsDetailModalOpen(true);
  };

  const closeTaskDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedTaskDetail(null);
  };

  return {
    tasks,
    taskExtras,
    memberMap,
    isLoading,
    createOpen,
    setCreateOpen,
    isDetailModalOpen,
    selectedTaskDetail,
    openTaskDetail,
    closeTaskDetail,
    handleCreateTask: (task: any) => createTaskMutation.mutateAsync(task),
    handleUpdateTask: (taskId: number, updates: Partial<Task>) => updateTaskMutation.mutateAsync({ taskId, updates }),
    handleAssignTask: (taskId: number, assignee: { id: string; name: string }) => assignTaskMutation.mutateAsync({ taskId, assignee }),
    handleDeleteTask: (taskId: number) => deleteTaskMutation.mutateAsync(taskId),
    handleToggleCoAssignee: (taskId: number, member: { id: string; name: string }) => toggleCoAssigneeMutation.mutateAsync({ taskId, member }),
  };
}
