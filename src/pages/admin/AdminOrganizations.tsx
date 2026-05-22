import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreVertical, Lock, Unlock, Archive, Zap, Settings } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { AdminDataTable, type Column } from "@/components/admin/shell/AdminDataTable";
import { AdminFilterBar } from "@/components/admin/shell/AdminFilterBar";
import { OrganizationStatusBadge } from "@/components/admin/organizations/OrganizationStatusBadge";
import { BlockOrgDialog } from "@/components/admin/organizations/BlockOrgDialog";
import { AdminPageError } from "@/components/admin/shell/AdminPageError";
import { useAdminOrganizations, useBlockOrganization, useUnblockOrganization, useArchiveOrganization } from "@/hooks/admin/useAdminOrganizations";
import type { AdminOrganization } from "@/types/admin";

export function AdminOrganizations() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOrg, setDialogOrg] = useState<AdminOrganization | null>(null);
  const [dialogMode, setDialogMode] = useState<"block" | "archive">("block");

  const params = {
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  };
  const { data: orgs = [], isLoading, error, refetch } = useAdminOrganizations(params);
  const blockMut = useBlockOrganization();
  const unblockMut = useUnblockOrganization();
  const archiveMut = useArchiveOrganization();

  async function handleConfirm(reason: string) {
    if (!dialogOrg) return;
    try {
      if (dialogMode === "block") await blockMut.mutateAsync({ id: dialogOrg.id, reason });
      else await archiveMut.mutateAsync({ id: dialogOrg.id, reason });
      toast.success(dialogMode === "block" ? "Organização bloqueada." : "Organização arquivada.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const columns: Column<AdminOrganization>[] = [
    {
      key: "name",
      header: "Nome",
      cell: (row) => <span className="font-medium text-sm">{row.name || "Sem nome"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <OrganizationStatusBadge
          status={row.organization_status?.status}
          deleted={!!row.organization_status?.deleted_at}
        />
      ),
    },
    {
      key: "plan",
      header: "Plano",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{row.organization_status?.plan_sku ?? "—"}</span>
      ),
    },
    {
      key: "limits",
      header: "Limites",
      cell: (row) => (
        <span className="text-sm" title="Usuários ativos / limite contratado">
          {row.organization_status?.active_users_count ?? 0}
          <span className="text-muted-foreground">/{row.organization_status?.max_users_allowed ?? "?"}</span>
        </span>
      ),
    },
    {
      key: "finance",
      header: "Financeiro",
      cell: (row) => (
        <div className="text-xs">
          <p className="font-medium text-gray-700">{row.organization_status?.plan_sku ?? "Sem plano"}</p>
          <p className="text-muted-foreground">Histórico: MVP</p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/novura-admin/flags-planos?org=${row.id}`)}>
              <Settings className="h-4 w-4 mr-2" />Configurar tenant
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {row.organization_status?.status === "active" ? (
              <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDialogOrg(row); setDialogMode("block"); }}>
                <Lock className="h-4 w-4 mr-2" />Bloquear
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={async (e) => { e.stopPropagation(); await unblockMut.mutateAsync(row.id); toast.success("Desbloqueada."); }}>
                <Unlock className="h-4 w-4 mr-2" />Desbloquear
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDialogOrg(row); setDialogMode("archive"); }}>
              <Archive className="h-4 w-4 mr-2" />Arquivar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/novura-admin/flags-planos?org=${row.id}`)}>
              <Zap className="h-4 w-4 mr-2" />Flags & planos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Organizações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Controle de bloqueio, limites e histórico financeiro dos tenants
        </p>
      </div>

      {error && <AdminPageError message={(error as Error).message} onRetry={() => refetch()} />}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <AdminFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Buscar por nome..."
            selects={[{
              key: "status",
              placeholder: "Todos os status",
              value: statusFilter,
              options: [{ label: "Ativa", value: "active" }, { label: "Bloqueada", value: "blocked" }],
              onChange: setStatusFilter,
            }]}
            isDirty={search !== "" || statusFilter !== "all"}
            onClear={() => { setSearch(""); setStatusFilter("all"); }}
          />
        </CardHeader>
        <CardContent className="p-0">
          <AdminDataTable
            columns={columns}
            data={orgs}
            isLoading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/novura-admin/flags-planos?org=${r.id}`)}
          />
        </CardContent>
      </Card>

      {dialogOrg && (
        <BlockOrgDialog
          open={!!dialogOrg}
          onOpenChange={(o) => !o && setDialogOrg(null)}
          organizationName={dialogOrg.name}
          mode={dialogMode}
          onConfirm={handleConfirm}
          isLoading={blockMut.isPending || archiveMut.isPending}
        />
      )}
    </div>
  );
}
