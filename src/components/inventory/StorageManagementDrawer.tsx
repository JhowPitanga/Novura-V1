import { useEffect, useId, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { fetchMarketplaceIntegrations } from "@/services/inventory.service";

type WarehouseType = "physical" | "fulfillment";

interface StorageManagementDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingStorage?: { id: string; name: string; active: boolean; type?: WarehouseType; integration_id?: string | null };
  onSaved?: () => void;
}

export function StorageManagementDrawer({
  open,
  onOpenChange,
  existingStorage,
  onSaved,
}: StorageManagementDrawerProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [warehouseType, setWarehouseType] = useState<WarehouseType>("physical");
  const [integrationId, setIntegrationId] = useState<string>("");
  const { organizationId } = useAuth();

  const isFulfillment = warehouseType === "fulfillment";

  const { data: integrations = [] } = useQuery({
    queryKey: ["marketplace-integrations", organizationId],
    queryFn: () => fetchMarketplaceIntegrations(organizationId!),
    enabled: !!organizationId && isFulfillment,
  });

  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (existingStorage) {
      setName(existingStorage.name || "");
      setActive(existingStorage.active ?? true);
      setWarehouseType((existingStorage.type as WarehouseType) ?? "physical");
      setIntegrationId(existingStorage.integration_id ?? "");
    } else {
      setName("");
      setActive(true);
      setWarehouseType("physical");
      setIntegrationId("");
    }
  }, [existingStorage, open]);

  useEffect(() => {
    if (open) {
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
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          contentRef.current?.focus();
        }
      }, 0);
      // Sync isDefault with localStorage
      try {
        const lsId = typeof window !== "undefined" ? localStorage.getItem("defaultStorageId") : null;
        setIsDefault(!!lsId && (existingStorage ? lsId === existingStorage.id : false));
      } catch (_) {
        setIsDefault(false);
      }
    }
  }, [open, existingStorage]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", description: "Informe o nome do armazém.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (existingStorage?.id) {
        const updatePayload: Record<string, unknown> = {
          name,
          active,
          type: warehouseType,
          integration_id: isFulfillment && integrationId ? integrationId : null,
          readonly: isFulfillment,
        };
        const { error } = await supabase
          .from("storage")
          .update(updatePayload as never)
          .eq("id", existingStorage.id);
        if (error) throw error;
        // Persist default selection quando editar
        try {
          const lsId = typeof window !== "undefined" ? localStorage.getItem("defaultStorageId") : null;
          if (isDefault) {
            localStorage.setItem("defaultStorageId", existingStorage.id);
          } else if (lsId === existingStorage.id) {
            // Unset default if toggled off on the same storage
            localStorage.removeItem("defaultStorageId");
          }
        } catch (_) {}
        toast({ title: "Armazém atualizado", description: "As alterações foram salvas." });
      } else {
        const { data, error } = await supabase
          .from("storage")
          .insert([{
            name,
            active,
            organizations_id: organizationId ?? null,
            type: warehouseType,
            integration_id: isFulfillment && integrationId ? integrationId : null,
            readonly: isFulfillment,
          } as never])
          .select("id");
        if (error) throw error;
        const newId = (data && Array.isArray(data) && data.length > 0) ? String(data[0].id) : undefined;
        // Persist default selection for newly created storage
        try {
          if (isDefault && newId) {
            localStorage.setItem("defaultStorageId", newId);
          }
        } catch (_) {}
        toast({ title: "Armazém criado", description: "Novo armazém cadastrado com sucesso." });
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar armazém";
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        ref={contentRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 flex h-full w-full sm:w-[90%] md:w-[60%] lg:w-[42%] xl:w-[35%] flex-col max-h-screen"
      >
        <DrawerHeader>
          <DrawerTitle id={titleId}>{existingStorage ? "Editar Armazém" : "Novo Armazém"}</DrawerTitle>
          <DrawerDescription id={descriptionId}>
            {existingStorage ? "Atualize os dados do armazém selecionado." : "Preencha os dados para criar um novo armazém."}
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storage-name">Nome do Armazém</Label>
            <Input id="storage-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Armazém Principal" data-autofocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="storage-type">Tipo de Armazém</Label>
            <Select value={warehouseType} onValueChange={(v) => setWarehouseType(v as WarehouseType)} disabled={!!existingStorage}>
              <SelectTrigger id="storage-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="physical">Físico — operado por você</SelectItem>
                <SelectItem value="fulfillment">Fulfillment — operado pelo marketplace</SelectItem>
              </SelectContent>
            </Select>
            {!!existingStorage && (
              <p className="text-xs text-muted-foreground">O tipo não pode ser alterado após a criação.</p>
            )}
          </div>

          {isFulfillment && (
            <div className="space-y-2">
              <Label htmlFor="storage-integration">Integração do Marketplace</Label>
              <Select value={integrationId} onValueChange={setIntegrationId}>
                <SelectTrigger id="storage-integration">
                  <SelectValue placeholder="Selecione a integração..." />
                </SelectTrigger>
                <SelectContent>
                  {integrations.map((int) => (
                    <SelectItem key={int.id} value={int.id}>
                      {int.marketplace_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Integração à qual este armazém fulfillment pertence.</p>
            </div>
          )}

          {isFulfillment && (
            <div className="flex items-center gap-2 rounded-md border-2 border-[#FF6400] bg-[#FF6400]/12 p-3 shadow-sm">
              <Lock className="w-4 h-4 shrink-0 text-[#FF6400]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#FF6400]">Somente leitura</p>
                <p className="text-xs font-medium leading-snug text-gray-900 mt-0.5">
                  Armazéns fulfillment não permitem entrada/saída manual. Estoque sincronizado via API do marketplace.
                </p>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 border-2 border-[#FF6400] bg-[#FF6400]/10 text-[#FF6400] font-semibold">
                Readonly
              </Badge>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ativo</p>
              <p className="text-xs text-muted-foreground">Disponível para seleção nos filtros e operações</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          {!isFulfillment && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Definir como padrão</p>
                <p className="text-xs text-muted-foreground">Usado como armazém padrão nas operações</p>
              </div>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button className="bg-novura-primary" onClick={handleSave} disabled={saving}>{existingStorage ? "Salvar alterações" : "+ Criar Armazém"}</Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}