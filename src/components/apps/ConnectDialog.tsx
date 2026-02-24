import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface ConnectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    appName: string | undefined;
    storeName: string;
    onStoreNameChange: (name: string) => void;
    onConnect: () => void;
}

export function ConnectDialog({
    open, onOpenChange, appName, storeName, onStoreNameChange, onConnect,
}: ConnectDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Conectar {appName}</DialogTitle>
                    <DialogDescription>
                        Você está prestes a conectar o {appName} ao seu sistema.
                        Isso permitirá sincronização automática de dados.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div>
                        <label className="text-sm font-medium">Nome da Loja</label>
                        <Input
                            placeholder="Digite o nome da loja"
                            value={storeName}
                            onChange={(e) => onStoreNameChange(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Obrigatório. Será exibido no card de apps conectados.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={onConnect} disabled={!storeName.trim()}>Conectar Agora</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
