import { Button } from "@/components/ui/button";

interface LinkFilterBarProps {
  vincularBadgeFilter: string;
  onVincularBadgeFilterChange: (v: string) => void;
  paraVincularCount: number;
  semEstoqueCount: number;
}

export function LinkFilterBar({
  vincularBadgeFilter,
  onVincularBadgeFilterChange,
  paraVincularCount,
  semEstoqueCount,
}: LinkFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
      <div className="w-full">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className={`h-9 rounded-full px-3 ${vincularBadgeFilter === 'para_vincular' ? 'border-novura-primary text-novura-primary' : 'border-gray-200 text-gray-700'}`}
            onClick={() => onVincularBadgeFilterChange('para_vincular')}
          >
            Para vincular ({paraVincularCount})
          </Button>
          <Button
            variant="outline"
            className={`h-9 rounded-full px-3 ${vincularBadgeFilter === 'sem_estoque' ? 'border-novura-primary text-novura-primary' : 'border-gray-200 text-gray-700'}`}
            onClick={() => onVincularBadgeFilterChange('sem_estoque')}
          >
            Sem estoque ({semEstoqueCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
