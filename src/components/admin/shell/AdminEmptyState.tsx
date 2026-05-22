import { SearchX } from "lucide-react";

interface AdminEmptyStateProps {
  message?: string;
  description?: string;
}

export function AdminEmptyState({
  message = "Nenhum item encontrado.",
  description = "Tente ajustar os filtros ou realize uma nova busca.",
}: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <div className="p-3 bg-gray-100 rounded-full">
        <SearchX className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-gray-700">{message}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}
