import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useWarehouseConfig,
  useAllActiveStorage,
  useWarehouseConfigMutation,
} from "@/hooks/useWarehouseConfig";

interface WarehouseConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  marketplaceName: string;
}

export function WarehouseConfigModal({
  open,
  onOpenChange,
  integrationId,
  marketplaceName,
}: WarehouseConfigModalProps) {
  const { toast } = useToast();

  const { data: config, isLoading: configLoading } = useWarehouseConfig(
    open ? integrationId : null
  );
  const { data: allStorages = [], isLoading: physicalLoading } = useAllActiveStorage();
  const saveMutation = useWarehouseConfigMutation();

  const [physicalId, setPhysicalId] = useState<string>("");

  // Sync form state when config loads
  useEffect(() => {
    if (config) {
      setPhysicalId(config.physicalStorageId ?? "");
    }
  }, [config]);

  const handleSave = async () => {
    if (!physicalId) {
      toast({
        title: "Armazém físico obrigatório",
        description: "Selecione um armazém físico para continuar.",
        variant: "destructive",
      });
      return;
    }
    try {
      await saveMutation.mutateAsync({
        integrationId,
        physicalStorageId: physicalId,
        fulfillmentStorageId: config?.fulfillmentStorageId ?? null,
      });
      toast({ title: "Configuração salva", description: "O armazém foi vinculado com sucesso." });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const isLoading = configLoading || physicalLoading;
  const isSaving = saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-novura-primary" />
            Configurar Armazém — {marketplaceName}
          </DialogTitle>
          <DialogDescription>
            Define de qual armazém o estoque será deduzido nas vendas desta integração.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Physical warehouse */}
            <div className="space-y-1.5">
              <Label htmlFor="physical-storage">
                Armazém Físico <span className="text-destructive">*</span>
              </Label>
              <Select value={physicalId} onValueChange={setPhysicalId}>
                <SelectTrigger id="physical-storage">
                  <SelectValue placeholder="Selecione o armazém físico..." />
                </SelectTrigger>
                <SelectContent>
                  {allStorages.length === 0 ? (
                    <SelectItem value="__empty" disabled>
                      Nenhum armazém encontrado
                    </SelectItem>
                  ) : (
                    allStorages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.type})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecione o armazém da organização para dedução de estoque desta integração.
              </p>
            </div>

          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || isSaving || !physicalId}
            className="bg-novura-primary hover:bg-novura-primary/90"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
