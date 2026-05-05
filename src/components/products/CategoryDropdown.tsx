import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderTree, Pencil, Plus, Save, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  parent_id?: string;
}

interface CategoryDropdownProps {
  categories: Category[];
  selectedCategory?: string;
  selectedCategories?: string[];
  onCategoryChange?: (categoryId: string) => void;
  onCategoriesChange?: (categoryIds: string[]) => void;
  onAddCategory: (category: { name: string; parent_id?: string }) => void;
  onUpdateCategory?: (categoryId: string, name: string) => void;
  onDeleteCategory?: (categoryId: string) => void;
  onLinkCategory?: (categoryId: string, parentId: string | null) => void;
}

interface TreeNode extends Category {
  children: TreeNode[];
}

type DrawerMode = "home" | "create" | "edit";
type EditMode = "list" | "detail";

function buildTree(categories: Category[]): TreeNode[] {
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

export function CategoryDropdown({
  categories,
  selectedCategory = "",
  selectedCategories = [],
  onCategoryChange,
  onCategoriesChange,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onLinkCategory,
}: CategoryDropdownProps) {
  const tree = useMemo(() => buildTree(categories), [categories]);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("home");

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingSelectedCategories, setPendingSelectedCategories] = useState<string[]>([]);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<"parent" | "child">("parent");
  const [newCategoryParentId, setNewCategoryParentId] = useState<string>("");

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingParentId, setEditingParentId] = useState<string>("none");
  const [editMode, setEditMode] = useState<EditMode>("list");

  useEffect(() => {
    if (!isPopoverOpen) return;
    setPendingSelectedCategories(
      selectedCategories.length > 0 ? selectedCategories : selectedCategory ? [selectedCategory] : []
    );
  }, [isPopoverOpen, selectedCategories, selectedCategory]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);

  const selectedLabel = useMemo(() => {
    if (pendingSelectedCategories.length === 0) return "Todas as categorias";
    if (pendingSelectedCategories.length === 1) {
      return categoryById.get(pendingSelectedCategories[0])?.name || "Categoria";
    }
    return `${pendingSelectedCategories.length} categorias`;
  }, [pendingSelectedCategories, categoryById]);

  const toggleExpand = (categoryId: string) => {
    setExpanded((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  const collectDescendants = (node: TreeNode): string[] => {
    const ids: string[] = [];
    node.children.forEach((child) => {
      ids.push(child.id);
      ids.push(...collectDescendants(child));
    });
    return ids;
  };

  const findNodeById = (nodes: TreeNode[], id: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const child = findNodeById(node.children, id);
      if (child) return child;
    }
    return null;
  };

  const collectAncestorIds = (nodes: TreeNode[], id: string, trail: string[] = []): string[] => {
    for (const node of nodes) {
      const nextTrail = [...trail, node.id];
      if (node.id === id) return trail;
      const found = collectAncestorIds(node.children, id, nextTrail);
      if (found.length > 0) return found;
    }
    return [];
  };

  const filteredIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return new Set(categories.map((c) => c.id));

    const directMatches = categories.filter((c) => c.name.toLowerCase().includes(term)).map((c) => c.id);
    const ids = new Set<string>(directMatches);
    directMatches.forEach((id) => {
      const ancestors = collectAncestorIds(tree, id);
      ancestors.forEach((a) => ids.add(a));
    });
    return ids;
  }, [search, categories, tree]);

  useEffect(() => {
    if (!search.trim()) return;
    const nextExpanded: Record<string, boolean> = {};
    filteredIds.forEach((id) => {
      const ancestors = collectAncestorIds(tree, id);
      ancestors.forEach((a) => {
        nextExpanded[a] = true;
      });
    });
    setExpanded((prev) => ({ ...prev, ...nextExpanded }));
  }, [search, filteredIds, tree]);

  const handleToggleNode = (node: TreeNode, checked: boolean) => {
    const descendants = collectDescendants(node);
    setPendingSelectedCategories((prev) => {
      const selected = new Set(prev);
      if (checked) {
        selected.add(node.id);
        descendants.forEach((id) => selected.add(id));
      } else {
        selected.delete(node.id);
        descendants.forEach((id) => selected.delete(id));
      }
      return Array.from(selected);
    });
  };

  const renderTree = (node: TreeNode, level = 0): JSX.Element | null => {
    if (!filteredIds.has(node.id)) return null;

    const hasChildren = node.children.length > 0;
    const isExpanded = !!expanded[node.id];
    const checked = pendingSelectedCategories.includes(node.id);

    return (
      <div key={node.id}>
        <div className="grid grid-cols-[20px_1fr_24px] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-violet-50/60">
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => handleToggleNode(node, Boolean(value))}
            className="border-gray-300"
          />
          <span className="truncate text-sm text-gray-800" style={{ paddingLeft: `${level * 14}px` }}>
            {node.name}
          </span>
          <div className="flex justify-end">
            {hasChildren ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                onClick={() => toggleExpand(node.id)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-3 border-l border-violet-100 pl-2">
            {node.children.map((child) => renderTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const resetDrawerState = () => {
    setDrawerMode("home");
    setEditMode("list");
    setNewCategoryName("");
    setNewCategoryType("parent");
    setNewCategoryParentId("");
    setEditingCategoryId(null);
    setEditingCategoryName("");
    setEditingParentId("none");
  };

  const openEditCategory = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setEditingParentId(category.parent_id || "none");
    setEditMode("detail");
  };

  const editingCategory = editingCategoryId ? categoryById.get(editingCategoryId) : undefined;
  const editingParentCategory =
    editingCategory?.parent_id ? categoryById.get(editingCategory.parent_id) : undefined;

  const renderManageTree = (node: TreeNode, level = 0): JSX.Element => {
    const hasChildren = node.children.length > 0;
    const isExpanded = !!expanded[node.id];
    const category = categoryById.get(node.id);

    return (
      <div key={`manage-${node.id}`}>
        <div
          className="grid grid-cols-[20px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-violet-50/60"
          style={{ paddingLeft: `${level * 10}px` }}
        >
          <div className="flex justify-center">
            {hasChildren ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                onClick={() => toggleExpand(node.id)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            ) : (
              <span className="inline-block h-4 w-4" />
            )}
          </div>
          <span className="truncate text-sm text-gray-800">{node.name}</span>
          {category ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-violet-700 hover:bg-violet-50"
                onClick={() => openEditCategory(category)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:bg-red-50"
                onClick={() => onDeleteCategory?.(category.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-3 border-l border-violet-100 pl-2">
            {node.children.map((child) => renderManageTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-12 w-full min-w-[260px] justify-between rounded-2xl border-0 bg-white text-gray-700 shadow-lg ring-1 ring-gray-200/60"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" sideOffset={8} className="w-[460px] p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Categoria pai {'>'} subcategoria</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-violet-700 hover:bg-violet-50 hover:text-violet-800"
              onClick={() => {
                setIsPopoverOpen(false);
                setIsDrawerOpen(true);
              }}
            >
              <FolderTree className="mr-2 h-4 w-4" />
              Gerenciar
            </Button>
          </div>

          <div className="mb-3">
            <Input
              placeholder="Buscar categoria ou subcategoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-gray-200 focus-visible:ring-violet-500"
            />
          </div>

          <ScrollArea className="max-h-80 pr-1">
            <div className="space-y-1">
              <div className="grid grid-cols-[20px_1fr_24px] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-violet-50/60">
                <Checkbox
                  checked={pendingSelectedCategories.length === 0}
                  onCheckedChange={(value) => {
                    if (value) setPendingSelectedCategories([]);
                  }}
                />
                <span className="text-sm text-gray-800">Todas as categorias</span>
                <span />
              </div>

              {tree.map((node) => renderTree(node))}
            </div>
          </ScrollArea>

          <div className="mt-3 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingSelectedCategories(
                  selectedCategories.length > 0 ? selectedCategories : selectedCategory ? [selectedCategory] : []
                );
                setIsPopoverOpen(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-violet-700 text-white hover:bg-violet-800"
              onClick={() => {
                const unique = Array.from(new Set(pendingSelectedCategories));
                if (onCategoriesChange) {
                  onCategoriesChange(unique);
                } else if (onCategoryChange) {
                  onCategoryChange(unique[0] || "");
                }
                setIsPopoverOpen(false);
              }}
            >
              Aplicar filtro
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Drawer
        open={isDrawerOpen}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) resetDrawerState();
        }}
        direction="right"
      >
        <DrawerContent className="fixed inset-y-0 right-0 h-full w-[430px]">
          <DrawerHeader>
            <DrawerTitle>Gerenciar categorias</DrawerTitle>
            <DrawerDescription>Fluxo por cards com criação e edição em estrutura limpa.</DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 overflow-y-auto px-4 pb-6">
            {drawerMode === "home" && (
              <div className="grid grid-cols-1 gap-3">
                <Card className="border-violet-200 transition hover:border-violet-300 hover:bg-violet-50/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-violet-800">Card de Criação</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-600">
                    <p className="mb-3">Criar categoria pai ou categoria filho vinculada a uma categoria pai existente.</p>
                    <Button size="sm" className="bg-violet-700 text-white hover:bg-violet-800" onClick={() => setDrawerMode("create")}>
                      Abrir criação
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-violet-200 transition hover:border-violet-300 hover:bg-violet-50/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-violet-800">Card de Edição</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-600">
                    <p className="mb-3">Editar nome da categoria, alterar vínculo de pai e excluir categoria.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-violet-200 text-violet-700 hover:bg-violet-50"
                      onClick={() => {
                        setDrawerMode("edit");
                        setEditMode("list");
                      }}
                    >
                      Abrir edição
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {drawerMode === "create" && (
              <div className="space-y-4 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">Nova categoria</p>
                  <Button variant="ghost" size="sm" onClick={() => setDrawerMode("home")}>
                    Voltar
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={newCategoryType === "parent" ? "default" : "outline"}
                      className={newCategoryType === "parent" ? "bg-violet-700 text-white hover:bg-violet-800" : "border-violet-200 text-violet-700 hover:bg-violet-50"}
                      onClick={() => setNewCategoryType("parent")}
                    >
                      Categoria pai
                    </Button>
                    <Button
                      type="button"
                      variant={newCategoryType === "child" ? "default" : "outline"}
                      className={newCategoryType === "child" ? "bg-violet-700 text-white hover:bg-violet-800" : "border-violet-200 text-violet-700 hover:bg-violet-50"}
                      onClick={() => setNewCategoryType("child")}
                    >
                      Subcategoria
                    </Button>
                  </div>
                </div>

                {newCategoryType === "child" && (
                  <div className="space-y-2">
                    <Label>Categoria pai existente</Label>
                    <div className="max-h-44 overflow-auto rounded-lg border border-violet-100 bg-violet-50/30 p-2 space-y-1">
                      {categories.filter((c) => !c.parent_id).map((category) => {
                        const selected = newCategoryParentId === category.id;
                        return (
                          <button
                            key={category.id}
                            type="button"
                            className={cn(
                              "w-full rounded-md px-2 py-1.5 text-left text-sm transition flex items-center justify-between",
                              selected ? "bg-violet-100 text-violet-800" : "hover:bg-violet-50 text-gray-700"
                            )}
                            onClick={() => setNewCategoryParentId(category.id)}
                          >
                            <span>{category.name}</span>
                            {selected ? <CheckCircle2 className="h-4 w-4 text-violet-700" /> : null}
                          </button>
                        );
                      })}
                      {categories.filter((c) => !c.parent_id).length === 0 ? (
                        <p className="px-2 py-1.5 text-sm text-gray-500">Nenhuma categoria pai disponível.</p>
                      ) : null}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    placeholder="Digite o nome da categoria"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full bg-violet-700 text-white hover:bg-violet-800"
                  disabled={
                    !newCategoryName.trim() || (newCategoryType === "child" && !newCategoryParentId)
                  }
                  onClick={() => {
                    onAddCategory({
                      name: newCategoryName.trim(),
                      parent_id: newCategoryType === "child" ? newCategoryParentId : undefined,
                    });
                    setNewCategoryName("");
                    setNewCategoryParentId("");
                    setNewCategoryType("parent");
                    setDrawerMode("home");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Criar categoria
                </Button>
              </div>
            )}

            {drawerMode === "edit" && editMode === "list" && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">Editar categorias na árvore</p>
                  <Button variant="ghost" size="sm" onClick={() => setDrawerMode("home")}>
                    Voltar
                  </Button>
                </div>

                <div className="max-h-[460px] overflow-auto rounded-lg border border-gray-100 p-2">
                  <div className="space-y-1">{tree.map((node) => renderManageTree(node))}</div>
                </div>
              </div>
            )}

            {drawerMode === "edit" && editMode === "detail" && editingCategory && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">Detalhes da edição</p>
                  <Button variant="ghost" size="sm" onClick={() => setEditMode("list")}>
                    Voltar para árvore
                  </Button>
                </div>

                <Card className="border-violet-200 bg-violet-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-violet-800">Categoria selecionada</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-gray-700">
                    {editingParentCategory ? (
                      <>
                        <p>
                          <span className="font-medium text-gray-900">Categoria:</span> {editingParentCategory.name}
                        </p>
                        <p>
                          <span className="font-medium text-gray-900">Subcategoria:</span> {editingCategory.name}
                        </p>
                      </>
                    ) : (
                      <p>
                        <span className="font-medium text-gray-900">Categoria:</span> {editingCategory.name}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-gray-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-violet-800">
                      <Pencil className="h-4 w-4" />
                      Editar dados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} />
                    <Select value={editingParentId} onValueChange={setEditingParentId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem categoria pai</SelectItem>
                        {categories
                          .filter((c) => c.id !== editingCategory.id)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-violet-700 text-white hover:bg-violet-800"
                        onClick={() => {
                          if (!editingCategoryId) return;
                          if (editingCategoryName.trim()) {
                            onUpdateCategory?.(editingCategoryId, editingCategoryName.trim());
                          }
                          onLinkCategory?.(editingCategoryId, editingParentId === "none" ? null : editingParentId);
                          setEditingCategoryId(null);
                          setEditingCategoryName("");
                          setEditingParentId("none");
                          setEditMode("list");
                        }}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingCategoryId(null);
                          setEditingCategoryName("");
                          setEditingParentId("none");
                          setEditMode("list");
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (!editingCategoryId) return;
                          onDeleteCategory?.(editingCategoryId);
                          setEditingCategoryId(null);
                          setEditingCategoryName("");
                          setEditingParentId("none");
                          setEditMode("list");
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
