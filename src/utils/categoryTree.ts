export interface CategoryShape {
  id: string;
  name: string;
  parent_id?: string | null;
}

export interface CategoryTreeNode extends CategoryShape {
  children: CategoryTreeNode[];
}

export function buildCategoryTree(categories: CategoryShape[]): CategoryTreeNode[] {
  const map = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

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
      currentParentId = parentNode.parent_id ?? undefined;
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

  const sortRecursive = (nodes: CategoryTreeNode[], visited = new Set<string>()) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    nodes.forEach((n) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      sortRecursive(n.children, visited);
    });
  };

  sortRecursive(roots);
  return roots;
}

export function getCategoryBreadcrumb(
  categoryId: string,
  categories: CategoryShape[]
): { parent: CategoryShape | null; self: CategoryShape | null } {
  const self = categories.find((c) => c.id === categoryId) ?? null;
  if (!self) return { parent: null, self: null };
  const parent = self.parent_id
    ? categories.find((c) => c.id === self.parent_id) ?? null
    : null;
  return { parent, self };
}
