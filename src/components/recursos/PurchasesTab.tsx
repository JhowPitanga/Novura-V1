
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, RotateCcw } from "lucide-react";
import { TrackingDrawer } from "./TrackingDrawer";
import { ChatDrawer } from "./ChatDrawer";

interface Purchase {
  id: number;
  produto: string;
  quantidade: number;
  status: string;
  loja: string;
  dataCompra: string;
  valor: number;
  image: string;
}

interface PurchasesTabProps {
  purchases: Purchase[];
}

export function PurchasesTab({ purchases }: PurchasesTabProps) {
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState("");

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Entregue": return "bg-green-100 text-green-800";
      case "Em Trânsito": return "bg-blue-100 text-blue-800";
      case "Processando": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const handleBuyAgain = (produto: string, quantidade: number) => {
    console.log(`Comprando novamente: ${produto} - Quantidade: ${quantidade}`);
    // Aqui seria implementada a lógica para adicionar o produto ao carrinho
  };

  return (
    <>
      <div className="space-y-6">
        <h3 className="text-xl font-semibold">Minhas Compras</h3>
        
        <div className="space-y-4">
          {purchases.map((compra) => (
            <Card key={compra.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <img 
                    src={compra.image} 
                    alt={compra.produto}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  
                  <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                    <div>
                      <h4 className="font-semibold">{compra.produto}</h4>
                      <p className="text-sm text-gray-600">Pedido #{compra.id}</p>
                    </div>
                    
                    <div className="text-center">
                      <p className="font-medium">{compra.quantidade}</p>
                      <p className="text-sm text-gray-600">Quantidade</p>
                    </div>
                    
                    <div className="text-center">
                      <Badge 
                        className={`${getStatusColor(compra.status)} cursor-pointer`}
                        onClick={() => compra.status === "Em Trânsito" && setIsTrackingOpen(true)}
                      >
                        {compra.status}
                      </Badge>
                    </div>
                    
                    <div>
                      <p className="font-semibold">{compra.loja}</p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setSelectedStore(compra.loja);
                          setIsChatOpen(true);
                        }}
                        className="p-0 h-auto text-blue-600 hover:text-blue-800"
                      >
                        <MessageSquare className="w-3 h-3 mr-1" />
                        Mensagem
                      </Button>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-lg font-bold text-novura-primary">
                        R$ {compra.valor.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-600">{compra.dataCompra}</p>
                    </div>

                    <div className="text-center">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleBuyAgain(compra.produto, compra.quantidade)}
                        className="text-novura-primary border-novura-primary hover:bg-novura-primary hover:text-white"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Comprar Novamente
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <TrackingDrawer open={isTrackingOpen} onOpenChange={setIsTrackingOpen} />
      <ChatDrawer 
        open={isChatOpen} 
        onOpenChange={setIsChatOpen} 
        storeName={selectedStore} 
      />
    </>
  );
}
