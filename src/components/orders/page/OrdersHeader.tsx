import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

interface OrdersHeaderProps {
  isSyncing: boolean;
  onOpenSyncModal: () => void;
}

export function OrdersHeader({ isSyncing, onOpenSyncModal }: Readonly<OrdersHeaderProps>) {
  return (
    <div className="flex items-center justify-between mb-8">
      <h1 className="text-3xl font-bold text-gray-900">Gestão de Pedidos</h1>
      <div className="flex items-center gap-3">
        <Button
          className="h-10 px-4 rounded-xl bg-primary text-white shadow-lg disabled:opacity-50"
          disabled={isSyncing}
          onClick={onOpenSyncModal}
        >
          <Zap className="w-4 h-4 mr-2" />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar pedidos'}
        </Button>
      </div>
    </div>
  );
}
