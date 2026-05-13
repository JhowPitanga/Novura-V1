import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateStandardDiscount } from "@/hooks/usePromotions";
import { validateStandardDiscount } from "./validators";
import { AlertCircle } from "lucide-react";

interface CreateStandardDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  organizationId: string;
  marketplaceKey: string;
  isShopee: boolean;
}

export function CreateStandardDiscountDialog({
  open,
  onOpenChange,
  integrationId,
  organizationId,
  marketplaceKey,
  isShopee,
}: CreateStandardDiscountDialogProps) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const mutation = useCreateStandardDiscount(organizationId, marketplaceKey);

  const handleSubmit = async () => {
    const validationErrors = validateStandardDiscount({ name, startDate, endDate, isShopee });
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    await mutation.mutateAsync({ organizationId, integrationId, name, startDate, endDate });
    onOpenChange(false);
    setName("");
    setStartDate("");
    setEndDate("");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setErrors([]);
    }
    onOpenChange(v);
  };

  const maxDays = isShopee ? 180 : 14;
  const minStartHint = isShopee ? "Mínimo 1 hora após agora" : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Desconto Normal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {errors.length > 0 && (
            <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <ul className="text-sm text-red-700 space-y-1">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="promo-name">Nome da promoção</Label>
            <Input
              id="promo-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Desconto Maio 2026"
              maxLength={60}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="start-date">Data início</Label>
              <Input
                id="start-date"
                type="datetime-local"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
              {minStartHint && <p className="text-xs text-gray-400">{minStartHint}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="end-date">Data fim</Label>
              <Input
                id="end-date"
                type="datetime-local"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
              <p className="text-xs text-gray-400">Máx. {maxDays} dias</p>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Após criar, adicione produtos na promoção pelo botão &ldquo;Adicionar produtos&rdquo; na lista.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || !integrationId}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {mutation.isPending ? "Criando..." : "Criar desconto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
