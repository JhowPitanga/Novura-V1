import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminDataTable, type Column } from "@/components/admin/shell/AdminDataTable";
import { AdminPageError } from "@/components/admin/shell/AdminPageError";
import { OrganizationStatusBadge } from "@/components/admin/organizations/OrganizationStatusBadge";
import { ModuleAccessEditor } from "@/components/admin/modules/ModuleAccessEditor";
import { useAdminOrganizations } from "@/hooks/admin/useAdminOrganizations";
import {
  useOrganizationModules,
  useUpdateGlobalModule,
  useUpdateOrgModuleAccess,
} from "@/hooks/admin/useAdminModules";
import type { AdminOrganization } from "@/types/admin";
import type { BaseFeatureCapabilities } from "@/types/admin";

export function AdminModulesAccess() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orgSearch, setOrgSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    searchParams.get("org"),
  );

  const { data: orgs = [], isLoading: orgsLoading, error: orgsError, refetch: refetchOrgs } =
    useAdminOrganizations();
  const {
    data: modules = [],
    isLoading: modsLoading,
    error: modsError,
    refetch: refetchMods,
  } = useOrganizationModules(selectedOrgId ?? "");
  const saveOrg = useUpdateOrgModuleAccess();
  const saveGlobal = useUpdateGlobalModule();

  useEffect(() => {
    if (selectedOrgId) {
      setSearchParams({ org: selectedOrgId }, { replace: true });
    }
  }, [selectedOrgId, setSearchParams]);

  const filteredOrgs = orgSearch
    ? orgs.filter((o) => o.name.toLowerCase().includes(orgSearch.toLowerCase()))
    : orgs;

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  async function handleSaveOrg(
    moduleKey: string,
    is_enabled: boolean,
    capabilities: BaseFeatureCapabilities,
  ) {
    if (!selectedOrgId) return;
    try {
      await saveOrg.mutateAsync({ organizationId: selectedOrgId, featureKey: moduleKey, is_enabled, capabilities });
      toast.success("Acesso da organização atualizado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleGlobal(moduleKey: string, active: boolean) {
    try {
      await saveGlobal.mutateAsync({ moduleName: moduleKey, active });
      if (selectedOrgId) await refetchMods();
      toast.success("Módulo global atualizado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const orgColumns: Column<AdminOrganization>[] = [
    {
      key: "name",
      header: "Organização",
      cell: (row) => (
        <div>
          <p className="text-sm font-medium">{row.name}</p>
          <OrganizationStatusBadge
            status={row.organization_status?.status}
            deleted={!!row.organization_status?.deleted_at}
          />
        </div>
      ),
    },
  ];

  const isSaving = saveOrg.isPending || saveGlobal.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Módulos & Features</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Liberação granular por organização: módulo do sistema + capacidades (can_view, can_create…)
        </p>
      </div>

      {orgsError && (
        <AdminPageError message={(orgsError as Error).message} onRetry={() => refetchOrgs()} />
      )}

      <div className="flex flex-col lg:flex-row gap-4 min-h-[480px]">
        <Card className="w-full lg:w-80 border-0 shadow-sm flex-shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Organizações</CardTitle>
            <Input
              placeholder="Buscar..."
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </CardHeader>
          <CardContent className="p-0 max-h-[520px] overflow-auto">
            <AdminDataTable
              columns={orgColumns}
              data={filteredOrgs}
              isLoading={orgsLoading}
              getRowId={(o) => o.id}
              onRowClick={(o) => setSelectedOrgId(o.id)}
              emptyMessage="Nenhuma organização."
            />
          </CardContent>
        </Card>

        <Card className="flex-1 border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedOrg
                ? `Acesso — ${selectedOrg.name}`
                : "Selecione uma organização à esquerda"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[600px] overflow-auto">
            {!selectedOrgId && (
              <p className="text-sm text-muted-foreground">
                Escolha uma organização para configurar módulos e features.
              </p>
            )}
            {selectedOrgId && modsError && (
              <AdminPageError message={(modsError as Error).message} onRetry={() => refetchMods()} />
            )}
            {selectedOrgId && modsLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-lg" />
              ))}
            {selectedOrgId && !modsLoading && !modsError &&
              modules.map((mod) => (
                <ModuleAccessEditor
                  key={mod.module_key}
                  module={mod}
                  onSaveOrg={handleSaveOrg}
                  onToggleGlobal={handleGlobal}
                  isSaving={isSaving}
                />
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
