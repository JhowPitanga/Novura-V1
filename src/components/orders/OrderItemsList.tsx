import { useState } from "react";
import { ChevronDown, ChevronUp, Package } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/utils/orderUtils";

interface OrderItemsListProps {
    pedido: any;
}

export function OrderItemsList({ pedido }: OrderItemsListProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
            <Collapsible open={expanded} onOpenChange={setExpanded}>
                <CollapsibleTrigger asChild>
                    <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors w-full">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                <Package className="w-5 h-5 mr-2 text-purple-600" />
                                Itens do Pedido ({pedido.itens.length})
                            </h3>
                            {expanded
                                ? <ChevronUp className="w-5 h-5 text-gray-400" />
                                : <ChevronDown className="w-5 h-5 text-gray-400" />
                            }
                        </div>
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-6 pb-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 text-sm font-medium text-gray-500 pb-2 border-b border-gray-200">
                                <span className="col-span-2">Produto</span>
                                <span className="text-center">Qtd</span>
                                <span className="text-right hidden sm:inline">Valor Unit.</span>
                                <span className="text-right">Total</span>
                            </div>
                            {pedido.itens.map((item: any) => (
                                <div
                                    key={item.id}
                                    className="grid grid-cols-4 sm:grid-cols-5 gap-4 items-center py-3 hover:bg-gray-50 rounded-lg px-3 transition-colors"
                                >
                                    <div className="col-span-2">
                                        <span className="text-gray-900 font-medium">{item.nome}</span>
                                        <p className="text-xs text-gray-500 mt-0.5">SKU: {item.sku || "N/A"}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">SKU Vinculado: {pedido?.linkedSku || "N/A"}</p>
                                    </div>
                                    <div className={`text-center font-medium ${item.quantidade > 1 ? 'text-purple-600 bg-purple-100 rounded-lg py-1 px-2' : 'text-gray-900'}`}>
                                        {item.quantidade}
                                    </div>
                                    <div className="text-right text-gray-900 hidden sm:inline">
                                        {formatCurrency(item.valor)}
                                    </div>
                                    <div className="text-right font-semibold text-gray-900">
                                        {formatCurrency(item.quantidade * item.valor)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
