import { CategoryPickerDialog } from "@/components/listings/CategoryPickerDialog";
import { RequiredLabel } from "@/components/listings/RequiredLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

interface StepCategoryProps {
  title: string;
  setTitle: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  categorySuggestions: any[];
  domainSuggestions: any[];
  hasSearchedCategory: boolean;
  isLoadingPredict: boolean;
  runPredict: () => void;
  pathsByCategoryId: Record<string, string>;
  dumpOpen: boolean;
  setDumpOpen: (v: boolean) => void;
  dumpQuery: string;
  setDumpQuery: (v: string) => void;
  dumpLoading: boolean;
  dumpSelected: any[];
  pendingCategoryId: string;
  pendingCategoryName: string;
  getColumnItems: (level: number) => any[];
  handleSelectLevel: (level: number, item: any) => void;
  handleBreadcrumbClick: (index: number) => void;
  confirmPickerCategory: () => Promise<void>;
  cancelPicker: () => void;
}

export function StepCategory({
  title,
  setTitle,
  categoryId,
  setCategoryId,
  categorySuggestions,
  domainSuggestions,
  hasSearchedCategory,
  isLoadingPredict,
  runPredict,
  pathsByCategoryId,
  dumpOpen,
  setDumpOpen,
  dumpQuery,
  setDumpQuery,
  dumpLoading,
  dumpSelected,
  pendingCategoryId,
  pendingCategoryName,
  getColumnItems,
  handleSelectLevel,
  handleBreadcrumbClick,
  confirmPickerCategory,
  cancelPicker,
}: StepCategoryProps) {
  return (
    <div className="space-y-4">
      <div>
        <RequiredLabel text="Título do produto" required />
        <div className="relative mt-2">
          <Input
            id="ml-title"
            placeholder="Digite o título do produto"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runPredict(); }}
            className="pr-40"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-novura-primary text-sm flex items-center gap-1"
            onClick={runPredict}
          >
            <Search className="w-4 h-4" /> Buscar categoria
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" />
      <div className="space-y-2">
        {isLoadingPredict ? (
          <div className="text-sm text-gray-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando sugestões...
          </div>
        ) : hasSearchedCategory && categorySuggestions.length === 0 && domainSuggestions.length === 0 ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">Nenhuma sugestão de categoria</div>
            <Button className="bg-novura-primary hover:bg-novura-primary/90 text-white" onClick={() => setDumpOpen(true)}>
              Selecionar manualmente
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {categorySuggestions.map((sug: any, idx: number) => {
              const path: any[] = Array.isArray(sug?.path_from_root) ? sug.path_from_root : [];
              const leaf = path.length ? path[path.length - 1] : null;
              const leafId = leaf?.id || sug?.category_id || "";
              const leafName = leaf?.name || sug?.category_name || "Categoria";
              const fullPath = path.map((p: any) => p?.name).filter(Boolean).join(" › ");
              return (
                <button
                  key={String(leafId || idx)}
                  className="border border-gray-200 rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50"
                  onClick={() => setCategoryId(String(leafId || ""))}
                >
                  <div className="font-medium text-gray-900">{leafName}</div>
                  <div className="text-xs text-gray-600">{fullPath || leafName}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {domainSuggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">Sugestões por domínio</div>
            <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => setDumpOpen(true)}>Não é essa categoria</Button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {domainSuggestions.map((d: any, i: number) => {
              const leafId = String(d?.category_id || "");
              const leafName = String(d?.category_name || "Categoria");
              const domain = String(d?.domain_name || d?.domain_id || "");
              const subtitle = pathsByCategoryId[leafId] || domain;
              const selected = leafId === String(categoryId || "");
              return (
                <button
                  key={leafId || i}
                  className={`${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"} border rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50`}
                  onClick={() => setCategoryId(leafId)}
                >
                  <div className="font-medium text-gray-900">{leafName}</div>
                  <div className="text-xs text-gray-600">{subtitle}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {categoryId && domainSuggestions.length === 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">Categoria selecionada manualmente</div>
          <div className="border border-novura-primary rounded-lg px-6 py-5 md:px-8 md:py-6 bg-purple-50">
            <div className="text-base font-medium text-novura-primary">{pathsByCategoryId[String(categoryId)] || categoryId}</div>
          </div>
        </div>
      )}
      <CategoryPickerDialog
        open={dumpOpen}
        onOpenChange={setDumpOpen}
        dumpQuery={dumpQuery}
        onQueryChange={setDumpQuery}
        dumpLoading={dumpLoading}
        dumpSelected={dumpSelected}
        pendingCategoryId={pendingCategoryId}
        pendingCategoryName={pendingCategoryName}
        getColumnItems={getColumnItems}
        handleSelectLevel={handleSelectLevel}
        handleBreadcrumbClick={handleBreadcrumbClick}
        onConfirm={confirmPickerCategory}
        onCancel={cancelPicker}
      />
    </div>
  );
}
