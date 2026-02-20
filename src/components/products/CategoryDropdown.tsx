
import { useState } from "react";
import { ChevronDown, Plus, Tag, Trash2, Edit, ArrowLeft, Info, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from "@/components/ui/drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface Category {
  id: string;
  name: string;
  parent_id?: string;
  children?: Category[];
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

type DrawerStep = 'filter' | 'create' | 'addChild' | 'edit';

export function CategoryDropdown({ categories, selectedCategory = "", selectedCategories = [], onCategoryChange, onCategoriesChange, onAddCategory, onUpdateCategory, onDeleteCategory, onLinkCategory }: CategoryDropdownProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [pendingSelectedCategories, setPendingSelectedCategories] = useState<string[]>(selectedCategories.length ? selectedCategories : (selectedCategory ? [selectedCategory] : []));
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [currentStep, setCurrentStep] = useState<DrawerStep>('filter');
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newChildCategoryName, setNewChildCategoryName] = useState("");
  const [selectedParentCategory, setSelectedParentCategory] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [expandedEditParents, setExpandedEditParents] = useState<Record<string, boolean>>({});

  // Organizar categorias em estrutura hierárquica
  const organizeCategories = (cats: Category[]) => {
    const categoryMap = new Map<string, Category>();
    const rootCategories: Category[] = [];

    // Primeiro, criar um mapa de todas as categorias
    cats.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Em seguida, organizar em hierarquia
    cats.forEach(cat => {
      const categoryWithChildren = categoryMap.get(cat.id)!;
      
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        const parent = categoryMap.get(cat.parent_id)!;
        parent.children!.push(categoryWithChildren);
      } else {
        rootCategories.push(categoryWithChildren);
      }
    });

    return rootCategories;
  };

  const organizedCategories = organizeCategories(categories);

  const toggleParentExpand = (parentId: string) => {
    setExpandedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
  };

  const handleSaveSelection = () => {
    const unique = Array.from(new Set(pendingSelectedCategories));
    if (onCategoriesChange) {
      onCategoriesChange(unique);
    } else if (onCategoryChange) {
      onCategoryChange(unique[0] || "");
    }
    setIsPopoverOpen(false);
  };

  const handleCancelSelection = () => {
    setPendingSelectedCategories(selectedCategories.length ? selectedCategories : (selectedCategory ? [selectedCategory] : []));
    setIsPopoverOpen(false);
  };

  const handleSaveCategory = () => {
    if (newCategoryName.trim()) {
      onAddCategory({ name: newCategoryName.trim() });
      setNewCategoryName("");
      setCurrentStep('filter');
      setIsDrawerOpen(false);
    }
  };

  const handleSaveChildCategory = () => {
    if (newChildCategoryName.trim() && selectedParentCategory) {
      onAddCategory({ 
        name: newChildCategoryName.trim(), 
        parent_id: selectedParentCategory 
      });
      setNewChildCategoryName("");
      setSelectedParentCategory("");
      setCurrentStep('filter');
      setIsDrawerOpen(false);
    }
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (onDeleteCategory) {
      onDeleteCategory(categoryId);
    }
  };

  const handleStartEdit = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const handleSaveEdit = () => {
    if (editingCategoryId && editingCategoryName.trim() && onUpdateCategory) {
      onUpdateCategory(editingCategoryId, editingCategoryName.trim());
      setEditingCategoryId(null);
      setEditingCategoryName("");
    }
  };

  const handleCancelEdit = () => {
    setEditingCategoryId(null);
    setEditingCategoryName("");
  };

  const resetDrawer = () => {
    setCurrentStep('filter');
    setNewCategoryName("");
    setNewChildCategoryName("");
    setSelectedParentCategory("");
    setEditingCategoryId(null);
    setEditingCategoryName("");
  };

  const renderCategoryItems = (cats: Category[], level = 0) => {
    return cats.map((category) => {
      const hasChildren = category.children && category.children.length > 0;
      
      if (hasChildren) {
        return (
          <DropdownMenu key={category.id}>
            <DropdownMenuTrigger asChild>
              <DropdownMenuItem
                className={`${level > 0 ? 'pl-6' : ''} ${selectedCategory === category.id ? 'bg-muted' : ''} justify-between`}
                onSelect={(e) => e.preventDefault()}
              >
                <span>{category.name}</span>
                <ChevronDown className="w-4 h-4" />
              </DropdownMenuItem>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              <DropdownMenuItem
                onClick={() => onCategoryChange(category.id)}
                className={selectedCategory === category.id ? 'bg-muted' : ''}
              >
                Todas de {category.name}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {category.children?.map((child) => (
                <DropdownMenuItem
                  key={child.id}
                  onClick={() => onCategoryChange(child.id)}
                  className={selectedCategory === child.id ? 'bg-muted' : ''}
                >
                  {child.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }

      return (
        <DropdownMenuItem
          key={category.id}
          onClick={() => onCategoryChange(category.id)}
          className={`${level > 0 ? 'pl-6' : ''} ${selectedCategory === category.id ? 'bg-muted' : ''}`}
        >
          {category.name}
        </DropdownMenuItem>
      );
    });
  };

  // Nova renderização em formato de accordion
  const renderAccordionFilter = () => {
    return (
      <div className="space-y-1">
        <Accordion type="multiple" collapsible className="w-full">
          {organizedCategories.map((category) => {
            const hasChildren = category.children && category.children.length > 0;
            if (hasChildren) {
              return (
                <AccordionItem key={category.id} value={category.id}>
                  <AccordionTrigger className={`text-sm ${selectedCategory === category.id ? 'bg-muted font-bold rounded-md px-2' : 'font-bold'}`}>
                    {category.name}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col">
                      <DropdownMenuItem
                        onClick={() => onCategoryChange(category.id)}
                        className={`${selectedCategory === category.id ? 'bg-muted' : ''}`}
                      >
                        Todas de {category.name}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {category.children?.map((child) => (
                        <DropdownMenuItem
                          key={child.id}
                          onClick={() => onCategoryChange(child.id)}
                          className={`${selectedCategory === child.id ? 'bg-muted' : ''}`}
                        >
                          {child.name}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            }
            return (
              <DropdownMenuItem
                key={category.id}
                onClick={() => onCategoryChange(category.id)}
                className={`${selectedCategory === category.id ? 'bg-muted font-bold' : ''}`}
              >
                {category.name}
              </DropdownMenuItem>
            );
          })}
        </Accordion>
      </div>
    );
  };

  const selectedLabel = (() => {
    const current = pendingSelectedCategories.filter(Boolean);
    if (current.length === 0) return "Todas as categorias";
    const selectedSet = new Set(current);
    organizedCategories.forEach(parent => {
      const childIds = (parent.children || []).map(c => c.id);
      const allChildrenSelected = childIds.length > 0 && childIds.every(id => selectedSet.has(id));
      const parentSelected = selectedSet.has(parent.id);
      if (parentSelected || allChildrenSelected) {
        childIds.forEach(id => selectedSet.delete(id));
        selectedSet.add(parent.id);
      }
    });
    const effectiveIds = Array.from(selectedSet);
    const names = effectiveIds.map(id => categories.find(c => c.id === id)?.name || "").filter(Boolean);
    if (names.length === 0) return "Categorias selecionadas";
    const truncate = (s: string, max = 12) => (s.length <= max ? s : s.slice(0, max - 3) + "...");
    if (names.length === 1) return truncate(names[0]);
    const first = truncate(names[0]);
    const extra = names.length - 1;
    return `${first}, +${extra}`;
  })();

  const renderPopoverTree = () => {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700">Categorias</div>
        <ScrollArea className="max-h-80 pr-1">
          <div className="space-y-1">
            {/* Todas as categorias */}
            <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={pendingSelectedCategories.length === 0}
                  onCheckedChange={(checked) => {
                    if (checked) setPendingSelectedCategories([]);
                  }}
                />
                <span className="text-sm">Todas as categorias</span>
              </div>
            </div>
            {/* Pais e filhos */}
            {organizedCategories.map((parent) => {
              const hasChildren = (parent.children || []).length > 0;
              const expanded = !!expandedParents[parent.id];
              return (
                <div key={parent.id} className="px-2 py-1">
                  <div className="grid grid-cols-[24px_1fr_24px] items-center gap-2 rounded hover:bg-gray-50">
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={pendingSelectedCategories.includes(parent.id)}
                        onCheckedChange={(checked) => {
                          setPendingSelectedCategories(prev => {
                            const exists = prev.includes(parent.id);
                            const childIds = (parent.children || []).map(c => c.id);
                            if (checked && !exists) {
                              const withoutAll = prev.filter(id => ![parent.id, ...childIds, ""].includes(id));
                              return [...withoutAll, parent.id, ...childIds];
                            }
                            if (!checked && exists) {
                              return prev.filter(id => id !== parent.id && !childIds.includes(id));
                            }
                            return prev;
                          });
                        }}
                      />
                    </div>
                    <div className="text-sm font-medium truncate">{parent.name}</div>
                    <div className="flex items-center justify-center">
                      {hasChildren && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                          onClick={() => toggleParentExpand(parent.id)}
                          aria-label="Expandir subcategorias"
                          title="Expandir subcategorias"
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {hasChildren && expanded && (
                    <div className="mt-1 ml-6 space-y-1">
                      {parent.children?.map(child => (
                        <div key={child.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50">
                          <Checkbox
                            checked={pendingSelectedCategories.includes(child.id)}
                            onCheckedChange={(checked) => {
                              setPendingSelectedCategories(prev => {
                                const exists = prev.includes(child.id);
                                if (checked && !exists) return [...prev.filter(id => id !== ""), child.id];
                                if (!checked && exists) return prev.filter(id => id !== child.id);
                                return prev;
                              });
                            }}
                          />
                          <span className="text-sm">{child.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" onClick={handleCancelSelection}>
            Cancelar
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                (document.activeElement as HTMLElement | null)?.blur();
                resetDrawer();
                setIsPopoverOpen(false);
                setIsDrawerOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar/Editar
            </Button>
            <Button size="sm" onClick={handleSaveSelection}>
              Salvar
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderAllCategoriesForEdit = () => {
    const renderCategory = (category: Category, level = 0): JSX.Element[] => {
      const elements: JSX.Element[] = [];
      const hasChildren = category.children && category.children.length > 0;
      const parentCategory = category.parent_id ? categories.find(c => c.id === category.parent_id) : null;
      
      const expanded = !!expandedEditParents[category.id];
      elements.push(
        <div key={category.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center flex-1">
            {level > 0 && (
              <ChevronDown className="w-4 h-4 mr-2 text-muted-foreground rotate-90" />
            )}
            {hasChildren && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0 ml-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                onClick={() => setExpandedEditParents(prev => ({ ...prev, [category.id]: !prev[category.id] }))}
                aria-label="Expandir subcategorias"
                title="Expandir subcategorias"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </Button>
            )}
            
            {editingCategoryId === category.id ? (
              <div className="flex items-center space-x-2 flex-1">
                <Input
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  className="flex-1"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveEdit();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveEdit}
                  className="h-8 w-8 p-0 text-green-600"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="h-8 w-8 p-0 text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="text-sm font-medium">{category.name}</span>
                {parentCategory && (
                  <span className="text-xs text-muted-foreground">
                    Subcategoria de: {parentCategory.name}
                  </span>
                )}
              </div>
            )}
          </div>
          
          {editingCategoryId !== category.id && (
            <div className="flex items-center space-x-1">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => handleStartEdit(category)}
                className="h-8 w-8 p-0 text-primary hover:text-primary/80 hover:bg-primary/10"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 w-8 p-0 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => onLinkCategory?.(category.id, null)}
                  >
                    Sem categoria pai
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {categories
                    .filter(c => !c.parent_id && c.id !== category.id)
                    .map(c => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => onLinkCategory?.(category.id, c.id)}
                      >
                        Vincular a: {c.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => handleDeleteCategory(category.id)}
                className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      );

      // Adicionar filhos se existirem
      if (hasChildren && expanded) {
        category.children?.forEach(child => {
          elements.push(...renderCategory(child, level + 1));
        });
      }

      return elements;
    };

    const allElements: JSX.Element[] = [];
    organizedCategories.forEach(category => {
      allElements.push(...renderCategory(category));
    });

    return allElements;
  };

  const renderDrawerContent = () => {
    switch (currentStep) {
      case 'filter':
        return (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <TooltipProvider>
                {/* Card 1 - Cadastrar Categoria */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card 
                      className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20"
                      onClick={() => setCurrentStep('create')}
                    >
                      <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                          <Tag className="w-6 h-6 text-primary" />
                        </div>
                        <CardTitle className="text-lg">Cadastrar Categoria</CardTitle>
                      </CardHeader>
                      <CardContent className="text-center">
                        <p className="text-sm text-muted-foreground">
                          Criar uma nova categoria principal
                        </p>
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clique para criar uma nova categoria principal para organizar seus produtos</p>
                  </TooltipContent>
                </Tooltip>

                {/* Card 2 - Adicionar Categoria Filho */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card 
                      className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20"
                      onClick={() => setCurrentStep('addChild')}
                    >
                      <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                          <Plus className="w-6 h-6 text-primary" />
                        </div>
                        <CardTitle className="text-lg">Categoria Filho</CardTitle>
                      </CardHeader>
                      <CardContent className="text-center">
                        <p className="text-sm text-muted-foreground">
                          Adicionar subcategoria a uma categoria existente
                        </p>
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clique para adicionar uma subcategoria dentro de uma categoria principal existente</p>
                  </TooltipContent>
                </Tooltip>

                {/* Card 3 - Editar Categorias */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card 
                      className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20"
                      onClick={() => setCurrentStep('edit')}
                    >
                      <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                          <Edit className="w-6 h-6 text-primary" />
                        </div>
                        <CardTitle className="text-lg">Editar Categorias</CardTitle>
                      </CardHeader>
                      <CardContent className="text-center">
                        <p className="text-sm text-muted-foreground">
                          Gerenciar e excluir categorias existentes
                        </p>
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clique para editar nomes ou excluir categorias já cadastradas</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        );

      case 'create':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center mb-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setCurrentStep('filter')}
                className="mr-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
              <h3 className="text-lg font-semibold">Cadastrar Nova Categoria</h3>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Tag className="w-5 h-5 mr-2" />
                  Informações da Categoria
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="category-name">Nome da Categoria</Label>
                  <Input
                    id="category-name"
                    placeholder="Ex: Eletrônicos"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={handleSaveCategory}
                  className="w-full"
                  disabled={!newCategoryName.trim()}
                >
                  Salvar Categoria
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case 'addChild':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center mb-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setCurrentStep('filter')}
                className="mr-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
              <h3 className="text-lg font-semibold">Adicionar Categoria Filho</h3>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Plus className="w-5 h-5 mr-2" />
                  Subcategoria
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="parent-category">Categoria Pai</Label>
                  <Select value={selectedParentCategory} onValueChange={setSelectedParentCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria pai" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter(cat => !cat.parent_id).map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="child-category-name">Nome da Subcategoria</Label>
                  <Input
                    id="child-category-name"
                    placeholder="Ex: Celulares"
                    value={newChildCategoryName}
                    onChange={(e) => setNewChildCategoryName(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={handleSaveChildCategory}
                  className="w-full"
                  disabled={!newChildCategoryName.trim() || !selectedParentCategory}
                >
                  Salvar Subcategoria
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case 'edit':
        return (
          <div className="p-6 space-y-6 h-full flex flex-col">
            <div className="flex items-center mb-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setCurrentStep('filter')}
                className="mr-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
              <h3 className="text-lg font-semibold">Editar Categorias</h3>
            </div>
            
            <Card className="flex-1 flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Edit className="w-5 h-5 mr-2" />
                  Categorias Cadastradas
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-[calc(100vh-300px)] px-6 pb-6">
                  <div className="space-y-3">
                    {renderAllCategoriesForEdit()}
                    {categories.length === 0 && (
                      <div className="text-center py-8">
                        <Info className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={(open) => {
        setIsPopoverOpen(open);
        if (open) setPendingSelectedCategories(selectedCategories.length ? selectedCategories : (selectedCategory ? [selectedCategory] : []));
      }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full max-w-[180px] justify-between">
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className="w-4 h-4 ml-2 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-[420px] p-3">
          {renderPopoverTree()}
        </PopoverContent>
      </Popover>

      <Drawer direction="right" open={isDrawerOpen} onOpenChange={(open) => {
        setIsDrawerOpen(open);
        if (!open) resetDrawer();
      }}>
        <DrawerContent className="fixed inset-y-0 right-0 h-full w-[35%]">
          <DrawerHeader>
            <DrawerTitle>Gerenciar Categorias</DrawerTitle>
            <DrawerDescription>Crie, edite e organize categorias e subcategorias.</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden">
            {renderDrawerContent()}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
