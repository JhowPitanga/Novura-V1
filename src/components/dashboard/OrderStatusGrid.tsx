import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface StatusCounts {
    vincular: number;
    emissao: number;
    impressao: number;
    coleta: number;
    enviado: number;
}

interface DelayedFlags {
    vincular: boolean;
    emissao: boolean;
    impressao: boolean;
    coleta: boolean;
}

interface OrderStatusGridProps {
    counts?: StatusCounts;
    delayed?: DelayedFlags;
}

const defaultCounts: StatusCounts = { vincular: 0, emissao: 0, impressao: 0, coleta: 0, enviado: 0 };
const defaultDelayed: DelayedFlags = { vincular: false, emissao: false, impressao: false, coleta: false };

const statusItems = [
    { key: 'vincular' as const, label: 'Vincular', href: '/pedidos?status=a-vincular' },
    { key: 'emissao' as const, label: 'Para emitir', href: '/pedidos/emissao_nfe/emitir' },
    { key: 'impressao' as const, label: 'Imprimir', href: '/pedidos?status=impressao' },
    { key: 'coleta' as const, label: 'Coleta', href: '/pedidos?status=aguardando-coleta' },
];

export function OrderStatusGrid({ counts = defaultCounts, delayed = defaultDelayed }: OrderStatusGridProps) {
    return (
        <Card className="mb-8 border-0 shadow-lg rounded-xl bg-white">
            <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Status dos Pedidos</h3>
                <div className="grid grid-cols-5 gap-4">
                    {statusItems.map(({ key, label, href }) => (
                        <Button key={key} asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                            <Link to={href}>
                                <div className={`text-2xl font-bold ${delayed[key] ? 'text-red-600' : 'text-gray-900'}`}>
                                    {counts[key]}
                                </div>
                                <div className={`text-sm ${delayed[key] ? 'text-red-600' : 'text-gray-600'} text-center`}>
                                    {label}
                                </div>
                            </Link>
                        </Button>
                    ))}
                    <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                        <Link to="/pedidos?status=enviado">
                            <div className="text-2xl font-bold text-gray-900">{counts.enviado}</div>
                            <div className="text-sm text-gray-600 text-center">Enviado</div>
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
