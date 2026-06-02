import { describe, it, expect } from 'vitest';
import {
  mapRowToTask,
  mergeLabels,
  buildMemberMap,
  extractTaskExtras,
} from '../teamTasks';

const memberMap = {
  'user-1': { nome: 'Alice', email: 'alice@test.com' },
  'user-2': { nome: null, email: 'bob@test.com' },
};

describe('mapRowToTask', () => {
  it('maps a full row to Task with all fields', () => {
    const row = {
      id: 1,
      title: 'Test Task',
      assigned_to: 'user-1',
      visible_to_members: ['user-2'],
      priority: 'high',
      due_date: '2026-06-15',
      type: 'story',
      status: 'doing',
      time_tracked: 30,
      labels: ['urgent'],
      dependencies: [2],
    };
    const task = mapRowToTask(row, memberMap);
    expect(task.id).toBe(1);
    expect(task.title).toBe('Test Task');
    expect(task.assignee).toBe('Alice');
    expect(task.assignees).toEqual(['Alice', 'bob@test.com']);
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2026-06-15');
    expect(task.type).toBe('story');
    expect(task.storyPoints).toBe(0);
    expect(task.status).toBe('doing');
    expect(task.timeTracked).toBe(30);
    expect(task.labels).toEqual(['urgent']);
    expect(task.dependencies).toEqual([2]);
    expect(task.startDate).toBeUndefined();
  });

  it('decodes start: label into startDate', () => {
    const row = {
      id: 2, title: 'T2', assigned_to: null, visible_to_members: null,
      priority: null, due_date: null, type: null, status: null,
      time_tracked: null, labels: ['urgent', 'start:2026-01-10'], dependencies: null,
    };
    const task = mapRowToTask(row, memberMap);
    expect(task.startDate).toBe('2026-01-10');
    // start: label preserved verbatim in labels array
    expect(task.labels).toContain('start:2026-01-10');
  });

  it('uses defaults for null priority/type/status/due_date/time_tracked', () => {
    const row = {
      id: 3, title: 'T3', assigned_to: null, visible_to_members: null,
      priority: null, due_date: null, type: null, status: null,
      time_tracked: null, labels: null, dependencies: null,
    };
    const task = mapRowToTask(row, memberMap);
    expect(task.priority).toBe('medium');
    expect(task.type).toBe('task');
    expect(task.status).toBe('todo');
    expect(task.dueDate).toBe('');
    expect(task.timeTracked).toBe(0);
    expect(task.labels).toEqual([]);
    expect(task.dependencies).toEqual([]);
  });

  it('uses email fallback when nome is null', () => {
    const row = {
      id: 4, title: 'T4', assigned_to: 'user-2', visible_to_members: [],
      priority: 'low', due_date: '2026-06-01', type: 'bug', status: 'done',
      time_tracked: 0, labels: [], dependencies: [],
    };
    const task = mapRowToTask(row, memberMap);
    expect(task.assignee).toBe('bob@test.com');
  });

  it('returns empty assignee/assignees when assigned_to not in memberMap', () => {
    const row = {
      id: 5, title: 'T5', assigned_to: 'unknown', visible_to_members: [],
      priority: 'medium', due_date: '', type: 'task', status: 'todo',
      time_tracked: 0, labels: [], dependencies: [],
    };
    const task = mapRowToTask(row, memberMap);
    expect(task.assignee).toBe('');
    expect(task.assignees).toEqual([]);
  });

  it('filters out unknown ids from assignees', () => {
    const row = {
      id: 6, title: 'T6', assigned_to: 'user-1', visible_to_members: ['unknown-id'],
      priority: 'medium', due_date: '', type: 'task', status: 'todo',
      time_tracked: 0, labels: [], dependencies: [],
    };
    const task = mapRowToTask(row, memberMap);
    expect(task.assignees).toEqual(['Alice']);
  });
});

describe('mergeLabels', () => {
  it('returns copy of currentLabels when updates has no recognized keys', () => {
    const orig = ['urgent', 'start:2026-01-01'];
    const result = mergeLabels(orig, {});
    expect(result).toEqual(orig);
  });

  it('replaces start: label when updates.startDate provided', () => {
    const result = mergeLabels(['urgent', 'start:2026-01-01'], { startDate: '2026-02-15' });
    expect(result).toContain('start:2026-02-15');
    expect(result).not.toContain('start:2026-01-01');
    expect(result).toContain('urgent');
  });

  it('removes all start: labels when updates.startDate is empty string', () => {
    const result = mergeLabels(['urgent', 'start:2026-01-01'], { startDate: '' });
    expect(result.filter((l) => l.startsWith('start:'))).toHaveLength(0);
    expect(result).toContain('urgent');
  });

  it('merges ui labels with existing start: when only labels provided', () => {
    const result = mergeLabels(['urgent', 'start:2026-01-01'], { labels: ['urgent', 'blocker'] });
    expect(result).toContain('start:2026-01-01');
    expect(result).toContain('urgent');
    expect(result).toContain('blocker');
  });

  it('set-union deduplication: both startDate and labels provided', () => {
    const result = mergeLabels(['start:2026-01-01'], { startDate: '2026-03-01', labels: ['urgent'] });
    expect(result).toContain('start:2026-03-01');
    expect(result).not.toContain('start:2026-01-01');
    expect(result).toContain('urgent');
    expect(result.filter((l) => l.startsWith('start:'))).toHaveLength(1);
  });
});

describe('buildMemberMap', () => {
  it('maps array to Record<id, {nome, email}>', () => {
    const members = [
      { id: 'u1', nome: 'Alice', email: 'alice@test.com' },
      { id: 'u2', nome: null, email: 'bob@test.com' },
    ];
    const map = buildMemberMap(members);
    expect(map['u1']).toEqual({ nome: 'Alice', email: 'alice@test.com' });
    expect(map['u2']).toEqual({ nome: null, email: 'bob@test.com' });
  });

  it('returns empty object for empty array', () => {
    expect(buildMemberMap([])).toEqual({});
  });
});

describe('extractTaskExtras', () => {
  it('maps rows to extras keyed by id', () => {
    const rows = [
      { id: 1, assigned_to: 'u1', created_by: 'u2', visible_to_members: ['u3'] },
      { id: 2, assigned_to: null, created_by: null, visible_to_members: null },
    ];
    const extras = extractTaskExtras(rows);
    expect(extras[1]).toEqual({ assigned_to: 'u1', created_by: 'u2', visible_to_members: ['u3'] });
    expect(extras[2]).toEqual({ assigned_to: null, created_by: null, visible_to_members: [] });
  });

  it('coerces falsy assigned_to/created_by to null', () => {
    const rows = [{ id: 3, assigned_to: '', created_by: '', visible_to_members: [] }];
    const extras = extractTaskExtras(rows);
    expect(extras[3].assigned_to).toBeNull();
    expect(extras[3].created_by).toBeNull();
  });

  it('returns empty object for empty array', () => {
    expect(extractTaskExtras([])).toEqual({});
  });
});
