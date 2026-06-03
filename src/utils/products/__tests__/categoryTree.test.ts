/**
 * Characterization tests for buildTree (CategoryDropdown P-D extraction).
 * Pins behavior before extracting to categoryTree.ts.
 */
import { describe, it, expect } from 'vitest';
import { buildTree } from '../categoryTree';

describe('buildTree', () => {
  it('returns empty array for no categories', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('returns roots when all categories have no parent_id', () => {
    const cats = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
    const tree = buildTree(cats);
    expect(tree).toHaveLength(2);
    const names = tree.map((n) => n.name);
    expect(names).toEqual(['Alpha', 'Beta']); // sorted alphabetically
  });

  it('nests children under their parent', () => {
    const cats = [
      { id: 'root', name: 'Root' },
      { id: 'child1', name: 'Child1', parent_id: 'root' },
      { id: 'child2', name: 'Child2', parent_id: 'root' },
    ];
    const tree = buildTree(cats);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.id).toBe('root');
    expect(root.children).toHaveLength(2);
    expect(root.children.map((c) => c.name)).toEqual(['Child1', 'Child2']); // sorted
  });

  it('sorts children alphabetically at each level', () => {
    const cats = [
      { id: 'r', name: 'Root' },
      { id: 'z', name: 'Zeta', parent_id: 'r' },
      { id: 'a', name: 'Alpha', parent_id: 'r' },
    ];
    const [root] = buildTree(cats);
    expect(root.children.map((c) => c.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('treats node with unknown parent_id as root (not attached)', () => {
    const cats = [
      { id: 'child', name: 'Orphan', parent_id: 'nonexistent' },
    ];
    const tree = buildTree(cats);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('child');
    expect(tree[0].children).toHaveLength(0);
  });

  it('cycle guard: self-referential parent_id treated as root', () => {
    const cats = [{ id: 'loop', name: 'Loop', parent_id: 'loop' }];
    const tree = buildTree(cats);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('loop');
    expect(tree[0].children).toHaveLength(0);
  });

  it('cycle guard: mutual parent references — no infinite loop', () => {
    const cats = [
      { id: 'a', name: 'A', parent_id: 'b' },
      { id: 'b', name: 'B', parent_id: 'a' },
    ];
    const tree = buildTree(cats);
    // One or both become roots; critical: no hang
    expect(Array.isArray(tree)).toBe(true);
    const total = tree.reduce(function countAll(sum, n): number {
      return sum + 1 + n.children.reduce(countAll, 0);
    }, 0);
    expect(total).toBe(2);
  });

  it('preserves nested grandchildren', () => {
    const cats = [
      { id: 'gp', name: 'Grandparent' },
      { id: 'p', name: 'Parent', parent_id: 'gp' },
      { id: 'c', name: 'Child', parent_id: 'p' },
    ];
    const tree = buildTree(cats);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].id).toBe('c');
  });
});
