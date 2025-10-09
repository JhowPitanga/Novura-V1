
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare } from "lucide-react";

interface ChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
}

export function ChatDrawer({ open, onOpenChange, storeName }: ChatDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full w-[400px] fixed right-0">
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center">
            <MessageSquare className="w-5 h-5 mr-2" />
            Chat com {storeName}
          </DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-4">
            <div className="bg-gray-100 p-3 rounded-lg">
              <p className="text-sm">Olá! Como posso ajudá-lo com seu pedido?</p>
              <p className="text-xs text-gray-600 mt-1">Vendedor - 10:30</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg ml-8">
              <p className="text-sm">Gostaria de saber o status do pedido #2</p>
              <p className="text-xs text-gray-600 mt-1">Você - 10:32</p>
            </div>
            <div className="bg-gray-100 p-3 rounded-lg">
              <p className="text-sm">Seu pedido já saiu para entrega! Chegará em breve.</p>
              <p className="text-xs text-gray-600 mt-1">Vendedor - 10:35</p>
            </div>
          </div>
        </div>
        <div className="border-t p-4">
          <div className="flex space-x-2">
            <Input placeholder="Digite sua mensagem..." className="flex-1" />
            <Button size="sm">Enviar</Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
