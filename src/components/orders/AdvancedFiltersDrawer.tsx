import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";

interface AdvancedFiltersDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AdvancedFiltersDrawer({ open, onOpenChange }: AdvancedFiltersDrawerProps) {
  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-[30%] right-0">
        <DrawerHeader>
          <DrawerTitle>Filtros Avançados</DrawerTitle>
          <DrawerDescription>Ajuste os filtros para encontrar pedidos específicos.</DrawerDescription>
        </DrawerHeader>
        <div className="p-4">
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Marketplace</span>
              <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50">
                <option>Todos</option>
                <option>Mercado Livre</option>
                <option>Amazon</option>
                <option>Shopee</option>
                <option>Magazine Luiza</option>
                <option>Americanas</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Período</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Input type="date" className="rounded-md" />
                <Input type="date" className="rounded-md" />
              </div>
            </label>
          </div>
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Aplicar Filtros</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
