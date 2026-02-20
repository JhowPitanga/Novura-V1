import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DeleteListingDialogProps {
    itemId: string | null;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

export function DeleteListingDialog({ itemId, onClose, onConfirm }: DeleteListingDialogProps) {
    return (
        <Dialog open={!!itemId} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Excluir anúncio?</DialogTitle>
                    <DialogDescription>
                        Remove somente do banco de dados. Não impacta no Mercado Livre.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
                    <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700"
                        onClick={async () => { await onConfirm(); onClose(); }}
                    >
                        Excluir
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
