import { Pedido, Item } from "@/types/pedidos";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface ScannerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentPedido: Pedido | null;
    scannedItems: Item[];
    onScan: (sku: string) => void;
}

export function ScannerModal({ open, onOpenChange, currentPedido, scannedItems, onScan }: ScannerModalProps) {
    if (!currentPedido) return null;

    const allItemsScanned = currentPedido.itens.every(item => scannedItems.some(scannedItem => scannedItem.id === item.id));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl w-full p-6" aria-describedby="scanner-desc" aria-labelledby="scanner-title">
                <DialogHeader>
                    <DialogTitle id="scanner-title">Scanner de Pedidos</DialogTitle>
                    <DialogDescription id="scanner-desc">
                        Escaneie os itens do pedido {currentPedido.idPlataforma} para verificação.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center space-x-2">
                            <Input
                                placeholder="Escanear SKU ou ID..."
                                className="flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        onScan(e.currentTarget.value);
                                        e.currentTarget.value = "";
                                    }
                                }}
                            />
                            <Button type="button">Buscar</Button>
                        </div>

                        <div className="bg-muted p-4 rounded-md">
                            <h4 className="text-lg font-semibold mb-2">Itens do Pedido ({currentPedido.itens.length})</h4>
                            <ScrollArea className="h-[200px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Produto</TableHead>
                                            <TableHead className="text-center">Qtd.</TableHead>
                                            <TableHead className="text-center">Bipado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {currentPedido.itens.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="flex items-center gap-2">
                                                    <img src={item.imagem || "/placeholder.svg"} alt={item.nome} className="w-10 h-10 rounded-md object-cover" />
                                                    <div>
                                                        <p className="font-medium">{item.nome}</p>
                                                        <p className="text-sm text-muted-foreground">{item.sku}</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">{item.quantidade}</TableCell>
                                                <TableCell className="text-center">
                                                    {scannedItems.some(scanned => scanned.id === item.id) ? (
                                                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                                                    ) : (
                                                        <X className="h-5 w-5 text-red-500 mx-auto" />
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                    </div>

                    <div className="md:w-1/3 space-y-4">
                        <div className="bg-card p-4 rounded-md border">
                            <h4 className="font-semibold mb-2">Resumo do Pedido</h4>
                            <p>ID do Pedido: {currentPedido.idPlataforma}</p>
                            <p>Marketplace: {currentPedido.marketplace}</p>
                            <p className="mt-2">
                                Status de verificação:{" "}
                                {allItemsScanned ? (
                                    <span className="text-green-500 font-bold">Completo</span>
                                ) : (
                                    <span className="text-red-500 font-bold">Pendente</span>
                                )}
                            </p>
                            <div className="mt-4 flex flex-col gap-2">
                                <Button className="w-full" disabled={!allItemsScanned}>
                                    Concluir Verificação
                                </Button>
                                <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                                    Fechar
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
