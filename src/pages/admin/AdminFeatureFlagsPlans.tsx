import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CreditCard, Globe, Building2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AdminMetricCard } from "@/components/admin/shell/AdminMetricCard";
import { AdminPageError } from "@/components/admin/shell/AdminPageError";
import { GlobalModuleRow } from "@/components/admin/modules/GlobalModuleRow";
import { OrgModuleAccessCard } from "@/components/admin/modules/OrgModuleAccessCard";
import { OrgTenantPicker } from "@/components/admin/organizations/OrgTenantPicker";
import { PlansCatalogPanel } from "@/components/admin/plans/PlansCatalogPanel";
import { useAdminOrganizations } from "@/hooks/admin/useAdminOrganizations";
import {
  useOrganizationModules,
  useUpdateGlobalModule,
  useUpdateOrgModuleAccess,
} from "@/hooks/admin/useAdminModules";
import { useUpdateOrganizationPlan } from "@/hooks/admin/useAdminFeatures";
import { listSystemPlans } from "@/services/admin-control.service";
import { sortAdminModules } from "@/lib/adminModules";
import type { BaseFeatureCapabilities, OrgModuleCatalogItem } from "@/types/admin";

type AdminTab = "plataforma" | "organizacoes";

export function AdminFeatureFlagsPlans() {
  const [params, setSearchParams] = useSearchParams();
  const [orgSearch, setOrgSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(params.get("org"));
  const tab = (
    params.get("tab") === "organizacoes" || (params.get("org") && params.get("tab") !== "plataforma")
      ? "organizacoes"
      : "plataforma"
  ) as AdminTab;

  const orgsQuery = useAdminOrganizations();
  const plansQuery = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: listSystemPlans,
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });

  const orgs = orgsQuery.data ?? [];
  const catalogOrgId = orgs[0]?.id ?? "";
  const globalModulesQuery = useOrganizationModules(catalogOrgId);
  const orgModulesQuery = useOrganizationModules(selectedOrgId ?? "");

  const saveOrg = useUpdateOrgModuleAccess();
  const saveGlobal = useUpdateGlobalModule();
  const updatePlan = useUpdateOrganizationPlan();

  const setTab = (next: AdminTab) => {
    const nextParams: Record<string, string> = { tab: next };
    if (next === "organizacoes" && selectedOrgId) nextParams.org = selectedOrgId;
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (tab !== "organizacoes" || !selectedOrgId) return;
    setSearchParams({ tab: "organizacoes", org: selectedOrgId }, { replace: true });
  }, [selectedOrgId, tab, setSearchParams]);

  const selectedOrg = orgs.find((org) => org.id === selectedOrgId) ?? null;
  const { production: globalProd, inDevelopment: globalDev } = useMemo(
    () => sortAdminModules(globalModulesQuery.data ?? []),
    [globalModulesQuery.data],
  );
  const { production: orgProd, inDevelopment: orgDev } = useMemo(
    () => sortAdminModules(orgModulesQuery.data ?? []),
    [orgModulesQuery.data],
  );

  async function saveOrgModule(
    moduleKey: string,
    is_enabled: boolean,
    capabilities: BaseFeatureCapabilities,
  ) {
    if (!selectedOrgId) return;
    try {
      await saveOrg.mutateAsync({ organizationId: selectedOrgId, featureKey: moduleKey, is_enabled, capabilities });
      toast.success("Módulo atualizado para a organização.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveGlobalModule(moduleKey: string, active: boolean) {
    try {
      await saveGlobal.mutateAsync({ moduleName: moduleKey, active });
      await globalModulesQuery.refetch();
      if (selectedOrgId) await orgModulesQuery.refetch();
      toast.success("Liberação global atualizada.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function savePlan(planSku: string) {
    if (!selectedOrgId) return;
    try {
      await updatePlan.mutateAsync({ organizationId: selectedOrgId, planSku });
      await orgsQuery.refetch();
      await orgModulesQuery.refetch();
      toast.success("Plano atualizado para o tenant.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const isSaving = saveOrg.isPending || saveGlobal.isPending;
  const currentPlan = selectedOrg?.organization_status?.plan_sku ?? "";
  const maxUsers = selectedOrg?.organization_status?.max_users_allowed ?? 0;

  function renderOrgModules(items: OrgModuleCatalogItem[]) {
    return items.map((mod) => (
      <OrgModuleAccessCard
        key={`${selectedOrgId}-${mod.module_key}`}
        module={mod}
        onSave={saveOrgModule}
        isSaving={isSaving}
      />
    ));
  }

  function renderGlobalModules(items: OrgModuleCatalogItem[]) {
    return items.map((mod) => (
      <GlobalModuleRow key={mod.module_key} module={mod} onToggle={saveGlobalModule} isSaving={isSaving} />
    ));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Feature Flags & Planos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure a plataforma globalmente ou libere módulos por tenant. Alterações propagam aos usuários em instantes.
        </p>
      </div>

      {(orgsQuery.error || plansQuery.error) && (
        <AdminPageError
          message={((orgsQuery.error || plansQuery.error) as Error).message}
          onRetry={() => {
            orgsQuery.refetch();
            plansQuery.refetch();
          }}
        />
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="plataforma" className="gap-2">
            <Globe className="h-4 w-4" />
            Plataforma
          </TabsTrigger>
          <TabsTrigger value="organizacoes" className="gap-2">
            <Building2 className="h-4 w-4" />
            Por organização
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plataforma" className="space-y-4 mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Liberação global de módulos</CardTitle>
              <CardDescription>
                Liga ou desliga módulos para todo o sistema. Tenants só veem módulos ativos aqui e liberados no tenant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {globalModulesQuery.isLoading && !catalogOrgId ? (
                <p className="text-sm text-muted-foreground">Carregando catálogo...</p>
              ) : globalModulesQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-md" />
                  ))}
                </div>
              ) : globalModulesQuery.error ? (
                <AdminPageError
                  message={(globalModulesQuery.error as Error).message}
                  onRetry={() => globalModulesQuery.refetch()}
                />
              ) : (
                <div className="divide-y rounded-md border px-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase py-2">Em produção</p>
                  {renderGlobalModules(globalProd)}
                  {globalDev.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground uppercase py-2 pt-4">
                        Em desenvolvimento
                      </p>
                      {renderGlobalModules(globalDev)}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Planos do sistema</CardTitle>
              <CardDescription>Templates de cotas e limites — atribua o plano na aba Por organização.</CardDescription>
            </CardHeader>
            <CardContent>
              <PlansCatalogPanel plans={plansQuery.data ?? []} isLoading={plansQuery.isLoading} compact />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organizacoes" className="mt-4">
          <div className="flex flex-col xl:flex-row gap-4">
            <OrgTenantPicker
              organizations={orgs}
              selectedId={selectedOrgId}
              onSelect={setSelectedOrgId}
              search={orgSearch}
              onSearchChange={setOrgSearch}
              isLoading={orgsQuery.isLoading}
            />

            <div className="flex-1 space-y-4 min-w-0">
              {!selectedOrg && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Selecione uma organização na lista para configurar plano e módulos do tenant.
                  </CardContent>
                </Card>
              )}

              {selectedOrg && (
                <>
                  <Card className="border-0 shadow-sm border-l-4 border-l-novura-primary">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Tenant selecionado</p>
                      <p className="text-lg font-semibold text-gray-900 mt-0.5">{selectedOrg.name}</p>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <AdminMetricCard label="Plano atual" value={currentPlan.replace("plan_", "") || "—"} icon={CreditCard} />
                    <AdminMetricCard label="Limite de usuários" value={maxUsers} icon={ShieldCheck} />
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-5 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase">Alterar plano</p>
                        <Select value={currentPlan} onValueChange={savePlan} disabled={updatePlan.isPending}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar plano" />
                          </SelectTrigger>
                          <SelectContent>
                            {(plansQuery.data ?? []).map((plan) => (
                              <SelectItem key={plan.sku} value={plan.sku}>
                                {plan.name} — até {plan.max_users} usuários
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Badge variant="secondary" className="text-xs">
                          Aplica cotas do template ao tenant
                        </Badge>
                      </CardContent>
                    </Card>
                  </div>

                  {orgModulesQuery.error && (
                    <AdminPageError
                      message={(orgModulesQuery.error as Error).message}
                      onRetry={() => orgModulesQuery.refetch()}
                    />
                  )}

                  {orgModulesQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-lg" />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <h2 className="text-sm font-semibold text-gray-900">Módulos do tenant</h2>
                        <p className="text-xs text-muted-foreground">
                          Overrides por organização. O estado global é configurado na aba Plataforma.
                        </p>
                      </div>
                      <div className="space-y-3">{renderOrgModules(orgProd)}</div>
                      {orgDev.length > 0 && (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-gray-900">Em desenvolvimento</h2>
                            <Badge variant="secondary">Beta</Badge>
                          </div>
                          {renderOrgModules(orgDev)}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
