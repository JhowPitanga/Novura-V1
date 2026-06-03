/**
 * buildTree: converts a flat category list to a sorted tree.
 * Extracted verbatim from CategoryDropdown.tsx (P-D refactor).
 * Includes cycle-guard using DFS visited set.
 */

export interface Category {
  id: string;
  name: string;
  parent_id?: string;
}

export interface TreeNode extends Category {
  children: TreeNode[];
}

export function buildTree(categories: Category[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  categories.forEach((category) => {
    map.set(category.id, { ...category, children: [] });
  });

  const createsCycle = (nodeId: string, parentId: string): boolean => {
    if (nodeId === parentId) return true;
    const visited = new Set<string>([nodeId]);
    let currentParentId: string | undefined = parentId;

    while (currentParentId) {
      if (visited.has(currentParentId)) return true;
      visited.add(currentParentId);
      const parentNode = map.get(currentParentId);
      if (!parentNode?.parent_id) return false;
      currentParentId = parentNode.parent_id;
    }

    return false;
  };

  map.forEach((node) => {
    const parentId = node.parent_id;
    if (parentId && map.has(parentId) && !createsCycle(node.id, parentId)) {
      map.get(parentId)!.children.push(node);
      return;
    }
    roots.push(node);
  });

  const sortRecursive = (nodes: TreeNode[], visited = new Set<string>()) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      sortRecursive(n.children, visited);
    });
  };

  sortRecursive(roots);
  return roots;
}
