import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface CannotDisconnectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    message: string;
}

export function CannotDisconnectDialog({ open, onOpenChange, message }: CannotDisconnectDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Não é possível desconectar</DialogTitle>
                    <DialogDescription>
                        {message || 'Existem reservas de estoque ativas vinculadas a anúncios deste aplicativo.'}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
