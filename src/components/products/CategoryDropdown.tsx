/**
 * CategoryDropdown: selection popover + management drawer.
 * P-D refactor: buildTree extracted to utils/products/categoryTree.ts;
 * popover extracted to CategorySelectionPopover; drawer to CategoryMgmtDrawer.
 * This file is now a thin composition facade.
 */
import { useState, useMemo } from "react";
import { buildTree } from "@/utils/products/categoryTree";
import { CategorySelectionPopover } from "./CategorySelectionPopover";
import { CategoryMgmtDrawer } from "./CategoryMgmtDrawer";

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

export function CategoryDropdown({
  categories,
  selectedCategory,
  selectedCategories,
  onCategoryChange,
  onCategoriesChange,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onLinkCategory,
}: CategoryDropdownProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const tree = useMemo(() => buildTree(categories), [categories]);

  return (
    <>
      <CategorySelectionPopover
        tree={tree}
        categories={categories}
        selectedCategory={selectedCategory}
        selectedCategories={selectedCategories}
        onCategoryChange={onCategoryChange}
        onCategoriesChange={onCategoriesChange}
        onOpenManage={() => setIsDrawerOpen(true)}
      />
      <CategoryMgmtDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        tree={tree}
        categories={categories}
        onAddCategory={onAddCategory}
        onUpdateCategory={onUpdateCategory}
        onDeleteCategory={onDeleteCategory}
        onLinkCategory={onLinkCategory}
      />
    </>
  );
}
