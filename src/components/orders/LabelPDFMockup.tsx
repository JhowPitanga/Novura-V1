import { QrCode } from "lucide-react";

export function LabelPDFMockup({ settings, pedidos }: { settings: any; pedidos: any[] }) {
    const renderLabelContent = (pedido: any) => {
        if (settings.labelSize === "10x15") {
            return (
                <div className="flex flex-col items-center justify-center p-4" style={{ width: '10cm', height: '15cm', border: '1px dashed #ccc', backgroundColor: '#f9f9f9', fontSize: '10px' }}>
                    <div className="text-sm font-bold">ETIQUETA DE ENVIO - {pedido.marketplace}</div>
                    <div className="mt-4 text-center">
                        <p className="font-semibold">Pedido: #{pedido.id}</p>
                        <p>Cliente: {pedido.cliente}</p>
                        <p>Endereço: Rua da Amostra, 123 - Cidade, Estado</p>
                        <div className="mt-2">
                            <QrCode size={60} />
                            <p className="text-xs">Rastreamento: {pedido.idPlataforma}</p>
                        </div>
                    </div>
                </div>
            );
        } else if (settings.labelSize === "A4") {
            return (
                <div className="flex flex-wrap p-4" style={{ width: '21cm', height: '29.7cm', border: '1px dashed #ccc', backgroundColor: '#f9f9f9', fontSize: '10px' }}>
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="m-2 p-2" style={{ width: '9.5cm', height: '13.5cm', border: '1px solid #ddd', fontSize: '9px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="font-bold text-xs">ETIQUETA {i + 1} - {pedido.marketplace}</div>
                            <div className="mt-1 text-center">
                                <p className="font-semibold">Pedido: #{pedido.id}</p>
                                <p>Cliente: {pedido.cliente}</p>
                                <p>Endereço: Rua da Amostra, 123 - Cidade, Estado</p>
                                <div className="mt-1">
                                    <QrCode size={50} />
                                    <p className="text-xs">Rastreamento: {pedido.idPlataforma}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }
    };

    return (
        <div className="h-full flex flex-col p-6 bg-gray-100 rounded-lg">
            <h1 className="text-2xl font-bold mb-6">Visualização da Etiqueta</h1>
            <div className="flex-1 p-8 overflow-y-auto bg-white rounded-lg shadow-lg flex justify-center items-center">
                {pedidos.length > 0 ? (
                    renderLabelContent(pedidos[0])
                ) : (
                    <p className="text-gray-500">Selecione um pedido para visualizar a etiqueta.</p>
                )}
            </div>
        </div>
    );
}
