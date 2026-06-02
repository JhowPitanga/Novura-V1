/**
 * Presentational popover for category multi-selection (P-D split from CategoryDropdown).
 * Pure UI: tree rendering, search, pending selection, apply/cancel.
 * No data fetching — receives categories as props.
 */
import { useMemo, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type Category, type TreeNode } from "@/utils/products/categoryTree";

interface CategorySelectionPopoverProps {
  tree: TreeNode[];
  categories: Category[];
  selectedCategory?: string;
  selectedCategories?: string[];
  onCategoryChange?: (categoryId: string) => void;
  onCategoriesChange?: (categoryIds: string[]) => void;
  onOpenManage: () => void;
}

function collectDescendants(node: TreeNode): string[] {
  const ids: string[] = [];
  node.children.forEach((child) => {
    ids.push(child.id);
    ids.push(...collectDescendants(child));
  });
  return ids;
}

function collectAncestorIds(nodes: TreeNode[], id: string, trail: string[] = []): string[] {
  for (const node of nodes) {
    const nextTrail = [...trail, node.id];
    if (node.id === id) return trail;
    const found = collectAncestorIds(node.children, id, nextTrail);
    if (found.length > 0) return found;
  }
  return [];
}

export function CategorySelectionPopover({
  tree, categories,
  selectedCategory = "", selectedCategories = [],
  onCategoryChange, onCategoriesChange,
  onOpenManage,
}: CategorySelectionPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setPending(selectedCategories.length > 0 ? selectedCategories : selectedCategory ? [selectedCategory] : []);
  }, [isOpen, selectedCategories, selectedCategory]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const selectedLabel = useMemo(() => {
    if (pending.length === 0) return "Todas as categorias";
    if (pending.length === 1) return categoryById.get(pending[0])?.name || "Categoria";
    return `${pending.length} categorias`;
  }, [pending, categoryById]);

  const filteredIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return new Set(categories.map((c) => c.id));
    const directMatches = categories.filter((c) => c.name.toLowerCase().includes(term)).map((c) => c.id);
    const ids = new Set<string>(directMatches);
    directMatches.forEach((id) => collectAncestorIds(tree, id).forEach((a) => ids.add(a)));
    return ids;
  }, [search, categories, tree]);

  useEffect(() => {
    if (!search.trim()) return;
    const nextExpanded: Record<string, boolean> = {};
    filteredIds.forEach((id) => {
      collectAncestorIds(tree, id).forEach((a) => { nextExpanded[a] = true; });
    });
    setExpanded((prev) => ({ ...prev, ...nextExpanded }));
  }, [search, filteredIds, tree]);

  const handleToggleNode = (node: TreeNode, checked: boolean) => {
    const descendants = collectDescendants(node);
    setPending((prev) => {
      const selected = new Set(prev);
      if (checked) { selected.add(node.id); descendants.forEach((id) => selected.add(id)); }
      else { selected.delete(node.id); descendants.forEach((id) => selected.delete(id)); }
      return Array.from(selected);
    });
  };

  const renderNode = (node: TreeNode, level = 0): JSX.Element | null => {
    if (!filteredIds.has(node.id)) return null;
    const hasChildren = node.children.length > 0;
    const isExpanded = !!expanded[node.id];
    const checked = pending.includes(node.id);
    return (
      <div key={node.id}>
        <div className="grid grid-cols-[20px_1fr_24px] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-violet-50/60">
          <Checkbox checked={checked} onCheckedChange={(v) => handleToggleNode(node, Boolean(v))} className="border-gray-300" />
          <span className="truncate text-sm text-gray-800" style={{ paddingLeft: `${level * 14}px` }}>{node.name}</span>
          <div className="flex justify-end">
            {hasChildren ? (
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                onClick={() => setExpanded((prev) => ({ ...prev, [node.id]: !prev[node.id] }))}>
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-3 border-l border-violet-100 pl-2">{node.children.map((child) => renderNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-12 w-full min-w-[260px] justify-between rounded-2xl border-0 bg-white text-gray-700 shadow-lg ring-1 ring-gray-200/60">
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[460px] p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Categoria pai {'>'} subcategoria</span>
          <Button type="button" variant="ghost" size="sm" className="text-violet-700 hover:bg-violet-50 hover:text-violet-800"
            onClick={() => { setIsOpen(false); onOpenManage(); }}>
            <FolderTree className="mr-2 h-4 w-4" />Gerenciar
          </Button>
        </div>
        <div className="mb-3">
          <Input placeholder="Buscar categoria ou subcategoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 border-gray-200 focus-visible:ring-violet-500" />
        </div>
        <ScrollArea className="max-h-80 pr-1">
          <div className="space-y-1">
            <div className="grid grid-cols-[20px_1fr_24px] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-violet-50/60">
              <Checkbox checked={pending.length === 0} onCheckedChange={(v) => { if (v) setPending([]); }} />
              <span className="text-sm text-gray-800">Todas as categorias</span>
              <span />
            </div>
            {tree.map((node) => renderNode(node))}
          </div>
        </ScrollArea>
        <div className="mt-3 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => {
            setPending(selectedCategories.length > 0 ? selectedCategories : selectedCategory ? [selectedCategory] : []);
            setIsOpen(false);
          }}>Cancelar</Button>
          <Button size="sm" className="bg-violet-700 text-white hover:bg-violet-800" onClick={() => {
            const unique = Array.from(new Set(pending));
            if (onCategoriesChange) { onCategoriesChange(unique); }
            else if (onCategoryChange) { onCategoryChange(unique[0] || ""); }
            setIsOpen(false);
          }}>Aplicar filtro</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
