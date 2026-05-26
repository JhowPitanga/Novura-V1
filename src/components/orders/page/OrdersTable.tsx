import LoadingOverlay from "@/components/LoadingOverlay";
import { OrderTableHeader } from "@/components/orders/OrderTableHeader";
import { OrderTablePagination } from "@/components/orders/OrderTablePagination";
import { OrderTableRow } from "@/components/orders/OrderTableRow";

interface ColumnDef {
  id: string;
  name: string;
  enabled: boolean;
  alwaysVisible?: boolean;
  render: (pedido: any) => React.ReactNode;
}

interface RowViewModel {
  pedido: any;
  isChecked: boolean;
  isProcessing: boolean;
  isNfeAuthorized: boolean;
  nfeFocusStatus: string;
  isXmlLoading: boolean;
  isArrangeLoading: boolean;
}

interface SelectionCounts {
  todos: number;
  'emissao-nf': number;
  impressao: number;
  enviado: number;
}

interface PaginationState {
  currentPage: number;
  totalPages: number;
  showingFrom: number;
  showingTo: number;
  totalFiltered: number;
}

export interface OrdersTableProps {
  isLoading: boolean;
  listTopOffset: number;
  columns: ColumnDef[];
  rowViewModels: RowViewModel[];
  activeStatus: string;
  nfBadgeFilter: string;
  selectionCounts: SelectionCounts;
  filteredCount: number;
  pagination: PaginationState;
  listContainerRef: React.RefObject<HTMLDivElement | null>;
  theadRef: React.RefObject<HTMLTableSectionElement | null>;
  onToggleRow: (id: string) => void;
  onOpenDetails: (pedido: any) => void;
  onVincular: (pedido: any) => void;
  onReprintLabel: (pedido: any) => void;
  onEmitirNfe: (pedidos: any[], opts?: any) => void;
  onSubirXml: (pedido: any) => void;
  onSyncNfe: (pedido: any) => void;
  onArrangeShipment: (pedido: any) => void;
  addProcessingId: (id: string) => void;
  onSelectAll: () => void;
  onPageChange: (page: number) => void;
}

export function OrdersTable({
  isLoading,
  listTopOffset,
  columns,
  rowViewModels,
  activeStatus,
  nfBadgeFilter,
  selectionCounts,
  filteredCount,
  pagination,
  listContainerRef,
  theadRef,
  onToggleRow,
  onOpenDetails,
  onVincular,
  onReprintLabel,
  onEmitirNfe,
  onSubirXml,
  onSyncNfe,
  onArrangeShipment,
  addProcessingId,
  onSelectAll,
  onPageChange,
}: OrdersTableProps) {
  const selectedCount =
    activeStatus === 'todos' ? selectionCounts.todos :
    activeStatus === 'emissao-nf' ? selectionCounts['emissao-nf'] :
    activeStatus === 'impressao' ? selectionCounts.impressao :
    activeStatus === 'enviado' ? selectionCounts.enviado :
    0;

  const isAllChecked =
    (activeStatus === 'todos' && selectionCounts.todos > 0 && selectionCounts.todos === filteredCount) ||
    (activeStatus === 'emissao-nf' && selectionCounts['emissao-nf'] > 0 && selectionCounts['emissao-nf'] === filteredCount) ||
    (activeStatus === 'impressao' && selectionCounts.impressao > 0 && selectionCounts.impressao === filteredCount) ||
    (activeStatus === 'enviado' && selectionCounts.enviado > 0 && selectionCounts.enviado === filteredCount);

  return (
    <div ref={listContainerRef} className="rounded-2xl bg-white shadow-lg overflow-hidden relative">
      {isLoading && (
        <LoadingOverlay fullscreen={false} topOffset={listTopOffset} message="Carregando pedidos..." />
      )}
      <div className="overflow-x-auto text-[clamp(12px,0.95vw,14px)]">
        <table className="min-w-full table-fixed divide-y divide-gray-200">
          <OrderTableHeader
            ref={theadRef}
            activeStatus={activeStatus}
            columns={columns}
            selectedCount={selectedCount}
            filteredCount={filteredCount}
            isAllChecked={isAllChecked}
            isCheckboxDisabled={activeStatus === 'emissao-nf' && nfBadgeFilter === 'processando'}
            onSelectAll={onSelectAll}
          />
          <tbody className="bg-white divide-y-[2px] divide-gray-200">
            {rowViewModels.length > 0 ? (
              rowViewModels.map((vm) => (
                <OrderTableRow
                  key={vm.pedido.id}
                  pedido={vm.pedido}
                  isChecked={vm.isChecked}
                  isProcessing={vm.isProcessing}
                  isNfeAuthorized={vm.isNfeAuthorized}
                  nfeFocusStatus={vm.nfeFocusStatus}
                  isXmlLoading={vm.isXmlLoading}
                  isArrangeLoading={vm.isArrangeLoading}
                  activeStatus={activeStatus}
                  columns={columns}
                  nfBadgeFilter={nfBadgeFilter}
                  onToggle={onToggleRow}
                  onOpenDetails={onOpenDetails}
                  onVincular={onVincular}
                  onReprintLabel={onReprintLabel}
                  onEmitir={onEmitirNfe}
                  onSubirXml={onSubirXml}
                  onSyncNfe={onSyncNfe}
                  onArrangeShipment={onArrangeShipment}
                  addProcessingId={addProcessingId}
                />
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.filter((col) => col.enabled).length + 2}
                  className="py-10 text-center text-gray-500"
                >
                  Nenhum pedido encontrado para este status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <OrderTablePagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        showingFrom={pagination.showingFrom}
        showingTo={pagination.showingTo}
        totalFiltered={pagination.totalFiltered}
        onPageChange={onPageChange}
      />
    </div>
  );
}
