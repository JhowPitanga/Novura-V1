import { QrCode, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PickingListPDFMockup({ pedidos, settings, onPrint }: { pedidos: any[]; settings: any; onPrint?: () => void }) {
    const groupedItems: Record<string, { imagem?: string; nome?: string; sku?: string; quantidade: number }> = {};
    if (settings.groupByProduct) {
        pedidos.forEach(pedido => {
            pedido.itens.forEach(item => {
                if (groupedItems[item.sku]) {
                    groupedItems[item.sku].quantidade += item.quantidade;
                } else {
                    groupedItems[item.sku] = { ...item, quantidade: item.quantidade };
                }
            });
        });
    }

    const renderContent = () => {
        if (settings.groupByProduct) {
            return (
                <ul className="space-y-4">
                    {Object.values(groupedItems).map((item, itemIndex) => (
                        <li key={itemIndex} className="flex items-start space-x-4 border p-4 rounded-lg bg-gray-50">
                            <div className="w-16 h-16 flex-shrink-0">
                                <img src={item.imagem || "/placeholder.svg"} alt={item.nome || ''} className="w-full h-full object-cover rounded" loading="lazy" decoding="async" width="64" height="64" />
                            </div>
                            <div className="flex-1">
                                <p className="font-medium text-lg">{item.nome}</p>
                                <p className="text-sm text-gray-600">SKU: {item.sku || 'N/A'}</p>
                                {settings.includeOrderNumber && (
                                    <p className="text-xs text-gray-500 mt-1">Pedidos: {pedidos.map(p => `#${p.id}`).join(', ')}</p>
                                )}
                                <p className="text-xl font-bold mt-2">Qtd: {item.quantidade}</p>
                            </div>
                            {settings.includeBarcode && (
                                <div className="flex flex-col items-center justify-center p-2 rounded-md bg-white border border-gray-200">
                                    <QrCode className="w-8 h-8 text-gray-700" />
                                    <span className="text-xs mt-1">Bipar</span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            );
        } else {
            return (
                pedidos.map((pedido) => (
                    <div key={pedido.id} className="mb-8">
                        <h3 className="text-xl font-semibold mb-4 border-b pb-2">
                            Pedido #{pedido.id} ({pedido.marketplace})
                        </h3>
                        <ul className="space-y-4">
                            {pedido.itens.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex items-start space-x-4 border p-4 rounded-lg bg-gray-50">
                                    <div className="w-16 h-16 flex-shrink-0">
                                        <img src={item.imagem || "/placeholder.svg"} alt={item.nome} className="w-full h-full object-cover rounded" loading="lazy" decoding="async" width="64" height="64" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-lg">{item.nome}</p>
                                        <p className="text-sm text-gray-600">SKU: {item.sku || 'N/A'}</p>
                                        <p className="text-sm text-gray-600">ID na Plataforma: {pedido.idPlataforma}</p>
                                        <p className="text-sm font-bold mt-2">Qtd: {item.quantidade}</p>
                                    </div>
                                    {settings.includeBarcode && (
                                        <div className="flex flex-col items-center justify-center p-2 rounded-md bg-white border border-gray-200">
                                            <QrCode className="w-8 h-8 text-gray-700" />
                                            <span className="text-xs mt-1">Bipar</span>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))
            );
        }
    };

    return (
        <div className="h-full flex flex-col p-6 bg-gray-100 rounded-lg">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Visualização da Lista de Separação</h1>
                <Button onClick={onPrint}>
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir
                </Button>
            </div>
            <div className="flex-1 p-8 overflow-y-auto bg-white rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-6">
                    <div className="text-right">
                        <p className="text-sm">Data: {new Date().toLocaleDateString('pt-BR')}</p>
                        <p className="text-sm">Hora: {new Date().toLocaleTimeString('pt-BR')}</p>
                    </div>
                </div>
                {renderContent()}
            </div>
        </div>
    );
}
