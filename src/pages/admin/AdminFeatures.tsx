import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminDataTable, type Column } from "@/components/admin/shell/AdminDataTable";
import { FeatureCapabilityEditor } from "@/components/admin/features/FeatureCapabilityEditor";
import { OrganizationStatusBadge } from "@/components/admin/organizations/OrganizationStatusBadge";
import { useAdminOrganizations } from "@/hooks/admin/useAdminOrganizations";
import { useOrganizationFeatures, useUpdateOrganizationFeature } from "@/hooks/admin/useAdminFeatures";
import type { AdminOrganization, BaseFeatureCapabilities } from "@/types/admin";

export function AdminFeatures() {
  const [orgSearch, setOrgSearch]     = useState("");
  const [selectedOrgId, setOrgId]     = useState<string | null>(null);

  const { data: orgs = [], isLoading: orgsLoading } = useAdminOrganizations();
  const { data: features = [], isLoading: featLoading } = useOrganizationFeatures(selectedOrgId ?? "");
  const updateMut = useUpdateOrganizationFeature();

  const filteredOrgs = orgSearch
    ? orgs.filter((o) => o.name.toLowerCase().includes(orgSearch.toLowerCase()))
    : orgs;

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  async function handleSave(featureKey: string, is_enabled: boolean, caps: BaseFeatureCapabilities) {
    if (!selectedOrgId) return;
    try {
      await updateMut.mutateAsync({ organizationId: selectedOrgId, featureKey, is_enabled, capabilities: caps });
      toast.success("Feature atualizada com sucesso.");
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
          <OrganizationStatusBadge status={row.organization_status?.status} deleted={!!row.organization_status?.deleted_at} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Features & Capacidades</h1>
        <p className="text-sm text-muted-foreground mt-1">Selecione uma organização e configure suas features</p>
      </div>

      <div className="flex gap-4 h-[calc(100vh-260px)]">
        {/* Left panel — org list */}
        <Card className="w-72 border-0 shadow-sm flex-shrink-0 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Organizações</CardTitle>
            <Input
              placeholder="Buscar..."
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            <AdminDataTable
              columns={orgColumns}
              data={filteredOrgs}
              isLoading={orgsLoading}
              getRowId={(o) => o.id}
              onRowClick={(o) => setOrgId(o.id)}
              emptyMessage="Nenhuma organização."
            />
          </CardContent>
        </Card>

        {/* Right panel — features */}
        <Card className="flex-1 border-0 shadow-sm flex flex-col overflow-auto">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedOrg ? `Features — ${selectedOrg.name}` : "Selecione uma organização"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 overflow-auto">
            {!selectedOrgId && (
              <p className="text-sm text-muted-foreground">
                Clique em uma organização para ver e editar suas features.
              </p>
            )}
            {selectedOrgId && featLoading && (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-lg" />
              ))
            )}
            {selectedOrgId && !featLoading && features.map((f) => (
              <FeatureCapabilityEditor
                key={f.feature_key}
                feature={f}
                onSave={handleSave}
                isSaving={updateMut.isPending}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
