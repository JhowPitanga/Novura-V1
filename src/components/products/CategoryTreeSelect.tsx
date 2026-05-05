// T10 — Category tree select component
// Features: flat-list from RPC get_categories_tree, debounced search,
// hierarchical indentation, single selection, breadcrumb display, inline create.
import { useState, useEffect, useMemo, useRef } from "react";
import { Search, ChevronDown, ChevronRight, Plus, Check, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export interface CategoryNode {
  id: string;
  name: string;
  parent_id: string | null;
  path: string | null;
  level: number;
  active: boolean;
}

interface CategoryTreeSelectProps {
  value?: string | null;
  onChange: (categoryId: string | null, category: CategoryNode | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CategoryTreeSelect({
  value,
  onChange,
  placeholder = "Selecione uma categoria",
  disabled = false,
  className = "",
}: CategoryTreeSelectProps) {
  const { toast } = useToast();
  const { organizationId } = useAuth();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Fetch category tree via RPC when popover opens
  useEffect(() => {
    if (!open || !organizationId) return;
    setLoading(true);
    supabase
      .rpc('get_categories_tree', { p_org_id: organizationId })
      .then(({ data, error }) => {
        if (!error && Array.isArray(data)) {
          setCategories(data as CategoryNode[]);
        }
        setLoading(false);
      });
  }, [open, organizationId]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === value) ?? null,
    [categories, value]
  );

  // Filter and build tree nodes to display
  const visibleCategories = useMemo(() => {
    if (!debouncedSearch) {
      // Show tree with expand/collapse
      return categories.filter((c) => {
        if (c.parent_id === null) return true;
        // Show if parent is expanded
        return isAncestorExpanded(c, categories, expandedIds);
      });
    }
    // Search mode: show all matching nodes (and their ancestors)
    const term = debouncedSearch.toLowerCase();
    const matchIds = new Set(
      categories
        .filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            (c.path?.toLowerCase() ?? "").includes(term)
        )
        .map((c) => c.id)
    );
    // Include ancestors of matched nodes
    const withAncestors = new Set(matchIds);
    for (const id of matchIds) {
      let node = categories.find((c) => c.id === id);
      while (node?.parent_id) {
        withAncestors.add(node.parent_id);
        node = categories.find((c) => c.id === node!.parent_id);
      }
    }
    return categories.filter((c) => withAncestors.has(c.id));
  }, [categories, debouncedSearch, expandedIds]);

  const hasChildren = (id: string) => categories.some((c) => c.parent_id === id);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (cat: CategoryNode) => {
    if (value === cat.id) {
      onChange(null, null);
    } else {
      onChange(cat.id, cat);
    }
    setOpen(false);
    setSearch("");
  };

  const handleCreate = async () => {
    if (!newCategoryName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: newCategoryName.trim(), parent_id: newCategoryParent || null })
        .select()
        .single();
      if (error) throw error;
      // Refresh tree
      const { data: tree } = await supabase.rpc('get_categories_tree', { p_org_id: organizationId });
      if (Array.isArray(tree)) setCategories(tree as CategoryNode[]);
      setNewCategoryName("");
      setNewCategoryParent(null);
      setShowCreate(false);
      toast({ title: "Categoria criada", description: `"${data.name}" adicionada com sucesso.` });
      // Auto-select new category
      onChange(data.id, data as any);
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const displayValue = selectedCategory
    ? (selectedCategory.path ?? selectedCategory.name)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal text-left",
            !displayValue && "text-gray-400",
            className
          )}
        >
          <span className="truncate flex-1 mr-2 text-sm">
            {displayValue ?? placeholder}
          </span>
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-80" align="start">
        {/* Search */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* Tree */}
        <ScrollArea className="h-64">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-violet-600/30 border-t-violet-600 rounded-full animate-spin mr-2" />
              Carregando...
            </div>
          ) : visibleCategories.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              {debouncedSearch ? "Nenhuma categoria encontrada" : "Sem categorias"}
            </div>
          ) : (
            <div className="py-1">
              {visibleCategories.map((cat) => {
                const selected = cat.id === value;
                const expanded = expandedIds.has(cat.id);
                const childCount = hasChildren(cat.id);
                return (
                  <div
                    key={cat.id}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1.5 cursor-pointer text-sm hover:bg-violet-50 transition-colors group",
                      selected && "bg-violet-100 text-violet-800"
                    )}
                    style={{ paddingLeft: `${8 + cat.level * 16}px` }}
                    onClick={() => handleSelect(cat)}
                  >
                    {/* Expand/collapse button */}
                    {childCount ? (
                      <button
                        type="button"
                        onClick={(e) => toggleExpand(cat.id, e)}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                      >
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-3.5 flex-shrink-0" />
                    )}

                    {/* Icon */}
                    {expanded && childCount ? (
                      <FolderOpen className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                    ) : (
                      <Folder className={cn("w-3.5 h-3.5 flex-shrink-0", cat.level === 0 ? "text-violet-500" : "text-gray-400")} />
                    )}

                    <span className="flex-1 truncate">{cat.name}</span>

                    {selected && <Check className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Create inline */}
        <div className="border-t p-2">
          {!showCreate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-2 text-violet-600 hover:bg-violet-50"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-4 h-4" />
              Nova categoria
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Nome da nova categoria"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
              />
              <select
                className="w-full h-8 text-sm border rounded px-2 text-gray-700"
                value={newCategoryParent ?? ""}
                onChange={(e) => setNewCategoryParent(e.target.value || null)}
              >
                <option value="">Sem categoria pai (raiz)</option>
                {categories
                  .filter((c) => c.level < 3)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {"  ".repeat(c.level)}{c.name}
                    </option>
                  ))}
              </select>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="flex-1 h-7 text-xs"
                  onClick={() => { setShowCreate(false); setNewCategoryName(""); }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 h-7 text-xs bg-violet-700 hover:bg-violet-800 text-white"
                  onClick={handleCreate}
                  disabled={!newCategoryName.trim() || creating}
                >
                  {creating ? "Criando..." : "Criar"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function isAncestorExpanded(
  node: CategoryNode,
  all: CategoryNode[],
  expanded: Set<string>
): boolean {
  if (!node.parent_id) return true;
  if (!expanded.has(node.parent_id)) return false;
  const parent = all.find((c) => c.id === node.parent_id);
  if (!parent) return false;
  return isAncestorExpanded(parent, all, expanded);
}
