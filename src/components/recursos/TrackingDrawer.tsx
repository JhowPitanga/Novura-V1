
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Truck } from "lucide-react";

interface TrackingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrackingDrawer({ open, onOpenChange }: TrackingDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full w-[400px] fixed right-0">
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center">
            <Truck className="w-5 h-5 mr-2" />
            Status do Pedido
          </DrawerTitle>
        </DrawerHeader>
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-green-600">
              <div className="w-3 h-3 bg-green-600 rounded-full"></div>
              <div>
                <p className="font-medium">Pedido confirmado</p>
                <p className="text-xs text-gray-600">18/01/2024 - 14:30</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 text-green-600">
              <div className="w-3 h-3 bg-green-600 rounded-full"></div>
              <div>
                <p className="font-medium">Saiu para entrega</p>
                <p className="text-xs text-gray-600">19/01/2024 - 08:15</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 text-blue-600">
              <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
              <div>
                <p className="font-medium">Em trânsito</p>
                <p className="text-xs text-gray-600">Previsão: 22/01/2024</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 text-gray-400">
              <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
              <div>
                <p className="font-medium">Entregue</p>
                <p className="text-xs text-gray-600">Aguardando...</p>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
