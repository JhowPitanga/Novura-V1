import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox as CustomCheckbox } from "@/components/ui/checkbox";

interface ColumnDef {
  id: string;
  name: string;
  enabled: boolean;
  alwaysVisible?: boolean;
}

interface ColumnsManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animatedOpen: boolean;
  columns: ColumnDef[];
  onColumnsChange: (cols: ColumnDef[]) => void;
  panelRef: React.RefObject<HTMLElement | null>;
}

export function ColumnsManagementPanel({
  open,
  onOpenChange,
  animatedOpen,
  columns,
  onColumnsChange,
  panelRef,
}: ColumnsManagementPanelProps) {
  const dragStartIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[50] bg-black/40 transition-opacity duration-200 ${animatedOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => {
          onOpenChange(false);
          const btn = document.querySelector<HTMLButtonElement>('button[data-columns-trigger]');
          btn?.focus();
        }}
      />
      {/* Aside */}
      <aside
        ref={panelRef}
        className={`fixed inset-y-0 right-0 z-[60] w-[30%] max-w-[560px] bg-white/95 backdrop-blur-md shadow-2xl flex flex-col border-l border-gray-100 transform transition-transform duration-300 ease-out ${animatedOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Gerenciar Colunas"
      >
        <div className="grid gap-2 p-6 border-b border-gray-100 bg-gradient-to-b from-white to-gray-50/70">
          <h2 className="text-xl font-bold">Gerenciar Colunas</h2>
          <p className="text-sm text-gray-600">Selecione e arraste para organizar as colunas da tabela.</p>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            {columns.map((col, index) => (
              <div
                key={col.id}
                draggable
                onDragStart={(e) => {
                  dragStartIndexRef.current = index;
                  e.dataTransfer.effectAllowed = 'move';
                  try { e.dataTransfer.setData('text/plain', String(index)); } catch {}
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverIndex !== index) setDragOverIndex(index);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragStartIndexRef.current ?? parseInt(e.dataTransfer.getData('text/plain') || '-1', 10);
                  const to = index;
                  if (from === -1 || from === null || isNaN(from)) return;
                  const copy = [...columns];
                  const [item] = copy.splice(from, 1);
                  copy.splice(to, 0, item);
                  onColumnsChange(copy);
                  setDragOverIndex(null);
                  dragStartIndexRef.current = null;
                }}
                onDragEnd={() => { setDragOverIndex(null); dragStartIndexRef.current = null; }}
                className={`flex items-center justify-between p-2 rounded-md border bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing ${dragOverIndex === index ? 'ring-2 ring-purple-300' : ''}`}
              >
                <div className="flex items-center space-x-2">
                  {!col.alwaysVisible && (
                    <CustomCheckbox
                      checked={col.enabled}
                      onChange={(e) => onColumnsChange(columns.map(c => c.id === col.id ? { ...c, enabled: !!(e.target as HTMLInputElement).checked } : c))}
                    />
                  )}
                  <span className="text-sm">{col.name}</span>
                  {col.alwaysVisible && (
                    <Badge variant="secondary" className="text-xs">Obrigatória</Badge>
                  )}
                </div>
                <div className="text-xs text-gray-400 select-none">arraste</div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        </div>
      </aside>
    </>
  );
}
