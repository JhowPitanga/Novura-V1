import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Building2, Warehouse, Plus, AlertTriangle, Store } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  useBlockedCompaniesForProvider,
  useCompleteIntegrationSetup,
  useIntegrationDetail,
  useUpdateIntegrationStoreName,
} from "@/hooks/useIntegrations";
import {
  useWarehouseConfig,
  useAllActiveStorage,
  useWarehouseConfigMutation,
} from "@/hooks/useWarehouseConfig";

interface QuickSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  providerKey: string;
  providerDisplayName: string;
  /** Pre-fill if returning from /empresas/nova */
  defaultCompanyId?: string | null;
  /** For callback flow, open directly on company tab */
  initialTab?: "store" | "company" | "warehouse";
}

/**
 * Two-step modal for completing integration setup after OAuth:
 *  Step 1 — Select company (blocked ones are disabled)
 *  Step 2 — Select warehouse (reuses WarehouseConfigModal logic inline)
 */
export function QuickSetupModal({
  open,
  onOpenChange,
  integrationId,
  providerKey,
  providerDisplayName,
  defaultCompanyId,
  initialTab = "store",
}: QuickSetupModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId } = useAuth();
  const [activeTab, setActiveTab] = useState<"store" | "company" | "warehouse">(initialTab);
  const [storeName, setStoreName] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(defaultCompanyId ?? "");
  const [physicalStorageId, setPhysicalStorageId] = useState<string>("");

  const { data: companies = [] } = useQuery({
    queryKey: ["quicksetup-companies", organizationId],
    enabled: Boolean(organizationId) && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, razao_social, cnpj")
        .eq("organization_id", organizationId!)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; razao_social: string; cnpj: string }>;
    },
    staleTime: 60_000,
  });

  // Data fetching
  const { data: integrationDetail } = useIntegrationDetail(open ? integrationId : null);
  const { data: blockedCompanyIds = [], isLoading: blockedLoading } =
    useBlockedCompaniesForProvider(open ? providerKey : null);
  const { data: allStorages = [], isLoading: storageLoading } = useAllActiveStorage();
  const { data: existingConfig } = useWarehouseConfig(open ? integrationId : null);
  const completeSetup = useCompleteIntegrationSetup();
  const updateStoreName = useUpdateIntegrationStoreName();
  const saveWarehouse = useWarehouseConfigMutation();

  // Sync current values when modal opens
  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (integrationDetail?.store_name) {
      setStoreName(integrationDetail.store_name);
    }
    if (integrationDetail?.company_id) {
      setSelectedCompanyId(integrationDetail.company_id);
    }
  }, [integrationDetail]);

  useEffect(() => {
    if (existingConfig?.physicalStorageId) {
      setPhysicalStorageId(existingConfig.physicalStorageId);
    }
  }, [existingConfig]);

  // Pre-fill company if coming back from /empresas/nova
  useEffect(() => {
    if (defaultCompanyId) {
      setSelectedCompanyId(defaultCompanyId);
    }
  }, [defaultCompanyId]);

  const blockedSet = new Set(blockedCompanyIds);
  const hasLinkedCompany = Boolean(integrationDetail?.company_id);
  const canEditCompany = !hasLinkedCompany;
  const effectiveStoreName = storeName.trim();
  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!effectiveStoreName) {
      toast({
        title: "Nome da loja obrigatório",
        description: "Informe um nome da loja para salvar.",
        variant: "destructive",
      });
      return;
    }
    if (!physicalStorageId) {
      toast({
        title: "Armazém físico obrigatório",
        description: "Selecione um armazém físico para continuar.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedCompanyId) {
      toast({
        title: "Empresa obrigatória",
        description: "Defina uma empresa para continuar.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateStoreName.mutateAsync({ integrationId, storeName: effectiveStoreName });

      // Only set company when integration has no linked company yet.
      if (canEditCompany) {
        await completeSetup.mutateAsync({
          integrationId,
          companyId: selectedCompanyId,
        });
      }

      await saveWarehouse.mutateAsync({
        integrationId,
        physicalStorageId,
        fulfillmentStorageId: existingConfig?.fulfillmentStorageId ?? null,
      });

      toast({
        title: "Integração configurada!",
        description: `${providerDisplayName} vinculado com sucesso.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erro ao salvar configuração",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleCreateCompany = () => {
    onOpenChange(false);
    navigate(`/empresas/nova?returnToApp=${integrationId}&providerKey=${providerKey}`);
  };

  const isSaving = completeSetup.isPending || saveWarehouse.isPending || updateStoreName.isPending;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSaving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-5 h-5 text-novura-primary" />
            Configurações — {providerDisplayName}
          </DialogTitle>
          <DialogDescription>
            Edite os dados da loja, visualize o vínculo de company e configure o armazém.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="w-full h-auto rounded-none bg-transparent border-b border-gray-200 p-0 justify-start">
            <TabsTrigger
              value="store"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5"
            >
              <Store className="w-4 h-4" />
              Loja
            </TabsTrigger>
            <TabsTrigger
              value="company"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5"
            >
              <Building2 className="w-4 h-4" />
              Company
            </TabsTrigger>
            <TabsTrigger
              value="warehouse"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5"
            >
              <Warehouse className="w-4 h-4" />
              Armazém
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[290px] pt-2">
          <TabsContent value="store" className="space-y-4 py-2 m-0 min-h-[280px]">
            <div className="space-y-1.5">
              <Label htmlFor="store-name">
                Nome da loja <span className="text-destructive">*</span>
              </Label>
              <Input
                id="store-name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex.: Loja Oficial ABC"
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Este nome é usado internamente no Novura para identificar a conta conectada.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="company" className="space-y-4 py-2 m-0 min-h-[280px]">
            <div className="space-y-1.5">
              <Label htmlFor="company-select">
                Company <span className="text-destructive">*</span>
              </Label>
              {blockedLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando empresas...
                </div>
              ) : (
                <TooltipProvider>
                  <Select
                    value={selectedCompanyId}
                    onValueChange={setSelectedCompanyId}
                    disabled={!canEditCompany}
                  >
                    <SelectTrigger id="company-select">
                      <SelectValue placeholder="Selecione uma company..." />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.length === 0 ? (
                        <SelectItem value="__empty" disabled>
                          Nenhuma empresa cadastrada
                        </SelectItem>
                      ) : (
                        companies.map((company) => {
                          const isBlocked = blockedSet.has(company.id);
                          return isBlocked ? (
                            <Tooltip key={company.id}>
                              <TooltipTrigger asChild>
                                <div className="relative flex w-full cursor-not-allowed select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none opacity-50">
                                  <AlertTriangle className="w-3 h-3 mr-1.5 text-amber-500" />
                                  {company.razao_social}
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    (já conectada)
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Esta empresa já possui uma integração ativa com {providerDisplayName}.</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <SelectItem key={company.id} value={company.id}>
                              {company.razao_social}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </TooltipProvider>
              )}

              <p className="text-xs text-muted-foreground">
                {canEditCompany
                  ? "Cada company pode ter apenas uma integração ativa por canal."
                  : "A alteração de company está temporariamente bloqueada para integrações já vinculadas."}
              </p>
            </div>

            {canEditCompany && (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-novura-primary hover:text-novura-primary/80 hover:bg-novura-primary/10 gap-1.5 px-2"
                  onClick={handleCreateCompany}
                >
                  <Plus className="w-4 h-4" />
                  Criar nova empresa
                </Button>
                <span className="text-xs text-muted-foreground">
                  e vincular automaticamente
                </span>
              </div>
            )}
            {!canEditCompany && selectedCompany && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                Company vinculada: <span className="font-medium text-foreground">{selectedCompany.razao_social}</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="warehouse" className="space-y-4 py-2 m-0 min-h-[280px]">
            <div className="space-y-1.5">
              <Label htmlFor="warehouse-select">
                Armazém Físico <span className="text-destructive">*</span>
              </Label>
              {storageLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando armazéns...
                </div>
              ) : (
                <Select value={physicalStorageId} onValueChange={setPhysicalStorageId}>
                  <SelectTrigger id="warehouse-select">
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
              )}
              <p className="text-xs text-muted-foreground">
                O estoque será deduzido deste armazém a cada venda nesta integração.
              </p>
            </div>
          </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !physicalStorageId || !effectiveStoreName || !selectedCompanyId}
            className="bg-novura-primary hover:bg-novura-primary/90"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar configurações"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
