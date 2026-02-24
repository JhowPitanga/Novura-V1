import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CategoryPickerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dumpQuery: string;
  onQueryChange: (q: string) => void;
  dumpLoading: boolean;
  dumpSelected: any[];
  pendingCategoryId: string;
  pendingCategoryName: string;
  getColumnItems: (level: number) => any[];
  handleSelectLevel: (level: number, item: any) => void;
  handleBreadcrumbClick: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function PickerColumn({
  level,
  selectedId,
  items,
  onSelect,
}: {
  level: number;
  selectedId: string;
  items: any[];
  onSelect: (item: any) => void;
}) {
  return (
    <div className="border rounded-md bg-white h-[420px]">
      <ScrollArea className="h-[420px] p-2">
        <div className="grid grid-cols-1 gap-2">
          {items.map((it: any, idx: number) => {
            const selected = selectedId === String(it?.id || "");
            return (
              <button
                key={String(it?.id || idx)}
                className={`${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"} border rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50`}
                onClick={() => onSelect(it)}
              >
                <div className="font-medium text-gray-900">{String(it?.name || "Categoria")}</div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function CategoryPickerDialog({
  open,
  onOpenChange,
  dumpQuery,
  onQueryChange,
  dumpLoading,
  dumpSelected,
  pendingCategoryId,
  pendingCategoryName,
  getColumnItems,
  handleSelectLevel,
  handleBreadcrumbClick,
  onConfirm,
  onCancel,
}: CategoryPickerDialogProps) {
  const breadcrumbs = (() => {
    const lastSel = dumpSelected[dumpSelected.length - 1];
    const includePending =
      pendingCategoryId && String(lastSel?.id || "") !== String(pendingCategoryId || "");
    return includePending
      ? [...dumpSelected, { id: pendingCategoryId, name: pendingCategoryName }]
      : [...dumpSelected];
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>Selecionar categoria manualmente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Buscar"
            value={dumpQuery}
            onChange={(e) => onQueryChange(e.target.value)}
          />

          <div className="flex items-center flex-wrap gap-2 text-sm text-novura-primary">
            {breadcrumbs.map((s, idx) => (
              <span key={String(s?.id || idx)} className="flex items-center gap-2">
                <button
                  className="text-novura-primary hover:underline"
                  onClick={() => handleBreadcrumbClick(idx)}
                >
                  {String(s?.name || "")}
                </button>
                {idx < breadcrumbs.length - 1 ? (
                  <span className="text-novura-primary">&gt;</span>
                ) : null}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {dumpLoading ? (
              <div className="col-span-4 p-4 text-sm text-gray-600">Carregando categorias...</div>
            ) : (
              <>
                {[0, 1, 2].map((level) => (
                  <PickerColumn
                    key={level}
                    level={level}
                    selectedId={String(dumpSelected[level]?.id || "")}
                    items={getColumnItems(level)}
                    onSelect={(item) => handleSelectLevel(level, item)}
                  />
                ))}
                <PickerColumn
                  level={3}
                  selectedId={pendingCategoryId}
                  items={getColumnItems(3)}
                  onSelect={(item) => handleSelectLevel(3, item)}
                />
              </>
            )}
          </div>

          <div className="flex justify-end items-center space-x-2">
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              className="bg-novura-primary hover:bg-novura-primary/90"
              disabled={!pendingCategoryId}
              onClick={onConfirm}
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
