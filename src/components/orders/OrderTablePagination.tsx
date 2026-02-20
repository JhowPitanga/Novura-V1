import { Button } from "@/components/ui/button";

interface OrderTablePaginationProps {
  currentPage: number;
  totalPages: number;
  showingFrom: number;
  showingTo: number;
  totalFiltered: number;
  onPageChange: (page: number) => void;
}

export function OrderTablePagination({
  currentPage,
  totalPages,
  showingFrom,
  showingTo,
  totalFiltered,
  onPageChange,
}: OrderTablePaginationProps) {
  return (
    <div className="py-4 px-6 flex flex-col md:flex-row md:justify-between md:items-center gap-3 text-sm text-gray-600">
      <div>
        Exibindo {showingFrom}-{showingTo} de {totalFiltered} pedido(s)
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="h-8 px-3 rounded-lg"
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          Anterior
        </Button>
        {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
          const page = i + 1;
          return (
            <Button
              key={page}
              variant={page === currentPage ? "default" : "outline"}
              className={`h-8 w-9 p-0 rounded-lg ${page === currentPage ? 'bg-primary text-white' : ''}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </Button>
          );
        })}
        {totalPages > 10 && (
          <span className="px-2">...</span>
        )}
        {totalPages > 10 && (
          <Button
            variant={totalPages === currentPage ? "default" : "outline"}
            className={`h-8 w-12 p-0 rounded-lg ${totalPages === currentPage ? 'bg-primary text-white' : ''}`}
            onClick={() => onPageChange(totalPages)}
          >
            {totalPages}
          </Button>
        )}
        <Button
          variant="outline"
          className="h-8 px-3 rounded-lg"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          Próximo
        </Button>
      </div>
    </div>
  );
}
