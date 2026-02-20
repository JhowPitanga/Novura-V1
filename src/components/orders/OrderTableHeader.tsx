import { forwardRef } from "react";
import { Checkbox as CustomCheckbox } from "@/components/ui/checkbox";

interface ColumnDef {
  id: string;
  name: string;
  enabled: boolean;
}

interface OrderTableHeaderProps {
  activeStatus: string;
  columns: ColumnDef[];
  selectedCount: number;
  filteredCount: number;
  isAllChecked: boolean;
  isCheckboxDisabled: boolean;
  onSelectAll: () => void;
}

export const OrderTableHeader = forwardRef<HTMLTableSectionElement, OrderTableHeaderProps>(
  function OrderTableHeader({
    activeStatus,
    columns,
    selectedCount,
    filteredCount,
    isAllChecked,
    isCheckboxDisabled,
    onSelectAll,
  }, ref) {
    const enabledCols = columns.filter(col => col.enabled).length;
    const showCheckbox = activeStatus === "todos" || activeStatus === "emissao-nf" || activeStatus === "impressao" || activeStatus === "enviado";

    if (selectedCount > 0) {
      return (
        <thead ref={ref} className="bg-gray-50">
          <tr>
            <th className="w-[2%] px-2 py-3 text-left text-xs font-medium tracking-wider bg-purple-600">
              {showCheckbox && (
                <CustomCheckbox
                  checked={isAllChecked}
                  onChange={onSelectAll}
                />
              )}
            </th>
            <th colSpan={enabledCols + 1} className="px-6 py-3 text-left text-sm font-semibold bg-purple-600 text-white">
              {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
            </th>
          </tr>
        </thead>
      );
    }

    return (
      <thead ref={ref} className="bg-gray-50">
        <tr>
          <th className="w-[2%] px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {showCheckbox && (
              <div className="w-5 h-5 flex items-center justify-center">
                <CustomCheckbox
                  checked={isAllChecked}
                  disabled={isCheckboxDisabled}
                  onChange={onSelectAll}
                />
              </div>
            )}
          </th>
          {columns.filter(col => col.enabled).map(col => (
            <th
              key={col.id}
              className={`py-3 text-[clamp(11px,0.9vw,13px)] font-medium text-gray-500 uppercase tracking-wider ${col.id === 'produto' ? 'text-left w-[26%] pr-0' : ''} ${col.id === 'itens' ? 'text-center w-[4%] pl-0 pr-0' : ''} ${col.id === 'cliente' ? 'text-center w-[14%] pr-0' : ''} ${col.id === 'valor' ? 'text-left w-[10%]' : ''} ${col.id === 'tipoEnvio' ? 'text-center w-[10%]' : ''} ${col.id === 'marketplace' ? 'text-left w-[8%]' : ''} ${col.id === 'status' ? 'text-center w-[10%]' : ''} ${col.id === 'margem' ? 'text-center w-[8%]' : ''}`}
            >
              {col.name}
            </th>
          ))}
          <th className="py-1 text-[clamp(11px,0.9vw,13px)] text-center font-medium text-gray-500 uppercase tracking-wider w-[8%]">Detalhes</th>
        </tr>
      </thead>
    );
  }
);
