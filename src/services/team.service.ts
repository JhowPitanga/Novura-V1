import { supabase } from "@/integrations/supabase/client";

// ── Tasks ──────────────────────────────────────────────────────────────────────

export async function fetchTasks(orgId: string) {
  return supabase
    .from('tasks')
    .select('id,title,priority,type,status,due_date,time_tracked,labels,dependencies,assigned_to,created_by,visible_to_members')
    .eq('organizations_id', orgId)
    .order('created_at', { ascending: false });
}

export async function createTask(
  orgId: string,
  userId: string,
  payload: {
    assignedToId?: string | null;
    title: string;
    priority: string;
    type: string;
    status?: string;
    dueDate?: string;
    timeTracked?: number;
    labels?: string[];
    dependencies?: number[];
    visibility?: string;
    visibleMemberIds?: string[];
  },
) {
  return supabase
    .from('tasks')
    .insert({
      organizations_id: orgId,
      created_by: userId,
      assigned_to: payload.assignedToId || null,
      title: payload.title,
      description: null,
      priority: payload.priority,
      type: payload.type,
      status: payload.status ?? 'todo',
      due_date: payload.dueDate ? payload.dueDate : null,
      time_tracked: payload.timeTracked ?? 0,
      labels: payload.labels ?? [],
      dependencies: payload.dependencies ?? [],
      visibility: payload.visibility ?? 'team',
      visible_to_members: payload.visibleMemberIds ?? [],
    } as any)
    .select();
}

export async function updateTask(taskId: number, orgId: string, payload: Record<string, any>) {
  return supabase
    .from('tasks')
    .update(payload as any)
    .eq('id', taskId)
    .eq('organizations_id', orgId);
}

export async function assignTask(taskId: number, orgId: string, assigneeId: string) {
  return supabase
    .from('tasks')
    .update({ assigned_to: assigneeId } as any)
    .eq('id', taskId)
    .eq('organizations_id', orgId);
}

export async function toggleCoAssigneeTask(taskId: number, visibleTo: string[]) {
  return supabase
    .from('tasks')
    .update({ visible_to_members: visibleTo } as any)
    .eq('id', taskId);
}

export async function deleteTask(taskId: number, orgId: string) {
  return supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('organizations_id', orgId);
}

// ── Members ────────────────────────────────────────────────────────────────────

export async function fetchOrgMembers(orgId: string) {
  return supabase.rpc('search_org_members', { p_org_id: orgId, p_term: null, p_limit: 200 });
}

// ── Chat Unread ────────────────────────────────────────────────────────────────

export async function fetchUnreadCounts(userId: string) {
  return (supabase as any)
    .from('chat_unread_counts')
    .select('channel_id, unread_count')
    .eq('user_id', userId);
}

export async function upsertUnreadCount(channelId: string, userId: string, count: number) {
  return (supabase as any)
    .from('chat_unread_counts')
    .upsert(
      { channel_id: channelId, user_id: userId, unread_count: count },
      { onConflict: 'channel_id,user_id' },
    );
}

export async function markChannelRead(channelId: string) {
  return (supabase as any).rpc('mark_channel_read', { p_channel_id: channelId });
}

// ── User Profile (DM name resolution) ─────────────────────────────────────────

export async function fetchDmUserProfile(otherId: string) {
  return supabase
    .from('user_profiles')
    .select('id,nome,email')
    .eq('id', otherId)
    .single();
}
