import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Pencil,
  Plus,
  Save,
  Tags,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  type CategoryTreeNode,
  type CategoryShape,
  buildCategoryTree,
  getCategoryBreadcrumb,
} from "@/utils/categoryTree";
import type { Category } from "@/hooks/useCategories";

type DrawerMode = "home" | "create" | "edit";
type EditPhase = "list" | "detail";

const TODAS = "todas";

function filterTreeBySearch(nodes: CategoryTreeNode[], term: string): CategoryTreeNode[] {
  if (!term.trim()) return nodes;
  const t = term.trim().toLowerCase();
  const out: CategoryTreeNode[] = [];
  for (const n of nodes) {
    const childFiltered = filterTreeBySearch(n.children, term);
    const selfMatch = n.name.toLowerCase().includes(t);
    if (selfMatch || childFiltered.length > 0) {
      out.push({
        ...n,
        children: selfMatch ? n.children : childFiltered,
      });
    }
  }
  return out;
}

function collectDescendantIds(node: CategoryTreeNode): string[] {
  const ids: string[] = [];
  for (const c of node.children) {
    ids.push(c.id, ...collectDescendantIds(c));
  }
  return ids;
}

function findNodeById(nodes: CategoryTreeNode[], id: string): CategoryTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const d = findNodeById(n.children, id);
    if (d) return d;
  }
  return null;
}

function selectedFilterLabel(
  selectedCategory: string,
  categories: CategoryShape[]
): string {
  if (selectedCategory === TODAS) return "Todas as categorias";
  const { parent, self } = getCategoryBreadcrumb(selectedCategory, categories);
  if (!self) return "Categoria";
  if (parent) return `${parent.name} › ${self.name}`;
  return self.name;
}

export interface InventoryCategoryFilterProps {
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
  categories: Category[];
  loading: boolean;
  createCategory: (name: string, parent_id?: string | null) => Promise<unknown>;
  updateCategory: (categoryId: string, name: string) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  linkCategory: (categoryId: string, parentId: string | null) => Promise<void>;
}

export function InventoryCategoryFilter({
  selectedCategory,
  onCategoryChange,
  categories,
  loading,
  createCategory,
  updateCategory,
  deleteCategory,
  linkCategory,
}: InventoryCategoryFilterProps) {
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const categoryById = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("home");
  const [editPhase, setEditPhase] = useState<EditPhase>("list");

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"parent" | "child">("parent");
  const [newParentId, setNewParentId] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingParentId, setEditingParentId] = useState<string>("none");

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filterTree = useMemo(
    () => filterTreeBySearch(tree, filterSearch),
    [tree, filterSearch]
  );

  // When searching, expand all branches that contain matches
  useEffect(() => {
    if (!filterSearch.trim()) return;
    const next: Record<string, boolean> = {};
    const mark = (nodes: CategoryTreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          next[n.id] = true;
          mark(n.children);
        }
      }
    };
    mark(filterTree);
    setTreeExpanded((prev) => ({ ...prev, ...next }));
  }, [filterSearch, filterTree]);

  const resetDrawer = useCallback(() => {
    setDrawerMode("home");
    setEditPhase("list");
    setNewName("");
    setNewType("parent");
    setNewParentId("");
    setEditingId(null);
    setEditingName("");
    setEditingParentId("none");
  }, []);

  const openEditDetail = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setEditingParentId(cat.parent_id || "none");
    setEditPhase("detail");
  };

  const toggleTreeExpand = (id: string) => {
    setTreeExpanded((p) => ({ ...p, [id]: !p[id] }));
  };

  const pickFilterCategory = (id: string) => {
    onCategoryChange(id);
    setPopoverOpen(false);
    setFilterSearch("");
  };

  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [categories]
  );

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCategory(deleteTarget.id);
      if (selectedCategory === deleteTarget.id) {
        onCategoryChange(TODAS);
      }
      if (editingId === deleteTarget.id) {
        setEditPhase("list");
        setEditingId(null);
      }
      setDeleteTarget(null);
    } catch {
      /* toast from hook */
    } finally {
      setDeleting(false);
    }
  };

  const renderFilterRow = (node: CategoryTreeNode, level: number): JSX.Element => {
    const hasChildren = node.children.length > 0;
    const isOpen = !!treeExpanded[node.id];
    const isSelected = selectedCategory === node.id;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-1 rounded-xl px-2 py-2 text-sm transition-colors",
            isSelected ? "bg-violet-100 text-violet-900" : "hover:bg-violet-50/80 text-gray-800"
          )}
          style={{ paddingLeft: `${8 + level * 14}px` }}
        >
          <div className="flex w-7 shrink-0 justify-center">
            {hasChildren ? (
              <button
                type="button"
                className="rounded-md p-0.5 text-violet-700 hover:bg-violet-100"
                aria-expanded={isOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTreeExpand(node.id);
                }}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="inline-block w-4" />
            )}
          </div>
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left font-medium"
            onClick={() => pickFilterCategory(node.id)}
          >
            {node.name}
          </button>
        </div>
        {hasChildren && isOpen && (
          <div className="border-l border-violet-100 ml-[14px] pl-1">
            {node.children.map((ch) => renderFilterRow(ch, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderEditListRow = (node: CategoryTreeNode, level: number): JSX.Element => {
    const hasChildren = node.children.length > 0;
    const isOpen = !!treeExpanded[node.id];
    const cat = categoryById.get(node.id);

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm"
          style={{ paddingLeft: `${4 + level * 12}px` }}
        >
          <div className="flex w-7 shrink-0 justify-center">
            {hasChildren ? (
              <button
                type="button"
                className="rounded-md p-0.5 text-violet-700 hover:bg-violet-100"
                onClick={() => toggleTreeExpand(node.id)}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="inline-block w-4" />
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-gray-800">{node.name}</span>
          {cat && (
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-violet-700 hover:bg-violet-50"
                aria-label="Editar categoria"
                onClick={() => openEditDetail(cat)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:bg-red-50"
                aria-label="Excluir categoria"
                onClick={() => setDeleteTarget(cat)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        {hasChildren && isOpen && (
          <div className="border-l border-gray-100 ml-3 pl-1">
            {node.children.map((ch) => renderEditListRow(ch, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const editingCategory = editingId ? categoryById.get(editingId) ?? null : null;
  const { parent: editingParent, self: editingSelf } = editingId
    ? getCategoryBreadcrumb(editingId, categories)
    : { parent: null, self: null };

  const editDetailTitle =
    editingSelf && editingParent
      ? "Editando subcategoria"
      : editingSelf
        ? "Editando categoria"
        : "Edição";

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            className="h-12 w-full min-w-[220px] justify-between rounded-2xl border-0 bg-white font-normal text-gray-800 shadow-lg ring-1 ring-gray-200/60 hover:bg-white"
          >
            <span className="truncate text-left">
              {loading ? "Carregando categorias…" : selectedFilterLabel(selectedCategory, categories)}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-gray-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(100vw-2rem,420px)] p-0" sideOffset={8}>
          <div className="border-b border-gray-100 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-800">Filtrar por categoria</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1 text-violet-700 hover:bg-violet-50"
                onClick={() => {
                  setPopoverOpen(false);
                  setDrawerOpen(true);
                }}
              >
                <FolderTree className="h-4 w-4" />
                Gerenciar
              </Button>
            </div>
            <Input
              placeholder="Buscar na árvore…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="h-10 rounded-xl border-gray-200"
            />
          </div>
          <ScrollArea className="max-h-80">
            <div className="space-y-0.5 p-2">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  selectedCategory === TODAS
                    ? "bg-violet-100 text-violet-900"
                    : "text-gray-800 hover:bg-violet-50/80"
                )}
                onClick={() => pickFilterCategory(TODAS)}
              >
                <Tags className="h-4 w-4 shrink-0 text-violet-600" />
                Todas as categorias
              </button>
              {filterTree.map((n) => renderFilterRow(n, 0))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) resetDrawer();
        }}
        direction="right"
      >
        <DrawerContent className="fixed inset-y-0 right-0 flex h-full w-full max-w-[440px] flex-col border-l bg-background p-0">
          <DrawerHeader className="border-b border-gray-100 px-4 pb-4 pt-6 text-left">
            <DrawerTitle className="text-xl">Categorias do estoque</DrawerTitle>
            <DrawerDescription>
              Organize categorias e subcategorias; o filtro da lista usa a árvore ao lado.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-8 pt-2">
            {drawerMode === "home" && (
              <div className="grid gap-3">
                <Card className="border-violet-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-violet-900">
                      <Plus className="h-4 w-4" />
                      Nova categoria
                    </CardTitle>
                    <CardDescription>
                      Crie uma categoria raiz ou uma subcategoria vinculada a uma existente.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      className="w-full bg-violet-700 text-white hover:bg-violet-800"
                      onClick={() => setDrawerMode("create")}
                    >
                      Abrir criação
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-violet-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-violet-900">
                      <Pencil className="h-4 w-4" />
                      Editar ou excluir
                    </CardTitle>
                    <CardDescription>
                      Escolha uma categoria na árvore; ícone de lápis edita, lixeira remove.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-violet-200 text-violet-800 hover:bg-violet-50"
                      onClick={() => {
                        setDrawerMode("edit");
                        setEditPhase("list");
                      }}
                    >
                      Abrir lista de edição
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {drawerMode === "create" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Criação</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDrawerMode("home")}>
                    Voltar
                  </Button>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Tipo</CardTitle>
                    <CardDescription>Categoria principal ou subcategoria.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={newType === "parent" ? "default" : "outline"}
                      className={cn(
                        newType === "parent" && "bg-violet-700 hover:bg-violet-800"
                      )}
                      onClick={() => {
                        setNewType("parent");
                        setNewParentId("");
                      }}
                    >
                      Categoria
                    </Button>
                    <Button
                      type="button"
                      variant={newType === "child" ? "default" : "outline"}
                      className={cn(newType === "child" && "bg-violet-700 hover:bg-violet-800")}
                      onClick={() => setNewType("child")}
                    >
                      Subcategoria
                    </Button>
                  </CardContent>
                </Card>

                {newType === "child" && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Categoria pai</CardTitle>
                      <CardDescription>Obrigatório para subcategorias.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="max-h-40 rounded-lg border border-violet-100 bg-violet-50/30 p-2">
                        <div className="space-y-1">
                          {parentCategories.length === 0 ? (
                            <p className="px-2 py-2 text-sm text-muted-foreground">
                              Crie uma categoria raiz primeiro.
                            </p>
                          ) : (
                            parentCategories.map((c) => {
                              const active = newParentId === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={cn(
                                    "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm",
                                    active
                                      ? "bg-violet-100 font-medium text-violet-900"
                                      : "text-gray-700 hover:bg-violet-50"
                                  )}
                                  onClick={() => setNewParentId(c.id)}
                                >
                                  {c.name}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Nome</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      placeholder="Nome exibido nos filtros e produtos"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <Button
                      type="button"
                      className="w-full bg-violet-700 text-white hover:bg-violet-800"
                      disabled={
                        !newName.trim() || (newType === "child" && !newParentId)
                      }
                      onClick={async () => {
                        try {
                          await createCategory(
                            newName.trim(),
                            newType === "child" ? newParentId : null
                          );
                          setNewName("");
                          setNewParentId("");
                          setNewType("parent");
                          setDrawerMode("home");
                        } catch {
                          /* hook toast */
                        }
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Criar
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {drawerMode === "edit" && editPhase === "list" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Escolha o que editar</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDrawerMode("home")}>
                    Voltar
                  </Button>
                </div>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Árvore de categorias</CardTitle>
                    <CardDescription>Use as setas para expandir; ações à direita de cada linha.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[min(60vh,420px)] pr-2">
                      <div className="space-y-0.5">
                        {tree.length === 0 ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            Nenhuma categoria cadastrada.
                          </p>
                        ) : (
                          tree.map((n) => renderEditListRow(n, 0))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}

            {drawerMode === "edit" && editPhase === "detail" && editingCategory && editingSelf && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditPhase("list")}>
                    ← Voltar à lista
                  </Button>
                </div>

                <Card className="border-violet-200 bg-violet-50/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-violet-950">{editDetailTitle}</CardTitle>
                    <CardDescription className="text-gray-700">
                      {editingParent ? (
                        <span className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                          <span>
                            <span className="font-medium text-gray-900">Categoria:</span>{" "}
                            {editingParent.name}
                          </span>
                          <span className="hidden sm:inline text-gray-400">·</span>
                          <span>
                            <span className="font-medium text-gray-900">Subcategoria:</span>{" "}
                            {editingSelf.name}
                          </span>
                        </span>
                      ) : (
                        <span>
                          <span className="font-medium text-gray-900">Categoria raiz:</span>{" "}
                          {editingSelf.name}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-violet-300 bg-white"
                      disabled
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Modo edição
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(editingCategory)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Dados</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="inv-cat-name">Nome</Label>
                      <Input
                        id="inv-cat-name"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Vínculo (categoria pai)</Label>
                      <Select value={editingParentId} onValueChange={setEditingParentId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem pai (tornar raiz)</SelectItem>
                          {categories
                            .filter((c) => c.id !== editingId)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      className="w-full bg-violet-700 text-white hover:bg-violet-800"
                      disabled={!editingName.trim()}
                      onClick={async () => {
                        if (!editingId) return;
                        try {
                          await updateCategory(editingId, editingName.trim());
                          await linkCategory(
                            editingId,
                            editingParentId === "none" ? null : editingParentId
                          );
                          setEditPhase("list");
                          setEditingId(null);
                        } catch {
                          /* toast */
                        }
                      }}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Salvar alterações
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  A categoria &quot;{deleteTarget.name}&quot; será desativada. Produtos podem precisar de
                  recategorização.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
