import { useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BlockOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string;
  mode: "block" | "archive";
  onConfirm: (reason: string) => Promise<void>;
  isLoading?: boolean;
}

export function BlockOrgDialog({
  open,
  onOpenChange,
  organizationName,
  mode,
  onConfirm,
  isLoading,
}: BlockOrgDialogProps) {
  const [reason, setReason] = useState("");

  const isBlock = mode === "block";
  const title = isBlock ? "Bloquear organização" : "Arquivar organização";
  const description = isBlock
    ? `Bloquear "${organizationName}" impedirá todos os acessos dos seus usuários. Informe o motivo:`
    : `Arquivar "${organizationName}" é uma ação irreversível que bloqueia o acesso e marca a conta como inativa. Informe o motivo:`;

  async function handleConfirm() {
    if (!reason.trim()) return;
    await onConfirm(reason.trim());
    setReason("");
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Label htmlFor="reason" className="text-sm font-medium">Motivo <span className="text-destructive">*</span></Label>
          <Input
            id="reason"
            className="mt-1"
            placeholder="Descreva o motivo..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason("")}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={handleConfirm}
            disabled={!reason.trim() || isLoading}
          >
            {isLoading ? "Processando..." : isBlock ? "Bloquear" : "Arquivar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
