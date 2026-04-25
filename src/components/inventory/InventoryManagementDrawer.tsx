import { useState, useEffect, useId, useRef } from "react";
import { Minus, Package, Plus, Settings, ArrowRightLeft, Info } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useStorage } from "@/hooks/useStorage";
import { useAuth } from "@/hooks/useAuth";

interface EstoqueProduct {
  id: string;
  produto: string;
  sku: string;
  galpao?: string;
  estoque: number;
  reservado: number;
  disponivel: number;
  status: string;
  valor?: number;
  stock_by_location?: Array<{
    storage_id: string;
    storage_name: string;
    current: number;
    reserved: number;
    available: number;
  }>;
}

interface EstoqueManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: EstoqueProduct | null;
  onUpdateStock: (productId: string, newStock: number) => void;
  onStockAdjusted?: () => void;
}

type OperationType = "entrada" | "saida" | "transferencia";

export function InventoryManagementDrawer({
  isOpen,
  onClose,
  product,
  onUpdateStock,
  onStockAdjusted,
}: EstoqueManagementDrawerProps) {
  const [adjustmentQuantity, setAdjustmentQuantity] = useState<number>(0);
  const [operationType, setOperationType] = useState<OperationType>("entrada");
  const [loading, setLoading] = useState(false);
  const [selectedStorageId, setSelectedStorageId] = useState<string | undefined>(undefined);
  const [transferFromId, setTransferFromId] = useState<string | undefined>(undefined);
  const [transferToId, setTransferToId] = useState<string | undefined>(undefined);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const { storageLocations, loading: storageLoading } = useStorage();
  const { toast } = useToast();
  const { organizationId } = useAuth();

  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Determine if current storage is a fulfillment (Full) warehouse
  const currentStorageId = selectedStorageId
    || product?.stock_by_location?.[0]?.storage_id;

  const currentStorageMeta = storageLocations.find(
    (s) => String(s.id) === String(currentStorageId || "")
  ) as (typeof storageLocations[0] & { type?: string; readonly?: boolean }) | undefined;

  const isFulfillmentStorage =
    (currentStorageMeta as any)?.type === "fulfillment" ||
    (currentStorageMeta as any)?.readonly === true;

  // Physical, writable storages only (allowed as transfer origin/destination)
  const physicalStorages = storageLocations.filter(
    (s) => (s as any).type !== "fulfillment" && !(s as any).readonly
  );

  useEffect(() => {
    if (isOpen) {
      setAdjustmentQuantity(0);
      setOperationType("entrada");
      setTransferFromId(product?.stock_by_location?.[0]?.storage_id);
      setTransferToId(undefined);
      setAdjustmentNote("");
      setTransferNote("");
      setSelectedStorageId(product?.stock_by_location?.[0]?.storage_id);

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && !contentRef.current?.contains(activeEl)) {
        activeEl.blur();
      }
      setTimeout(() => {
        const autofocusEl = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        const firstFocusable =
          autofocusEl ||
          contentRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
        if (firstFocusable) firstFocusable.focus();
        else contentRef.current?.focus();
      }, 0);
    }
  }, [isOpen, product]);

  if (!product) return null;

  const handleCloseDrawer = () => {
    setAdjustmentQuantity(0);
    setOperationType("entrada");
    onClose();
  };

  const stockByStorageId = new Map(
    (product.stock_by_location || []).map((loc) => [String(loc.storage_id), loc])
  );
  const getStorageAvailable = (storageId?: string) =>
    Number(stockByStorageId.get(String(storageId || ""))?.available || 0);
  const getStorageCurrent = (storageId?: string) =>
    Number(stockByStorageId.get(String(storageId || ""))?.current || 0);

  const resolveCurrentUserName = async (): Promise<string> => {
    const { data: authRes } = await supabase.auth.getUser();
    const userId = authRes?.user?.id || null;
    if (!userId || !organizationId) return authRes?.user?.email || "Usuario";

    const { data: usr } = await (supabase as any)
      .from("users")
      .select("name, organization_id")
      .eq("id", userId)
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle();

    return usr?.name || authRes?.user?.email || "Usuario";
  };

  // ── Adjustment (Entrada / Saída) ──────────────────────────────────────────
  const handleSaveAdjustment = async () => {
    if (adjustmentQuantity === 0) {
      toast({ title: "Erro", description: "Insira uma quantidade válida.", variant: "destructive" });
      return;
    }

    const quantity =
      operationType === "saida" ? -Math.abs(adjustmentQuantity) : Math.abs(adjustmentQuantity);

    const targetStorageId =
      selectedStorageId ||
      product.stock_by_location?.[0]?.storage_id ||
      null;

    if (!targetStorageId) {
      toast({ title: "Erro", description: "Nenhum armazém selecionado.", variant: "destructive" });
      return;
    }
    if (operationType === "saida") {
      const available = getStorageAvailable(targetStorageId);
      if (available <= 0) {
        toast({ title: "Erro", description: "Não é possível realizar saída em armazém com estoque disponível zerado.", variant: "destructive" });
        return;
      }
      if (adjustmentQuantity > available) {
        toast({ title: "Erro", description: `Quantidade maior que o disponível no armazém (${available}).`, variant: "destructive" });
        return;
      }
    }

    setLoading(true);
    try {
      const { data: prod } = await (supabase as any)
        .from("products")
        .select("company_id")
        .eq("id", product.id)
        .limit(1)
        .maybeSingle();

      // Legacy-safe path: avoid RPC upsert that may fail with unique(product_id) schemas.
      const { data: stockRowRaw, error: stockErr } = await (supabase as any)
        .from("products_stock")
        .select("id, current, reserved")
        .eq("product_id", product.id)
        .eq("storage_id", targetStorageId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (stockErr) {
        toast({ title: "Erro", description: stockErr.message || "Falha ao consultar estoque.", variant: "destructive" });
        return;
      }

      let stockRow = stockRowRaw;
      if (!stockRow?.id) {
        if (operationType !== "entrada") {
          toast({ title: "Erro", description: "Registro de estoque não encontrado para este armazém.", variant: "destructive" });
          return;
        }

        // For new warehouse/product combinations, create stock row on first manual entry.
        const ins = await (supabase as any)
          .from("products_stock")
          .insert({
            product_id: product.id,
            storage_id: targetStorageId,
            company_id: prod?.company_id || null,
            current: 0,
            reserved: 0,
            in_transit: 0,
          })
          .select("id, current")
          .limit(1)
          .maybeSingle();

        if (ins?.error) {
          const msg = String(ins.error.message || "");
          if (msg.includes("duplicate key")) {
            const retry = await (supabase as any)
              .from("products_stock")
              .select("id, current, reserved")
              .eq("product_id", product.id)
              .eq("storage_id", targetStorageId)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (retry?.error || !retry?.data?.id) {
              toast({ title: "Erro", description: retry?.error?.message || msg, variant: "destructive" });
              return;
            }
            stockRow = retry.data;
          } else {
            toast({ title: "Erro", description: msg, variant: "destructive" });
            return;
          }
        } else {
          stockRow = ins?.data;
        }
      }

      const currentDb = Number(stockRow.current || 0);
      const reservedDb = Number(stockRow.reserved || 0);
      const availableDb = Math.max(currentDb - reservedDb, 0);
      if (operationType === "saida") {
        if (availableDb <= 0) {
          toast({ title: "Erro", description: "Não é possível realizar saída em armazém com estoque disponível zerado.", variant: "destructive" });
          return;
        }
        if (adjustmentQuantity > availableDb) {
          toast({ title: "Erro", description: `Quantidade maior que o disponível no armazém (${availableDb}).`, variant: "destructive" });
          return;
        }
      }

      const nextCurrent = currentDb + quantity;
      if (nextCurrent < 0) {
        toast({ title: "Erro", description: "Ajuste inválido: estoque não pode ficar negativo.", variant: "destructive" });
        return;
      }

      const { error: updateErr } = await (supabase as any)
        .from("products_stock")
        .update({
          current: nextCurrent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stockRow.id);

      if (updateErr) {
        toast({ title: "Erro", description: updateErr.message, variant: "destructive" });
        return;
      }

      // Record structured inventory transaction
      const displayName = await resolveCurrentUserName();

      const moveType = operationType === "entrada" ? "ENTRADA" : "SAIDA";
      const noteLabel = adjustmentNote.trim();
      const moveRefBase = noteLabel ? `${displayName} - ${noteLabel}` : displayName;
      const txPayload = {
        organizations_id: organizationId,
        company_id: prod?.company_id || null,
        product_id: product.id,
        storage_id: targetStorageId,
        movement_type: moveType,
        quantity_change: quantity,
        source_ref: `${moveRefBase}[${moveType}]`,
      };
      // Keep insert fully compatible with legacy schemas.
      await (supabase as any).from("inventory_transactions").insert(txPayload);

      toast({
        title: "Sucesso",
        description: `${operationType === "entrada" ? "Entrada" : "Saída"} de ${adjustmentQuantity} un. registrada.`,
      });

      onStockAdjusted?.();
      handleCloseDrawer();
    } catch (err: any) {
      toast({ title: "Erro inesperado", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Transfer ──────────────────────────────────────────────────────────────
  const handleSaveTransfer = async () => {
    if (!transferFromId || !transferToId) {
      toast({ title: "Erro", description: "Selecione origem e destino.", variant: "destructive" });
      return;
    }
    if (transferFromId === transferToId) {
      toast({ title: "Erro", description: "Origem e destino não podem ser iguais.", variant: "destructive" });
      return;
    }
    if (adjustmentQuantity <= 0) {
      toast({ title: "Erro", description: "Insira uma quantidade válida.", variant: "destructive" });
      return;
    }
    if (Number(product.estoque || 0) <= 0) {
      toast({ title: "Erro", description: "Não é possível transferir produto com estoque total zerado.", variant: "destructive" });
      return;
    }
    const availableFrom = getStorageAvailable(transferFromId);
    if (availableFrom <= 0) {
      toast({ title: "Erro", description: "Armazém de origem com estoque disponível zerado.", variant: "destructive" });
      return;
    }
    if (adjustmentQuantity > availableFrom) {
      toast({ title: "Erro", description: `Quantidade maior que o disponível na origem (${availableFrom}).`, variant: "destructive" });
      return;
    }
    if (!organizationId) return;

    setLoading(true);
    try {
      // Legacy-safe frontend transfer (no RPC dependency; avoids noisy 404 logs).
      const actorName = await resolveCurrentUserName();

      const { data: prod } = await (supabase as any)
        .from("products")
        .select("company_id")
        .eq("id", product.id)
        .limit(1)
        .maybeSingle();

      const noteLabel = transferNote?.trim();
      const moveRefBase = noteLabel ? `${actorName} - ${noteLabel}` : actorName;

      // 1) Ensure origin row exists and has enough stock
      const { data: originRow, error: originErr } = await (supabase as any)
        .from("products_stock")
        .select("id, current, reserved")
        .eq("product_id", product.id)
        .eq("storage_id", transferFromId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (originErr || !originRow?.id) {
        toast({ title: "Erro", description: "Origem não encontrada para o produto.", variant: "destructive" });
        return;
      }
      const originAvailable = Number(originRow.current || 0) - Number(originRow.reserved || 0);
      if (originAvailable < adjustmentQuantity) {
        toast({ title: "Erro", description: `Estoque insuficiente na origem (${originAvailable}).`, variant: "destructive" });
        return;
      }

      // 2) Ensure destination row exists BEFORE debiting origin (prevents partial transfer)
      const { data: destinationRow, error: destSelErr } = await (supabase as any)
        .from("products_stock")
        .select("id, current")
        .eq("product_id", product.id)
        .eq("storage_id", transferToId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (destSelErr) {
        toast({ title: "Erro", description: destSelErr.message, variant: "destructive" });
        return;
      }

      let destinationId = destinationRow?.id as string | undefined;
      let destinationCurrent = Number(destinationRow?.current || 0);
      if (!destinationId) {
        const insRes = await (supabase as any)
          .from("products_stock")
          .insert({
            product_id: product.id,
            storage_id: transferToId,
            company_id: prod?.company_id || null,
            current: 0,
            reserved: 0,
            in_transit: 0,
          })
          .select("id, current")
          .limit(1)
          .single();
        if (insRes?.error) {
          const msg = String(insRes.error.message || "");
          if (msg.includes("products_stock_product_id_key")) {
            toast({
              title: "Transferência indisponível",
              description: "Seu banco atual ainda não suporta estoque por múltiplos armazéns para o mesmo produto. Aplique a migration de estoque multi-armazém.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Erro", description: msg, variant: "destructive" });
          }
          return;
        }
        destinationId = insRes?.data?.id;
        destinationCurrent = Number(insRes?.data?.current || 0);
      }

      // 3) Apply transfer updates
      const originUpd = await (supabase as any)
        .from("products_stock")
        .update({
          current: Number(originRow.current || 0) - Math.abs(adjustmentQuantity),
          updated_at: new Date().toISOString(),
        })
        .eq("id", originRow.id);
      if (originUpd?.error) {
        toast({ title: "Erro", description: originUpd.error.message, variant: "destructive" });
        return;
      }
      const destUpd = await (supabase as any)
        .from("products_stock")
        .update({
          current: destinationCurrent + Math.abs(adjustmentQuantity),
          updated_at: new Date().toISOString(),
        })
        .eq("id", destinationId);
      if (destUpd?.error) {
        // best-effort rollback of origin
        await (supabase as any)
          .from("products_stock")
          .update({
            current: Number(originRow.current || 0),
            updated_at: new Date().toISOString(),
          })
          .eq("id", originRow.id);
        toast({ title: "Erro", description: destUpd.error.message, variant: "destructive" });
        return;
      }

      await (supabase as any).from("inventory_transactions").insert([
        {
          organizations_id: organizationId,
          company_id: prod?.company_id || null,
          product_id: product.id,
          storage_id: transferFromId,
          movement_type: "TRANSFERENCIA",
          quantity_change: -Math.abs(adjustmentQuantity),
          source_ref: `${moveRefBase}[OUT]`,
        },
        {
          organizations_id: organizationId,
          company_id: prod?.company_id || null,
          product_id: product.id,
          storage_id: transferToId,
          movement_type: "TRANSFERENCIA",
          quantity_change: Math.abs(adjustmentQuantity),
          source_ref: `${moveRefBase}[IN]`,
        },
      ]);

      toast({
        title: "Transferência realizada",
        description: `${adjustmentQuantity} un. transferidas com sucesso.`,
      });
      onStockAdjusted?.();
      handleCloseDrawer();
    } catch (err: any) {
      toast({ title: "Erro inesperado", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const previewStorageId =
    selectedStorageId ||
    product.stock_by_location?.[0]?.storage_id ||
    undefined;
  const selectedCurrent = getStorageCurrent(previewStorageId);
  const selectedAvailable = getStorageAvailable(previewStorageId);
  const rawPreviewStock =
    adjustmentQuantity > 0 && operationType !== "transferencia"
      ? selectedCurrent + (operationType === "entrada" ? adjustmentQuantity : -adjustmentQuantity)
      : selectedCurrent;
  const isPreviewNegative = operationType === "saida" && rawPreviewStock < 0;
  const previewStock = Math.max(rawPreviewStock, 0);

  const transferAvailable = getStorageAvailable(transferFromId);
  const isTransferInvalid =
    operationType === "transferencia" &&
    (
      !transferFromId ||
      !transferToId ||
      transferFromId === transferToId ||
      adjustmentQuantity <= 0 ||
      transferAvailable <= 0 ||
      adjustmentQuantity > transferAvailable
    );
  const isAdjustmentInvalid =
    operationType !== "transferencia" &&
    (
      adjustmentQuantity <= 0 ||
      (operationType === "saida" && (selectedAvailable <= 0 || adjustmentQuantity > selectedAvailable || rawPreviewStock < 0))
    );

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }} direction="right">
      <DrawerContent
        ref={contentRef}
        className="fixed inset-y-0 right-0 flex h-full w-full sm:w-[90%] md:w-[60%] lg:w-[42%] xl:w-[35%] flex-col"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <DrawerHeader className="border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <DrawerTitle id={titleId} className="text-lg">Ajustar Estoque</DrawerTitle>
          </div>
          <DrawerDescription id={descriptionId}>
            {product.produto} ({product.sku})
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Product Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Informações do Produto</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Nome</Label>
                  <p className="font-medium">{product.produto}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SKU</Label>
                  <p className="font-medium">{product.sku}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Current Stock */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Estoque Atual</h3>
              <div className="rounded-lg border bg-white overflow-hidden">
                <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-muted text-[11px] font-semibold text-muted-foreground">
                  <span>Armazém</span>
                  <span className="text-right">Disponível</span>
                  <span className="text-right">Reservado</span>
                  <span className="text-right">Total</span>
                </div>
                <div className="divide-y">
                  {(product.stock_by_location || []).map((loc) => (
                    <div key={loc.storage_id} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm">
                      <span>{loc.storage_name}</span>
                      <span className="text-right font-semibold text-green-600">{loc.available}</span>
                      <span className="text-right font-semibold text-orange-600">{loc.reserved}</span>
                      <span className="text-right font-semibold text-primary">{loc.current}</span>
                    </div>
                  ))}
                  {(product.stock_by_location || []).length === 0 && (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Sem estoque distribuído por armazém.</div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Read-only banner for fulfillment/Full warehouses */}
            {isFulfillmentStorage ? (
              <div className="rounded-md border border-violet-200 bg-violet-50 p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-violet-800">Estoque Full — somente leitura</p>
                  <p className="text-xs text-violet-700 mt-0.5">
                    Este estoque é sincronizado automaticamente pela API do marketplace. Nenhuma operação manual é permitida.
                  </p>
                </div>
              </div>
            ) : (
              /* Operations for physical warehouses */
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Operação</h3>

                {/* Operation type selector */}
                <div className="flex gap-2">
                  <Button
                    variant={operationType === "entrada" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOperationType("entrada")}
                    className="flex-1"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Entrada
                  </Button>
                  <Button
                    variant={operationType === "saida" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOperationType("saida")}
                    className="flex-1"
                  >
                    <Minus className="w-4 h-4 mr-1" />
                    Saída
                  </Button>
                  <Button
                    variant={operationType === "transferencia" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOperationType("transferencia")}
                    className="flex-1"
                  >
                    <ArrowRightLeft className="w-4 h-4 mr-1" />
                    Transferir
                  </Button>
                </div>

                {operationType !== "transferencia" ? (
                  /* Entrada / Saída form */
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="adjust-storage" className="text-xs text-muted-foreground">Armazém</Label>
                      <select
                        id="adjust-storage"
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={selectedStorageId || ""}
                        onChange={(e) => setSelectedStorageId(e.target.value || undefined)}
                      >
                        <option value="" disabled>Selecione o armazém</option>
                        {storageLocations
                          .filter((s: any) => (s as any).type !== "fulfillment" && !(s as any).readonly)
                          .map((s: any) => {
                            const available = getStorageAvailable(String(s.id));
                            return (
                              <option key={s.id} value={s.id}>
                                {s.name} ({available} disp.)
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="adjustment-quantity" className="text-xs text-muted-foreground">
                        Quantidade
                      </Label>
                      <Input
                        id="adjustment-quantity"
                        type="number"
                        min="0"
                        value={adjustmentQuantity || ""}
                        onChange={(e) => setAdjustmentQuantity(Number(e.target.value))}
                        placeholder="Digite a quantidade"
                        data-autofocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adjust-note" className="text-xs text-muted-foreground">
                        Observação (opcional)
                      </Label>
                      <Input
                        id="adjust-note"
                        value={adjustmentNote}
                        onChange={(e) => setAdjustmentNote(e.target.value)}
                        placeholder="Ex: Ajuste de inventário"
                      />
                    </div>

                    {adjustmentQuantity > 0 && (
                      <div className={`p-3 rounded-lg space-y-1 ${isPreviewNegative ? "bg-red-50 border border-red-200" : "bg-muted"}`}>
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-muted-foreground">Novo estoque após ajuste:</p>
                        </div>
                        <p className={`text-lg font-bold ${isPreviewNegative ? "text-red-600" : "text-primary"}`}>{previewStock} unidades</p>
                        {isPreviewNegative && (
                          <p className="text-xs text-red-600">
                            Não é possível deduzir mais que o estoque disponível no armazém.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* Transfer form */
                  <>
                    <div className="rounded-md border-2 border-[#FF6400] bg-[#FF6400]/12 p-3 text-xs flex items-start gap-2 shadow-sm">
                      <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#FF6400]" aria-hidden />
                      <span className="font-medium leading-snug text-gray-900">
                        Transferências só são permitidas entre armazéns físicos. Destinos Full não são aceitos.
                      </span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transfer-from" className="text-xs text-muted-foreground">Origem</Label>
                      <select
                        id="transfer-from"
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={transferFromId || ""}
                        onChange={(e) => setTransferFromId(e.target.value || undefined)}
                      >
                        <option value="" disabled>Selecione o armazém de origem</option>
                        {physicalStorages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transfer-to" className="text-xs text-muted-foreground">Destino</Label>
                      <select
                        id="transfer-to"
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={transferToId || ""}
                        onChange={(e) => setTransferToId(e.target.value || undefined)}
                      >
                        <option value="" disabled>Selecione o armazém de destino</option>
                        {physicalStorages
                          .filter((s) => s.id !== transferFromId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transfer-qty" className="text-xs text-muted-foreground">
                        Quantidade
                      </Label>
                      <Input
                        id="transfer-qty"
                        type="number"
                        min="1"
                        value={adjustmentQuantity || ""}
                        onChange={(e) => setAdjustmentQuantity(Number(e.target.value))}
                        placeholder="Quantidade a transferir"
                      />
                    </div>

                    <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
                      <p className="text-xs text-violet-800">
                        Disponível na origem:{" "}
                        <span className="font-semibold">{getStorageAvailable(transferFromId)} un.</span>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transfer-note" className="text-xs text-muted-foreground">
                        Observação (opcional)
                      </Label>
                      <Input
                        id="transfer-note"
                        value={transferNote}
                        onChange={(e) => setTransferNote(e.target.value)}
                        placeholder="Ex: Reabastecimento filial"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {!isFulfillmentStorage && (
          <div className="border-t border-border p-6 flex-shrink-0">
            <Button
              onClick={operationType === "transferencia" ? handleSaveTransfer : handleSaveAdjustment}
              className="w-full"
              disabled={loading || storageLoading || isAdjustmentInvalid || isTransferInvalid}
            >
              <Settings className="w-4 h-4 mr-2" />
              {loading
                ? "Salvando..."
                : operationType === "transferencia"
                ? "Confirmar Transferência"
                : "Salvar Ajuste"}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
