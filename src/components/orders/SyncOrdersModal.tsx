import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SyncOrdersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncMarketplace: string;
  onSyncMarketplaceChange: (v: string) => void;
  isSyncing: boolean;
  selectedCount: number;
  onSyncAll: () => void;
  onSyncSelected: () => void;
  onSyncByInternalId: (id: string) => void;
  shopeeShopOptions: Array<{ id: string; shop_id: number; label: string }>;
  selectedShopeeShopId: number;
  onSelectedShopeeShopIdChange: (id: number) => void;
  shopeeOrderSnInput: string;
  onShopeeOrderSnInputChange: (v: string) => void;
  shopeeDateFrom: string;
  onShopeeDateFromChange: (v: string) => void;
  shopeeDateTo: string;
  onShopeeDateToChange: (v: string) => void;
  onSyncShopee: () => void;
}

export function SyncOrdersModal({
  open,
  onOpenChange,
  syncMarketplace,
  onSyncMarketplaceChange,
  isSyncing,
  selectedCount,
  onSyncAll,
  onSyncSelected,
  onSyncByInternalId,
  shopeeShopOptions,
  selectedShopeeShopId,
  onSelectedShopeeShopIdChange,
  shopeeOrderSnInput,
  onShopeeOrderSnInputChange,
  shopeeDateFrom,
  onShopeeDateFromChange,
  shopeeDateTo,
  onShopeeDateToChange,
  onSyncShopee,
}: SyncOrdersModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sincronizar pedidos</DialogTitle>
          <DialogDescription>Selecione o marketplace e a loja para sincronizar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant={syncMarketplace === "mercado_livre" ? "default" : "outline"} onClick={() => onSyncMarketplaceChange("mercado_livre")}>Mercado Livre</Button>
            <Button variant={syncMarketplace === "shopee" ? "default" : "outline"} onClick={() => onSyncMarketplaceChange("shopee")}>Shopee</Button>
          </div>
          {syncMarketplace === "mercado_livre" && (
            <div className="space-y-2">
              <Button className="w-full" disabled={isSyncing} onClick={() => { onOpenChange(false); onSyncAll(); }}>Sincronizar todos pedidos</Button>
              <Button className="w-full" disabled={isSyncing || selectedCount === 0} onClick={() => { onOpenChange(false); onSyncSelected(); }}>{selectedCount > 0 ? `Sincronizar selecionados (${selectedCount})` : "Sincronizar selecionados"}</Button>
              <Button className="w-full" disabled={isSyncing} onClick={() => { const id = window.prompt("Informe o ID interno (orders.id) para sincronizar:"); if (id) { onOpenChange(false); onSyncByInternalId(id); } }}>Sincronizar por ID interno...</Button>
            </div>
          )}
          {syncMarketplace === "shopee" && (
            <div className="space-y-3">
              <Select value={selectedShopeeShopId ? String(selectedShopeeShopId) : undefined} onValueChange={(v) => onSelectedShopeeShopIdChange(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione a loja da Shopee" />
                </SelectTrigger>
                <SelectContent>
                  {shopeeShopOptions.map((opt) => (
                    <SelectItem key={opt.id} value={String(opt.shop_id)}>{opt.label} ({opt.shop_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-2">
                <div className="text-sm font-medium">order_sn_list (opcional)</div>
                <Textarea
                  value={shopeeOrderSnInput}
                  onChange={(e) => onShopeeOrderSnInputChange(e.target.value)}
                  placeholder="Ex.: 250730FC87B0Q5, 1234ABC, 5678DEF"
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Período opcional (até 15 dias)</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={shopeeDateFrom} onChange={(e) => onShopeeDateFromChange(e.target.value)} />
                  <Input type="date" value={shopeeDateTo} onChange={(e) => onShopeeDateToChange(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" disabled={isSyncing || !selectedShopeeShopId} onClick={onSyncShopee}>Sincronizar Shopee</Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
